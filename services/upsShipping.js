const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { getUPSAccessToken } = require('./upsClient');

const UPS_BASE_URLS = Object.freeze({
  sandbox: 'https://wwwcie.ups.com',
  production: 'https://onlinetools.ups.com',
});

function resolveUPSBaseUrl(envSetting, overrideUrl) {
  if (overrideUrl) {
    return overrideUrl;
  }
  const normalized = String(envSetting || '').trim().toLowerCase();
  if (['production', 'prod', 'live'].includes(normalized)) {
    return UPS_BASE_URLS.production;
  }
  return UPS_BASE_URLS.sandbox;
}

function loadUPSConfig(overrides = {}) {
  const envSetting = overrides.UPS_ENV ?? process.env.UPS_ENV ?? 'sandbox';
  const baseUrlOverride = overrides.UPS_BASE_URL ?? process.env.UPS_BASE_URL;

  const config = {
    env: envSetting,
    baseUrl: resolveUPSBaseUrl(envSetting, baseUrlOverride),
    clientId: overrides.UPS_CLIENT_ID ?? process.env.UPS_CLIENT_ID,
    clientSecret: overrides.UPS_CLIENT_SECRET ?? process.env.UPS_CLIENT_SECRET,
    accountNumber: overrides.UPS_ACCOUNT_NUMBER ?? process.env.UPS_ACCOUNT_NUMBER,
    serviceCode: overrides.UPS_SERVICE_CODE ?? process.env.UPS_SERVICE_CODE ?? '03',
    labelFormat: overrides.UPS_LABEL_FORMAT ?? process.env.UPS_LABEL_FORMAT ?? 'GIF',
    shipper: {
      name: overrides.UPS_SHIPPER_NAME ?? process.env.UPS_SHIPPER_NAME ?? overrides.SHIPPER_NAME ?? process.env.SHIPPER_NAME,
      phone: overrides.UPS_SHIPPER_PHONE ?? process.env.UPS_SHIPPER_PHONE ?? overrides.SHIPPER_PHONE ?? process.env.SHIPPER_PHONE,
      email: overrides.UPS_SHIPPER_EMAIL ?? process.env.UPS_SHIPPER_EMAIL,
      line1: overrides.UPS_SHIPPER_LINE1 ?? process.env.UPS_SHIPPER_LINE1 ?? overrides.SHIPPER_ADDRESS_LINE1 ?? process.env.SHIPPER_ADDRESS_LINE1,
      line2: overrides.UPS_SHIPPER_LINE2 ?? process.env.UPS_SHIPPER_LINE2 ?? overrides.SHIPPER_ADDRESS_LINE2 ?? process.env.SHIPPER_ADDRESS_LINE2,
      city: overrides.UPS_SHIPPER_CITY ?? process.env.UPS_SHIPPER_CITY ?? overrides.SHIPPER_CITY ?? process.env.SHIPPER_CITY,
      postalCode: overrides.UPS_SHIPPER_POSTAL_CODE ?? process.env.UPS_SHIPPER_POSTAL_CODE ?? overrides.UPS_SHIPPER_POSTCODE ?? process.env.UPS_SHIPPER_POSTCODE ?? overrides.SHIPPER_POSTCODE ?? process.env.SHIPPER_POSTCODE,
      country: overrides.UPS_SHIPPER_COUNTRY ?? process.env.UPS_SHIPPER_COUNTRY ?? overrides.SHIPPER_COUNTRY ?? process.env.SHIPPER_COUNTRY ?? 'GB',
    },
  };

  const missing = [];
  if (!config.clientId) missing.push('UPS_CLIENT_ID');
  if (!config.clientSecret) missing.push('UPS_CLIENT_SECRET');
  if (!config.accountNumber) missing.push('UPS_ACCOUNT_NUMBER');
  if (!config.shipper.name) missing.push('UPS_SHIPPER_NAME');
  if (!config.shipper.line1) missing.push('UPS_SHIPPER_LINE1');
  if (!config.shipper.city) missing.push('UPS_SHIPPER_CITY');
  if (!config.shipper.postalCode) missing.push('UPS_SHIPPER_POSTAL_CODE');
  if (!config.shipper.country) missing.push('UPS_SHIPPER_COUNTRY');

  if (missing.length) {
    throw new Error(`Missing UPS configuration values: ${missing.join(', ')}`);
  }

  config.shipper.country = String(config.shipper.country).toUpperCase();

  return config;
}

function ensureAddressLines(line1, line2) {
  const lines = [line1, line2]
    .map(v => (v == null ? undefined : String(v).trim()))
    .filter(Boolean);
  if (!lines.length) {
    lines.push('Address unavailable');
  }
  return lines.slice(0, 3);
}

function computeTotalWeightKg(lineItems = []) {
  const total = lineItems.reduce((acc, item) => {
    const qty = Number(item?.qty) > 0 ? Number(item.qty) : 0;
    const weight = Number(item?.weightKg ?? 1);
    if (!qty) return acc;
    const safeWeight = weight > 0 ? weight : 1;
    return acc + safeWeight * qty;
  }, 0);
  return total > 0 ? total : 1;
}

function formatDecimal(value, fractionDigits = 3) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return '0';
  }
  const fixed = num.toFixed(fractionDigits);
  return String(parseFloat(fixed));
}

function extractUpsError(error) {
  if (!error.response) {
    return error;
  }
  const { status, data } = error.response;
  const messages = [];

  if (Array.isArray(data?.response?.errors)) {
    data.response.errors.forEach(errItem => {
      if (errItem?.message) messages.push(errItem.message);
      else if (errItem?.code) messages.push(`UPS code ${errItem.code}`);
    });
  } else if (Array.isArray(data?.Errors)) {
    data.Errors.forEach(errItem => {
      if (errItem?.Message) messages.push(errItem.Message);
      else if (errItem?.Code) messages.push(`UPS code ${errItem.Code}`);
    });
  } else if (data?.Fault?.detail?.Errors?.ErrorDetail) {
    const details = data.Fault.detail.Errors.ErrorDetail;
    const normalize = Array.isArray(details) ? details : [details];
    normalize.forEach(detail => {
      const primary = detail?.PrimaryErrorCode;
      if (primary?.Description) messages.push(primary.Description);
      else if (primary?.Code) messages.push(`UPS code ${primary.Code}`);
    });
  }

  const messageSuffix = messages.length ? `: ${messages.join('; ')}` : '';
  const err = new Error(`UPS API error${messageSuffix}`);
  err.statusCode = status;
  err.details = data;
  return err;
}

function buildShipmentRequest(orderPayload, config) {
  const {
    orderId,
    paymentId,
    customer = {},
    shippingAddress = {},
    lineItems = [],
    totals = {},
    currency,
  } = orderPayload;

  const weightKg = computeTotalWeightKg(lineItems);
  const shipToLines = ensureAddressLines(shippingAddress.line1 ?? shippingAddress.address1, shippingAddress.line2 ?? shippingAddress.address2);
  const shipperLines = ensureAddressLines(config.shipper.line1, config.shipper.line2);
  const shipToCountry = String(shippingAddress.country || shippingAddress.countryCode || 'GB').toUpperCase();
  const shipToPostal = shippingAddress.postcode || shippingAddress.postalCode || shippingAddress.zip || shippingAddress.zipCode || '';
  const shipToState = shippingAddress.state || shippingAddress.region || shippingAddress.stateProvinceCode || shippingAddress.province;

  const requestCurrency = currency || totals.currency || 'GBP';
  const shipmentDescription = `Order ${orderId}`;

  const shipmentRequest = {
    ShipmentRequest: {
      Request: {
        TransactionReference: {
          CustomerContext: `order:${orderId}`,
        },
      },
      Shipment: {
        Description: shipmentDescription,
        Shipper: {
          Name: config.shipper.name,
          AttentionName: config.shipper.name,
          Phone: config.shipper.phone ? { Number: String(config.shipper.phone) } : undefined,
          EMailAddress: config.shipper.email ? String(config.shipper.email) : undefined,
          ShipperNumber: config.accountNumber,
          Address: {
            AddressLine: shipperLines,
            City: config.shipper.city,
            PostalCode: config.shipper.postalCode,
            CountryCode: config.shipper.country,
          },
        },
        ShipFrom: {
          Name: config.shipper.name,
          AttentionName: config.shipper.name,
          Phone: config.shipper.phone ? { Number: String(config.shipper.phone) } : undefined,
          Address: {
            AddressLine: shipperLines,
            City: config.shipper.city,
            PostalCode: config.shipper.postalCode,
            CountryCode: config.shipper.country,
          },
        },
        ShipTo: {
          Name: customer.name || 'Customer',
          AttentionName: customer.name || 'Customer',
          Phone: customer.phone ? { Number: String(customer.phone) } : undefined,
          EMailAddress: customer.email ? String(customer.email) : undefined,
          Address: {
            AddressLine: shipToLines,
            City: shippingAddress.city || shippingAddress.town || '',
            PostalCode: shipToPostal,
            CountryCode: shipToCountry,
          },
        },
        PaymentInformation: {
          ShipmentCharge: {
            Type: '01',
            BillShipper: {
              AccountNumber: config.accountNumber,
            },
          },
        },
        Service: {
          Code: String(config.serviceCode),
        },
        ReferenceNumber: [
          orderId ? { Code: 'ON', Value: String(orderId) } : null,
          paymentId ? { Code: 'IK', Value: String(paymentId) } : null,
        ].filter(Boolean),
        Package: [
          {
            Description: lineItems[0]?.name ? String(lineItems[0].name).slice(0, 35) : 'Package',
            Packaging: { Code: '02' },
            PackageWeight: {
              UnitOfMeasurement: { Code: 'KGS' },
              Weight: formatDecimal(weightKg),
            },
          },
        ],
        InvoiceLineTotal: totals?.total != null ? {
          CurrencyCode: requestCurrency,
          MonetaryValue: formatDecimal(totals.total, 2),
        } : undefined,
      },
      LabelSpecification: {
        LabelImageFormat: {
          Code: String(config.labelFormat).toUpperCase(),
        },
      },
    },
  };

  if (shipToState) {
    shipmentRequest.ShipmentRequest.Shipment.ShipTo.Address.StateProvinceCode = String(shipToState);
  }

  if (shippingAddress.company || shippingAddress.businessName) {
    shipmentRequest.ShipmentRequest.Shipment.ShipTo.CompanyName = shippingAddress.company || shippingAddress.businessName;
  }

  return shipmentRequest;
}

function validateOrderPayload(payload) {
  const missing = [];
  if (!payload || typeof payload !== 'object') {
    throw new Error('UPS shipment payload must be an object');
  }
  if (!payload.orderId) missing.push('orderId');
  if (!payload.paymentId) missing.push('paymentId');
  if (!payload.customer?.name) missing.push('customer.name');
  if (!payload.customer?.email) missing.push('customer.email');
  if (!payload.shippingAddress?.line1 && !payload.shippingAddress?.address1) missing.push('shippingAddress.line1');
  if (!payload.shippingAddress?.city) missing.push('shippingAddress.city');
  if (!payload.shippingAddress?.postcode && !payload.shippingAddress?.postalCode && !payload.shippingAddress?.zip && !payload.shippingAddress?.zipCode) missing.push('shippingAddress.postcode');
  if (!payload.shippingAddress?.country && !payload.shippingAddress?.countryCode) missing.push('shippingAddress.country');
  if (!Array.isArray(payload.lineItems) || payload.lineItems.length === 0) missing.push('lineItems');
  if (payload.lineItems) {
    payload.lineItems.forEach((item, idx) => {
      if (!item || typeof item !== 'object') {
        missing.push(`lineItems[${idx}]`);
        return;
      }
      if (item.qty == null) missing.push(`lineItems[${idx}].qty`);
      if (item.unitPrice == null) missing.push(`lineItems[${idx}].unitPrice`);
    });
  }
  if (payload.totals?.total == null) missing.push('totals.total');
  if (missing.length) {
    throw new Error(`Missing required order fields: ${missing.join(', ')}`);
  }
}

async function createUPSShipment(orderPayload, envOverrides = {}) {
  validateOrderPayload(orderPayload);
  const config = loadUPSConfig(envOverrides);

  try {
    const accessToken = await getUPSAccessToken(config.baseUrl, config.clientId, config.clientSecret);
    const shipmentRequest = buildShipmentRequest(orderPayload, config);
    const url = `${config.baseUrl}/api/shipments/v2403/shipments`;

    const response = await axios.post(url, shipmentRequest, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        transId: uuidv4(),
        transactionSrc: 'WineCellarBackend',
      },
    });

    const shipmentResults = response.data?.ShipmentResponse?.ShipmentResults || {};
    const packageResultsRaw = shipmentResults.PackageResults;
    const packageResults = Array.isArray(packageResultsRaw)
      ? packageResultsRaw
      : packageResultsRaw
        ? [packageResultsRaw]
        : [];
    const firstPackage = packageResults[0] || {};
    const trackingNumber = firstPackage.TrackingNumber || shipmentResults.ShipmentIdentificationNumber;

    const labelGraphic = firstPackage.ShippingLabel?.GraphicImage;
    const labelFormat = firstPackage.ShippingLabel?.ImageFormat?.Code || config.labelFormat;

    return {
      trackingNumber,
      shipmentIdentificationNumber: shipmentResults.ShipmentIdentificationNumber,
      label: labelGraphic
        ? {
            format: labelFormat,
            data: labelGraphic,
          }
        : null,
      raw: response.data,
    };
  } catch (error) {
    throw extractUpsError(error);
  }
}

module.exports = {
  createUPSShipment,
  loadUPSConfig,
  resolveUPSBaseUrl,
  computeTotalWeightKg,
};
