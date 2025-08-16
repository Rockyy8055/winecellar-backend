const axios = require('axios');
const { getUPSAccessToken } = require('./upsClient');

async function createUPSShipment(order, env) {
  const {
    UPS_BASE_URL,
    UPS_CLIENT_ID,
    UPS_CLIENT_SECRET,
    UPS_ACCOUNT_NUMBER,
    SHIPPER_NAME,
    SHIPPER_PHONE,
    SHIPPER_ADDRESS_LINE1,
    SHIPPER_CITY,
    SHIPPER_POSTCODE,
    SHIPPER_COUNTRY,
  } = env;

  const token = await getUPSAccessToken(UPS_BASE_URL, UPS_CLIENT_ID, UPS_CLIENT_SECRET);

  const shipper = {
    name: SHIPPER_NAME,
    phone: SHIPPER_PHONE,
    addressLine1: SHIPPER_ADDRESS_LINE1,
    city: SHIPPER_CITY,
    postalCode: SHIPPER_POSTCODE,
    countryCode: SHIPPER_COUNTRY || 'GB',
  };

  const to = order.shippingAddress || {};

  // Minimal shipment payload (v2403). Adjust service code, weight, dims as needed.
  const payload = {
    ShipmentRequest: {
      Shipment: {
        Shipper: {
          Name: shipper.name,
          Phone: { Number: shipper.phone },
          ShipperNumber: UPS_ACCOUNT_NUMBER,
          Address: {
            AddressLine: [shipper.addressLine1],
            City: shipper.city,
            PostalCode: shipper.postalCode,
            CountryCode: shipper.countryCode,
          },
        },
        ShipTo: {
          Name: to.name || 'Customer',
          Phone: to.phone ? { Number: to.phone } : undefined,
          Address: {
            AddressLine: [to.line1 || to.address1 || ''],
            City: to.city || '',
            PostalCode: to.postcode || to.postalCode || '',
            CountryCode: to.country || 'GB',
          },
        },
        PaymentInformation: {
          ShipmentCharge: {
            Type: '01',
            BillShipper: { AccountNumber: UPS_ACCOUNT_NUMBER },
          },
        },
        Service: { Code: '11' },
        Package: [{
          Packaging: { Code: '02' },
          PackageWeight: { UnitOfMeasurement: { Code: 'KGS' }, Weight: String((to.weightKg || 1)) },
          Dimensions: {
            UnitOfMeasurement: { Code: 'CM' },
            Length: String(to.lengthCm || 10),
            Width: String(to.widthCm || 10),
            Height: String(to.heightCm || 10),
          },
        }],
      },
      LabelSpecification: { LabelImageFormat: { Code: 'GIF' } },
    },
  };

  const res = await axios.post(
    `${UPS_BASE_URL}/api/shipments/v2403/ship`,
    payload,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  // Extract tracking number(s)
  const shipmentResults = res.data.ShipmentResponse?.ShipmentResults || {};
  const trackingNumber = shipmentResults?.PackageResults?.TrackingNumber || shipmentResults?.ShipmentIdentificationNumber;
  const shipmentId = shipmentResults?.ShipmentIdentificationNumber;

  return { trackingNumber, shipmentId, raw: res.data };
}

module.exports = { createUPSShipment };