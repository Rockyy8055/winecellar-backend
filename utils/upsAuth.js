const axios = require('axios');

const UPS_ENV = process.env.UPS_ENV || 'sandbox';
const baseURL =
  UPS_ENV === 'production'
    ? 'https://onlinetools.ups.com'
    : 'https://wwwcie.ups.com';

async function getUpsAccessToken() {
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

  return response.data.access_token;
}

module.exports = { getUpsAccessToken };
