const axios = require('axios');
const { getUpsAccessToken, UPS_BASE_URL } = require('./upsAuth');

const DEFAULT_SHIPPER = Object.freeze({
  name: 'WineCellar',
  addressLine: '1, 536 Kingsland Road',
  city: 'London',
  postalCode: 'E8 4AH',
  countryCode: 'GB',
});

async function createUpsShipment(order) {
  const token = await getUpsAccessToken();

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
          Name: process.env.UPS_SHIPPER_NAME || DEFAULT_SHIPPER.name,
          ShipperNumber: process.env.UPS_ACCOUNT_NUMBER,
          Address: {
            AddressLine: [process.env.UPS_SHIPPER_LINE1 || DEFAULT_SHIPPER.addressLine],
            City: process.env.UPS_SHIPPER_CITY || DEFAULT_SHIPPER.city,
            PostalCode: process.env.UPS_SHIPPER_POSTAL_CODE || DEFAULT_SHIPPER.postalCode,
            CountryCode: (process.env.UPS_SHIPPER_COUNTRY || DEFAULT_SHIPPER.countryCode),
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

module.exports = { createUpsShipment };
