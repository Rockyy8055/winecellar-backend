// filepath: /d:/WineCeller/MERN-backend/models/shipping.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const shippingSchema = new Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  address: { type: String, required: true },
  city: { type: String, required: true },
  zipCode: { type: String, required: true },
  country: { type: String, required: true },
  shippingMethod: { type: String, required: true }, 
  shippingCost: { type: Number, required: true }, 
  createdAt: { type: Date, default: Date.now },
});

const Shipping = mongoose.model('Shipping', shippingSchema);

module.exports = Shipping;