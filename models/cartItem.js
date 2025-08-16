const mongoose = require("mongoose");

const cartItemSchema = new mongoose.Schema({
  session_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "ShoppingSession",
    required: true,
  },
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

const CartItem = mongoose.model("CartItem", cartItemSchema);
module.exports = CartItem;
