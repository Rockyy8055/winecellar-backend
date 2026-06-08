const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { getUPSAccessToken } = require('./upsClient');
const { loadUPSConfig } = require('./upsShipment');
const OrderDetails = require('../models/orderDetails');

/**
 * Get tracking information from UPS API
 * @param {string} trackingNumber - UPS tracking number
 * @param {object} env - Environment variables
 * @returns {Promise<object>} Tracking information
 */
async function getUPSTrackingInfo(trackingNumber, env = {}) {
  const config = loadUPSConfig(env);
  const version = env.UPS_TRACK_API_VERSION || process.env.UPS_TRACK_API_VERSION || 'v1';
  const token = await getUPSAccessToken(config.baseUrl, config.clientId, config.clientSecret, config.accountNumber);
  const url = `${config.baseUrl}/api/track/${version}/details/${trackingNumber}`;
  
  try {
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        transId: uuidv4(),
        transactionSrc: config.transactionSrc || 'WineCellarBackend',
      },
    });
    
    const trackResponse = res.data.trackResponse;
    const shipment = trackResponse?.shipment?.[0];
    const pkg = shipment?.package?.[0];
    
    if (!pkg) {
      throw new Error('No tracking information found');
    }
    
    const activity = pkg.activity || [];
    const currentActivity = activity[0]; // Most recent activity
    
    // Map UPS status codes to our status enum
    const statusCode = currentActivity?.status?.code || currentActivity?.status?.type;
    const statusDescription = currentActivity?.status?.description;
    
    return {
      trackingNumber,
      status: statusCode,
      statusType: currentActivity?.status?.type,
      statusDescription,
      deliveryDate: pkg.deliveryDate?.[0],
      deliveryTime: pkg.deliveryTime,
      activities: activity.map(act => ({
        location: act.location?.address?.city,
        status: act.status?.description,
        date: act.date,
        time: act.time,
      })),
      raw: res.data,
    };
  } catch (error) {
    if (error.response?.status === 404) {
      throw new Error('Tracking number not found in UPS system');
    }
    throw error;
  }
}

/**
 * Map UPS status codes to our internal order status
 * @param {string} upsStatusCode - UPS status code
 * @returns {string} Our internal status
 */
function mapUPSStatusToOrderStatus(upsStatusCode, statusDescription = '') {
  const code = String(upsStatusCode || '').trim().toUpperCase();
  const desc = String(statusDescription || '').trim().toLowerCase();

  if (desc.includes('delivered') || code === 'FS') {
    return 'DELIVERED';
  }
  if (desc.includes('out for delivery') || code === 'OT') {
    return 'OUT_FOR_DELIVERY';
  }
  if (desc.includes('ups has your package') || desc.includes('picked up') || code === 'OR') {
    return 'PICKED';
  }
  if (desc.includes('on the way') || desc.includes('in transit')) {
    return 'SHIPPED';
  }

  const statusMap = {
    'I': 'SHIPPED',        // In Transit
    'P': 'PICKED',         // Picked Up
    'M': 'SHIPPED',        // Manifest Pickup
    'MV': 'CANCELLED',     // Manifest Void
    'X': 'SHIPPED',        // Out for Delivery (we use OUT_FOR_DELIVERY)
    'D': 'DELIVERED',      // Delivered
    'RS': 'CANCELLED',     // Return to Sender
  };
  
  // Special case for Out for Delivery
  if (code === 'X') {
    return 'OUT_FOR_DELIVERY';
  }
  
  return statusMap[code] || 'SHIPPED';
}

function parseUPSDateTime(dateValue, timeValue) {
  const date = String(dateValue || '').trim();
  const time = String(timeValue || '').trim().padEnd(6, '0');
  if (!/^\d{8}$/.test(date)) return new Date();
  const yyyy = date.slice(0, 4);
  const mm = date.slice(4, 6);
  const dd = date.slice(6, 8);
  const hh = time.slice(0, 2) || '00';
  const mi = time.slice(2, 4) || '00';
  const ss = time.slice(4, 6) || '00';
  const parsed = new Date(`${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}Z`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function normalizeUPSWebhookPayload(body = {}) {
  const status = body.activityStatus || {};
  const trackingNumber = String(body.trackingNumber || body.inquiryNumber || body.packageNumber || '').trim();
  const statusCode = body.statusCode || status.code || status.type || null;
  const statusType = body.statusType || status.type || null;
  const statusDescription = body.statusDescription || status.description || status.descriptionCode || '';
  const eventTime = body.timestamp
    ? new Date(body.timestamp)
    : parseUPSDateTime(body.gmtActivityDate || body.localActivityDate, body.gmtActivityTime || body.localActivityTime);

  return {
    trackingNumber,
    statusCode,
    statusType,
    statusDescription,
    eventTime: Number.isNaN(eventTime.getTime()) ? new Date() : eventTime,
    scheduledDeliveryDate: body.scheduledDeliveryDate || null,
    actualDeliveryDate: body.actualDeliveryDate || null,
    activityLocation: body.activityLocation || null,
    raw: body,
  };
}

async function applyUPSTrackingEventToOrder(order, event, source = 'UPS') {
  const newStatus = mapUPSStatusToOrderStatus(event.statusType || event.statusCode, event.statusDescription);
  order.upsTrackingStatusCode = event.statusCode || null;
  order.upsTrackingStatusType = event.statusType || null;
  order.upsTrackingStatusDescription = event.statusDescription || null;
  order.upsTrackingLastSyncedAt = new Date();
  order.upsLastTrackingEvent = event.raw || event;

  if (event.scheduledDeliveryDate) {
    order.upsScheduledDeliveryDate = event.scheduledDeliveryDate;
  }
  if (event.actualDeliveryDate) {
    order.upsActualDeliveryDate = event.actualDeliveryDate;
  }

  if (order.status !== newStatus) {
    order.status = newStatus;
    order.statusHistory = Array.isArray(order.statusHistory) ? order.statusHistory : [];
    order.statusHistory.push({
      status: newStatus,
      note: `${source}: ${event.statusDescription || event.statusCode || newStatus}`,
      at: event.eventTime || new Date(),
    });
  }

  order.modified_at = new Date();
  await order.save();
  return order;
}

/**
 * Update order status based on UPS tracking information
 * @param {string} orderId - Order ID
 * @returns {Promise<object>} Updated order
 */
async function updateOrderFromUPSTracking(orderId) {
  const order = await OrderDetails.findById(orderId);
  
  if (!order) {
    throw new Error('Order not found');
  }
  
  if (!order.carrierTrackingNumber) {
    throw new Error('No UPS tracking number for this order');
  }
  
  const trackingInfo = await getUPSTrackingInfo(order.carrierTrackingNumber);
  const newStatus = mapUPSStatusToOrderStatus(trackingInfo.statusType || trackingInfo.status, trackingInfo.statusDescription);

  order.upsTrackingStatusCode = trackingInfo.status || null;
  order.upsTrackingStatusType = trackingInfo.statusType || null;
  order.upsTrackingStatusDescription = trackingInfo.statusDescription || null;
  order.upsTrackingLastSyncedAt = new Date();
  order.upsLastTrackingEvent = trackingInfo.raw || trackingInfo;
  
  // Only update if status has changed
  if (order.status !== newStatus) {
    order.status = newStatus;
    order.statusHistory.push({
      status: newStatus,
      note: `UPS: ${trackingInfo.statusDescription}`,
      at: new Date(),
    });
  }

  order.modified_at = new Date();
  await order.save();
  
  return { order, trackingInfo };
}

/**
 * Sync all active orders with UPS tracking
 * This can be run as a cron job
 */
async function syncAllActiveOrdersWithUPS() {
  const activeStatuses = ['CONFIRMED', 'PICKED', 'SHIPPED', 'OUT_FOR_DELIVERY'];
  const orders = await OrderDetails.find({
    status: { $in: activeStatuses },
    carrier: 'UPS',
    carrierTrackingNumber: { $exists: true, $ne: null },
  });
  
  console.log(`Syncing ${orders.length} active UPS orders...`);
  
  const results = {
    success: 0,
    failed: 0,
    errors: [],
  };
  
  for (const order of orders) {
    try {
      await updateOrderFromUPSTracking(order._id);
      results.success++;
    } catch (error) {
      results.failed++;
      results.errors.push({
        orderId: order._id,
        trackingCode: order.trackingCode,
        error: error.message,
      });
      console.error(`Failed to sync order ${order.trackingCode}:`, error.message);
    }
  }
  
  console.log(`UPS sync complete: ${results.success} success, ${results.failed} failed`);
  return results;
}

let upsTrackingSyncTimer = null;

function getTrackingSyncIntervalMs() {
  const minutes = Number(process.env.UPS_TRACKING_SYNC_INTERVAL_MINUTES || 30);
  const safeMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
  return safeMinutes * 60 * 1000;
}

function startUPSTrackingSyncScheduler(options = {}) {
  if (process.env.UPS_TRACKING_SYNC_ENABLED === 'false') {
    console.log('UPS tracking sync scheduler disabled by UPS_TRACKING_SYNC_ENABLED=false');
    return null;
  }

  if (upsTrackingSyncTimer) {
    return upsTrackingSyncTimer;
  }

  const intervalMs = getTrackingSyncIntervalMs();
  const runSync = () => {
    syncAllActiveOrdersWithUPS().catch(error => {
      console.error('UPS tracking sync scheduler failed:', error.message);
    });
  };

  upsTrackingSyncTimer = setInterval(runSync, intervalMs);
  if (typeof upsTrackingSyncTimer.unref === 'function') {
    upsTrackingSyncTimer.unref();
  }

  if (options.runImmediately !== false) {
    const startupDelayMs = Number(process.env.UPS_TRACKING_SYNC_STARTUP_DELAY_MS || 10000);
    const startupTimer = setTimeout(runSync, Number.isFinite(startupDelayMs) ? startupDelayMs : 10000);
    if (typeof startupTimer.unref === 'function') {
      startupTimer.unref();
    }
  }

  console.log(`UPS tracking sync scheduler started: every ${Math.round(intervalMs / 60000)} minute(s)`);
  return upsTrackingSyncTimer;
}

module.exports = {
  getUPSTrackingInfo,
  updateOrderFromUPSTracking,
  syncAllActiveOrdersWithUPS,
  startUPSTrackingSyncScheduler,
  mapUPSStatusToOrderStatus,
  normalizeUPSWebhookPayload,
  applyUPSTrackingEventToOrder,
};
