const { v4: uuidv4 } = require('uuid');
const OrderDetails = require('../models/orderDetails');
const { createUPSShipment } = require('../services/upsShipment');
const { sendMail } = require('../services/emailService');

async function getOrder(req, res) {
  try {
    const { id } = req.params;
    const order = await OrderDetails.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching order', error: err.message });
  }
}

async function trackOrder(req, res) {
  try {
    const { trackingCode } = req.params;
    const order = await OrderDetails.findOne({ trackingCode });
    if (!order) return res.status(404).json({ message: 'Tracking code not found' });
    res.json({
      trackingCode: order.trackingCode,
      status: order.status,
      statusHistory: order.statusHistory,
      updatedAt: order.modified_at,
      carrierTrackingNumber: order.carrierTrackingNumber,
    });
  } catch (err) {
    res.status(500).json({ message: 'Error tracking order', error: err.message });
  }
}

async function updateOrderStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    const order = await OrderDetails.findById(id);
    if (!order) return res.status(404).json({ message: 'Order not found' });
    order.status = status;
    order.statusHistory.push({ status, note });
    order.modified_at = new Date();
    await order.save();
    res.json({ message: 'Status updated', order });
  } catch (err) {
    res.status(500).json({ message: 'Error updating status', error: err.message });
  }
}

function initializeOrderMetadata(orderDoc) {
  orderDoc.trackingCode = orderDoc.trackingCode || uuidv4();
  orderDoc.status = 'PLACED';
  orderDoc.statusHistory = [{ status: 'PLACED', note: 'Order placed' }];
  return orderDoc;
}

function buildUPSShipmentPayloadFromOrder(order) {
  const shippingAddress = order.shippingAddress || {};
  const lineItems = Array.isArray(order.items)
    ? order.items.map((item, idx) => ({
        id: item.sku || item.SKU || item.id || item.productId || String(idx + 1),
        name: item.name || item.title || item.productName || item.ProductName || item.sku || `Item ${idx + 1}`,
        qty: item.qty ?? item.quantity ?? 1,
        unitPrice: item.price ?? item.unitPrice ?? item.unit_price ?? 0,
        weightKg: item.weightKg ?? item.weight_kg ?? item.weight ?? 1,
      }))
    : [];

  return {
    orderId: String(order._id),
    paymentId: order.paymentReference || (order.payment_id ? String(order.payment_id) : undefined),
    customer: order.customer || {},
    shippingAddress,
    lineItems,
    totals: {
      subtotal: order.subtotal ?? 0,
      shipping: order.shippingFee ?? 0,
      tax: order.vat ?? 0,
      total: order.total ?? 0,
    },
    currency: order.currency || 'GBP',
  };
}

function applyShipmentResultToOrder(order, shipmentResult, note) {
  order.carrier = 'UPS';
  order.carrierTrackingNumber = shipmentResult.trackingNumber || shipmentResult.shipmentIdentificationNumber;
  if (shipmentResult.label) {
    order.carrierLabelFormat = shipmentResult.label.format || null;
    order.carrierLabelData = shipmentResult.label.data || null;
  }
  order.status = 'CONFIRMED';
  order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
  order.statusHistory.push({ status: 'CONFIRMED', note, at: new Date() });
  order.modified_at = new Date();
}

async function createShipmentForOrder(orderId) {
  const order = await OrderDetails.findById(orderId);
  if (!order) throw new Error('Order not found');

  const shipmentPayload = buildUPSShipmentPayloadFromOrder(order);
  const shipmentResult = await createUPSShipment(shipmentPayload);
  applyShipmentResultToOrder(order, shipmentResult, 'UPS shipment created');
  await order.save();
  return order;
}

const OWNER_EMAIL = process.env.ORDER_ALERT_EMAIL || process.env.WINECELLAR_OWNER_EMAIL || 'winecellarcustomerservice@gmail.com';

async function emailOwnerOrderPlaced(order) {
  try {
    if (!OWNER_EMAIL) {
      console.warn('ORDER_ALERT_EMAIL not configured; skipping owner notification.');
      return;
    }
    const customerEmail = order?.customer?.email;
    if (customerEmail && customerEmail.toLowerCase() === OWNER_EMAIL.toLowerCase()) {
      // Avoid emailing the customer with the internal alert if they used the owner email address.
      console.warn('Skipping owner notification because customer email matches owner email.');
      return;
    }
    const to = OWNER_EMAIL;

    const subject = `New Order: ${order.trackingCode} (£${Number(order.total).toFixed(2)})`;
    const itemsText = (order.items || [])
      .map(it => {
        const itemName = it.name || it.name0 || it.ProductName || it.title || it.productName || it.SKU || it.sku || 'Item';
        return `- ${itemName} x${it.qty} @ £${Number(it.price).toFixed(2)}`;
      })
      .join('\n');
    const address = order.shippingAddress || {};
    const customer = order.customer || {};
    const text = `New order placed\n\n` +
      `Tracking: ${order.trackingCode}\n` +
      `Status: ${order.status}\n` +
      `Total: £${Number(order.total).toFixed(2)}\n\n` +
      `Customer:\n` +
      `  ${customer.name || ''}\n` +
      `  ${customer.email || ''}\n` +
      `  ${customer.phone || ''}\n\n` +
      `Shipping Address:\n` +
      `  ${address.line1 || ''}\n` +
      `  ${address.city || ''} ${address.postcode || ''}\n` +
      `  ${address.country || ''}\n\n` +
      `Items:\n${itemsText}`;
    await sendMail(to, subject, text);
  } catch (e) {
    console.error('Email notify failed:', e.message);
  }
}

module.exports = {
  getOrder,
  trackOrder,
  updateOrderStatus,
  initializeOrderMetadata,
  createShipmentForOrder,
  emailOwnerOrderPlaced,
  buildUPSShipmentPayloadFromOrder,
  applyShipmentResultToOrder,
};