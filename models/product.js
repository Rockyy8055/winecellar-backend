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
    default: "",
  },
  description: {
    type: String,
    required: false,
    default: "",
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
    required: false,
    default: 0,
  },
  sizeStocks: {
    type: Map,
    of: Number,
    default: new Map([
      ['1.5LTR', 0],
      ['1LTR', 0],
      ['75CL', 0],
      ['70CL', 0],
      ['35CL', 0],
      ['20CL', 0],
      ['10CL', 0],
      ['5CL', 0]
    ])
  },
});

// Pre-save middleware to sync total stock with sizeStocks
productSchema.pre('save', function(next) {
  if (this.isModified('sizeStocks')) {
    // Calculate total stock from sizeStocks
    const totalStock = Array.from(this.sizeStocks.values()).reduce((sum, stock) => sum + Math.max(0, stock), 0);
    this.stock = totalStock;
  }
  next();
});

const Product = mongoose.model("Product", productSchema);

module.exports = Product;
