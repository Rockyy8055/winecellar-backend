const mongoose = require("mongoose");
const {
  parseSizeStocksInput,
  computeTotalStock,
  createEmptySizeStocks,
} = require("../utils/sizeStocks");

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
  sizes: {
    type: Object,
    default: () => createEmptySizeStocks(),
  },
  totalStock: {
    type: Number,
    default: 0,
  },
  inStock: {
    type: Boolean,
    default: true,
  },
});

// Pre-save middleware to normalize sizes and sync stock flags
productSchema.pre('save', function(next) {
  try {
    const normalizedSizes = parseSizeStocksInput(this.sizes, {
      rejectUnknown: true,
      fillMissing: true,
      coerce: 'strict',
    }) || createEmptySizeStocks();

    this.sizes = normalizedSizes;

    const computedTotal = computeTotalStock(normalizedSizes);
    this.totalStock = computedTotal;
    this.inStock = computedTotal > 0;

    next();
  } catch (err) {
    next(err);
  }
});

const Product = mongoose.model("Product", productSchema);

module.exports = Product;
