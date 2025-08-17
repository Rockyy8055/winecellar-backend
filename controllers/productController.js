const Product = require("../models/product");
const Inventory = require("../models/inventory");

const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find();

    // Format response as per the provided JSON structure
    const formattedProducts = products.map((product) => {
      return {
        ProductId: product._id,
        name: product.name,
        price: product.price,
        desc: product.desc,
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
    const newProduct = new Product(req.body);
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
    const limit = Math.max(1, Math.min(100, parseInt(req.query.limit || '20', 10)));
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

module.exports = {
  getAllProducts,
  addProduct,
  deleteAllProducts,
  adminListProducts,
  adminUpdateProduct,
  adminUpdateProductStock,
};
