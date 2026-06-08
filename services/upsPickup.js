const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { getUPSAccessToken } = require('./upsClient');
const { loadUPSConfig, computeTotalWeightKg } = require('./upsShipment');

function envBool(key, defaultValue = false) {
  const raw = process.env[key];
  if (raw == null || raw === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function formatDateYYYYMMDD(date) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

function addBusinessDays(date, days) {
  const d = new Date(date);
  let remaining = Number(days) || 0;
  while (remaining > 0) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) remaining -= 1;
  }
  return d;
}

function formatDecimal(value, fractionDigits = 1) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '1';
  return String(parseFloat(num.toFixed(fractionDigits)));
}

function getPickupMode() {
  const mode = String(process.env.UPS_PICKUP_MODE || 'smart').trim().toLowerCase();
  if (['off', 'none', 'disabled', 'false'].includes(mode)) return 'none';
  if (['oncall', 'on-call', 'one-time', 'standard'].includes(mode)) return 'oncall';
  return 'smart';
}

function getPickupDate() {
  if (process.env.UPS_PICKUP_DATE) {
    return String(process.env.UPS_PICKUP_DATE).replace(/-/g, '');
  }
  const offset = Number(process.env.UPS_PICKUP_DATE_OFFSET_DAYS || 0);
  return formatDateYYYYMMDD(addBusinessDays(new Date(), offset));
}

function buildSmartPickupRequest(order, config) {
  return {
    PickupTriggerGWNRequest: {
      Request: {
        TransactionReference: {
          CustomerContext: `order:${order.trackingCode || order._id}`,
        },
      },
      AccountNumber: config.accountNumber,
      ServiceDateOption: String(process.env.UPS_SMART_PICKUP_SERVICE_DATE_OPTION || '01'),
    },
  };
}

function buildOnCallPickupRequest(order, config, shipmentResult = {}) {
  const shippingAddress = order.shippingAddress || {};
  const lineItems = Array.isArray(order.items) ? order.items : [];
  const weightKg = computeTotalWeightKg(lineItems);
  const destinationCountry = String(shippingAddress.country || shippingAddress.countryCode || 'GB').toUpperCase();
  const shipperPhone = config.shipper.phone || process.env.UPS_PICKUP_PHONE || '0000000000';
  const notificationEmail =
    process.env.UPS_PICKUP_NOTIFICATION_EMAIL ||
    process.env.ORDER_ALERT_EMAIL ||
    process.env.WINECELLAR_OWNER_EMAIL ||
    config.shipper.email;

  const request = {
    PickupCreationRequest: {
      RatePickupIndicator: process.env.UPS_PICKUP_RATE_INDICATOR || 'N',
      Shipper: {
        Account: {
          AccountNumber: config.accountNumber,
          AccountCountryCode: config.shipper.country,
        },
      },
      PickupDateInfo: {
        CloseTime: String(process.env.UPS_PICKUP_CLOSE_TIME || '1700'),
        ReadyTime: String(process.env.UPS_PICKUP_READY_TIME || '0900'),
        PickupDate: getPickupDate(),
      },
      PickupAddress: {
        CompanyName: config.shipper.name,
        ContactName: config.shipper.name,
        AddressLine: config.shipper.line1,
        City: config.shipper.city,
        PostalCode: config.shipper.postalCode,
        CountryCode: config.shipper.country,
        Phone: {
          Number: String(shipperPhone).replace(/[^\d+]/g, '').slice(0, 15) || '0000000000',
        },
      },
      PickupPiece: [
        {
          ServiceCode: String(config.serviceCode),
          Quantity: String(Math.max(1, Number(shipmentResult.packageResults?.length || 1))),
          DestinationCountryCode: destinationCountry,
          ContainerCode: process.env.UPS_PICKUP_CONTAINER_CODE || '01',
        },
      ],
      TotalWeight: {
        Weight: formatDecimal(weightKg),
        UnitOfMeasurement: 'KGS',
      },
      OverweightIndicator: 'N',
      PaymentMethod: process.env.UPS_PICKUP_PAYMENT_METHOD || '01',
      SpecialInstruction: process.env.UPS_PICKUP_SPECIAL_INSTRUCTION || 'Wine Cellar ecommerce pickup',
      ReferenceNumber: String(order.trackingCode || order._id || '').slice(0, 35),
    },
  };

  if (config.shipper.line2) {
    request.PickupCreationRequest.PickupAddress.AddressLine = `${config.shipper.line1} ${config.shipper.line2}`.trim();
  }
  if (notificationEmail) {
    request.PickupCreationRequest.Notification = {
      ConfirmationEmailAddress: notificationEmail,
      UndeliverableEmailAddress: notificationEmail,
    };
  }

  return request;
}

function extractPickupResult(data, mode) {
  const standard = data?.PickupCreationResponse;
  const smart = data?.PickupTriggerGWNResponse;
  const response = standard || smart || {};

  return {
    mode,
    prn: response.PRN || null,
    serviceDate: response.ServiceDate || response.PickupDate || null,
    triggerStatus: smart?.TriggerStatus || null,
    rateStatus: standard?.RateStatus || null,
    raw: data,
  };
}

async function scheduleUPSPickupForOrder(order, shipmentResult = {}, envOverrides = {}) {
  const defaultEnabled = true;
  if (!envBool('UPS_AUTO_PICKUP_ENABLED', defaultEnabled)) {
    return { skipped: true, reason: 'UPS_AUTO_PICKUP_ENABLED is false' };
  }

  const mode = getPickupMode();
  if (mode === 'none') {
    return { skipped: true, reason: 'UPS_PICKUP_MODE is disabled' };
  }

  const config = loadUPSConfig(envOverrides);
  const version = envOverrides.UPS_PICKUP_API_VERSION || process.env.UPS_PICKUP_API_VERSION || 'v2409';
  const pickupRequest = mode === 'smart'
    ? buildSmartPickupRequest(order, config)
    : buildOnCallPickupRequest(order, config, shipmentResult);

  const accessToken = await getUPSAccessToken(config.baseUrl, config.clientId, config.clientSecret, config.accountNumber);
  const response = await axios.post(`${config.baseUrl}/api/pickupcreation/${version}/pickup`, pickupRequest, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      transId: uuidv4(),
      transactionSrc: config.transactionSrc || 'WineCellarBackend',
    },
  });

  return extractPickupResult(response.data, mode);
}

module.exports = {
  scheduleUPSPickupForOrder,
  buildSmartPickupRequest,
  buildOnCallPickupRequest,
  extractPickupResult,
  getPickupMode,
  formatDateYYYYMMDD,
};
