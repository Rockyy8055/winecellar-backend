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

async function createShipmentForOrder(orderId) {
  const order = await OrderDetails.findById(orderId);
  if (!order) throw new Error('Order not found');
  const env = {
    UPS_BASE_URL: process.env.UPS_BASE_URL,
    UPS_CLIENT_ID: process.env.UPS_CLIENT_ID,
    UPS_CLIENT_SECRET: process.env.UPS_CLIENT_SECRET,
    UPS_ACCOUNT_NUMBER: process.env.UPS_ACCOUNT_NUMBER,
    SHIPPER_NAME: process.env.SHIPPER_NAME,
    SHIPPER_PHONE: process.env.SHIPPER_PHONE,
    SHIPPER_ADDRESS_LINE1: process.env.SHIPPER_ADDRESS_LINE1,
    SHIPPER_CITY: process.env.SHIPPER_CITY,
    SHIPPER_POSTCODE: process.env.SHIPPER_POSTCODE,
    SHIPPER_COUNTRY: process.env.SHIPPER_COUNTRY,
  };
  const { trackingNumber, shipmentId } = await createUPSShipment(order, env);
  order.carrier = 'UPS';
  order.carrierTrackingNumber = trackingNumber || shipmentId;
  order.status = 'CONFIRMED';
  order.statusHistory.push({ status: 'CONFIRMED', note: 'UPS shipment created' });
  order.modified_at = new Date();
  await order.save();
  return order;
}

async function emailOwnerOrderPlaced(order) {
  try {
    const to = 'winecellarcustomerservice@gmail.com';
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

module.exports = { getOrder, trackOrder, updateOrderStatus, initializeOrderMetadata, createShipmentForOrder, emailOwnerOrderPlaced };