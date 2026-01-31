const express = require('express');
const router = express.Router();
const axios = require('axios');
const { requireAdmin } = require('../config/requireAdmin');

const UPS_ENV = process.env.UPS_ENV || 'sandbox';
const baseURL =
  UPS_ENV === 'production'
    ? 'https://onlinetools.ups.com'
    : 'https://wwwcie.ups.com';

router.get('/ups-production-check', requireAdmin, async (req, res) => {
  try {
    const response = await axios.post(
      `${baseURL}/security/v1/oauth/token`,
      'grant_type=client_credentials',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' +
            Buffer.from(
              `${process.env.UPS_CLIENT_ID}:${process.env.UPS_CLIENT_SECRET}`
            ).toString('base64'),
        },
      }
    );

    return res.json({
      success: true,
      environment: process.env.UPS_ENV,
      baseUrlUsed: baseURL,
      tokenReceived: !!response.data.access_token,
      message: 'UPS Production OAuth Successful',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      environment: process.env.UPS_ENV,
      baseUrlUsed: baseURL,
      error: error.response?.data || error.message,
      message: 'UPS Production OAuth Failed',
    });
  }
});

module.exports = router;
