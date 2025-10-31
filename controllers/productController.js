const Product = require("../models/product");
const Inventory = require("../models/inventory");
const OrderDetails = require("../models/orderDetails");

const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find();

    // Format response as per the provided JSON structure
    const formattedProducts = products.map((product) => {
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
        img: product.img || "", // Empty string if no image path
        stock: product.stock,
      };
    });

    // Return formatted products as JSON
    res.status(200).json(formattedProducts);
  } catch (error) {
    res.status(500).json({ message: "Error fetching products", error });
  }
};

const addProduct = async (req, res) => {
  try {
    const productData = { ...req.body };
    // Sync desc and description fields
    if (productData.description && !productData.desc) {
      productData.desc = productData.description;
    } else if (productData.desc && !productData.description) {
      productData.description = productData.desc;
    }
    const newProduct = new Product(productData);
    const savedProduct = await newProduct.save();
    res.status(201).json(savedProduct);
  } catch (error) {
    res.status(500).json({ message: "Error adding product", error });
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
    res.json({ items, total, page, pages: Math.ceil(total/limit) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

const adminUpdateProduct = async (req, res) => {
  try {
    const id = req.params.id;
    const update = req.body || {};
    // Sync desc and description fields when either is updated
    if (update.description !== undefined) {
      update.desc = update.description;
    } else if (update.desc !== undefined) {
      update.description = update.desc;
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
    let { stock, delta } = req.body || {};

    const product = await Product.findById(id);
    if (!product) return res.status(404).json({ error: 'Not found' });

    if (delta !== undefined) {
      const next = Number(product.stock || 0) + Number(delta);
      product.stock = Math.max(0, Math.floor(next));
    } else if (stock !== undefined) {
      stock = Number(stock);
      if (!Number.isFinite(stock) || stock < 0) return res.status(400).json({ error: 'Invalid stock' });
      product.stock = Math.floor(stock);
    } else {
      return res.status(400).json({ error: 'Provide stock or delta' });
    }

    product.modified_at = new Date();
    await product.save();
    res.json(product);
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

module.exports = {
  getAllProducts,
  addProduct,
  deleteAllProducts,
  adminListProducts,
  adminUpdateProduct,
  adminUpdateProductStock,
  adminDeleteProduct,
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
          stock: Number(p.stock ?? 0)
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
