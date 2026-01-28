const Product = require("../models/product");
const OrderDetails = require("../models/orderDetails");
const { uploadProductImage: uploadProductImageToS3, deleteProductImageByUrl } = require('../services/productImageUpload');
const { toPublicUrl } = require('../utils/publicUrl');
const {
  SAFE_SIZE_KEYS,
  normalizeSizeKey,
  parseSizeStocksInput,
  normalizeSizeStocksForResponse,
  computeTotalStock,
  createEmptySizeStocks,
} = require('../utils/sizeStocks');

function extractSizeStocksFromBody(body = {}) {
  const extracted = {};
  if (!body || typeof body !== 'object') {
    return extracted;
  }

  for (const [key, value] of Object.entries(body)) {
    const bracketMatch = key.match(/^sizeStocks\[([^\]]+)\]$/);
    const dotMatch = key.match(/^sizeStocks\.([^\.]+)$/);
    const rawSize = bracketMatch?.[1] || dotMatch?.[1];
    if (!rawSize) {
      continue;
    }
    const normalizedKey = normalizeSizeKey(rawSize);
    if (SAFE_SIZE_KEYS.includes(normalizedKey)) {
      extracted[normalizedKey] = value;
    }
  }

  return extracted;
}

function parseJsonMaybe(value) {
  if (value === undefined || value === null) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    try {
      return JSON.parse(trimmed);
    } catch (_) {
      return value;
    }
  }
  return value;
}

function formatProductResponse(doc) {
  if (!doc) {
    return null;
  }

  const base = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const productIdCandidate = base._id || base.ProductId || base.id;
  const productId = productIdCandidate ? String(productIdCandidate) : undefined;
  const sizeStocksSource = doc.sizeStocks?.toObject?.() || base.sizeStocks || {};
  const sizeStocks = normalizeSizeStocksForResponse(sizeStocksSource);

  const rawImage = base.img || base.imageUrl || base.image || '';
  const publicImage = rawImage ? toPublicUrl(rawImage) : '';

  return {
    ...base,
    ProductId: productId || base.ProductId,
    img: publicImage,
    imageUrl: publicImage,
    sizeStocks,
  };
}

function formatProductForResponse(doc) {
  const formatted = formatProductResponse(doc);
  if (!formatted) {
    return null;
  }

  const totalStock = computeTotalStock(formatted.sizeStocks);
  const productId = formatted.ProductId || (formatted._id && String(formatted._id)) || formatted.id;

  return {
    ...formatted,
    ProductId: productId,
    discount: formatted.discount ?? 'No discount',
    size: formatted.size ?? 'N/A',
    vendor: formatted.vendor ?? 'Unknown Vendor',
    Country: formatted.Country ?? 'Unknown Country',
    Region: formatted.Region ?? 'Unknown Region',
    brand: formatted.brand ?? 'Unknown Brand',
    stock: Number.isFinite(Number(formatted.stock)) ? Number(formatted.stock) : totalStock,
    sizeStocks: formatted.sizeStocks,
  };
}

function validateSizeStocks(sizeStocks = {}, options = {}) {
  try {
    const normalized = parseSizeStocksInput(sizeStocks, { rejectUnknown: true, fillMissing: true, coerce: 'strict', ...options }) || createEmptySizeStocks();
    return { valid: true, normalized };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

function syncDescriptionFields(payload = {}) {
  if (payload.description !== undefined && payload.desc === undefined) {
    payload.desc = payload.description;
  } else if (payload.desc !== undefined && payload.description === undefined) {
    payload.description = payload.desc;
  }
}

function normalizeCategoryInput(raw) {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return [];
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((value) => String(value).trim()).filter(Boolean);
      }
    } catch (_) {
      // ignore JSON parse errors and fall back to comma split
    }
    return trimmed
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return undefined;
}

function coerceNumber(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function coerceBoolean(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }
  return undefined;
}

function stripUndefined(obj = {}) {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));
}

const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find();

    const formattedProducts = products.map(formatProductForResponse).filter(Boolean);
    res.status(200).json(formattedProducts);
  } catch (error) {
    res.status(500).json({ message: "Error fetching products", error });
  }
};

function normalizeTagsInput(raw) {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  if (Array.isArray(raw)) {
    return raw.map((value) => String(value).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) {
      return [];
    }
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((value) => String(value).trim()).filter(Boolean);
      }
    } catch (_) {
      // ignore JSON parse errors and fall back to comma split
    }
    return trimmed
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return undefined;
}

function buildProductPayloadFromBody(body = {}) {
  const extractedSizeStocks = extractSizeStocksFromBody(body);
  const payload = {
    name: body.name,
    desc: body.desc,
    description: body.description,
    category: normalizeCategoryInput(body.category),
    subCategory: body.subCategory,
    discount: body.discount,
    size: body.size,
    SKU: body.SKU,
    tags: normalizeTagsInput(body.tags),
    vendor: body.vendor,
    Country: body.Country,
    Region: body.Region,
    taxable: coerceBoolean(body.taxable),
    brand: body.brand,
  };

  const price = coerceNumber(body.price);
  if (price !== undefined) {
    payload.price = price;
  }

  // Handle sizeStocks if provided (multipart may send as JSON string)
  const hasExtractedSizeStocks = Object.keys(extractedSizeStocks).length > 0;
  const sizeStocksInput = body.sizeStocks !== undefined ? body.sizeStocks : (hasExtractedSizeStocks ? extractedSizeStocks : undefined);
  if (sizeStocksInput !== undefined) {
    const validation = validateSizeStocks(sizeStocksInput);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    payload.sizeStocks = validation.normalized;
  }

  const stock = coerceNumber(body.stock);
  if (stock !== undefined) {
    payload.stock = Math.max(0, Math.floor(stock));
  } else if (payload.sizeStocks !== undefined) {
    payload.stock = computeTotalStock(payload.sizeStocks);
  }

  syncDescriptionFields(payload);

  return stripUndefined(payload);
}

const addProduct = async (req, res) => {
  try {
    console.log('Add product request received:', {
      hasFile: !!req.file,
      hasImg: !!req.body.img,
      hasImageUrl: !!req.body.imageUrl,
      imgType: req.body.img ? (req.body.img.startsWith('data:') ? 'data-url' : 'url') : 'none'
    });

    const basePayload = buildProductPayloadFromBody(req.body || {});
    const newProduct = new Product(basePayload);

    // Handle image upload:
    // - multipart file field `image` => upload to S3
    // - img/imageUrl string => store as-is
    if (req.file) {
      try {
        console.log('Processing image upload...');
        const uploaded = await uploadProductImageToS3(newProduct._id, req.file);
        newProduct.img = uploaded.url;
        console.log('Image uploaded successfully:', uploaded.url);
      } catch (uploadError) {
        console.error('Image upload failed:', uploadError.message);
        return res.status(400).json({
          error: 'Image upload failed',
          details: uploadError.message
        });
      }
    } else if (req.body?.img || req.body?.imageUrl) {
      newProduct.img = req.body.img || req.body.imageUrl;
    }

    const savedProduct = await newProduct.save();
    console.log('Product saved successfully:', savedProduct._id);
    res.status(201).json(formatProductForResponse(savedProduct));
  } catch (error) {
    console.error('Error adding product:', error.message);
    res.status(500).json({ message: "Error adding product", error: error.message });
  }
};

const deleteAllProducts = async (req, res) => {
  try {
    const result = await Product.deleteMany({});
    res.status(200).json({ 
      message: `Deleted ${result.deletedCount} products successfully`,
      deletedCount: result.deletedCount 
    });
  } catch (error) {
    res.status(500).json({ message: "Error deleting products", error });
  }
};

// Admin list (raw), simple pagination/search
const adminListProducts = async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const filter = q ? { name: { $regex: q, $options: 'i' } } : {};
    const items = await Product.find(filter).sort({ modified_at: -1 });
    const formattedItems = items.map(formatProductForResponse).filter(Boolean);
    res.json(formattedItems);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

const adminUpdateProduct = async (req, res) => {
  try {
    const id = req.params.id;
    console.log('Update product request received:', {
      id,
      hasFile: !!req.file,
      hasImg: !!req.body.img,
      hasImageUrl: !!req.body.imageUrl,
      imgType: req.body.img ? (req.body.img.startsWith('data:') ? 'data-url' : 'url') : 'none'
    });

    const update = buildProductPayloadFromBody(req.body || {});

    // Get existing product to check for old image
    const existingProduct = await Product.findById(id);
    if (!existingProduct) return res.status(404).json({ error: 'Not found' });
    const oldImageUrl = existingProduct.img;
    let newImageUrl = null;

    // Handle image upload (either from file upload or data URL)
    if (req.file) {
      try {
        console.log('Processing image update...');
        const uploaded = await uploadProductImageToS3(id, req.file);
        update.img = uploaded.url;
        newImageUrl = uploaded.url;
        console.log('Image updated successfully:', uploaded.url);
      } catch (uploadError) {
        console.error('Image update failed:', uploadError.message);
        return res.status(400).json({
          error: 'Image upload failed',
          details: uploadError.message
        });
      }
    } else if (req.body?.img || req.body?.imageUrl) {
      update.img = req.body.img || req.body.imageUrl;
      newImageUrl = update.img;
    }

    // If sizeStocks was supplied but stock omitted, compute stock for query update
    if (update.sizeStocks !== undefined && update.stock === undefined) {
      update.stock = computeTotalStock(update.sizeStocks);
    }

    update.modified_at = new Date();

    const doc = await Product.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true, context: 'query' }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (oldImageUrl && newImageUrl && newImageUrl !== oldImageUrl) {
      try {
        await deleteProductImageByUrl(oldImageUrl);
      } catch (_) {
        // ignore S3 deletion errors
      }
    }

    console.log('Product updated successfully:', id);
    res.json(formatProductForResponse(doc));
  } catch (e) {
    console.error('Error updating product:', e.message);
    if (e?.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid product id' });
    }
    if (e?.name === 'ValidationError') {
      return res.status(400).json({ error: 'Validation failed', details: e.errors });
    }
    res.status(500).json({ error: e.message });
  }
};

// Admin: set or adjust stock
const adminUpdateProductStock = async (req, res) => {
  try {
    const id = req.params.id;
    let { stock, delta, sizeStocks } = req.body || {};
    if (sizeStocks === undefined) {
      const extracted = extractSizeStocksFromBody(req.body || {});
      if (Object.keys(extracted).length > 0) {
        sizeStocks = extracted;
      }
    }

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ error: 'Not found' });

    // Handle sizeStocks updates
    if (sizeStocks !== undefined) {
      const validation = validateSizeStocks(sizeStocks, { fillMissing: false });
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      
      // Update sizeStocks
      const currentSizeStocks = normalizeSizeStocksForResponse(product.sizeStocks?.toObject?.() || product.sizeStocks || {});
      const updates = validation.normalized;
      const updatedSizeStocks = { ...currentSizeStocks };
      Object.entries(updates).forEach(([key, value]) => {
        updatedSizeStocks[key] = Math.max(0, Math.floor(Number(value) || 0));
      });
      product.sizeStocks = updatedSizeStocks;
      product.stock = computeTotalStock(updatedSizeStocks);
    } else if (delta !== undefined) {
      const next = Number(product.stock || 0) + Number(delta);
      product.stock = Math.max(0, Math.floor(next));
    } else if (stock !== undefined) {
      stock = Number(stock);
      if (!Number.isFinite(stock) || stock < 0) return res.status(400).json({ error: 'Invalid stock' });
      product.stock = Math.floor(stock);
    } else {
      return res.status(400).json({ error: 'Provide stock, delta, or sizeStocks' });
    }

    product.modified_at = new Date();
    await product.save();
    
    res.json(formatProductForResponse(product));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// Admin: delete one product
const adminDeleteProduct = async (req, res) => {
  try {
    const id = req.params.id;
    if (!id) return res.status(400).json({ message: 'Invalid product id' });
    const doc = await Product.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ message: 'Product not found' });
    if (doc.img) {
      try {
        await deleteProductImageByUrl(doc.img);
      } catch (_) {
        // ignore
      }
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    if (e?.name === 'CastError') return res.status(400).json({ message: 'Invalid product id' });
    res.status(500).json({ message: 'Failed to delete product' });
  }
};

// Admin: batch update size stocks
const adminBatchUpdateSizeStocks = async (req, res) => {
  try {
    const { updates } = req.body || {}; // Array of { id, sizeStocks }

    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'updates must be an array' });
    }

    const results = [];
    const errors = [];

    for (const update of updates) {
      try {
        const { id, sizeStocks } = update;
        
        if (!id) {
          errors.push({ id, error: 'Product ID is required' });
          continue;
        }

        if (!sizeStocks) {
          errors.push({ id, error: 'sizeStocks is required' });
          continue;
        }

        // Validate sizeStocks
        const validation = validateSizeStocks(sizeStocks);
        if (!validation.valid) {
          errors.push({ id, error: validation.error });
          continue;
        }

        const product = await Product.findById(id);
        if (!product) {
          errors.push({ id, error: 'Product not found' });
          continue;
        }

        // Update sizeStocks
        product.sizeStocks = validation.normalized;
        product.modified_at = new Date();
        await product.save();

        results.push(formatProductForResponse(product));
      } catch (error) {
        errors.push({ id: update.id, error: error.message });
      }
    }

    res.json({ 
      success: true, 
      updated: results.length,
      errors: errors.length,
      results,
      errors
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

module.exports = {
  getAllProducts,
  addProduct,
  deleteAllProducts,
  adminListProducts,
  adminUpdateProduct,
  adminUpdateProductStock,
  adminDeleteProduct,
  adminBatchUpdateSizeStocks,
};

// Best sellers (public)
const clamp = (value, min, max, fallback) => {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const getBestSellers = async (req, res) => {
  try {
    const limit = clamp(req.query.limit, 1, 30, 15);
    const days = clamp(req.query.days, 1, 90, 7);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const pipeline = [
      { $match: { $or: [ { created_at: { $gte: since } }, { createdAt: { $gte: since } } ] } },
      { $unwind: '$items' },
      {
        $addFields: {
          _pidCandidate: {
            $ifNull: [
              '$items.product',
              { $ifNull: [
                '$items.productId',
                { $ifNull: [
                  '$items.ProductId',
                  { $ifNull: [
                    '$items._id',
                    { $ifNull: [
                      '$items.id',
                      { $ifNull: [
                        '$items.sku',
                        { $ifNull: [ '$items.SKU', '$items.name' ] }
                      ] }
                    ] }
                  ] }
                ] }
              ] }
            ]
          }
        }
      },
      { $addFields: { pid: { $toString: '$_pidCandidate' } } },
      {
        $group: {
          _id: '$pid',
          totalQty: { $sum: { $ifNull: ['$items.qty', 1] } },
          totalSales: { $sum: { $multiply: [ { $ifNull: ['$items.qty', 1] }, { $ifNull: ['$items.price', 0] } ] } },
          lastName: { $last: '$items.name' },
          lastSku: { $last: '$items.sku' },
          lastPrice: { $last: '$items.price' }
        }
      },
      { $sort: { totalQty: -1, totalSales: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: Product.collection.name,
          let: { k: '$_id', n: '$lastName', sku: '$lastSku' },
          pipeline: [
            { $match: { $expr: { $or: [
              { $eq: [ { $toString: '$_id' }, '$$k' ] },
              { $eq: [ { $toString: '$ProductId' }, '$$k' ] },
              { $eq: [ '$name', '$$n' ] },
              { $eq: [ '$SKU', '$$sku' ] }
            ] } } },
            { $limit: 1 }
          ],
          as: 'product'
        }
      }
    ];

    const rows = await OrderDetails.aggregate(pipeline).allowDiskUse(true);

    const normalized = rows.map((r) => {
      const p = Array.isArray(r.product) && r.product.length ? r.product[0] : {};
      const sizeStocks = normalizeSizeStocksForResponse(p.sizeStocks?.toObject?.() || p.sizeStocks || {});
      return {
        id: (p._id && String(p._id)) || p.id || p.ProductId || r._id,
        ProductId: p.ProductId || (p._id && String(p._id)) || r._id,
        name: p.name || r.lastName || '',
        price: Number(p.price ?? r.lastPrice ?? 0),
        desc: p.desc || '',
        description: p.description || p.desc || '',
        img: toPublicUrl(p.img || p.image || p.imageUrl || ''),
        imageUrl: toPublicUrl(p.imageUrl || p.img || ''),
        category: p.category || [],
        stock: Number(p.stock ?? 0),
        sizeStocks,
        totalQty: r.totalQty,
        totalSales: Number(r.totalSales || 0)
      };
    });

    if (normalized.length === 0) {
      // Fallback: all-time
      const allTime = await OrderDetails.aggregate([
        { $unwind: '$items' },
        {
          $addFields: {
            _pidCandidate: { $ifNull: [ '$items.product', { $ifNull: [ '$items.productId', { $ifNull: [ '$items.ProductId', '$items.name' ] } ] } ] }
          }
        },
        { $addFields: { pid: { $toString: '$_pidCandidate' } } },
        { $group: { _id: '$pid', totalQty: { $sum: { $ifNull: ['$items.qty', 1] } }, lastName: { $last: '$items.name' }, lastPrice: { $last: '$items.price' } } },
        { $sort: { totalQty: -1 } },
        { $limit: limit },
        {
          $lookup: {
            from: Product.collection.name,
            let: { k: '$_id', n: '$lastName' },
            pipeline: [
              { $match: { $expr: { $or: [ { $eq: [ { $toString: '$_id' }, '$$k' ] }, { $eq: [ { $toString: '$ProductId' }, '$$k' ] }, { $eq: [ '$name', '$$n' ] } ] } } },
              { $limit: 1 }
            ],
            as: 'product'
          }
        }
      ]).allowDiskUse(true);

      const fallback = allTime.map((r) => {
        const p = Array.isArray(r.product) && r.product.length ? r.product[0] : {};
        const sizeStocks = normalizeSizeStocksForResponse(p.sizeStocks?.toObject?.() || p.sizeStocks || {});
        return {
          id: (p._id && String(p._id)) || p.id || p.ProductId || r._id,
          ProductId: p.ProductId || (p._id && String(p._id)) || r._id,
          name: p.name || r.lastName || '',
          price: Number(p.price ?? r.lastPrice ?? 0),
          desc: p.desc || '',
          description: p.description || p.desc || '',
          img: p.img || p.image || p.imageUrl || '',
          imageUrl: p.imageUrl || p.img || '',
          category: p.category || [],
          stock: Number(p.stock ?? 0),
          sizeStocks
        };
      });
      return res.status(200).json(fallback);
    }

    return res.status(200).json(normalized);
  } catch (e) {
    console.error('best-sellers error:', e);
    return res.status(500).json({ message: 'Failed to compute best sellers' });
  }
};

module.exports.getBestSellers = getBestSellers;
