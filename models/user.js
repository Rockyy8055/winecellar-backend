const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  phone: { type: String },
  email: { type: String, required: true, lowercase: true, unique: true, index: true },
  passwordHash: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
  modified_at: { type: Date, default: Date.now },
  last_login: { type: Date },
  status: { type: String, default: 'active' },
});

const User = mongoose.model("User", userSchema);
module.exports = User;
