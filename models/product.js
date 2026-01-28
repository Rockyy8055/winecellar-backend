const mongoose = require("mongoose");

const SAFE_SIZE_KEYS = ['1.5LTR', '1LTR', '75CL', '70CL', '35CL', '20CL', '10CL', '5CL'];

function createEmptySizeStocks() {
  return SAFE_SIZE_KEYS.reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function normalizeSizeStocksForModel(input = {}) {
  if (input && typeof input.toObject === 'function') {
    input = input.toObject();
  }

  const normalized = {};

  if (input && typeof input === 'object') {
    Object.entries(input).forEach(([rawKey, value]) => {
      const key = String(rawKey || '')
        .toUpperCase()
        .replace(/\s+/g, '');
      if (!SAFE_SIZE_KEYS.includes(key)) {
        return;
      }
      const num = Number(value);
      normalized[key] = Number.isFinite(num) && num >= 0 ? Math.floor(num) : 0;
    });
  }

  SAFE_SIZE_KEYS.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(normalized, key)) {
      normalized[key] = 0;
    }
  });

  return normalized;
}

function sumSizeStocks(sizeStocks = {}) {
  return SAFE_SIZE_KEYS.reduce((total, key) => {
    const num = Number(sizeStocks?.[key]);
    return total + (Number.isFinite(num) && num > 0 ? Math.floor(num) : 0);
  }, 0);
}

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
    type: mongoose.Schema.Types.Mixed,
    default: () => createEmptySizeStocks(),
  },
});

// Pre-save middleware to normalize sizeStocks and sync total stock
productSchema.pre('save', function(next) {
  if (this.isModified('sizeStocks') || this.isNew) {
    const normalized = normalizeSizeStocksForModel(this.sizeStocks || {});
    this.sizeStocks = normalized;
    this.stock = sumSizeStocks(normalized);
  }
  next();
});

const Product = mongoose.model("Product", productSchema);

module.exports = Product;
