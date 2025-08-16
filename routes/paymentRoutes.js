// filepath: /d:/WineCeller/MERN-backend/routes/paymentRoutes.js
const express = require('express');
const { createPaymentIntent, handlePaymentConfirmation } = require('../controllers/paymentController');
const router = express.Router();

/**
 * Primary route under /api/payment
 */
router.post('/api/payment/create-payment-intent', createPaymentIntent);

/**
 * Alias route to support clients calling /api/create-payment-intent
 */
router.post('/api/create-payment-intent', createPaymentIntent);

/**
 * @swagger
 * /api/payment/Payment-confirmation:
 *   post:
 *     summary: Handle Stripe webhook events
 *     tags: [Payment]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook event handled successfully
 *       400:
 *         description: Event type not handled
 *       500:
 *         description: Error handling webhook event
 */
router.post('/api/payment/Payment-confirmation', handlePaymentConfirmation);

module.exports = router;