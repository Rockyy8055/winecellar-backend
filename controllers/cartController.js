const Product = require("../models/product");
const CartItem = require("../models/cartItem");
const ShoppingSession = require("../models/shoppingSession");
const { toPublicUrl } = require('../utils/publicUrl');
const {
  SAFE_SIZE_KEYS,
  normalizeSizeStocksForResponse,
  normalizeSizeInput,
} = require('../utils/sizeStocks');

// Add item to cart
const addToCart = async (req, res) => {
  try {
    const { productId, quantity = 1, size } = req.body || {};
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User authentication required' });
    }

    if (!productId) {
      return res.status(400).json({ success: false, message: 'Product ID is required' });
    }

    // Validate product exists
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Validate size if provided
    if (size && !SAFE_SIZE_KEYS.includes(size)) {
      return res.status(400).json({ success: false, message: 'Invalid size' });
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
      return res.status(400).json({ success: false, message: 'Size is required for this product' });
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
          success: false,
          message: "THAT'S ALL WE HAVE FOR NOW",
          available: availableStock,
          requested: totalRequested
        });
      }
    } else {
      // Fallback to total stock check
      if (quantity > product.stock) {
        return res.status(400).json({ 
          success: false,
          message: "THAT'S ALL WE HAVE FOR NOW",
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

    res.status(201).json({ success: true, item: toCartItemResponse(cartItem) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Replace entire cart payload
const replaceCart = async (req, res) => {
  try {
    const userId = req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User authentication required' });
    }

    const items = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!items) {
      return res.status(400).json({ success: false, message: 'items array is required' });
    }

    if (items.length === 0) {
      await clearCartForUserId(userId);
      return res.json({ success: true, items: [], total: 0 });
    }

    let session = await ShoppingSession.findOne({ user_id: userId });
    if (!session) {
      session = new ShoppingSession({ user_id: userId, total: 0 });
      await session.save();
    }

    const aggregated = new Map();
    items.forEach((item, idx) => {
      const productId = String(item?.productId || item?.product_id || item?.id || '').trim();
      if (!productId) {
        throw new Error(`Invalid cart item at index ${idx}: productId is required.`);
      }

      const quantityValue = Number(item?.quantity ?? item?.qty ?? 0);
      const quantity = Number.isFinite(quantityValue) ? Math.floor(quantityValue) : NaN;
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`Invalid quantity for product ${productId}.`);
      }

      const rawSize = item?.size || item?.productSize || item?.selectedSize || null;
      const normalizedSize = rawSize ? normalizeSizeInput(rawSize) : '';
      if (rawSize && !normalizedSize) {
        throw new Error(`Invalid size provided for product ${productId}.`);
      }

      const key = `${productId}__${normalizedSize || 'NO_SIZE'}`;
      const existing = aggregated.get(key);
      aggregated.set(key, {
        productId,
        size: normalizedSize || null,
        quantity: (existing?.quantity || 0) + quantity,
      });
    });

    const productIds = [...new Set(Array.from(aggregated.values()).map((item) => item.productId))];
    const products = await Product.find({ _id: { $in: productIds } }).lean();
    const productMap = new Map(products.map((p) => [String(p._id), p]));

    const cartDocs = [];
    for (const item of aggregated.values()) {
      const product = productMap.get(item.productId);
      if (!product) {
        return res.status(404).json({ success: false, message: 'One or more products were not found' });
      }

      const sizeStocks = normalizeSizeStocksForResponse(product.sizeStocks || {});
      const hasMultipleSizes = Object.values(sizeStocks).some((stock) => stock > 0) || Object.keys(sizeStocks).length > 0;

      if (hasMultipleSizes) {
        if (!item.size) {
          return res.status(400).json({ success: false, message: `Size is required for ${product.name}` });
        }
        const availableStock = sizeStocks[item.size];
        if (availableStock === undefined) {
          return res.status(400).json({ success: false, message: `Invalid size for ${product.name}` });
        }
        if (item.quantity > availableStock) {
          return res.status(400).json({
            success: false,
            message: `Requested quantity for ${product.name} (${item.size}) exceeds available stock`,
            available: availableStock,
            requested: item.quantity,
          });
        }
      } else {
        if (item.size) {
          return res.status(400).json({ success: false, message: `Size selection is not supported for ${product.name}` });
        }
        if (item.quantity > product.stock) {
          return res.status(400).json({
            success: false,
            message: `Requested quantity for ${product.name} exceeds available stock`,
            available: product.stock,
            requested: item.quantity,
          });
        }
      }

      cartDocs.push({
        session_id: session._id,
        product_id: item.productId,
        quantity: item.quantity,
        size: item.size,
      });
    }

    await CartItem.deleteMany({ session_id: session._id });
    if (cartDocs.length) {
      await CartItem.insertMany(cartDocs);
    }

    await updateSessionTotal(session._id);
    const updatedSession = await ShoppingSession.findById(session._id);
    const cartItems = await CartItem.find({ session_id: session._id })
      .populate('product_id')
      .lean();
    const formattedItems = cartItems.map(toCartItemResponse);

    return res.json({
      success: true,
      items: formattedItems,
      total: updatedSession?.total || 0,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

// Get cart items
const getCart = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User authentication required' });
    }

    const session = await ShoppingSession.findOne({ user_id: userId });
    if (!session) {
      return res.json({ success: true, items: [], total: 0 });
    }

    const cartItems = await CartItem.find({ session_id: session._id })
      .populate('product_id')
      .lean();

    const formattedItems = cartItems.map(toCartItemResponse);

    res.json({ success: true, items: formattedItems, total: session.total });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update cart item quantity
const updateCartItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User authentication required' });
    }

    if (quantity < 0) {
      return res.status(400).json({ success: false, message: 'Quantity cannot be negative' });
    }

    const cartItem = await CartItem.findById(itemId).populate('product_id');
    if (!cartItem) {
      return res.status(404).json({ success: false, message: 'Cart item not found' });
    }

    // Verify ownership
    const session = await ShoppingSession.findById(cartItem.session_id);
    if (!session || session.user_id.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const product = cartItem.product_id;
    
    // Check stock availability
    if (cartItem.size) {
      const sizeStocks = normalizeSizeStocksForResponse(product.sizeStocks?.toObject?.() || product.sizeStocks || {});
      const availableStock = sizeStocks[cartItem.size] || 0;
      
      if (quantity > availableStock) {
        return res.status(400).json({ 
          success: false,
          message: "THAT'S ALL WE HAVE FOR NOW",
          available: availableStock,
          requested: quantity
        });
      }
    } else {
      if (quantity > product.stock) {
        return res.status(400).json({ 
          success: false,
          message: "THAT'S ALL WE HAVE FOR NOW",
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
    res.status(500).json({ success: false, message: error.message });
  }
};

// Remove item from cart
const removeFromCart = async (req, res) => {
  try {
    const { itemId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User authentication required' });
    }

    const cartItem = await CartItem.findById(itemId);
    if (!cartItem) {
      return res.status(404).json({ success: false, message: 'Cart item not found' });
    }

    // Verify ownership
    const session = await ShoppingSession.findById(cartItem.session_id);
    if (!session || session.user_id.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    await CartItem.findByIdAndDelete(itemId);
    await updateSessionTotal(session._id);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Clear cart
const clearCart = async (req, res) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'User authentication required' });
    }

    const result = await clearCartForUserId(userId);

    res.json({ success: true, itemsCleared: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Helper function to update session total
async function updateSessionTotal(sessionId) {
  const cartItems = await CartItem.find({ session_id: sessionId }).populate('product_id');

  const total = cartItems.reduce((sum, item) => {
    const price = item.product_id?.price || 0;
    return sum + (price * item.quantity);
  }, 0);

  await ShoppingSession.findByIdAndUpdate(sessionId, { total, modified_at: new Date() });
}

async function clearCartForUserId(userId) {
  if (!userId) {
    return { deletedCount: 0 };
  }

  const session = await ShoppingSession.findOne({ user_id: userId });
  if (!session) {
    return { deletedCount: 0 };
  }

  const result = await CartItem.deleteMany({ session_id: session._id });
  session.total = 0;
  session.modified_at = new Date();
  await session.save();

  return { deletedCount: result.deletedCount || 0 };
}

function toCartItemResponse(item) {
  if (!item) return null;
  const doc = typeof item.toObject === 'function' ? item.toObject() : item;
  const product = doc.product_id || {};
  const sizeStocks = normalizeSizeStocksForResponse(product.sizeStocks?.toObject?.() || product.sizeStocks || {});

  return {
    id: doc._id,
    productId: product._id,
    name: product.name,
    price: product.price,
    quantity: doc.quantity,
    size: doc.size,
    availableStock: doc.size ? sizeStocks[doc.size] || 0 : product.stock,
    sizeStocks,
    image: toPublicUrl(product.img),
    sku: product.SKU,
  };
}

module.exports = {
  addToCart,
  getCart,
  updateCartItem,
  removeFromCart,
  clearCart,
  clearCartForUserId,
  replaceCart,
};
