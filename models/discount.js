const mongoose = require("mongoose");

const discountSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  desc: {
    type: String,
    required: false,
  },
  discount_percent: {
    type: Number,
    required: true,
  },
  active: {
    type: Boolean,
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
  deleted_at: {
    type: Date,
    default: null,
  },
});

const Discount = mongoose.model("Discount", discountSchema);
module.exports = Discount;
