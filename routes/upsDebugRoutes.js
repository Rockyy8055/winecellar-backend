const express = require('express');
const router = express.Router();
const axios = require('axios');
const { requireAdmin } = require('../config/requireAdmin');

const UPS_BASE_URL =
  process.env.UPS_ENV === 'production'
    ? 'https://onlinetools.ups.com'
    : 'https://wwwcie.ups.com';

router.get('/ups-production-check', requireAdmin, async (req, res) => {
  try {
    const response = await axios.post(
      `${UPS_BASE_URL}/security/v1/oauth/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
      }),
      {
        auth: {
          username: process.env.UPS_CLIENT_ID,
          password: process.env.UPS_CLIENT_SECRET,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    return res.json({
      success: true,
      environment: process.env.UPS_ENV,
      baseUrlUsed: UPS_BASE_URL,
      tokenReceived: !!response.data.access_token,
      message: 'UPS Production OAuth Successful',
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      environment: process.env.UPS_ENV,
      baseUrlUsed: UPS_BASE_URL,
      error: error.response?.data || error.message,
      message: 'UPS Production OAuth Failed',
    });
  }
});

module.exports = router;
