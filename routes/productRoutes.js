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
} = require("../controllers/productController");
const { requireAdmin } = require('../config/requireAdmin');

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
router.post("/api/product/add", requireAdmin, addProduct);

/**
 * Admin: list products (raw for admin table)
 */
router.get('/api/admin/products', requireAdmin, adminListProducts);

/**
 * Admin: update product (price, desc, img, etc.)
 */
router.patch('/api/admin/products/:id', requireAdmin, adminUpdateProduct);

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

module.exports = router;
