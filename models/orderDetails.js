const mongoose = require("mongoose");

const orderDetailsSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false,
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
  subtotal: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  vat: { type: Number, default: 0 },
  shippingFee: { type: Number, default: 0 },
  total: {
    type: Number,
    required: true,
  },
  isTradeCustomer: { type: Boolean, default: false },
  payment_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "UserPayment",
    required: false,
  },
  shippingAddress: {
    type: Object,
    required: false,
  },
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
});

const OrderDetails = mongoose.model("OrderDetails", orderDetailsSchema);
module.exports = OrderDetails;
