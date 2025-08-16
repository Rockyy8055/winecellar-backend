const mongoose = require('mongoose');

const webUserLoginSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WebUser',
    required: true,
  },
  login_time: {
    type: Date,
    default: Date.now,
  },
  chrom_ip: {
    type: String,
    required: true,
  },
  token: {
    type: String,
    required: true,
  },
});

const WebUserLogin = mongoose.model('WebUserLogin', webUserLoginSchema);

module.exports = WebUserLogin;