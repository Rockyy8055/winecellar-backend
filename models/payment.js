const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  paymentIntentId: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, required: true },
  paymentMethod: { type: String, required: true },
  paymentStatus: { type: String, required: true },
  transactionId: { type: String, required: true },
  metadata: { type: Object, required: true },
  createdAt: { type: Date, required: true },
});

const Payment = mongoose.model('Payment', paymentSchema);
module.exports = Payment;