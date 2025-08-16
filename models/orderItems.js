const mongoose = require("mongoose");

const orderItemsSchema = new mongoose.Schema({
  order_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "OrderDetails",
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

const OrderItems = mongoose.model("OrderItems", orderItemsSchema);
module.exports = OrderItems;
