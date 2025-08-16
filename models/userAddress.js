const mongoose = require("mongoose");

const userAddressSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  address_line1: {
    type: String,
    required: true,
  },
  address_line2: {
    type: String,
    required: false,
  },
  city: {
    type: String,
    required: true,
  },
  postal_code: {
    type: String,
    required: true,
  },
  county: {
    type: String,
    required: false,
  },
  telephone: {
    type: String,
    required: false,
  },
  mobile: {
    type: String,
    required: false,
  },
});

const UserAddress = mongoose.model("UserAddress", userAddressSchema);
module.exports = UserAddress;
