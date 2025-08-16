const mongoose = require("mongoose");

const shoppingSessionSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  total: {
    type: Number,
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

const ShoppingSession = mongoose.model(
  "ShoppingSession",
  shoppingSessionSchema
);
module.exports = ShoppingSession;
