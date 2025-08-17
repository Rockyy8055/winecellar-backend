const express = require('express');
const router = express.Router();
const { getOrder, updateOrderStatus, trackOrder, initializeOrderMetadata, emailOwnerOrderPlaced } = require('../controllers/orderController');
const { requireAdmin } = require('../config/requireAdmin');
const { decodeUserFromAuthHeader } = require('../config/requireUser');
const { sendMail } = require('../services/emailService');
const OrderDetails = require('../models/orderDetails');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

function computeTotals(items, opts = {}) {
  const { isTradeCustomer = false, shippingOverride } = opts;
  const subtotalRaw = Array.isArray(items)
    ? items.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 0), 0)
    : 0;
  const subtotal = round2(subtotalRaw);
  const defaultShipping = subtotal >= 100 ? 0 : 4.99;
  const shippingFee = round2(shippingOverride != null ? Number(shippingOverride) : defaultShipping);
  const discount = isTradeCustomer ? round2(subtotal * 0.20) : 0;
  const vat = isTradeCustomer ? round2(subtotal * 0.20) : 0;
  const calculatedTotal = round2(subtotal - discount + vat + shippingFee);
  const total = calculatedTotal;
  return { subtotal, discount, vat, shippingFee, total, isTradeCustomer: !!isTradeCustomer };
}

// Create order (simple)
router.post('/api/orders/create', async (req, res) => {
  try {
    const { customer, shippingAddress, items = [], trackingCode, isTradeCustomer = false, shippingOverride } = req.body || {};
    const { subtotal, discount, vat, shippingFee, total, isTradeCustomer: isTrade } = computeTotals(items, { isTradeCustomer, shippingOverride });
    const userPayload = decodeUserFromAuthHeader(req); // { sub, login }
    const order = new OrderDetails({ customer, shippingAddress, items, subtotal, discount, vat, shippingFee, total, trackingCode, isTradeCustomer: isTrade });
    if (userPayload && userPayload.sub) order.user_id = userPayload.sub;
    initializeOrderMetadata(order);
    await order.save();

    // fire-and-forget emails
    emailOwnerOrderPlaced(order).catch(()=>{});
    if (customer?.email) {
      const itemsText = (items || []).map(it => `- ${it.name} x${it.qty} @ £${Number(it.price).toFixed(2)}`).join('\n');
      const link = `${req.headers.origin || 'http://localhost:4000'}/order-status?trackingCode=${order.trackingCode}`;
      const text = `Thank you for your order!\n\nTracking: ${order.trackingCode}\nSubtotal: £${subtotal.toFixed(2)}\nShipping: £${shippingFee.toFixed(2)}\nTotal: £${total.toFixed(2)}\n\nItems:\n${itemsText}\n\nTrack here: ${link}`;
      sendMail(customer.email, `Order ${order.trackingCode} confirmed`, text).catch(()=>{});
    }

    res.json({ _id: order._id, trackingCode: order.trackingCode, status: order.status, subtotal, discount, vat, shippingFee, total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Get order by id
router.get('/api/orders/:id', getOrder);

// Update order status (admin)
router.patch('/api/orders/:id/status', requireAdmin, updateOrderStatus);

// Public tracking by tracking code — minimal if not owner
router.get('/api/orders/track/:trackingCode', async (req, res) => {
  try {
    const code = req.params.trackingCode;
    const order = await OrderDetails.findOne({ trackingCode: code });
    if (!order) return res.status(404).json({ status: 'NOT_FOUND' });
    const userPayload = decodeUserFromAuthHeader(req);
    const isOwner = userPayload && String(userPayload.sub) === String(order.user_id || '');
    if (isOwner) {
      return res.json({
        trackingCode: order.trackingCode,
        status: order.status,
        statusHistory: order.statusHistory,
        customer: order.customer,
        shippingAddress: order.shippingAddress,
        items: order.items,
        subtotal: order.subtotal,
        shippingFee: order.shippingFee,
        total: order.total,
      });
    }
    return res.json({ trackingCode: order.trackingCode, status: order.status });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Pricing endpoint (no persistence)
router.post('/api/orders/price', (req, res) => {
  try {
    const { items = [], isTradeCustomer = false, shippingOverride } = req.body || {};
    const { subtotal, discount, vat, shippingFee, total } = computeTotals(items, { isTradeCustomer, shippingOverride });
    return res.json({ subtotal, discount, vat, shipping: shippingFee, total });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: list orders
router.get('/api/admin/orders', requireAdmin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '20', 10)));
    const status = (req.query.status || '').trim();
    const q = status ? { status } : {};
    const total = await OrderDetails.countDocuments(q);
    const items = await OrderDetails.find(q)
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    res.json({ items, total, page, pages: Math.ceil(total / limit) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: get one order with all details
router.get('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  try {
    const order = await OrderDetails.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Not found' });
    res.json(order);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;