const mongoose = require("mongoose");

const paymentDetailsSchema = new mongoose.Schema({
  order_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OrderDetails",
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  provider: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    required: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  modified_at: {
    type: Date,
    default: Date.now,
  },
});

const PaymentDetails = mongoose.model("PaymentDetails", paymentDetailsSchema);
module.exports = PaymentDetails;
