const axios = require('axios');

const UPS_BASE_URL =
  process.env.UPS_ENV === 'production'
    ? 'https://onlinetools.ups.com'
    : 'https://wwwcie.ups.com';

async function getUpsAccessToken() {
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

  return response.data.access_token;
}

module.exports = { getUpsAccessToken };
