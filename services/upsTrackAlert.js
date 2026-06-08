const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { getUPSAccessToken } = require('./upsClient');
const { loadUPSConfig } = require('./upsShipment');

function getTrackAlertConfig() {
  const webhookUrl = process.env.UPS_TRACK_ALERT_WEBHOOK_URL || process.env.UPS_WEBHOOK_URL;
  const credential = process.env.UPS_TRACK_ALERT_CREDENTIAL || process.env.UPS_WEBHOOK_CREDENTIAL;
  return {
    enabled: webhookUrl && credential && process.env.UPS_TRACK_ALERT_ENABLED !== 'false',
    webhookUrl,
    credential,
    credentialType: process.env.UPS_TRACK_ALERT_CREDENTIAL_TYPE || 'Bearer',
    locale: process.env.UPS_TRACK_ALERT_LOCALE || 'en_US',
    countryCode: process.env.UPS_TRACK_ALERT_COUNTRY_CODE || 'US',
    version: process.env.UPS_TRACK_ALERT_VERSION || 'v1',
  };
}

function buildTrackAlertSubscriptionRequest(trackingNumbers, config = getTrackAlertConfig()) {
  const list = (Array.isArray(trackingNumbers) ? trackingNumbers : [trackingNumbers])
    .map(value => String(value || '').trim())
    .filter(Boolean);

  return {
    locale: config.locale,
    countryCode: config.countryCode,
    trackingNumberList: list,
    destination: {
      url: config.webhookUrl,
      credentialType: config.credentialType,
      credential: config.credential,
    },
  };
}

async function subscribeUPSTrackAlert(trackingNumbers, envOverrides = {}) {
  const trackAlertConfig = getTrackAlertConfig();
  if (!trackAlertConfig.enabled) {
    return { skipped: true, reason: 'UPS Track Alert webhook URL or credential is not configured' };
  }

  const body = buildTrackAlertSubscriptionRequest(trackingNumbers, trackAlertConfig);
  if (!body.trackingNumberList.length) {
    return { skipped: true, reason: 'No UPS tracking numbers to subscribe' };
  }

  const upsConfig = loadUPSConfig(envOverrides);
  const accessToken = await getUPSAccessToken(upsConfig.baseUrl, upsConfig.clientId, upsConfig.clientSecret, upsConfig.accountNumber);
  const response = await axios.post(
    `${upsConfig.baseUrl}/api/track/${trackAlertConfig.version}/subscription/standard/package`,
    body,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        transId: uuidv4(),
        transactionSrc: upsConfig.transactionSrc || 'WineCellarBackend',
      },
    }
  );

  return {
    skipped: false,
    validTrackingNumbers: response.data?.validTrackingNumbers || [],
    invalidTrackingNumbers: response.data?.invalidTrackingNumbers || [],
    raw: response.data,
  };
}

function verifyTrackAlertCredential(headers = {}) {
  const expected = process.env.UPS_TRACK_ALERT_CREDENTIAL || process.env.UPS_WEBHOOK_CREDENTIAL;
  if (!expected) return true;
  const authorization = headers.authorization || headers.Authorization;
  const bearer = authorization && String(authorization).replace(/^Bearer\s+/i, '').trim();
  const received = headers.credential || headers.Credential || headers['Credential'] || headers['x-ups-credential'];
  return received === expected || bearer === expected;
}

module.exports = {
  getTrackAlertConfig,
  buildTrackAlertSubscriptionRequest,
  subscribeUPSTrackAlert,
  verifyTrackAlertCredential,
};
