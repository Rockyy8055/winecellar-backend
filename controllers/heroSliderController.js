const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const HeroSlide = require('../models/heroSlides');
const { toPublicUrl } = require('../utils/publicUrl');

const UPLOAD_RELATIVE_DIR = '/uploads/hero-slides';
const UPLOAD_DIR = path.join(__dirname, '../uploads/hero-slides');

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function getExtensionFromMime(mimeType = '') {
  const lower = String(mimeType).toLowerCase();
  if (lower === 'image/jpeg' || lower === 'image/jpg') return '.jpg';
  if (lower === 'image/png') return '.png';
  if (lower === 'image/webp') return '.webp';
  if (lower === 'image/gif') return '.gif';
  if (lower === 'image/svg+xml') return '.svg';
  if (lower === 'image/bmp') return '.bmp';
  if (lower === 'image/tiff') return '.tiff';
  if (lower === 'image/x-icon' || lower === 'image/vnd.microsoft.icon') return '.ico';
  if (lower.startsWith('image/')) {
    const subtype = lower.split('/')[1] || 'jpg';
    return '.' + subtype.replace(/[^a-z0-9]/g, '');
  }
  return '.jpg';
}

function extractFilenameFromUrl(imageUrl = '') {
  if (!imageUrl) return '';
  try {
    const parsed = new URL(imageUrl);
    return path.basename(parsed.pathname || '');
  } catch (_) {
    return path.basename(String(imageUrl));
  }
}

function parseBoolean(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  if (typeof value === 'boolean') return value;
  const asString = String(value).trim().toLowerCase();
  if (asString === 'true') return true;
  if (asString === 'false') return false;
  return defaultValue;
}

function parseIntOrDefault(value, defaultValue) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

function toSlideResponse(slideDoc) {
  if (!slideDoc) return null;
  const slide = typeof slideDoc.toObject === 'function' ? slideDoc.toObject() : slideDoc;
  return {
    id: slide._id,
    title: slide.title || '',
    subtitle: slide.subtitle || '',
    url: slide.url || '',
    imageUrl: slide.imageUrl,
    sortOrder: slide.sortOrder ?? 0,
    isActive: slide.isActive ?? true,
    createdAt: slide.createdAt,
    updatedAt: slide.updatedAt,
  };
}

async function getPublicHeroSlides(_req, res) {
  try {
    const slides = await HeroSlide.find({ isActive: true })
      .sort({ sortOrder: 1, createdAt: 1 })
      .lean();

    return res.json({ slides: slides.map(toSlideResponse) });
  } catch (error) {
    console.error('Public slider fetch failed:', error);
    return res.status(500).json({ message: 'Failed to load hero slides' });
  }
}

async function adminListHeroSlides(_req, res) {
  try {
    const slides = await HeroSlide.find({}).sort({ sortOrder: 1, createdAt: 1 }).lean();
    return res.json({ slides: slides.map(toSlideResponse) });
  } catch (error) {
    console.error('Admin slider list failed:', error);
    return res.status(500).json({ message: 'Failed to load hero slides' });
  }
}

async function adminCreateHeroSlide(req, res) {
  try {
    const file = req.file;
    if (!file || !file.buffer) {
      return res.status(400).json({ message: 'Image file is required (field name: image)' });
    }

    ensureUploadDir();

    const ext = getExtensionFromMime(file.mimetype);
    const stamp = Date.now();
    const rand = crypto.randomBytes(6).toString('hex');
    const filename = `hero-slide-${stamp}-${rand}${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    fs.writeFileSync(filePath, file.buffer);

    const relativePath = `${UPLOAD_RELATIVE_DIR}/${filename}`;
    const imageUrl = toPublicUrl(relativePath);

    const slide = await HeroSlide.create({
      imageUrl,
      title: typeof req.body?.title === 'string' ? req.body.title : '',
      subtitle: typeof req.body?.subtitle === 'string' ? req.body.subtitle : '',
      url: typeof req.body?.url === 'string' ? req.body.url : '',
      sortOrder: parseIntOrDefault(req.body?.sortOrder, 0),
      isActive: parseBoolean(req.body?.isActive, true),
    });

    return res.status(201).json({ ok: true, slide: toSlideResponse(slide) });
  } catch (error) {
    console.error('Admin slider create failed:', error);
    return res.status(500).json({ message: 'Failed to create hero slide' });
  }
}

async function adminUpdateHeroSlide(req, res) {
  try {
    const { id } = req.params;
    const update = {};
    const body = req.body || {};

    if (body.title !== undefined) update.title = body.title;
    if (body.subtitle !== undefined) update.subtitle = body.subtitle;
    if (body.url !== undefined) update.url = body.url;
    if (body.sortOrder !== undefined) update.sortOrder = parseIntOrDefault(body.sortOrder, 0);
    if (body.isActive !== undefined) update.isActive = parseBoolean(body.isActive, true);

    const slide = await HeroSlide.findByIdAndUpdate(id, update, { new: true });
    if (!slide) {
      return res.status(404).json({ message: 'Slide not found' });
    }
    return res.json({ ok: true, slide: toSlideResponse(slide) });
  } catch (error) {
    console.error('Admin slider update failed:', error);
    return res.status(500).json({ message: 'Failed to update hero slide' });
  }
}

async function adminDeleteHeroSlide(req, res) {
  try {
    const { id } = req.params;
    const slide = await HeroSlide.findByIdAndDelete(id);
    if (!slide) {
      return res.status(404).json({ message: 'Slide not found' });
    }

    try {
      const filename = extractFilenameFromUrl(slide.imageUrl);
      if (filename) {
        const filePath = path.join(UPLOAD_DIR, filename);
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }
      }
    } catch (e) {
      console.warn('Failed to delete hero slide image:', e.message);
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error('Admin slider delete failed:', error);
    return res.status(500).json({ message: 'Failed to delete hero slide' });
  }
}

module.exports = {
  getPublicHeroSlides,
  adminListHeroSlides,
  adminCreateHeroSlide,
  adminUpdateHeroSlide,
  adminDeleteHeroSlide,
};
