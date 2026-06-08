const axios = require('axios');

let cachedToken = null;
let tokenExpiresAt = 0; // epoch ms

async function getUPSAccessToken(baseUrl, clientId, clientSecret, accountNumber) {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) { // 60s buffer
    return cachedToken;
  }
  if (!baseUrl) {
    throw new Error('UPS OAuth base URL is required');
  }
  if (!clientId || !clientSecret) {
    throw new Error('UPS OAuth credentials are required');
  }
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const url = `${baseUrl}/security/v1/oauth/token`;
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');

  const headers = {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (accountNumber) {
    headers['x-merchant-id'] = String(accountNumber);
  }

  const res = await axios.post(url, params.toString(), {
    headers,
  });

  const { access_token, expires_in } = res.data;
  cachedToken = access_token;
  tokenExpiresAt = now + (expires_in * 1000);
  return cachedToken;
}

module.exports = { getUPSAccessToken };
