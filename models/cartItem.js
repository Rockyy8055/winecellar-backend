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
  size: {
    type: String,
    required: false,
    enum: ['1.5LTR', '1LTR', '75CL', '70CL', '35CL', '20CL', '10CL', '5CL'],
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
});

const CartItem = mongoose.model("CartItem", cartItemSchema);
module.exports = CartItem;
