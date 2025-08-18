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
const { requireAuth, optionalAuth } = require('./userAuth');

router.post('/api/orders/create', requireAuth, async (req, res) => {
  try {
    const { customer, shippingAddress, items = [], trackingCode, isTradeCustomer = false, shippingOverride } = req.body || {};
    if (!customer || !customer.email) {
      return res.status(400).json({ error: 'customer.email is required' });
    }
    // Detect Pick & Pay
    const m = String((req.body && req.body.method) || '').toLowerCase();
    const isPickAndPay = ['cod','pick_and_pay','pickup'].includes(m);
    let { subtotal, discount, vat, shippingFee, total, isTradeCustomer: isTrade } = computeTotals(items, { isTradeCustomer, shippingOverride });
    if (isPickAndPay) {
      shippingFee = 0;
      total = round2(subtotal - discount + vat + shippingFee);
    }
    const userPayload = { sub: req.userId }; // cookie auth
    // ETA: +2 business days
    const eta = (() => {
      const d = new Date();
      let add = 2; while (add > 0) { d.setDate(d.getDate()+1); const w=d.getDay(); if (w!==0 && w!==6) add--; }
      return d;
    })();
    const order = new OrderDetails({ method: m, customer, shippingAddress, items, subtotal, discount, vat, shippingFee, total, trackingCode, isTradeCustomer: isTrade, estimatedDelivery: eta });
    if (userPayload && userPayload.sub) order.user_id = userPayload.sub;
    initializeOrderMetadata(order);
    await order.save();

    // fire-and-forget emails (owner + customer receipt)
    emailOwnerOrderPlaced(order).catch(()=>{});
    const etaEmail = order.estimatedDelivery;
    try {
      const brand = '#350008';
      const itemsRows = (items || []).map(it => {
        const itemName = it.name || it.name0 || it.ProductName || it.title || it.productName || it.SKU || it.sku || 'Item';
        const qty = Number(it.qty || 0);
        const price = Number(it.price || 0);
        return `
        <tr>
          <td style="padding:8px;border:1px solid #eee"><strong>${itemName}</strong></td>
          <td style="padding:8px;border:1px solid #eee;text-align:center"><strong>x${qty}</strong></td>
          <td style="padding:8px;border:1px solid #eee;text-align:right">£${price.toFixed(2)}</td>
        </tr>`;
      }).join('');
      const totalsHtml = `
        <tr><td colspan="2" style="padding:8px;text-align:right;border:1px solid #eee">Subtotal</td><td style="padding:8px;text-align:right;border:1px solid #eee">£${subtotal.toFixed(2)}</td></tr>
        <tr><td colspan="2" style="padding:8px;text-align:right;border:1px solid #eee">Discount</td><td style="padding:8px;text-align:right;border:1px solid #eee">£${discount.toFixed(2)}</td></tr>
        <tr><td colspan="2" style="padding:8px;text-align:right;border:1px solid #eee">VAT</td><td style="padding:8px;text-align:right;border:1px solid #eee">£${vat.toFixed(2)}</td></tr>
        <tr><td colspan="2" style="padding:8px;text-align:right;border:1px solid #eee">Shipping</td><td style="padding:8px;text-align:right;border:1px solid #eee">£${shippingFee.toFixed(2)}</td></tr>
        <tr><td colspan="2" style="padding:8px;text-align:right;border:1px solid #eee;font-weight:bold">Total Paid</td><td style="padding:8px;text-align:right;border:1px solid #eee;font-weight:bold">£${total.toFixed(2)}</td></tr>`;
      const addr = shippingAddress || {};
      const trackUrl = `${(req.headers.origin || 'https://winecellar.co.in')}/order-status?trackingCode=${order.trackingCode}`;
      const html = `
      <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;border:1px solid #eee">
        <div style="background:${brand};color:#fff;padding:16px 20px;font-size:18px;font-weight:600">Wine Cellar</div>
        <div style="padding:20px">
          <p style="margin:0 0 12px 0">Dear ${customer.name || 'Customer'},</p>
          <p style="margin:0 0 16px 0">THANK YOU FOR CHOOSING WINE CELLAR.</p>
          <p style="margin:0 0 16px 0">Your order <strong>${order.trackingCode}</strong> has been received.</p>
          <p style="margin:0 0 16px 0"><strong>Payment method:</strong> ${isPickAndPay ? 'Pick and Pay (pay on pickup)' : 'Online payment'}</p>
          <table style="border-collapse:collapse;width:100%;margin:10px 0">
            <thead>
              <tr>
                <th style="padding:8px;border:1px solid #eee;text-align:left">Item</th>
                <th style="padding:8px;border:1px solid #eee;text-align:center">Qty</th>
                <th style="padding:8px;border:1px solid #eee;text-align:right">Price</th>
              </tr>
            </thead>
            <tbody>${itemsRows}</tbody>
            <tfoot>${totalsHtml}</tfoot>
          </table>
          <p style="margin:12px 0 0 0"><strong>Shipping address</strong><br/>
          ${addr.line1 || ''}<br/>${addr.city || ''} ${addr.postcode || ''}</p>
          <p style="margin:12px 0 0 0">Estimated delivery: <strong>${etaEmail.toDateString()}</strong></p>
          <p style="margin:12px 0 0 0">Track your order: <a href="${trackUrl}">${trackUrl}</a></p>
          <p style="margin:16px 0 0 0">Warm regards,<br/>Wine Cellar Team</p>
        </div>
      </div>`;
      // Send email; do not throw if fails
      sendMail(customer.email, 'THANK YOU FOR CHOOSING WINE CELLAR.', 'Thank you for your order', html).catch(err => {
        console.error('email receipt failed:', { orderId: String(order._id), email: customer.email, error: err.message });
      });
    } catch (err) {
      console.error('email build/send error:', err.message);
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

// Tracking by tracking code — full details for owner only (cookie auth optional)
router.get('/api/orders/track/:trackingCode', optionalAuth, async (req, res) => {
  try {
    const code = req.params.trackingCode;
    const order = await OrderDetails.findOne({ trackingCode: code });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const cookieUserId = req.userId || null;
    const bearer = decodeUserFromAuthHeader(req);
    const isOwner = (cookieUserId && String(cookieUserId) === String(order.user_id || '')) || (bearer && String(bearer.sub) === String(order.user_id || ''));
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
        createdAt: order.created_at,
        estimatedDelivery: order.estimatedDelivery,
      });
    }
    return res.json({ trackingCode: order.trackingCode, status: order.status, estimatedDelivery: order.estimatedDelivery });
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