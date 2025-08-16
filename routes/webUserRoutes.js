const express = require('express');
const {loginWebUser, checkUserExistence,sendOtp,verifyOtp } = require('../controllers/webUserController');
const router = express.Router();

/**
 * @swagger
 * /api/webusers/Login:
 *   post:
 *     summary: Create a new WebUser
 *     tags: [WebUser]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *                 example: "your_username"
 *               password:
 *                 type: string
 *                 example: "your_password"
 *     responses:
 *       201:
 *         description: WebUser created successfully
 *       400:
 *         description: Error creating WebUser
 */
router.post('/api/webusers/Login', loginWebUser);

/**
 * @swagger
 * /api/webusers/Check:
 *   post:
 *     summary: Check if a WebUser exists by username or email
 *     tags: [WebUser]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       200:
 *         description: User existence check
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 exists:
 *                   type: boolean
 *       500:
 *         description: Error checking user existence
 */
router. post('/api/webusers/Check', checkUserExistence);

/**
 * @swagger
 * /api/webusers/send-otp:
 *   post:
 *     summary: Send OTP to a WebUser
 *     tags: [WebUser]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               username:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP sent successfully
 *       400:
 *         description: Error sending OTP
 *       500:
 *         description: Server error
 */
router.post('/api/webusers/send-otp', sendOtp);

/**
 * @swagger
 * /api/webusers/verify-otp:
 *   post:
 *     summary: Verify OTP for a WebUser
 *     tags: [WebUser]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               otp:
 *                 type: string
 *               username:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: OTP verified successfully
 *       400:
 *         description: Invalid OTP or OTP not found
 *       500:
 *         description: Server error
 */
router.post('/api/webusers/verify-otp', verifyOtp);


module.exports = router;