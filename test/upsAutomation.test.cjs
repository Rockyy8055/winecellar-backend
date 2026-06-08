const assert = require('node:assert/strict');
const test = require('node:test');

const { parseUPSShipmentResponse, loadUPSConfig } = require('../services/upsShipment');
const {
  buildSmartPickupRequest,
  buildOnCallPickupRequest,
  extractPickupResult,
} = require('../services/upsPickup');
const { buildTrackAlertSubscriptionRequest, verifyTrackAlertCredential } = require('../services/upsTrackAlert');
const { normalizeUPSWebhookPayload, mapUPSStatusToOrderStatus } = require('../services/upsTracking');

test('parseUPSShipmentResponse extracts tracking and label data', () => {
  const parsed = parseUPSShipmentResponse({
    ShipmentResponse: {
      ShipmentResults: {
        ShipmentIdentificationNumber: 'SHIP123',
        PackageResults: {
          TrackingNumber: '1Z999',
          ShippingLabel: {
            ImageFormat: { Code: 'PNG' },
            GraphicImage: 'YmFzZTY0',
          },
        },
      },
    },
  }, { labelFormat: 'PNG' });

  assert.equal(parsed.trackingNumber, '1Z999');
  assert.equal(parsed.shipmentIdentificationNumber, 'SHIP123');
  assert.equal(parsed.label.format, 'PNG');
  assert.equal(parsed.label.data, 'YmFzZTY0');
});

test('pickup request builders include account and order context', () => {
  const config = loadUPSConfig({
    UPS_CLIENT_ID: 'client',
    UPS_CLIENT_SECRET: 'secret',
    UPS_ACCOUNT_NUMBER: 'ACCOUNT1',
  });
  const order = {
    _id: 'order-id',
    trackingCode: 'WC-1',
    shippingAddress: { country: 'GB' },
    items: [{ qty: 2, weightKg: 1.5 }],
  };

  const smart = buildSmartPickupRequest(order, config);
  assert.equal(smart.PickupTriggerGWNRequest.AccountNumber, 'ACCOUNT1');
  assert.equal(smart.PickupTriggerGWNRequest.Request.TransactionReference.CustomerContext, 'order:WC-1');

  const onCall = buildOnCallPickupRequest(order, config, { packageResults: [{}, {}] });
  assert.equal(onCall.PickupCreationRequest.Shipper.Account.AccountNumber, 'ACCOUNT1');
  assert.equal(onCall.PickupCreationRequest.PickupPiece[0].Quantity, '2');
  assert.equal(onCall.PickupCreationRequest.TotalWeight.Weight, '3');
});

test('extractPickupResult normalizes pickup confirmation fields', () => {
  const parsed = extractPickupResult({
    PickupCreationResponse: {
      PRN: 'PRN123',
      PickupDate: '20260604',
      RateStatus: 'Rated',
    },
  }, 'oncall');

  assert.equal(parsed.mode, 'oncall');
  assert.equal(parsed.prn, 'PRN123');
  assert.equal(parsed.serviceDate, '20260604');
  assert.equal(parsed.rateStatus, 'Rated');
});

test('Track Alert subscription request and credential verification work', () => {
  const request = buildTrackAlertSubscriptionRequest('1Z999', {
    locale: 'en_GB',
    countryCode: 'GB',
    webhookUrl: 'https://example.com/api/ups/webhook',
    credentialType: 'Bearer',
    credential: 'shared-secret',
  });

  assert.deepEqual(request.trackingNumberList, ['1Z999']);
  assert.equal(request.destination.url, 'https://example.com/api/ups/webhook');
  assert.equal(request.destination.credential, 'shared-secret');

  process.env.UPS_TRACK_ALERT_CREDENTIAL = 'shared-secret';
  assert.equal(verifyTrackAlertCredential({ authorization: 'Bearer shared-secret' }), true);
  assert.equal(verifyTrackAlertCredential({ credential: 'shared-secret' }), true);
  assert.equal(verifyTrackAlertCredential({ credential: 'bad-secret' }), false);
  delete process.env.UPS_TRACK_ALERT_CREDENTIAL;
});

test('UPS webhook payload normalization maps Track Alert events to order statuses', () => {
  const event = normalizeUPSWebhookPayload({
    inquiryNumber: '1Z999',
    activityStatus: { type: 'OT', description: 'Out for Delivery Today' },
    gmtActivityDate: '20260603',
    gmtActivityTime: '101530',
  });

  assert.equal(event.trackingNumber, '1Z999');
  assert.equal(event.statusType, 'OT');
  assert.equal(event.statusDescription, 'Out for Delivery Today');
  assert.equal(mapUPSStatusToOrderStatus(event.statusType, event.statusDescription), 'OUT_FOR_DELIVERY');
  assert.equal(mapUPSStatusToOrderStatus('FS', 'Delivered'), 'DELIVERED');
});
