const Product = require('../models/product');
const mongoose = require('mongoose');

// Standard sizes for initialization
const STANDARD_SIZES = ['1.5LTR', '1LTR', '75CL', '70CL', '35CL', '20CL', '10CL', '5CL'];

async function migrateExistingProducts() {
  try {
    console.log('Starting migration for existing products...');
    
    // Connect to database
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/winecellar');
    
    // Find all products without sizeStocks
    const products = await Product.find({
      sizeStocks: { $exists: false }
    });
    
    console.log(`Found ${products.length} products to migrate`);
    
    let updated = 0;
    for (const product of products) {
      // Initialize sizeStocks with current total stock distributed across sizes
      // For existing products, we'll put all stock in the first size as a default
      const sizeStocks = {};
      STANDARD_SIZES.forEach((size, index) => {
        sizeStocks[size] = index === 0 ? product.stock || 0 : 0;
      });
      
      product.sizeStocks = sizeStocks;
      await product.save();
      
      updated++;
      console.log(`Migrated product: ${product.name} (${product._id})`);
    }
    
    console.log(`Migration completed. Updated ${updated} products.`);
    
    // Close connection
    await mongoose.disconnect();
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateExistingProducts();
}

module.exports = { migrateExistingProducts };
