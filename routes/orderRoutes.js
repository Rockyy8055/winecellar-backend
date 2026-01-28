const express = require('express');
const router = express.Router();
const { getOrder, updateOrderStatus, trackOrder, initializeOrderMetadata, emailOwnerOrderPlaced, createShipmentForOrder } = require('../controllers/orderController');
const { requireAdmin } = require('../config/requireAdmin');
const { decodeUserFromAuthHeader } = require('../config/requireUser');
const { sendMail } = require('../services/emailService');
const OrderDetails = require('../models/orderDetails');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const VALID_PAYMENT_METHODS = new Map([
  ['debit card', 'Debit Card'],
  ['credit card', 'Credit Card'],
  ['paypal', 'PayPal'],
  ['pick & pay', 'Pick & Pay'],
  ['pick and pay', 'Pick & Pay'],
  ['pick_pay', 'Pick & Pay'],
  ['pickandpay', 'Pick & Pay']
]);

const generateOrderId = () => {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `WC-${ts}-${rand}`;
};

function normalizePaymentMethod(value) {
  if (!value) return null;
  const key = String(value).trim().toLowerCase();
  return VALID_PAYMENT_METHODS.get(key) || null;
}

function normalizeOrderItems(orderItems) {
  if (!Array.isArray(orderItems)) return [];
  return orderItems.reduce((acc, item) => {
    if (!item || typeof item !== 'object') return acc;
    const name = String(item.name || item.title || '').trim();
    const qty = Number(item.qty ?? item.quantity ?? 0);
    const price = Number(item.price ?? item.amount ?? 0);
    if (!name || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
      return acc;
    }
    acc.push({ name, qty, price });
    return acc;
  }, []);
}

function buildOrderEmail({ orderId, customerName, paymentMethod, orderItems, subtotal, tax, total, shopLocation }) {
  const brand = '#350008';
  const rows = orderItems.map(item => {
    const lineTotal = round2(item.qty * item.price);
    return `
      <tr>
        <td style="padding:8px;border:1px solid #eee;text-align:left">${item.name}</td>
        <td style="padding:8px;border:1px solid #eee;text-align:center">x${item.qty}</td>
        <td style="padding:8px;border:1px solid #eee;text-align:right">£${lineTotal.toFixed(2)}</td>
      </tr>`;
  }).join('');
  const totals = `
      <tr><td colspan="2" style="padding:8px;border:1px solid #eee;text-align:right">Subtotal</td><td style="padding:8px;border:1px solid #eee;text-align:right">£${subtotal.toFixed(2)}</td></tr>
      <tr><td colspan="2" style="padding:8px;border:1px solid #eee;text-align:right">Tax</td><td style="padding:8px;border:1px solid #eee;text-align:right">£${tax.toFixed(2)}</td></tr>
      <tr><td colspan="2" style="padding:8px;border:1px solid #eee;text-align:right;font-weight:bold">Total</td><td style="padding:8px;border:1px solid #eee;text-align:right;font-weight:bold">£${total.toFixed(2)}</td></tr>`;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:auto;border:1px solid #eee">
      <div style="background:${brand};color:#fff;padding:16px 20px;font-size:18px;font-weight:600">Wine Cellar</div>
      <div style="padding:20px">
        <p style="margin:0 0 12px 0">Dear ${customerName || 'Customer'},</p>
        <p style="margin:0 0 16px 0">Thank you for placing an order with Wine Cellar. This is a transactional confirmation email.</p>
        <p style="margin:0 0 16px 0">Your order <strong>${orderId}</strong> has been received.</p>
        <p style="margin:0 0 16px 0"><strong>Payment method:</strong> ${paymentMethod}</p>
        <table style="border-collapse:collapse;width:100%;margin:10px 0">
          <thead>
            <tr>
              <th style="padding:8px;border:1px solid #eee;text-align:left">Item</th>
              <th style="padding:8px;border:1px solid #eee;text-align:center">Qty</th>
              <th style="padding:8px;border:1px solid #eee;text-align:right">Line Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
          <tfoot>${totals}</tfoot>
        </table>
        ${shopLocation ? `<p style="margin:16px 0 0 0"><strong>Pickup location:</strong><br/>${shopLocation}</p>` : ''}
        <p style="margin:16px 0 0 0">If you have questions about your order, reply to this email or contact support.</p>
        <p style="margin:16px 0 0 0">Warm regards,<br/>Wine Cellar Team</p>
        <p style="margin:16px 0 0 0;font-size:12px;color:#555">This is an automated transactional email. Please do not reply directly.</p>
      </div>
    </div>`;

  const plainTextLines = [
    `Dear ${customerName || 'Customer'},`,
    'Thank you for placing an order with Wine Cellar.',
    `Order ID: ${orderId}`,
    `Payment method: ${paymentMethod}`,
    'Items:',
    ...orderItems.map(item => ` - ${item.name} x${item.qty} (£${round2(item.qty * item.price).toFixed(2)})`),
    `Subtotal: £${subtotal.toFixed(2)}`,
    `Tax: £${tax.toFixed(2)}`,
    `Total: £${total.toFixed(2)}`,
    shopLocation ? `Pickup location: ${shopLocation}` : '',
    'Thank you for shopping with Wine Cellar.'
  ].filter(Boolean);

  return { html, text: plainTextLines.join('\n') };
}

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

function sanitizeBillingDetails(details) {
  if (!details || typeof details !== 'object') return undefined;
  const allowedKeys = ['firstName', 'lastName', 'email', 'phone', 'address', 'postcode'];
  const sanitized = allowedKeys.reduce((acc, key) => {
    if (details[key] != null && details[key] !== '') acc[key] = details[key];
    return acc;
  }, {});
  return Object.keys(sanitized).length ? sanitized : undefined;
}

function normalizePickupStore(store) {
  if (!store || typeof store !== 'object') return undefined;
  const normalized = {};
  const storeId = store.storeId || store.id || store.store_id || store._id;
  const storeName = store.storeName || store.name || store.store_name;
  const addressLine1 = store.addressLine1 || store.addressLine || store.address1 || store.address || store.line1;
  const addressLine2 = store.addressLine2 || store.addressLineTwo || store.address2 || store.line2;
  const city = store.city || store.town;
  const state = store.state || store.region;
  const postcode = store.postcode || store.postalCode || store.zip || store.zipcode;
  const country = store.country;
  const phone = store.phone || store.telephone || store.contactNumber;

  if (storeId != null) normalized.storeId = String(storeId);
  if (storeName != null) normalized.storeName = storeName;
  if (addressLine1 != null) normalized.addressLine1 = addressLine1;
  if (addressLine2 != null) normalized.addressLine2 = addressLine2;
  if (city != null) normalized.city = city;
  if (state != null) normalized.state = state;
  if (postcode != null) normalized.postcode = postcode;
  if (country != null) normalized.country = country;
  if (phone != null) normalized.phone = phone;

  return Object.keys(normalized).length ? normalized : undefined;
}

function buildPickAndPayShippingAddress(pickupStore, fallbackAddress) {
  const baseAddress = fallbackAddress && typeof fallbackAddress === 'object' ? { ...fallbackAddress } : {};
  const storeDetails = normalizePickupStore(pickupStore);
  if (storeDetails) {
    if (storeDetails.storeId) baseAddress.storeId = storeDetails.storeId;
    if (storeDetails.storeName) baseAddress.storeName = storeDetails.storeName;
    if (storeDetails.addressLine1) {
      baseAddress.addressLine1 = storeDetails.addressLine1;
      baseAddress.line1 = storeDetails.addressLine1;
    }
    if (storeDetails.addressLine2) {
      baseAddress.addressLine2 = storeDetails.addressLine2;
      baseAddress.line2 = storeDetails.addressLine2;
    }
    if (storeDetails.city) baseAddress.city = storeDetails.city;
    if (storeDetails.state) baseAddress.state = storeDetails.state;
    if (storeDetails.postcode) baseAddress.postcode = storeDetails.postcode;
    if (storeDetails.country) baseAddress.country = storeDetails.country;
    if (storeDetails.phone) baseAddress.phone = storeDetails.phone;
  }
  return Object.keys(baseAddress).length ? baseAddress : undefined;
}

function mergeShippingWithPickupStore(shippingAddress, pickupStore) {
  if (!pickupStore || typeof pickupStore !== 'object') {
    return shippingAddress && typeof shippingAddress === 'object' ? { ...shippingAddress } : shippingAddress || null;
  }
  const merged = shippingAddress && typeof shippingAddress === 'object' ? { ...shippingAddress } : {};
  const fields = ['storeId', 'storeName', 'addressLine1', 'addressLine2', 'city', 'state', 'postcode', 'country', 'phone'];
  fields.forEach((key) => {
    if (pickupStore[key] != null && merged[key] == null) {
      merged[key] = pickupStore[key];
    }
  });
  if (pickupStore.addressLine1 != null && merged.line1 == null) merged.line1 = pickupStore.addressLine1;
  if (pickupStore.addressLine2 != null && merged.line2 == null) merged.line2 = pickupStore.addressLine2;
  return Object.keys(merged).length ? merged : null;
}

function serializeOrderForAdmin(doc) {
  if (!doc) return null;
  const order = typeof doc.toObject === 'function' ? doc.toObject({ virtuals: true }) : { ...doc };
  const pickupStore = order.pickupStore || null;
  const shippingAddress = mergeShippingWithPickupStore(order.shippingAddress, pickupStore);
  return {
    ...order,
    paymentMethod: order.paymentMethod || order.method || null,
    billingDetails: order.billingDetails || null,
    pickupStore,
    shippingAddress,
  };
}

// Create order (simple)
const { requireAuth, optionalAuth } = require('./userAuth');

router.post('/api/orders/create', optionalAuth, async (req, res) => {
  try {
    const {
      customerEmail,
      customerName,
      paymentMethod,
      orderItems,
      subtotal,
      tax,
      total,
      shopLocation,
    } = req.body || {};

    if (!customerEmail || typeof customerEmail !== 'string') {
      return res.status(400).json({ error: 'customerEmail is required' });
    }
    if (!customerName || typeof customerName !== 'string') {
      return res.status(400).json({ error: 'customerName is required' });
    }

    const normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);
    if (!normalizedPaymentMethod) {
      return res.status(400).json({ error: 'paymentMethod must be one of Debit Card | Credit Card | PayPal | Pick & Pay' });
    }

    const normalizedItems = normalizeOrderItems(orderItems);
    if (!normalizedItems.length) {
      return res.status(400).json({ error: 'orderItems must include at least one item with qty and price' });
    }

    const subtotalValue = Number(subtotal);
    const taxValue = Number(tax);
    const totalValue = Number(total);
    if (![subtotalValue, taxValue, totalValue].every(n => Number.isFinite(n) && n >= 0)) {
      return res.status(400).json({ error: 'subtotal, tax, total must be non-negative numbers' });
    }

    const orderId = generateOrderId();
    const orderDoc = new OrderDetails({
      trackingCode: orderId,
      method: normalizedPaymentMethod.toLowerCase(),
      paymentMethod: normalizedPaymentMethod,
      customer: {
        name: customerName,
        email: customerEmail,
      },
      items: normalizedItems,
      subtotal: subtotalValue,
      vat: taxValue,
      total: totalValue,
      pickupStore: shopLocation ? { storeName: shopLocation } : undefined,
      shippingFee: 0,
    });
    initializeOrderMetadata(orderDoc);
    await orderDoc.save();

    emailOwnerOrderPlaced(orderDoc).catch(() => {});
    const { html, text } = buildOrderEmail({
      orderId,
      customerName,
      paymentMethod: normalizedPaymentMethod,
      orderItems: normalizedItems,
      subtotal: subtotalValue,
      tax: taxValue,
      total: totalValue,
      shopLocation,
    });

    try {
      await sendMail(customerEmail, 'Thank you for placing an order', text, html);
    } catch (emailError) {
      console.error('Transactional email failed:', emailError.message);
      return res.status(502).json({ success: false, orderId, error: 'EMAIL_FAILED', message: 'Order saved but confirmation email could not be sent. Please contact support if you do not receive an email.' });
    }

    return res.json({ success: true, orderId });
  } catch (err) {
    console.error('order creation failed:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR' });
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

// Customer cancel by tracking code (optional auth)
router.post('/api/orders/cancel/:trackingCode', optionalAuth, async (req, res) => {
  try {
    const escapeRegExp = (s = '') => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const code = String(req.params.trackingCode || '').trim();
    if (!code) return res.status(404).json({ message: 'Order not found' });

    const order = await OrderDetails.findOne({ trackingCode: new RegExp(`^${escapeRegExp(code)}$`, 'i') });
    if (!order) return res.status(404).json({ message: 'Order not found' });

    const ip = (req.headers['x-forwarded-for'] || req.ip || '').toString();
    const ua = (req.headers['user-agent'] || '').toString();

    const current = String(order.status || '').toUpperCase();
    if (current === 'CANCELLED') {
      return res.status(409).json({ message: 'Already cancelled' });
    }
    const notCancellable = new Set(['SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED']);
    if (notCancellable.has(current)) {
      return res.status(409).json({ message: 'Cannot cancel at this stage' });
    }

    // If cookie user exists, the order must belong to them; otherwise, behave as public cancel window
    if (req.userId) {
      if (String(order.user_id || '') !== String(req.userId)) {
        // Hide existence to non-owners
        return res.status(404).json({ message: 'Order not found' });
      }
    }

    // Allowed cancel statuses: PLACED, CONFIRMED, PICKED, PROCESSING (PROCESSING may not be used but permitted)
    const allowed = new Set(['PLACED', 'CONFIRMED', 'PICKED', 'PROCESSING']);
    if (!allowed.has(current)) {
      return res.status(409).json({ message: 'Cannot cancel at this stage' });
    }

    order.status = 'CANCELLED';
    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({ status: 'CANCELLED', at: new Date(), note: 'Customer cancelled' });

    // Optional: restock inventory here if your system decremented stock on order creation
    await order.save();

    console.log('order cancellation', {
      trackingCode: order.trackingCode,
      userId: req.userId || null,
      ip,
      ua,
      at: new Date().toISOString(),
    });

    return res.json({ trackingCode: order.trackingCode, status: order.status });
  } catch (e) {
    return res.status(500).json({ error: e.message });
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
    const paymentMethodRaw = (req.query.paymentMethod || '').trim();
    const q = status ? { status } : {};
    if (paymentMethodRaw) q.paymentMethod = paymentMethodRaw.toLowerCase();
    const total = await OrderDetails.countDocuments(q);
    const items = await OrderDetails.find(q)
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();
    res.json({ items: items.map(serializeOrderForAdmin), total, page, pages: Math.ceil(total / limit) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: get one order with all details
router.get('/api/admin/orders/:id', requireAdmin, async (req, res) => {
  try {
    const order = await OrderDetails.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ error: 'Not found' });
    res.json(serializeOrderForAdmin(order));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Admin: manually create UPS shipment for an order
router.post('/api/admin/orders/:id/create-shipment', requireAdmin, async (req, res) => {
  try {
    const order = await createShipmentForOrder(req.params.id);
    res.json({ 
      message: 'UPS shipment created successfully',
      trackingNumber: order.carrierTrackingNumber,
      carrier: order.carrier,
      status: order.status
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;