// filepath: /d:/WineCeller/MERN-backend/models/webUser.js
const mongoose = require('mongoose');

const webUserSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  updated_at: {
    type: Date,
    default: Date.now,
  },
});

const WebUser = mongoose.model('WebUser', webUserSchema);

module.exports = WebUser;