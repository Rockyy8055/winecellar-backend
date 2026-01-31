const { v4: uuidv4 } = require('uuid');
const validator = require('validator');
const HeroSlides = require('../models/heroSlides');

const MAX_SLIDES = 6;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedPublicPayload = null;
let cacheExpiresAt = 0;

function isValidHttpUrl(value) {
  if (!value || typeof value !== 'string') return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  // Allow protocol-relative (//cdn...) and absolute http(s)
  if (trimmed.startsWith('//')) {
    return validator.isURL(`https:${trimmed}`, { require_protocol: true, protocols: ['http', 'https'] });
  }
  return validator.isURL(trimmed, { require_protocol: true, protocols: ['http', 'https'] });
}

function normalizeSlidesInput(rawSlides) {
  if (!Array.isArray(rawSlides)) {
    throw new Error('"slides" must be an array');
  }
  if (rawSlides.length === 0) {
    throw new Error('Provide at least one slide');
  }
  if (rawSlides.length > MAX_SLIDES) {
    throw new Error(`You can only configure up to ${MAX_SLIDES} slides`);
  }

  const seenIds = new Set();
  const normalized = rawSlides.map((slide, index) => {
    if (!slide || typeof slide !== 'object') {
      throw new Error(`Slide at index ${index} is invalid`);
    }

    const id = String(slide.id || '').trim() || uuidv4();
    if (seenIds.has(id)) {
      throw new Error(`Duplicate slide id detected: ${id}`);
    }
    seenIds.add(id);

    const imageUrl = String(slide.imageUrl || slide.image || '').trim();
    if (!isValidHttpUrl(imageUrl)) {
      throw new Error(`Slide ${id} is missing a valid imageUrl (http/https)`);
    }

    const urlRaw = String(slide.url || '').trim();
    const url = urlRaw ? urlRaw : '';
    if (url && !isValidHttpUrl(url)) {
      throw new Error(`Slide ${id} has an invalid link URL`);
    }

    const title = typeof slide.title === 'string' ? slide.title.trim() : '';
    const subtitle = typeof slide.subtitle === 'string' ? slide.subtitle.trim() : '';

    return {
      id,
      title,
      subtitle,
      imageUrl,
      url,
      order: index,
    };
  });

  return normalized;
}

function buildPublicPayload(slides) {
  return {
    slides: slides.map((slide) => ({
      id: slide.id,
      title: slide.title,
      subtitle: slide.subtitle,
      image: slide.imageUrl,
      imageUrl: slide.imageUrl,
      url: slide.url,
      order: slide.order,
    })),
  };
}

function invalidateSliderCache() {
  cachedPublicPayload = null;
  cacheExpiresAt = 0;
}

async function getAdminHeroSlides(_req, res) {
  try {
    const doc = await HeroSlides.findOne({}).lean();
    return res.json({
      slides: doc?.slides || [],
      updatedAt: doc?.updatedAt || null,
      updatedBy: doc?.updatedBy || null,
      maxSlides: MAX_SLIDES,
    });
  } catch (error) {
    console.error('Admin slider fetch failed:', error);
    return res.status(500).json({ message: 'Failed to load hero slides' });
  }
}

async function saveAdminHeroSlides(req, res) {
  try {
    const normalizedSlides = normalizeSlidesInput(req.body?.slides);
    const updatedBy = req?.admin?.email || req?.admin?.sub || 'admin';

    const doc = await HeroSlides.findOneAndUpdate(
      {},
      { slides: normalizedSlides, updatedBy },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    invalidateSliderCache();

    return res.json({
      slides: doc.slides,
      updatedAt: doc.updatedAt,
      updatedBy: doc.updatedBy,
    });
  } catch (error) {
    console.error('Admin slider save failed:', error);
    const status = error.message && error.message.startsWith('Slide') ? 400 : 400;
    return res.status(status).json({ message: error.message || 'Failed to save hero slides' });
  }
}

async function getPublicHeroSlides(_req, res) {
  try {
    const now = Date.now();
    if (cachedPublicPayload && now < cacheExpiresAt) {
      return res.json(cachedPublicPayload);
    }

    const doc = await HeroSlides.findOne({}).lean();
    const slides = doc?.slides || [];
    const payload = buildPublicPayload(slides);

    cachedPublicPayload = payload;
    cacheExpiresAt = now + CACHE_TTL_MS;

    return res.json(payload);
  } catch (error) {
    console.error('Public slider fetch failed:', error);
    return res.status(500).json({ message: 'Failed to load hero slides' });
  }
}

module.exports = {
  MAX_SLIDES,
  normalizeSlidesInput,
  getAdminHeroSlides,
  saveAdminHeroSlides,
  getPublicHeroSlides,
  invalidateSliderCache,
};
