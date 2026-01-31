const axios = require('axios');
const { getUpsAccessToken } = require('./upsAuth');

const UPS_BASE_URL =
  process.env.UPS_ENV === 'production'
    ? 'https://onlinetools.ups.com'
    : 'https://wwwcie.ups.com';

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
  const token = await getUpsAccessToken();

  const storeName = resolveStoreNameFromOrder(order);
  const shipper = getShipperFromStore(storeName);

  const shipping = order.shippingAddress || {};

  const shipToName = shipping.name || order?.customer?.name || 'Customer';
  const shipToLine1 = shipping.addressLine1 || shipping.line1;
  const shipToCity = shipping.city;
  const shipToPostalCode = shipping.postalCode || shipping.postcode;
  const shipToCountry = (shipping.countryCode || shipping.country || 'GB');

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

  const shipmentPayload = {
    ShipmentRequest: {
      Shipment: {
        Shipper: {
          Name: shipper.Name,
          ShipperNumber: process.env.UPS_ACCOUNT_NUMBER,
          Address: {
            AddressLine: shipper.AddressLine,
            City: shipper.City,
            PostalCode: shipper.PostalCode,
            CountryCode: shipper.CountryCode,
          },
        },
        ShipTo: {
          Name: shipToName,
          Address: {
            AddressLine: [shipToLine1],
            City: shipToCity,
            PostalCode: shipToPostalCode,
            CountryCode: String(shipToCountry).toUpperCase(),
          },
        },
        Service: {
          Code: '11',
        },
        Package: {
          PackagingType: { Code: '02' },
          PackageWeight: {
            UnitOfMeasurement: { Code: 'KGS' },
            Weight: '1',
          },
        },
      },
    },
  };

  const response = await axios.post(`${UPS_BASE_URL}/ship/v1/shipments`, shipmentPayload, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  return response.data;
}

module.exports = { createUpsShipment, getShipperFromStore };
