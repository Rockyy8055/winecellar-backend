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
  stock: {
    type: Number,
    required: false,
    default: 0,
  },
  sizeStocks: {
    type: Object,
    default: () => createEmptySizeStocks(),
  },
});

// Pre-save middleware to normalize sizeStocks and sync total stock
productSchema.pre('save', function(next) {
  try {
    if (this.isModified('sizeStocks') || this.isNew) {
      const normalized = parseSizeStocksInput(this.sizeStocks, { rejectUnknown: true, fillMissing: true, coerce: 'strict' }) || createEmptySizeStocks();
      this.sizeStocks = normalized;

      if (!this.isModified('stock') || this.stock === undefined || this.stock === null) {
        this.stock = computeTotalStock(normalized);
      }
    }

    if (this.isModified('stock') || this.isNew) {
      const num = Number(this.stock ?? 0);
      this.stock = Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0;
    }

    next();
  } catch (err) {
    next(err);
  }
});

const Product = mongoose.model("Product", productSchema);

module.exports = Product;
