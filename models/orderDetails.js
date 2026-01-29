const mongoose = require("mongoose");

const billingDetailsSchema = new mongoose.Schema(
  {
    firstName: { type: String },
    lastName: { type: String },
    email: { type: String },
    phone: { type: String },
    address: { type: String },
    postcode: { type: String },
  },
  { _id: false, strict: false }
);

const shippingAddressSchema = new mongoose.Schema(
  {
    line1: { type: String },
    line2: { type: String },
    city: { type: String },
    state: { type: String },
    postcode: { type: String },
    country: { type: String },
    phone: { type: String },
    storeId: { type: String },
    storeName: { type: String },
    addressLine1: { type: String },
    addressLine2: { type: String },
  },
  { _id: false, strict: false }
);

const pickupStoreSchema = new mongoose.Schema(
  {
    storeId: { type: String },
    storeName: { type: String },
    addressLine1: { type: String },
    addressLine2: { type: String },
    city: { type: String },
    postcode: { type: String },
    country: { type: String },
    phone: { type: String },
  },
  { _id: false, strict: false }
);

const orderDetailsSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
  },
  paymentReference: {
    type: String,
    index: true,
  },
  emailSent: {
    type: Boolean,
    default: false,
  },
  emailProvider: {
    type: String,
  },
  customer: {
    name: { type: String },
    email: { type: String },
    phone: { type: String },
  },
  items: [
    {
      name: { type: String },
      sku: { type: String },
      qty: { type: Number },
      price: { type: Number },
    },
  ],
  method: { type: String },
  paymentMethod: { type: String },
  billingDetails: billingDetailsSchema,
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  vat: { type: Number, default: 0 },
  shippingFee: { type: Number, default: 0 },
  total: {
    type: Number,
    required: true,
  },
  isTradeCustomer: { type: Boolean, default: false },
  estimatedDelivery: { type: Date },
  payment_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserPayment",
    required: false,
  },
  shippingAddress: shippingAddressSchema,
  pickupStore: pickupStoreSchema,
  trackingCode: {
    type: String,
    index: true,
  },
  status: {
    type: String,
    enum: [
      "PLACED",
      "CONFIRMED",
      "PICKED",
      "SHIPPED",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
      "CANCELLED",
    ],
    default: "PLACED",
  },
  statusHistory: [
    {
      status: { type: String },
      note: { type: String },
      at: { type: Date, default: Date.now },
    },
  ],
  created_at: {
    type: Date,
    default: Date.now,
  },
  modified_at: {
    type: Date,
    default: Date.now,
  },
  carrier: { type: String },
  carrierTrackingNumber: { type: String },
  carrierLabelFormat: { type: String },
  carrierLabelData: { type: String },
});

// Indexes for efficient lookups
orderDetailsSchema.index({ trackingCode: 1 }, { unique: true, sparse: true });
orderDetailsSchema.index({ user_id: 1 });
orderDetailsSchema.index({ paymentReference: 1 }, { unique: true, sparse: true });

const OrderDetails = mongoose.model("OrderDetails", orderDetailsSchema);
module.exports = OrderDetails;
