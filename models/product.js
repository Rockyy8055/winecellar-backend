const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  price: {
    type: Number,
    required: true,
  },
  desc: {
    type: String,
    required: false,
  },
  category: {
    type: [String],
    required: true,
  },
  subCategory: {
    type: String,
    required: false,
  },
  discount: {
    type: String,
    required: false,
  },
  size: {
    type: String,
    required: false,
  },
  SKU: {
    type: String,
    required: false,
  },
  tags: {
    type: [String],
    required: false,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  modified_at: {
    type: Date,
    default: Date.now,
  },
  deleted_at: {
    type: Date,
    default: null,
  },
  vendor: {
    type: String,
    required: false,
  },
  Country: {
    type: String,
    required: false,
  },
  Region: {
    type: String,
    required: false,
  },
  taxable: {
    type: Boolean,
    required: false,
  },
  brand: {
    type: String,
    required: false,
  },
  img: {
    type: String,
    required: false,
  },
  stock: {
    type: Number,
    required: true,
  },
});


const Product = mongoose.model("Product", productSchema);

module.exports = Product;
