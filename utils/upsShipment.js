const axios = require('axios');
const { getUpsAccessToken } = require('./upsAuth');

const UPS_ENV = process.env.UPS_ENV || 'sandbox';
const baseURL =
  UPS_ENV === 'production'
    ? 'https://onlinetools.ups.com'
    : 'https://wwwcie.ups.com';

function pruneUndefined(value) {
  if (Array.isArray(value)) {
    const cleaned = value
      .map(item => pruneUndefined(item))
      .filter(item => item !== undefined);
    return cleaned;
  }

  if (value && typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([key, val]) => {
      const cleaned = pruneUndefined(val);
      if (cleaned !== undefined) {
        out[key] = cleaned;
      }
    });
    return out;
  }

  if (value === null || value === undefined) {
    return undefined;
  }

  return value;
}

function normalizeUkPostcode(value) {
  if (value == null) return '';
  return String(value).trim().replace(/\s+/g, ' ');
}

function getShipperFromStore(storeName) {
  if (!storeName) {
    throw new Error('Store name missing in order');
  }

  const name = String(storeName).toLowerCase();

  if (name.includes('dalston')) {
    return {
      Name: 'WineCellar Dalston',
      AddressLine: ['536 Kingsland Road'],
      City: 'London',
      PostalCode: 'E8 4AH',
      CountryCode: 'GB',
    };
  }

  if (name.includes('stoke')) {
    return {
      Name: 'WineCellar Stoke Newington',
      AddressLine: ['164 Stoke Newington Road'],
      City: 'London',
      PostalCode: 'N16 7UY',
      CountryCode: 'GB',
    };
  }

  throw new Error('Invalid store location');
}

function resolveStoreNameFromOrder(order) {
  return (
    order?.shippingAddress?.storeName ||
    order?.pickupStore?.storeName ||
    order?.pickupStore?.storeId ||
    order?.shippingAddress?.storeId ||
    null
  );
}

async function createUpsShipment(order) {
  console.log('UPS DEBUG INFO:', {
    UPS_ENV: process.env.UPS_ENV,
    TOKEN_URL: `${baseURL}/security/v1/oauth/token`,
    SHIPMENT_URL: `${baseURL}/api/shipments/v1/ship`,
    CLIENT_ID_LENGTH: process.env.UPS_CLIENT_ID?.length,
    SECRET_LENGTH: process.env.UPS_CLIENT_SECRET?.length,
    ACCOUNT_NUMBER: process.env.UPS_ACCOUNT_NUMBER,
  });

  const token = await getUpsAccessToken();

  const storeName = resolveStoreNameFromOrder(order);
  const shipper = getShipperFromStore(storeName);

  const shipping = order.shippingAddress || {};

  const shipToName = shipping.name || order?.customer?.name || 'Customer';
  const shipToLine1 = shipping.addressLine1 || shipping.line1;
  const shipToCity = shipping.city;
  const shipToPostalCode = normalizeUkPostcode(shipping.postalCode || shipping.postcode);
  const shipToCountry = 'GB';

  const missing = [];
  if (!shipToLine1) missing.push('shippingAddress.line1');
  if (!shipToCity) missing.push('shippingAddress.city');
  if (!shipToPostalCode) missing.push('shippingAddress.postcode');
  if (!shipToCountry) missing.push('shippingAddress.country');
  if (missing.length) {
    const err = new Error(`Missing required shippingAddress fields: ${missing.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const shipperCountry = 'GB';
  const shipperPostalCode = normalizeUkPostcode(shipper.PostalCode);
  const shipperCity = shipper.City ? String(shipper.City).trim() : '';
  const shipperNumber = process.env.UPS_ACCOUNT_NUMBER;

  const shipmentPayload = {
    ShipmentRequest: {
      Shipment: {
        Shipper: {
          Name: shipper.Name,
          ShipperNumber: shipperNumber,
          Address: {
            AddressLine: shipper.AddressLine,
            City: shipperCity,
            PostalCode: shipperPostalCode,
            CountryCode: shipperCountry,
          },
        },
        ShipTo: {
          Name: shipToName,
          Address: {
            AddressLine: [shipToLine1],
            City: shipToCity,
            PostalCode: shipToPostalCode,
            CountryCode: shipToCountry,
          },
        },
        PaymentInformation: {
          ShipmentCharge: {
            Type: '01',
            BillShipper: {
              AccountNumber: shipperNumber,
            },
          },
        },
        Service: {
          Code: '11',
        },
        PackagingType: {
          Code: '02',
        },
        Packages: [
          {
            PackagingType: { Code: '02' },
            PackageWeight: {
              UnitOfMeasurement: { Code: 'KGS' },
              Weight: '1',
            },
          },
        ],
      },
    },
  };

  const prunedPayload = pruneUndefined(shipmentPayload);

  try {
    const response = await axios.post(`${baseURL}/api/shipments/v1/ship`, prunedPayload, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    return response.data;
  } catch (err) {
    console.log('UPS FULL ERROR RESPONSE:', JSON.stringify(err.response?.data, null, 2));
    throw err;
  }
}

module.exports = { createUpsShipment, getShipperFromStore };
