const mongoose = require('mongoose');

const { Schema } = mongoose;

const MAX_SLIDES = 6;

const SlideSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, default: '' },
    subtitle: { type: String, default: '' },
    imageUrl: { type: String, required: true },
    url: { type: String, default: '' },
    order: { type: Number, required: true },
  },
  { _id: false }
);

const HeroSlidesSchema = new Schema(
  {
    slides: {
      type: [SlideSchema],
      default: [],
      validate: {
        validator(value) {
          return !value || value.length <= MAX_SLIDES;
        },
        message: `You can only configure up to ${MAX_SLIDES} hero slides`,
      },
    },
    updatedBy: { type: String },
  },
  { timestamps: true }
);

module.exports = mongoose.models.HeroSlides || mongoose.model('HeroSlides', HeroSlidesSchema);
