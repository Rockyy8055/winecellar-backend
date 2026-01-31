const mongoose = require('mongoose');

const bestsellersOfWeekSchema = new mongoose.Schema(
  {
    productIds: {
      type: [String],
      validate: {
        validator(ids) {
          return Array.isArray(ids) && ids.length <= 6;
        },
        message: 'productIds must be an array with at most 6 entries',
      },
      required: true,
      default: [],
    },
    updatedBy: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: false, updatedAt: true },
  }
);

module.exports = mongoose.model('BestsellersOfWeek', bestsellersOfWeekSchema);
