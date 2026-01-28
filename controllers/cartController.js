const Product = require("../models/product");
const CartItem = require("../models/cartItem");
const ShoppingSession = require("../models/shoppingSession");
const { toPublicUrl } = require('../utils/publicUrl');
const {
  SAFE_SIZE_KEYS,
  normalizeSizeStocksForResponse,
} = require('../utils/sizeStocks');

// Add item to cart
const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1, size } = req.body || {};
    const userId = req.user?.userId; // From auth middleware

    if (!productId) {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    if (!userId) {
      return res.status(401).json({ error: 'User authentication required' });
    }

    // Validate product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Validate size if provided
    if (size && !SAFE_SIZE_KEYS.includes(size)) {
      return res.status(400).json({ error: 'Invalid size' });
    }

    // Get or create shopping session
    let session = await ShoppingSession.findOne({ user_id: userId });
    if (!session) {
      session = new ShoppingSession({ user_id: userId, total: 0 });
      await session.save();
    }

    // Check if product has sizeStocks and size is required
    const sizeStocks = normalizeSizeStocksForResponse(product.sizeStocks?.toObject?.() || product.sizeStocks || {});
    const hasMultipleSizes = Object.values(sizeStocks).some(stock => stock > 0) || Object.keys(sizeStocks).length > 0;
    
    if (hasMultipleSizes && !size) {
      return res.status(400).json({ error: 'Size is required for this product' });
    }

    // Check stock availability
    if (size && sizeStocks[size] !== undefined) {
      const availableStock = sizeStocks[size];
      
      // Check existing cart items for this product and size
      const existingCartItem = await CartItem.findOne({
        session_id: session._id,
        product_id: productId,
        size: size
      });

      const currentQuantity = existingCartItem ? existingCartItem.quantity : 0;
      const totalRequested = currentQuantity + quantity;

      if (totalRequested > availableStock) {
        return res.status(400).json({ 
          error: "THAT'S ALL WE HAVE FOR NOW",
          available: availableStock,
          requested: totalRequested
        });
      }
    } else {
      // Fallback to total stock check
      if (quantity > product.stock) {
        return res.status(400).json({ 
          error: "THAT'S ALL WE HAVE FOR NOW",
          available: product.stock,
          requested: quantity
        });
      }
    }

    // Add or update cart item
    const cartItem = await CartItem.findOneAndUpdate(
      { session_id: session._id, product_id: productId, size: size || null },
      { quantity: (existingCartItem?.quantity || 0) + quantity },
      { upsert: true, new: true }
    ).populate('product_id');

    // Update session total
    await updateSessionTotal(session._id);

    res.status(201).json(cartItem);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Get cart items
const getCart = async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    const session = await ShoppingSession.findOne({ user_id: userId });
    if (!session) {
      return res.json({ items: [], total: 0 });
    }

    const cartItems = await CartItem.find({ session_id: session._id })
      .populate('product_id')
      .lean();

    const formattedItems = cartItems.map(item => {
      const product = item.product_id || {};
      const sizeStocks = normalizeSizeStocksForResponse(product.sizeStocks?.toObject?.() || product.sizeStocks || {});
      
      return {
        id: item._id,
        productId: item.product_id._id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        size: item.size,
        availableStock: item.size ? sizeStocks[item.size] || 0 : product.stock,
        sizeStocks,
        image: toPublicUrl(product.img),
        sku: product.SKU
      };
    });

    res.json({ items: formattedItems, total: session.total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update cart item quantity
const updateCartItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;
    const userId = req.user?.userId;

    if (quantity < 0) {
      return res.status(400).json({ error: 'Quantity cannot be negative' });
    }

    const cartItem = await CartItem.findById(itemId).populate('product_id');
    if (!cartItem) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    // Verify ownership
    const session = await ShoppingSession.findById(cartItem.session_id);
    if (!session || session.user_id.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const product = cartItem.product_id;
    
    // Check stock availability
    if (cartItem.size) {
      const sizeStocks = normalizeSizeStocksForResponse(product.sizeStocks?.toObject?.() || product.sizeStocks || {});
      const availableStock = sizeStocks[cartItem.size] || 0;
      
      if (quantity > availableStock) {
        return res.status(400).json({ 
          error: "THAT'S ALL WE HAVE FOR NOW",
          available: availableStock,
          requested: quantity
        });
      }
    } else {
      if (quantity > product.stock) {
        return res.status(400).json({ 
          error: "THAT'S ALL WE HAVE FOR NOW",
          available: product.stock,
          requested: quantity
        });
      }
    }

    if (quantity === 0) {
      await CartItem.findByIdAndDelete(itemId);
    } else {
      cartItem.quantity = quantity;
      await cartItem.save();
    }

    await updateSessionTotal(session._id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Remove item from cart
const removeFromCart = async (req, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user?.userId;

    const cartItem = await CartItem.findById(itemId);
    if (!cartItem) {
      return res.status(404).json({ error: 'Cart item not found' });
    }

    // Verify ownership
    const session = await ShoppingSession.findById(cartItem.session_id);
    if (!session || session.user_id.toString() !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await CartItem.findByIdAndDelete(itemId);
    await updateSessionTotal(session._id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Clear cart
const clearCart = async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    const session = await ShoppingSession.findOne({ user_id: userId });
    if (session) {
      await CartItem.deleteMany({ session_id: session._id });
      session.total = 0;
      await session.save();
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Helper function to update session total
async function updateSessionTotal(sessionId) {
  const cartItems = await CartItem.find({ session_id: sessionId }).populate('product_id');
  
  const total = cartItems.reduce((sum, item) => {
    const price = item.product_id?.price || 0;
    return sum + (price * item.quantity);
  }, 0);

  await ShoppingSession.findByIdAndUpdate(sessionId, { total });
}

module.exports = {
  addToCart,
  getCart,
  updateCartItem,
  removeFromCart,
  clearCart
};
