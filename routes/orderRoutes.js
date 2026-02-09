const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { getOrder, updateOrderStatus, trackOrder, initializeOrderMetadata, emailOwnerOrderPlaced } = require('../controllers/orderController');
const { requireAdmin } = require('../config/requireAdmin');
const { sendMail, getEmailProvider } = require('../services/emailService');
const OrderDetails = require('../models/orderDetails');
const Product = require('../models/product');
const { clearCartForUserId } = require('../controllers/cartController');
const { updateOrderFromUPSTracking } = require('../services/upsTracking');
const { requireAuth, optionalAuth, requireAuthWithMessage } = require('./userAuth');
const { createUpsShipment, cancelUpsShipment } = require('../utils/upsShipment');
const { normalizeSizeInput } = require('../utils/sizeStocks');

const stripe = process.env.STRIPE_SECRET_KEY ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const VALID_PAYMENT_METHODS = new Map([
  ['debit card', 'Debit Card'],
  ['credit card', 'Credit Card'],
  ['card', 'Credit Card'],
  ['paypal', 'PayPal'],
  ['pick & pay', 'Pick & Pay'],
  ['pick and pay', 'Pick & Pay'],
  ['pick_pay', 'Pick & Pay'],
  ['pickandpay', 'Pick & Pay'],
  ['cod', 'Pick & Pay']
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

    const name = String(item.name || item.title || item.ProductName || item.productName || '').trim();
    const qtyValue = Number(item.qty ?? item.quantity ?? 0);
    const qty = Number.isFinite(qtyValue) ? Math.floor(qtyValue) : NaN;
    const priceValue = Number(item.price ?? item.amount ?? item.unitPrice ?? item.unit_price ?? 0);
    const price = Number.isFinite(priceValue) ? priceValue : NaN;
    const productIdRaw = item.productId ?? item.product_id ?? item.ProductId ?? item.productID ?? item.id;
    const productId = productIdRaw != null ? String(productIdRaw).trim() : null;
    const skuRaw = item.sku ?? item.SKU ?? item.productSku ?? item.productSKU ?? null;
    const sizeRaw = item.size ?? item.selectedSize ?? item.productSize ?? item.sizeLabel ?? item.size_key ?? null;
    const normalizedSize = sizeRaw ? normalizeSizeInput(sizeRaw) : '';

    if (!name || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price < 0) {
      return acc;
    }

    acc.push({
      productId,
      name,
      sku: skuRaw ? String(skuRaw).trim() : null,
      size: normalizedSize || null,
      sizeLabel: sizeRaw ? String(sizeRaw).trim() : null,
      qty,
      price,
    });
    return acc;
  }, []);
}

function buildSizeKeyCandidates(sizeRaw, canonicalKey) {
  const candidates = new Set();
  if (canonicalKey) {
    candidates.add(canonicalKey);
  }
  if (sizeRaw) {
    const raw = String(sizeRaw).trim();
    if (raw) {
      candidates.add(raw);
      candidates.add(raw.toUpperCase());
      candidates.add(raw.toUpperCase().replace(/\s+/g, ''));
    }
  }
  // common legacy variant: 70_CL -> 70CL, 1_LTR -> 1LTR
  if (canonicalKey) {
    candidates.add(String(canonicalKey).replace(/_/g, ''));
  }
  return Array.from(candidates).filter(Boolean);
}

function resolveExistingSizeKey(productDoc, sizeRaw, canonicalKey) {
  const sizesObj = productDoc?.sizes?.toObject?.() || productDoc?.sizes || {};
  const candidates = buildSizeKeyCandidates(sizeRaw, canonicalKey);
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(sizesObj, key)) {
      return key;
    }
  }
  return canonicalKey || candidates[0] || '';
}

router.get('/api/my-orders', requireAuth, async (req, res) => {
  try {
    const orders = await OrderDetails.find({ user_id: req.user._id })
      .sort({ created_at: -1 })
      .lean();

    const formatted = orders.map((order) => {
      const statusMeta = buildOrderStatusSummary(order);
      const upsTrackingNumber = order.upsTrackingNumber || order.carrierTrackingNumber || null;
      return {
        id: String(order._id),
        trackingCode: upsTrackingNumber || order.trackingCode,
        internalTrackingCode: order.trackingCode,
        upsTrackingNumber,
        status: order.status,
        statusDisplay: statusMeta.statusDisplay,
        statusMessage: statusMeta.statusMessage,
        pickupLocation: statusMeta.pickupLocation,
        createdAt: order.created_at,
        total: order.total,
        paymentMethod: order.paymentMethod,
        items: order.items,
        pickupStore: order.pickupStore,
        shippingAddress: order.shippingAddress,
      };
    });

    return res.json({ orders: formatted });
  } catch (err) {
    return res.status(500).json({ error: 'FAILED_TO_FETCH_ORDERS' });
  }
});

function extractOrderPayload(body = {}) {
  const customerEmail = body.customerEmail || body.customer?.email || body.billingDetails?.email;
  const customerName = body.customerName || body.customer?.name || [body.billingDetails?.firstName, body.billingDetails?.lastName].filter(Boolean).join(' ').trim();
  const paymentMethod = body.paymentMethod || body.method || body.payment_method || body.paymentType;
  const orderItems = body.orderItems || body.items || [];
  const subtotalRaw = body.subtotal ?? body.subtotalAmount ?? body.sub_total;
  const taxRaw = body.tax ?? body.vat ?? body.taxAmount;
  const totalRaw = body.total ?? body.totalAmount ?? body.amountPaid;
  const shopLocation = body.shopLocation || body.pickupStore?.storeName || body.storeLocation;
  const billingDetails = body.billingDetails || null;
  const pickupDetails = body.pickupDetails || null;
  const pickupStore = body.pickupStore || null;
  const shippingAddress = body.shippingAddress || body.shipping || body.deliveryAddress || body.address || null;
  const paymentReference = body.paymentReference || body.payment_reference || body.paymentId || body.payment_id || body.orderId || body.orderID || null;

  return {
    customerEmail,
    customerName,
    paymentMethod,
    orderItems,
    subtotal: subtotalRaw,
    tax: taxRaw,
    total: totalRaw,
    shopLocation,
    billingDetails,
    pickupDetails,
    pickupStore,
    shippingAddress,
    paymentReference,
  };
}

function normalizeShippingAddress(address, fallbackBillingDetails) {
  if (address && typeof address === 'object') {
    const line1 = address.line1 || address.addressLine1 || address.address1 || address.address || address.street || address.street1;
    const line2 = address.line2 || address.addressLine2 || address.address2 || address.street2;
    const city = address.city || address.town;
    const state = address.state || address.region;
    const postcode = address.postcode || address.postalCode || address.zip || address.zipcode;
    const country = address.country || address.countryCode;
    const phone = address.phone || address.telephone;

    const normalized = {};
    if (line1 != null) normalized.line1 = String(line1);
    if (line2 != null) normalized.line2 = String(line2);
    if (city != null) normalized.city = String(city);
    if (state != null) normalized.state = String(state);
    if (postcode != null) normalized.postcode = String(postcode);
    if (country != null) normalized.country = String(country);
    if (phone != null) normalized.phone = String(phone);
    return Object.keys(normalized).length ? normalized : undefined;
  }

  const billing = fallbackBillingDetails && typeof fallbackBillingDetails === 'object' ? fallbackBillingDetails : null;
  if (!billing) return undefined;
  const fallback = {};
  if (billing.address != null) fallback.line1 = String(billing.address);
  if (billing.postcode != null) fallback.postcode = String(billing.postcode);
  if (billing.phone != null) fallback.phone = String(billing.phone);
  if (billing.country != null) fallback.country = String(billing.country);
  if (billing.city != null) fallback.city = String(billing.city);
  return Object.keys(fallback).length ? fallback : undefined;
}

function buildOrderEmail({ orderId, customerName, paymentMethod, orderItems, subtotal, tax, total, shopLocation, billingDetails, pickupStore, isPickAndPay }) {
  const brand = '#350008';
  const billing = billingDetails && typeof billingDetails === 'object' ? billingDetails : {};
  const fullName = `${billing.firstName || ''} ${billing.lastName || ''}`.trim() || customerName || 'Customer';
  const billingLines = [
    fullName && `<strong>Name:</strong> ${fullName}`,
    (billing.email || '') && `<strong>Email:</strong> ${billing.email}`,
    (billing.phone || '') && `<strong>Phone:</strong> ${billing.phone}`,
    (billing.address || '') && `<strong>Address:</strong> ${billing.address}`,
    (billing.postcode || '') && `<strong>Postcode:</strong> ${billing.postcode}`,
  ].filter(Boolean).join('<br/>');
  const pickup = pickupStore && typeof pickupStore === 'object' ? pickupStore : null;
  const pickupLines = pickup ? [
    pickup.storeName && `<strong>Store:</strong> ${pickup.storeName}`,
    pickup.addressLine1 && `${pickup.addressLine1}`,
    pickup.addressLine2 && `${pickup.addressLine2}`,
    (pickup.city || pickup.postcode || pickup.country) && [pickup.city, pickup.postcode, pickup.country].filter(Boolean).join(', '),
    pickup.phone && `Contact: ${pickup.phone}`,
  ].filter(Boolean).join('<br/>') : '';
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
        <p style="margin:0 0 12px 0">Dear ${fullName},</p>
        <p style="margin:0 0 16px 0">Thank you for placing an order with Wine Cellar. We appreciate your patronage—visit us soon!</p>
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
        ${billingLines ? `<p style="margin:16px 0 0 0"><strong>Billing details</strong><br/>${billingLines}</p>` : ''}
        ${isPickAndPay && (pickupLines || shopLocation) ? `<p style="margin:16px 0 0 0"><strong>Store pickup</strong><br/>${pickupLines || shopLocation}</p>` : ''}
        ${!isPickAndPay && shopLocation ? `<p style="margin:16px 0 0 0"><strong>Shop:</strong><br/>${shopLocation}</p>` : ''}
        <p style="margin:16px 0 0 0">If you have questions about your order, reply to this email or contact support.</p>
        <p style="margin:16px 0 0 0">Warm regards,<br/>Wine Cellar Team</p>
        <p style="margin:16px 0 0 0;font-size:12px;color:#555">This is an automated transactional email. Please do not reply directly.</p>
      </div>
    </div>`;

  const plainTextLines = [
    `Dear ${fullName},`,
    'Thank you for placing an order with Wine Cellar. We appreciate your patronage—visit us soon!',
    `Order ID: ${orderId}`,
    `Payment method: ${paymentMethod}`,
    'Items:',
    ...orderItems.map(item => ` - ${item.name} x${item.qty} (£${round2(item.qty * item.price).toFixed(2)})`),
    `Subtotal: £${subtotal.toFixed(2)}`,
    `Tax: £${tax.toFixed(2)}`,
    `Total: £${total.toFixed(2)}`,
    billing.address ? `Billing address: ${billing.address}` : '',
    billing.postcode ? `Billing postcode: ${billing.postcode}` : '',
    isPickAndPay ? (shopLocation ? `Pickup location: ${shopLocation}` : '') : (shopLocation ? `Shop: ${shopLocation}` : ''),
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

function createOrderError(statusCode, code, message, details = {}) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.clientCode = code;
  error.clientMessage = message;
  error.details = details;
  return error;
}

async function attemptRefundForPaymentReference(paymentReference) {
  if (!stripe) {
    return { attempted: false, refunded: false, reason: 'stripe_not_configured' };
  }

  const ref = String(paymentReference || '').trim();
  if (!ref.startsWith('pi_')) {
    return { attempted: false, refunded: false, reason: 'not_payment_intent' };
  }

  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(ref);
    const status = paymentIntent?.status;

    if (status !== 'succeeded') {
      return { attempted: true, refunded: false, reason: `payment_intent_status_${status || 'unknown'}` };
    }

    const refundParams = paymentIntent.latest_charge
      ? { charge: paymentIntent.latest_charge }
      : { payment_intent: ref };

    const refund = await stripe.refunds.create(refundParams, {
      idempotencyKey: `refund_${ref}`,
    });

    return { attempted: true, refunded: true, refundId: refund?.id || null };
  } catch (e) {
    return { attempted: true, refunded: false, reason: e?.message || 'refund_failed' };
  }
}

function stripUndefinedFields(obj = {}) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

async function restoreStockForOrder(orderDoc, session) {
  if (!orderDoc || !Array.isArray(orderDoc.items) || !orderDoc.items.length) {
    return [];
  }

  const restockDetails = [];
  const now = new Date();

  for (const [index, item] of orderDoc.items.entries()) {
    const productId = item.productId || item.product_id || item.ProductId || item.product_id;
    const sizeKey = item.size || item.sizeKey || item.size_key || null;
    const qty = Number(item.qty || item.quantity || 0);

    if (!productId || !mongoose.isValidObjectId(productId) || !sizeKey || !Number.isFinite(qty) || qty <= 0) {
      restockDetails.push({ index, productId: productId || null, size: sizeKey || null, qty, skipped: true });
      continue;
    }

    const productBefore = await Product.findById(productId).session(session);
    if (!productBefore) {
      restockDetails.push({ index, productId, size: sizeKey, qty, restored: false });
      continue;
    }

    const resolvedSizeKey = resolveExistingSizeKey(productBefore, item.sizeLabel, sizeKey);
    const updateResult = await Product.updateOne(
      { _id: productId },
      {
        $inc: {
          [`sizes.${resolvedSizeKey}`]: qty,
          totalStock: qty,
        },
        $set: {
          modified_at: now,
        },
      },
      { session }
    );

    if (updateResult.modifiedCount === 0) {
      restockDetails.push({ index, productId, size: sizeKey, qty, restored: false });
      throw createOrderError(409, 'STOCK_RESTORE_CONFLICT', 'Unable to restore stock for one of the items', {
        itemIndex: index,
        productId,
        size: resolvedSizeKey,
        qty,
      });
    }

    const product = await Product.findById(productId).session(session);
    if (product) {
      const newTotal = Number(product.totalStock || 0);
      const desiredInStock = newTotal > 0;
      if (product.inStock !== desiredInStock) {
        await Product.updateOne({ _id: product._id }, { $set: { inStock: desiredInStock } }, { session });
      }
    }

    restockDetails.push({ index, productId, size: sizeKey, qty, restored: true });
  }

  return restockDetails;
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

const STATUS_DISPLAY_LABELS = {
  PLACED: 'Order placed',
  CONFIRMED: 'Processed',
  PICKED: 'Picked & packed',
  SHIPPED: 'Shipped',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

function isPickAndPayOrder(order) {
  const method = String(order?.paymentMethod || order?.method || '').trim().toLowerCase();
  return method === 'pick & pay';
}

function buildPickAndPayStatus(order) {
  const pickup = order?.pickupStore || {};
  const segments = [pickup.storeName, pickup.addressLine1, pickup.addressLine2, pickup.city]
    .filter(Boolean)
    .join(', ');
  const pickupLocation = segments || pickup.storeName || pickup.addressLine1 || 'the store';
  return {
    statusDisplay: 'Ready for collection',
    statusMessage: `Please collect it at the store${pickupLocation ? `: ${pickupLocation}` : ''}. Thank you!`,
    pickupLocation: pickupLocation || null,
  };
}

function buildOrderStatusSummary(order, trackingInfo = null) {
  if (!order) {
    return {
      statusDisplay: 'Order placed',
      statusMessage: 'Order placed',
      pickupLocation: null,
    };
  }

  const status = order.status || 'PLACED';

  if (isPickAndPayOrder(order)) {
    const pickStatus = buildPickAndPayStatus(order);
    return { statusDisplay: pickStatus.statusDisplay, statusMessage: pickStatus.statusMessage, pickupLocation: pickStatus.pickupLocation };
  }

  const statusDisplay = STATUS_DISPLAY_LABELS[status] || status;
  let statusMessage = statusDisplay;

  if (order.carrier === 'UPS' && trackingInfo?.statusDescription) {
    statusMessage = trackingInfo.statusDescription;
  } else if (Array.isArray(order.statusHistory) && order.statusHistory.length) {
    statusMessage = order.statusHistory[order.statusHistory.length - 1].note || statusDisplay;
  }

  return { statusDisplay, statusMessage, pickupLocation: null };
}

async function syncOrderWithUPSIfNeeded(order) {
  if (!order || order.carrier !== 'UPS' || !order.carrierTrackingNumber) {
    return { order, trackingInfo: null };
  }

  try {
    const result = await updateOrderFromUPSTracking(order._id);
    return {
      order: result?.order || order,
      trackingInfo: result?.trackingInfo || null,
    };
  } catch (err) {
    console.error('UPS sync (track endpoint) failed:', err.message);
    return { order, trackingInfo: null };
  }
}

router.post('/api/orders/create', requireAuthWithMessage('Authentication required to place orders'), async (req, res) => {
  try {
    const userId = req.user?._id;
    const extracted = extractOrderPayload(req.body);
    const {
      customerEmail,
      customerName,
      paymentMethod,
      orderItems,
      subtotal,
      tax,
      total,
      shopLocation,
      billingDetails,
      pickupStore,
      shippingAddress,
      paymentReference,
    } = extracted;

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

    // Idempotency: prevent duplicate emails/orders for the same payment reference
    if (paymentReference) {
      const existing = await OrderDetails.findOne({ paymentReference: String(paymentReference) });
      if (existing) {
        if (!existing.user_id || (userId && String(existing.user_id) === String(userId))) {
          return res.json({
            orderId: existing.trackingCode || String(existing._id),
            trackingCode: existing.trackingCode || String(existing._id),
            emailSent: !!existing.emailSent,
          });
        }
        return res.status(403).json({ error: 'ORDER_CONFLICT', message: 'Another account has already registered this payment reference.' });
      }
    }

    const normalizedItems = normalizeOrderItems(orderItems);
    if (!normalizedItems.length) {
      return res.status(400).json({ error: 'orderItems must include at least one item with qty and price' });
    }

    const invalidProductRefs = normalizedItems.reduce((acc, item, index) => {
      if (!item.productId || !mongoose.isValidObjectId(item.productId)) {
        acc.push({ index, productId: item.productId || null });
      }
      return acc;
    }, []);

    if (invalidProductRefs.length) {
      return res.status(400).json({
        error: 'INVALID_PRODUCT_REFERENCE',
        message: 'One or more order items are missing a valid product reference',
        details: { items: invalidProductRefs },
      });
    }

    const fallbackSubtotal = normalizedItems.reduce((sum, item) => sum + (item.price * item.qty), 0);
    const subtotalValue = Number(subtotal);
    const safeSubtotal = Number.isFinite(subtotalValue) && subtotalValue >= 0 ? subtotalValue : round2(fallbackSubtotal);
    const taxValue = Number(tax);
    const safeTax = Number.isFinite(taxValue) && taxValue >= 0 ? taxValue : 0;
    const totalValue = Number(total);
    const safeTotal = Number.isFinite(totalValue) && totalValue >= 0 ? totalValue : round2(safeSubtotal + safeTax);

    const orderId = generateOrderId();
    const isPickAndPay = normalizedPaymentMethod === 'Pick & Pay';
    const sanitizedBillingDetails = sanitizeBillingDetails(billingDetails);
    const normalizedPickupStore = normalizePickupStore(pickupStore) || (shopLocation ? { storeName: shopLocation } : undefined);
    const normalizedShippingAddress = isPickAndPay
      ? buildPickAndPayShippingAddress(normalizedPickupStore, shippingAddress)
      : normalizeShippingAddress(shippingAddress, billingDetails);

    if (normalizedShippingAddress && !normalizedShippingAddress.storeName) {
      const storeNameFromOrder = normalizedPickupStore?.storeName || shopLocation;
      if (storeNameFromOrder) {
        normalizedShippingAddress.storeName = storeNameFromOrder;
      }
    }

    let orderDoc;
    let session;
    try {
      session = await mongoose.startSession();
      session.startTransaction();

      const orderItemsForDoc = [];
      const now = new Date();

      for (const [index, item] of normalizedItems.entries()) {
        const canonicalSizeKey = item.size;
        if (!canonicalSizeKey) {
          throw createOrderError(400, 'SIZE_REQUIRED', 'Size is required for this product', {
            index,
            productId: item.productId,
          });
        }

        const productBefore = await Product.findById(item.productId).session(session);
        if (!productBefore) {
          throw createOrderError(400, 'OUT_OF_STOCK', "THAT'S ALL WE HAVE FOR NOW", {
            index,
            productId: item.productId,
            size: canonicalSizeKey,
            requested: item.qty,
          });
        }

        const resolvedSizeKey = resolveExistingSizeKey(productBefore, item.sizeLabel, canonicalSizeKey);
        const currentQty = Number(
          (productBefore.sizes?.toObject?.() || productBefore.sizes || {})[resolvedSizeKey] ?? 0
        );
        const currentTotal = Number(productBefore.totalStock ?? 0);
        if (!Number.isFinite(currentQty) || currentQty < item.qty || !Number.isFinite(currentTotal) || currentTotal < item.qty) {
          throw createOrderError(400, 'OUT_OF_STOCK', "THAT'S ALL WE HAVE FOR NOW", {
            index,
            productId: item.productId,
            size: canonicalSizeKey,
            requested: item.qty,
          });
        }

        const updateFilter = {
          _id: item.productId,
          [`sizes.${resolvedSizeKey}`]: { $gte: item.qty },
          totalStock: { $gte: item.qty },
        };

        const updateDoc = {
          $inc: {
            [`sizes.${resolvedSizeKey}`]: -item.qty,
            totalStock: -item.qty,
          },
          $set: {
            modified_at: now,
          },
        };

        const updateResult = await Product.updateOne(updateFilter, updateDoc, { session });
        if (updateResult.modifiedCount === 0) {
          throw createOrderError(400, 'OUT_OF_STOCK', "THAT'S ALL WE HAVE FOR NOW", {
            index,
            productId: item.productId,
            size: canonicalSizeKey,
            requested: item.qty,
          });
        }

        const product = await Product.findById(item.productId).session(session);
        if (!product) {
          throw createOrderError(409, 'STOCK_UPDATE_CONFLICT', 'Unable to confirm stock update for this item', {
            index,
            productId: item.productId,
            size: canonicalSizeKey,
            requested: item.qty,
          });
        }

        const newTotal = Number(product.totalStock || 0);
        const desiredInStock = newTotal > 0;
        if (product.inStock !== desiredInStock) {
          await Product.updateOne({ _id: product._id }, { $set: { inStock: desiredInStock } }, { session });
          product.inStock = desiredInStock;
        }

        const orderItemDoc = stripUndefinedFields({
          productId: product._id,
          name: item.name || product.name,
          sku: item.sku || product.SKU || product.sku,
          size: canonicalSizeKey,
          sizeLabel: item.sizeLabel || canonicalSizeKey,
          qty: item.qty,
          price: item.price,
        });

        orderItemsForDoc.push(orderItemDoc);
      }

      orderDoc = new OrderDetails({
        trackingCode: orderId,
        method: normalizedPaymentMethod.toLowerCase(),
        paymentMethod: normalizedPaymentMethod,
        paymentReference: paymentReference ? String(paymentReference) : undefined,
        user_id: userId,
        customer: {
          name: customerName,
          email: customerEmail,
        },
        items: orderItemsForDoc,
        subtotal: safeSubtotal,
        vat: safeTax,
        total: safeTotal,
        billingDetails: sanitizedBillingDetails,
        pickupStore: normalizedPickupStore,
        shippingAddress: normalizedShippingAddress,
        shippingFee: 0,
        emailProvider: getEmailProvider(),
      });

      initializeOrderMetadata(orderDoc);
      await orderDoc.save({ session });

      await session.commitTransaction();
    } catch (transactionError) {
      if (session) {
        try {
          await session.abortTransaction();
        } catch (_) {}
      }
      throw transactionError;
    } finally {
      if (session) {
        session.endSession();
      }
    }

    const upsEnvStatus = {
      UPS_ENV: process.env.UPS_ENV || null,
      UPS_CLIENT_ID: process.env.UPS_CLIENT_ID ? 'set' : 'missing',
      UPS_CLIENT_SECRET: process.env.UPS_CLIENT_SECRET ? 'set' : 'missing',
      UPS_ACCOUNT_NUMBER: process.env.UPS_ACCOUNT_NUMBER ? 'set' : 'missing',
    };

    const upsAddressMissing = [];
    if (!orderDoc.shippingAddress?.line1) upsAddressMissing.push('shippingAddress.line1');
    if (!orderDoc.shippingAddress?.city) upsAddressMissing.push('shippingAddress.city');
    if (!orderDoc.shippingAddress?.postcode) upsAddressMissing.push('shippingAddress.postcode');
    if (!orderDoc.shippingAddress?.country) upsAddressMissing.push('shippingAddress.country');

    const upsEligiblePaymentMethods = new Set(['Credit Card', 'Debit Card', 'PayPal']);
    const shouldAttemptUpsShipment = !isPickAndPay && upsEligiblePaymentMethods.has(normalizedPaymentMethod);

    console.log('UPS shipment attempt', {
      orderId: String(orderDoc._id),
      trackingCode: orderDoc.trackingCode,
      paymentMethod: orderDoc.paymentMethod,
      isPickAndPay,
      shouldAttemptUpsShipment,
      paymentReference: orderDoc.paymentReference || null,
      hasShippingAddress: !!orderDoc.shippingAddress,
      upsAddressMissing,
      shippingAddress: orderDoc.shippingAddress || null,
      upsEnvStatus,
    });

    if (shouldAttemptUpsShipment) {
      try {
        const upsResponse = await createUpsShipment(orderDoc);
      const trackingNumber =
        upsResponse?.ShipmentResponse
          ?.ShipmentResults
          ?.PackageResults
          ?.TrackingNumber;

      const shipmentIdentificationNumber =
        upsResponse?.ShipmentResponse
          ?.ShipmentResults
          ?.ShipmentIdentificationNumber;

      if (!trackingNumber) {
        const err = new Error('UPS response missing TrackingNumber');
        err.statusCode = 502;
        throw err;
      }

      orderDoc.upsTrackingNumber = String(trackingNumber);
      if (shipmentIdentificationNumber) {
        orderDoc.upsShipmentIdentificationNumber = String(shipmentIdentificationNumber);
      }
      orderDoc.upsStatus = 'CREATED';
      orderDoc.carrier = 'UPS';
      orderDoc.carrierTrackingNumber = String(trackingNumber);
      await orderDoc.save();

      console.log('UPS shipment created', {
        orderId: String(orderDoc._id),
        trackingCode: orderDoc.trackingCode,
        carrier: orderDoc.carrier,
        carrierTrackingNumber: orderDoc.carrierTrackingNumber,
        upsTrackingNumber: orderDoc.upsTrackingNumber,
        upsStatus: orderDoc.upsStatus,
      });
      } catch (shipmentError) {
        console.error('UPS shipment creation skipped/failed:', {
          message: shipmentError && shipmentError.message ? shipmentError.message : String(shipmentError),
          statusCode: shipmentError && shipmentError.statusCode ? shipmentError.statusCode : null,
          orderId: String(orderDoc._id),
          trackingCode: orderDoc.trackingCode,
          paymentMethod: orderDoc.paymentMethod,
          upsAddressMissing,
          upsEnvStatus,
          stack: shipmentError && shipmentError.stack ? shipmentError.stack : null,
        });

        try {
          orderDoc.upsStatus = 'FAILED';
          await orderDoc.save();
        } catch (_) {}
      }
    }

    emailOwnerOrderPlaced(orderDoc).catch(() => {});
    const { html, text } = buildOrderEmail({
      orderId,
      customerName,
      paymentMethod: normalizedPaymentMethod,
      orderItems: normalizedItems,
      subtotal: safeSubtotal,
      tax: safeTax,
      total: safeTotal,
      shopLocation,
      billingDetails: sanitizedBillingDetails,
      pickupStore: normalizedPickupStore,
      isPickAndPay,
    });

    let emailSent = false;
    try {
      await sendMail(customerEmail, 'Thank you for placing an order', text, html);
      emailSent = true;
      orderDoc.emailSent = true;
      await orderDoc.save();
    } catch (emailError) {
      console.error('Transactional email failed:', emailError && emailError.message ? emailError.message : emailError);
      orderDoc.emailSent = false;
      try { await orderDoc.save(); } catch (_) {}
    }

    if (userId) {
      clearCartForUserId(userId).catch((err) => {
        console.error('Failed to clear cart after order:', err);
      });
    }

    const upsTrackingNumber = orderDoc.upsTrackingNumber || orderDoc.carrierTrackingNumber || null;
    return res.json({
      success: true,
      orderId: String(orderDoc._id),
      dbOrderId: String(orderDoc._id),
      trackingCode: upsTrackingNumber || orderId,
      internalTrackingCode: orderId,
      upsTrackingNumber,
      emailSent,
    });
  } catch (err) {
    console.error('order creation failed:', err);
    const statusCode = err && Number.isInteger(err.statusCode) ? err.statusCode : 500;
    const clientCode = err?.clientCode || (statusCode >= 500 ? 'INTERNAL_ERROR' : 'ORDER_ERROR');
    const message = err?.clientMessage || err?.message || 'An unexpected error occurred while creating the order.';

    const paymentReference = req.body?.paymentReference || req.body?.payment_reference || req.body?.paymentId || req.body?.payment_id || req.body?.orderId || req.body?.orderID;
    const refund = paymentReference ? await attemptRefundForPaymentReference(paymentReference) : { attempted: false, refunded: false };

    const payload = {
      error: clientCode,
      message,
      ...(refund.attempted ? { refundAttempted: true, refunded: !!refund.refunded, refundId: refund.refundId || null, refundReason: refund.reason || null } : {}),
    };
    if (err?.details) {
      payload.details = err.details;
    }
    return res.status(statusCode).json(payload);
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
    const order = await OrderDetails.findOne({
      $or: [
        { trackingCode: code },
        { carrierTrackingNumber: code },
        { upsTrackingNumber: code },
      ],
    });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    const sessionUserId = req.user?._id ? String(req.user._id) : null;
    const isOwner = sessionUserId && String(order.user_id || '') === sessionUserId;
    const syncResult = await syncOrderWithUPSIfNeeded(order);
    const currentOrder = syncResult.order || order;
    const trackingInfo = syncResult.trackingInfo;
    const statusMeta = buildOrderStatusSummary(currentOrder, trackingInfo);

    const upsTrackingNumber = currentOrder.upsTrackingNumber || currentOrder.carrierTrackingNumber || null;

    const basePayload = {
      trackingCode: upsTrackingNumber || currentOrder.trackingCode,
      internalTrackingCode: currentOrder.trackingCode,
      upsTrackingNumber,
      status: currentOrder.status,
      statusDisplay: statusMeta.statusDisplay,
      statusMessage: statusMeta.statusMessage,
      pickupLocation: statusMeta.pickupLocation || undefined,
      estimatedDelivery: currentOrder.estimatedDelivery,
    };

    if (isOwner) {
      return res.json({
        ...basePayload,
        statusHistory: currentOrder.statusHistory,
        customer: currentOrder.customer,
        shippingAddress: currentOrder.shippingAddress,
        items: currentOrder.items,
        subtotal: currentOrder.subtotal,
        shippingFee: currentOrder.shippingFee,
        total: currentOrder.total,
        createdAt: currentOrder.created_at,
        trackingInfo: trackingInfo || undefined,
      });
    }

    if (trackingInfo) {
      basePayload.trackingInfo = {
        status: trackingInfo.status,
        statusDescription: trackingInfo.statusDescription,
        deliveryDate: trackingInfo.deliveryDate,
      };
    }

    return res.json(basePayload);
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
    if (req.user?._id) {
      if (String(order.user_id || '') !== String(req.user._id)) {
        // Hide existence to non-owners
        return res.status(404).json({ message: 'Order not found' });
      }
    }

    // Allowed cancel statuses: PLACED, CONFIRMED, PICKED, PROCESSING (PROCESSING may not be used but permitted)
    const allowed = new Set(['PLACED', 'CONFIRMED', 'PICKED', 'PROCESSING']);
    if (!allowed.has(current)) {
      return res.status(409).json({ message: 'Cannot cancel at this stage' });
    }

    const session = await mongoose.startSession();
    let restockSummary = [];
    try {
      session.startTransaction();

      restockSummary = await restoreStockForOrder(order, session);

      order.status = 'CANCELLED';
      order.statusHistory = order.statusHistory || [];
      order.statusHistory.push({ status: 'CANCELLED', at: new Date(), note: 'Customer cancelled' });
      await order.save({ session });

      await session.commitTransaction();
    } catch (restoreErr) {
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      console.error('order cancellation stock restore failed:', {
        trackingCode: order.trackingCode,
        message: restoreErr?.message,
        stack: restoreErr?.stack,
      });
      const err = createOrderError(500, 'STOCK_RESTORE_FAILED', 'Failed to restore stock for cancelled order');
      err.details = { trackingCode: order.trackingCode };
      throw err;
    } finally {
      session.endSession();
    }

    if (order.carrier === 'UPS' && order.upsStatus === 'CREATED' && order.upsVoidStatus !== 'VOIDED') {
      try {
        const voidResult = await cancelUpsShipment({
          shipmentIdentificationNumber: order.upsShipmentIdentificationNumber,
          trackingNumber: order.carrierTrackingNumber || order.upsTrackingNumber,
        });
        order.upsVoidStatus = 'VOIDED';
        order.upsVoidResponse = voidResult;
        await order.save();
      } catch (voidErr) {
        console.error('UPS void failed during order cancel:', {
          trackingCode: order.trackingCode,
          shipmentIdentificationNumber: order.upsShipmentIdentificationNumber || null,
          trackingNumber: order.carrierTrackingNumber || order.upsTrackingNumber || null,
          message: voidErr && voidErr.message ? voidErr.message : String(voidErr),
          status: voidErr && voidErr.response ? voidErr.response.status : null,
          data: voidErr && voidErr.response ? voidErr.response.data : null,
        });
        try {
          order.upsVoidStatus = 'FAILED';
          order.upsVoidResponse = voidErr && voidErr.response ? voidErr.response.data : { message: voidErr.message };
          await order.save();
        } catch (_) {}
      }
    }

    console.log('order cancellation', {
      trackingCode: order.trackingCode,
      userId: req.user?._id || null,
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
    const order = await OrderDetails.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Not found' });

    if (isPickAndPayOrder(order)) {
      return res.status(409).json({ error: 'Pick & Pay orders cannot be shipped with UPS' });
    }

    const upsResponse = await createUpsShipment(order);
    const trackingNumber =
      upsResponse?.ShipmentResponse
        ?.ShipmentResults
        ?.PackageResults
        ?.TrackingNumber;

    const shipmentIdentificationNumber =
      upsResponse?.ShipmentResponse
        ?.ShipmentResults
        ?.ShipmentIdentificationNumber;

    if (!trackingNumber) {
      return res.status(502).json({ error: 'UPS response missing TrackingNumber' });
    }

    order.upsTrackingNumber = String(trackingNumber);
    if (shipmentIdentificationNumber) {
      order.upsShipmentIdentificationNumber = String(shipmentIdentificationNumber);
    }
    order.upsStatus = 'CREATED';
    order.carrier = 'UPS';
    order.carrierTrackingNumber = String(trackingNumber);
    await order.save();

    res.json({
      message: 'UPS shipment created successfully',
      trackingNumber: order.carrierTrackingNumber,
      upsTrackingNumber: order.upsTrackingNumber,
      shipmentIdentificationNumber: order.upsShipmentIdentificationNumber || undefined,
      carrier: order.carrier,
      upsStatus: order.upsStatus,
      status: order.status,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;