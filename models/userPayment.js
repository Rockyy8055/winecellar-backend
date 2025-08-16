const mongoose = require("mongoose");

const userPaymentSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  payment_type: {
    type: String,
    required: true,
  },
  provider: {
    type: String,
    required: true,
  },
  account_no: {
    type: String,
    required: true,
  },
  expiry: {
    type: Date,
    required: true,
  },
});

const UserPayment = mongoose.model("UserPayment", userPaymentSchema);
module.exports = UserPayment;
