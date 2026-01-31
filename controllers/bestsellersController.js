const mongoose = require('mongoose');
const BestsellersOfWeek = require('../models/bestsellersOfWeek');
const Product = require('../models/product');
const { formatProductForResponse } = require('./productController');

const MAX_BESTSELLER_COUNT = 6;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

let cachedPublicResponse = null;
let cacheExpiresAt = 0;

function invalidateBestsellersCache() {
  cachedPublicResponse = null;
  cacheExpiresAt = 0;
}

function normalizeProductIdsInput(rawProducts) {
  if (!Array.isArray(rawProducts)) {
    throw new Error('"products" must be an array of product IDs');
  }

  const cleaned = rawProducts.map((id) => String(id || '').trim()).filter(Boolean);
  if (cleaned.length === 0) {
    throw new Error('At least one product must be provided');
  }
  if (cleaned.length > MAX_BESTSELLER_COUNT) {
    throw new Error(`You can only select up to ${MAX_BESTSELLER_COUNT} products`);
  }

  const seen = new Set();
  const duplicates = [];
  cleaned.forEach((id) => {
    if (seen.has(id)) {
      duplicates.push(id);
      return;
    }
    seen.add(id);
  });
  if (duplicates.length) {
    const uniqueDuplicates = Array.from(new Set(duplicates));
    throw new Error(`Duplicate product IDs are not allowed: ${uniqueDuplicates.join(', ')}`);
  }

  return cleaned;
}

async function fetchProductsByIdsOrdered(productIds) {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    return [];
  }

  const objectIds = productIds.filter((id) => mongoose.Types.ObjectId.isValid(id)).map((id) => new mongoose.Types.ObjectId(id));
  const query = {
    $or: [{ _id: { $in: objectIds } }],
  };

  // Some documents may use ProductId instead of _id, include those as well.
  query.$or.push({ ProductId: { $in: productIds } });

  const docs = await Product.find(query).lean();
  const lookup = new Map();

  docs.forEach((doc) => {
    const formatted = formatProductForResponse(doc);
    if (!formatted) {
      return;
    }
    const aliases = [doc._id, doc.ProductId, formatted.ProductId, formatted.id]
      .filter(Boolean)
      .map((value) => String(value));
    aliases.forEach((alias) => {
      if (!lookup.has(alias)) {
        lookup.set(alias, formatted);
      }
    });
  });

  return productIds
    .map((id) => lookup.get(id))
    .filter(Boolean)
    .slice(0, MAX_BESTSELLER_COUNT);
}

async function resolveSelectionWithProducts(productIds) {
  if (!productIds || productIds.length === 0) {
    return [];
  }
  const products = await fetchProductsByIdsOrdered(productIds);
  return products;
}

function buildPublicPayload(items) {
  return {
    items: items.map((item) => ({
      id: item.ProductId || item.id,
      ProductId: item.ProductId,
      name: item.name,
      price: item.price,
      img: item.img,
      imageUrl: item.imageUrl,
      SKU: item.SKU,
      stock: item.stock,
      category: item.category,
      description: item.description,
      desc: item.desc,
    })),
  };
}

async function getAdminBestsellers(req, res) {
  try {
    const selection = await BestsellersOfWeek.findOne({}).lean();
    const productIds = selection?.productIds || [];
    const products = await resolveSelectionWithProducts(productIds);

    return res.json({
      products,
      productIds,
      updatedAt: selection?.updatedAt || null,
      updatedBy: selection?.updatedBy || null,
    });
  } catch (error) {
    console.error('Admin bestsellers fetch failed:', error);
    return res.status(500).json({ message: 'Failed to load bestsellers selection' });
  }
}

async function updateAdminBestsellers(req, res) {
  try {
    const normalizedIds = normalizeProductIdsInput(req.body?.products);
    const products = await resolveSelectionWithProducts(normalizedIds);

    if (products.length !== normalizedIds.length) {
      const missing = normalizedIds.filter((id) => !products.find((p) => (p.ProductId || p.id) === id));
      throw new Error(`Some product IDs do not exist: ${missing.join(', ')}`);
    }

    const metadata = {
      productIds: normalizedIds,
      updatedBy: req?.admin?.email || req?.admin?.sub || 'admin',
    };

    const selection = await BestsellersOfWeek.findOneAndUpdate(
      {},
      metadata,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    invalidateBestsellersCache();

    return res.json({
      success: true,
      products,
      productIds: selection.productIds,
      updatedAt: selection.updatedAt,
      updatedBy: selection.updatedBy,
    });
  } catch (error) {
    console.error('Admin bestsellers update failed:', error);
    return res.status(400).json({ message: error.message || 'Failed to update bestsellers' });
  }
}

async function getPublicBestsellers(req, res) {
  try {
    const now = Date.now();
    if (cachedPublicResponse && now < cacheExpiresAt) {
      return res.json(cachedPublicResponse);
    }

    const selection = await BestsellersOfWeek.findOne({}).lean();
    const productIds = selection?.productIds || [];
    const products = await resolveSelectionWithProducts(productIds);
    const payload = buildPublicPayload(products);

    cachedPublicResponse = payload;
    cacheExpiresAt = now + CACHE_TTL_MS;

    return res.json(payload);
  } catch (error) {
    console.error('Public bestsellers fetch failed:', error);
    return res.status(500).json({ message: 'Failed to load bestsellers' });
  }
}

module.exports = {
  getAdminBestsellers,
  updateAdminBestsellers,
  getPublicBestsellers,
  invalidateBestsellersCache,
  normalizeProductIdsInput,
  MAX_BESTSELLER_COUNT,
};
