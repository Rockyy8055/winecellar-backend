const express = require('express');
const router = express.Router();
const { getOrder, updateOrderStatus, trackOrder, initializeOrderMetadata, emailOwnerOrderPlaced } = require('../controllers/orderController');
const { requireAdmin } = require('../config/requireAdmin');
const { decodeUserFromAuthHeader } = require('../config/requireUser');
const { sendMail } = require('../services/emailService');
const OrderDetails = require('../models/orderDetails');

function computeTotals(items, providedTotal) {
  const subtotal = Array.isArray(items)
    ? items.reduce((s, it) => s + Number(it.price || 0) * Number(it.qty || 0), 0)
    : 0;
  const shippingFee = subtotal < 100 ? 4.99 : 0;
  const total = Number.isFinite(Number(providedTotal)) ? Number(providedTotal) : subtotal + shippingFee;
  return { subtotal, shippingFee, total };
}

// Create order (simple)
router.post('/api/orders/create', async (req, res) => {
  try {
    const { customer, shippingAddress, items = [], total: providedTotal, trackingCode } = req.body || {};
    const { subtotal, shippingFee, total } = computeTotals(items, providedTotal);
    if (!Number.isFinite(Number(total))) {
      return res.status(400).json({ error: 'total is required (number)' });
    }
    const userPayload = decodeUserFromAuthHeader(req); // { sub, login }
    const order = new OrderDetails({ customer, shippingAddress, items, subtotal, shippingFee, total, trackingCode });
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

    res.json({ _id: order._id, trackingCode: order.trackingCode, status: order.status, subtotal, shippingFee, total });
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