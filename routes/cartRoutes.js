const express = require("express");
const router = express.Router();
const { requireAuth } = require('../routes/userAuth');
const {
  addToCart,
  getCart,
  updateCartItem,
  removeFromCart,
  clearCart
} = require("../controllers/cartController");

/**
 * Add item to cart
 */
router.post("/api/cart/add", requireAuth, addToCart);

/**
 * Get cart items
 */
router.get("/api/cart", requireAuth, getCart);

/**
 * Update cart item quantity
 */
router.patch("/api/cart/:itemId", requireAuth, updateCartItem);

/**
 * Remove item from cart
 */
router.delete("/api/cart/:itemId", requireAuth, removeFromCart);

/**
 * Clear cart
 */
router.delete("/api/cart", requireAuth, clearCart);

module.exports = router;
