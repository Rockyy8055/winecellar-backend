const mongoose = require("mongoose");

const inventorySchema = new mongoose.Schema({
  available: {
    type: Boolean,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
  },
  size: {
    type: String,
    required: false,
  },
  tags: {
    type: [String],
    required: false,
  },
  SKU: {
    type: String,
    required: true,
  },
  product_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Product",
    required: true,
  },
});

const Inventory = mongoose.model("Inventory", inventorySchema);

module.exports = Inventory;
