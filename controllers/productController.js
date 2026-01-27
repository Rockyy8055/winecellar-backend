const Product = require("../models/product");
const Inventory = require("../models/inventory");
const OrderDetails = require("../models/orderDetails");
const { uploadProductImage } = require('../services/imageUploadService');

// Standard sizes for validation
const STANDARD_SIZES = ['1.5LTR', '1LTR', '75CL', '70CL', '35CL', '20CL', '10CL', '5CL'];

function normalizeSizeStocks(sizeStocks = {}) {
  const normalized = {};
  STANDARD_SIZES.forEach(size => {
    const value = sizeStocks[size];
    normalized[size] = Math.max(0, Math.floor(Number(value) || 0));
  });
  return normalized;
}

function validateSizeStocks(sizeStocks = {}) {
  if (typeof sizeStocks !== 'object' || sizeStocks === null) {
    return { valid: false, error: 'sizeStocks must be an object' };
  }
  
  const normalized = {};
  for (const [size, value] of Object.entries(sizeStocks)) {
    if (!STANDARD_SIZES.includes(size)) {
      return { valid: false, error: `Invalid size: ${size}` };
    }
    const numValue = Number(value);
    if (!Number.isFinite(numValue) || numValue < 0) {
      return { valid: false, error: `Invalid stock value for ${size}: must be a non-negative number` };
    }
    normalized[size] = Math.floor(numValue);
  }
  
  return { valid: true, normalized };
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

    // Format response as per the provided JSON structure
    const formattedProducts = products.map((product) => {
      const imageUrl = product.img || '';
      const sizeStocks = normalizeSizeStocks(product.sizeStocks?.toObject?.() || product.sizeStocks || {});
      return {
        ProductId: product._id,
        name: product.name,
        price: product.price,
        desc: product.desc || "",
        description: product.description || product.desc || "",
        category: product.category,
        subCategory: product.subCategory,
        discount: product.discount || "No discount", // Default to "No discount" if not available
        size: product.size || "N/A", // Default size to "N/A" if not provided
        SKU: product.SKU,
        tags: product.tags || [], // Default to empty array if no tags
        created_at: product.created_at,
        modified_at: product.modified_at,
        deleted_at: product.deleted_at,
        vendor: product.vendor || "Unknown Vendor",
        Country: product.Country || "Unknown Country",
        Region: product.Region || "Unknown Region",
        taxable: product.taxable,
        brand: product.brand || "Unknown Brand",
        img: imageUrl,
        imageUrl,
        stock: product.stock,
        sizeStocks,
      };
    });

    // Return formatted products as JSON
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

  // Handle sizeStocks if provided
  if (body.sizeStocks !== undefined) {
    const validation = validateSizeStocks(body.sizeStocks);
    if (!validation.valid) {
      throw new Error(validation.error);
    }
    payload.sizeStocks = validation.normalized;
  }

  // Only set stock if not using sizeStocks (will be calculated by middleware)
  if (body.sizeStocks === undefined) {
    const stock = coerceNumber(body.stock);
    if (stock !== undefined) {
      payload.stock = Math.max(0, Math.floor(stock));
    }
  }

  syncDescriptionFields(payload);

  return stripUndefined(payload);
}

const addProduct = async (req, res) => {
  try {
    const basePayload = buildProductPayloadFromBody(req.body || {});
    const newProduct = new Product(basePayload);

    // Handle image upload (either from file upload or data URL)
    const imageInput = req.file || req.body.img || req.body.imageUrl;
    if (imageInput) {
      try {
        const { url } = await uploadProductImage(newProduct._id, imageInput);
        newProduct.img = url;
      } catch (uploadError) {
        return res.status(400).json({ 
          error: 'Image upload failed', 
          details: uploadError.message 
        });
      }
    }

    const savedProduct = await newProduct.save();
    res.status(201).json(savedProduct);
  } catch (error) {
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
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const rawLimit = parseInt(req.query.limit || '20', 10);
    const limit = Math.max(1, Math.min(5000, Number.isFinite(rawLimit) ? rawLimit : 20));
    const q = (req.query.q || '').trim();
    const filter = q ? { name: { $regex: q, $options: 'i' } } : {};
    const total = await Product.countDocuments(filter);
    const items = await Product.find(filter).sort({ modified_at: -1 }).skip((page-1)*limit).limit(limit);
    
    // Format items to include sizeStocks
    const formattedItems = items.map(item => {
      const itemObj = item.toObject();
      const sizeStocks = normalizeSizeStocks(item.sizeStocks?.toObject?.() || item.sizeStocks || {});
      return {
        ...itemObj,
        sizeStocks
      };
    });
    
    res.json({ items: formattedItems, total, page, pages: Math.ceil(total/limit) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

const adminUpdateProduct = async (req, res) => {
  try {
    const id = req.params.id;
    const update = buildProductPayloadFromBody(req.body || {});

    // Get existing product to check for old image
    const existingProduct = await Product.findById(id);
    if (!existingProduct) return res.status(404).json({ error: 'Not found' });

    // Handle image upload (either from file upload or data URL)
    const imageInput = req.file || req.body.img || req.body.imageUrl;
    if (imageInput) {
      try {
        const oldImageUrl = existingProduct.img;
        const { url } = await uploadProductImage(id, imageInput, oldImageUrl);
        update.img = url;
      } catch (uploadError) {
        return res.status(400).json({ 
          error: 'Image upload failed', 
          details: uploadError.message 
        });
      }
    }

    update.modified_at = new Date();

    const doc = await Product.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true, context: 'query' }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(doc);
  } catch (e) {
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

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ error: 'Not found' });

    // Handle sizeStocks updates
    if (sizeStocks !== undefined) {
      const validation = validateSizeStocks(sizeStocks);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
      
      // Update sizeStocks
      const currentSizeStocks = normalizeSizeStocks(product.sizeStocks?.toObject?.() || {});
      const updatedSizeStocks = { ...currentSizeStocks, ...validation.normalized };
      product.sizeStocks = updatedSizeStocks;
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
    
    // Return formatted response with sizeStocks
    const response = product.toObject();
    response.sizeStocks = normalizeSizeStocks(product.sizeStocks?.toObject?.() || {});
    
    res.json(response);
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
    // Optional: delete image from storage if you store keys
    // if (doc.imageKey) await storage.delete(doc.imageKey)
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

        const response = product.toObject();
        response.sizeStocks = normalizeSizeStocks(product.sizeStocks?.toObject?.() || {});
        
        results.push(response);
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
      const sizeStocks = normalizeSizeStocks(p.sizeStocks?.toObject?.() || p.sizeStocks || {});
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
        const sizeStocks = normalizeSizeStocks(p.sizeStocks?.toObject?.() || p.sizeStocks || {});
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
