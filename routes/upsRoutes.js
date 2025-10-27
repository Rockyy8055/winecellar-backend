const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../config/requireAdmin');
const { 
  getUPSTrackingInfo, 
  updateOrderFromUPSTracking, 
  syncAllActiveOrdersWithUPS 
} = require('../services/upsTracking');
const OrderDetails = require('../models/orderDetails');

/**
 * @swagger
 * /api/ups/track/{trackingNumber}:
 *   get:
 *     summary: Get UPS tracking information
 *     tags: [UPS]
 *     parameters:
 *       - in: path
 *         name: trackingNumber
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tracking information
 */
router.get('/api/ups/track/:trackingNumber', async (req, res) => {
  try {
    const { trackingNumber } = req.params;
    
    const env = {
      UPS_BASE_URL: process.env.UPS_BASE_URL,
      UPS_CLIENT_ID: process.env.UPS_CLIENT_ID,
      UPS_CLIENT_SECRET: process.env.UPS_CLIENT_SECRET,
    };
    
    const trackingInfo = await getUPSTrackingInfo(trackingNumber, env);
    res.json(trackingInfo);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/admin/ups/sync-order/{orderId}:
 *   post:
 *     summary: Sync single order with UPS tracking
 *     tags: [Admin, UPS]
 *     security:
 *       - bearerAuth: []
 */
router.post('/api/admin/ups/sync-order/:orderId', requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    const result = await updateOrderFromUPSTracking(orderId);
    res.json({
      message: 'Order synced with UPS tracking',
      order: result.order,
      trackingInfo: result.trackingInfo,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @swagger
 * /api/admin/ups/sync-all:
 *   post:
 *     summary: Sync all active orders with UPS tracking
 *     tags: [Admin, UPS]
 *     security:
 *       - bearerAuth: []
 */
router.post('/api/admin/ups/sync-all', requireAdmin, async (req, res) => {
  try {
    const results = await syncAllActiveOrdersWithUPS();
    res.json({
      message: 'Sync completed',
      results,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * UPS Webhook endpoint for tracking updates
 * UPS will POST tracking events to this endpoint
 */
router.post('/api/ups/webhook', async (req, res) => {
  try {
    console.log('UPS webhook received:', JSON.stringify(req.body, null, 2));
    
    // UPS webhook payload structure (example - adjust based on actual UPS webhook format)
    const { trackingNumber, statusCode, statusDescription, timestamp } = req.body;
    
    if (!trackingNumber) {
      return res.status(400).json({ error: 'Missing tracking number' });
    }
    
    // Find order by UPS tracking number
    const order = await OrderDetails.findOne({ carrierTrackingNumber: trackingNumber });
    
    if (!order) {
      console.warn(`Order not found for UPS tracking number: ${trackingNumber}`);
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Map UPS status to our status
    const { mapUPSStatusToOrderStatus } = require('../services/upsTracking');
    const newStatus = mapUPSStatusToOrderStatus(statusCode);
    
    // Update order status if changed
    if (order.status !== newStatus) {
      order.status = newStatus;
      order.statusHistory.push({
        status: newStatus,
        note: `UPS Webhook: ${statusDescription}`,
        at: new Date(timestamp || Date.now()),
      });
      order.modified_at = new Date();
      await order.save();
      
      console.log(`Order ${order.trackingCode} updated to ${newStatus} via UPS webhook`);
    }
    
    // Acknowledge receipt
    res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('UPS webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
