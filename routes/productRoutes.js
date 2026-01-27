// routes/productRoutes.js
const express = require("express");
const router = express.Router();
const {
  getAllProducts,
  addProduct,
  deleteAllProducts,
  adminListProducts,
  adminUpdateProduct,
  adminUpdateProductStock,
  getBestSellers,
  adminDeleteProduct,
  adminBatchUpdateSizeStocks,
} = require("../controllers/productController");
const { requireAdmin } = require('../config/requireAdmin');
const { adminProductImageUpload } = require('../middleware/upload');

/**
 * Public list
 */
router.get("/api/product/get", getAllProducts);

/**
 * Public best sellers
 */
router.get('/api/product/best-sellers', getBestSellers);

/**
 * Admin: add product
 */
router.post("/api/product/add", requireAdmin, adminProductImageUpload, addProduct);
router.post('/api/admin/products', requireAdmin, adminProductImageUpload, addProduct);

/**
 * Admin: list products (raw for admin table)
 */
router.get('/api/admin/products', requireAdmin, adminListProducts);

/**
 * Admin: update product (price, desc, img, etc.)
 */
router.patch('/api/admin/products/:id', requireAdmin, adminProductImageUpload, adminUpdateProduct);

/**
 * Admin: update stock (set or adjust)
 * - Body: { stock: 120 } to set; OR { delta: -5 } to adjust
 */
router.patch('/api/admin/products/:id/stock', requireAdmin, adminUpdateProductStock);

/**
 * Admin: delete all (danger)
 */
router.delete("/api/product/delete-all", requireAdmin, deleteAllProducts);

/**
 * Admin: delete one product
 */
router.delete('/api/admin/products/:id', requireAdmin, adminDeleteProduct);

/**
 * Admin: batch update size stocks
 * Body: { updates: [{ id: "productId", sizeStocks: { "1.5LTR": 10, "1LTR": 5, ... } }] }
 */
router.patch('/api/admin/products/batch-size-stocks', requireAdmin, adminBatchUpdateSizeStocks);

module.exports = router;
