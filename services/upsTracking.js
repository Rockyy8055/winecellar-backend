const axios = require('axios');
const { getUPSAccessToken } = require('./upsClient');
const OrderDetails = require('../models/orderDetails');

/**
 * Get tracking information from UPS API
 * @param {string} trackingNumber - UPS tracking number
 * @param {object} env - Environment variables
 * @returns {Promise<object>} Tracking information
 */
async function getUPSTrackingInfo(trackingNumber, env) {
  const { UPS_BASE_URL, UPS_CLIENT_ID, UPS_CLIENT_SECRET } = env;
  
  const token = await getUPSAccessToken(UPS_BASE_URL, UPS_CLIENT_ID, UPS_CLIENT_SECRET);
  
  const url = `${UPS_BASE_URL}/api/track/v1/details/${trackingNumber}`;
  
  try {
    const res = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
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
    const statusCode = currentActivity?.status?.code;
    const statusDescription = currentActivity?.status?.description;
    
    return {
      trackingNumber,
      status: statusCode,
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
function mapUPSStatusToOrderStatus(upsStatusCode) {
  const statusMap = {
    'I': 'CONFIRMED',      // In Transit
    'P': 'PICKED',         // Picked Up
    'M': 'SHIPPED',        // Manifest Pickup
    'X': 'SHIPPED',        // Out for Delivery (we use OUT_FOR_DELIVERY)
    'D': 'DELIVERED',      // Delivered
    'RS': 'CANCELLED',     // Return to Sender
  };
  
  // Special case for Out for Delivery
  if (upsStatusCode === 'X') {
    return 'OUT_FOR_DELIVERY';
  }
  
  return statusMap[upsStatusCode] || 'SHIPPED';
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
  
  const env = {
    UPS_BASE_URL: process.env.UPS_BASE_URL,
    UPS_CLIENT_ID: process.env.UPS_CLIENT_ID,
    UPS_CLIENT_SECRET: process.env.UPS_CLIENT_SECRET,
  };
  
  const trackingInfo = await getUPSTrackingInfo(order.carrierTrackingNumber, env);
  const newStatus = mapUPSStatusToOrderStatus(trackingInfo.status);
  
  // Only update if status has changed
  if (order.status !== newStatus) {
    order.status = newStatus;
    order.statusHistory.push({
      status: newStatus,
      note: `UPS: ${trackingInfo.statusDescription}`,
      at: new Date(),
    });
    order.modified_at = new Date();
    await order.save();
  }
  
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

module.exports = {
  getUPSTrackingInfo,
  updateOrderFromUPSTracking,
  syncAllActiveOrdersWithUPS,
  mapUPSStatusToOrderStatus,
};
