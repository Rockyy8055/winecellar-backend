const mongoose = require('mongoose');

const { Schema } = mongoose;

const HeroSlideSchema = new Schema(
  {
    imageUrl: { type: String, required: true },
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    url: { type: String, default: '' },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'hero_slides' }
);

HeroSlideSchema.index({ isActive: 1, sortOrder: 1, createdAt: 1 });

module.exports = mongoose.models.HeroSlide || mongoose.model('HeroSlide', HeroSlideSchema);
