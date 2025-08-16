const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  isExpire: { type: Boolean, default: false },
  requestCount: { type: Number, default: 0 },
  date: { type: String, required: true }
});

const OTP = mongoose.model('OTP', otpSchema);

module.exports = OTP;