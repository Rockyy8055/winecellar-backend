const e = require("express");
const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
  },
  first_name: {
    type: String,
    required: false,
  },
  last_name: {
    type: String,
    required: false,
  },
  password: {
    type: String,
    required: true,
  },
  telephone: {
    type: String,
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
  last_login: {
    type: Date,
    default: Date.now,
  },
  status: {
    type: String,
    default: "active",
  },
  role: {
    type: String,
    enum: ["admin", "user"],
    default: "user",
  },
});

const User = mongoose.model("User", userSchema);
module.exports = User;
