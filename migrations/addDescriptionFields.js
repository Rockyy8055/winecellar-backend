/**
 * Migration script to add description fields to existing products
 * This script ensures all products have both 'desc' and 'description' fields
 * with empty strings as default values if they don't exist.
 * 
 * Run this script once after deploying the schema changes:
 * node migrations/addDescriptionFields.js
 */

const mongoose = require('mongoose');
const Product = require('../models/product');
require('dotenv').config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/winecellar';

async function migrateDescriptions() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected successfully');

    // Find all products that are missing desc or description fields
    const products = await Product.find({
      $or: [
        { desc: { $exists: false } },
        { desc: null },
        { description: { $exists: false } },
        { description: null }
      ]
    });

    console.log(`Found ${products.length} products to update`);

    if (products.length === 0) {
      console.log('No products need updating. Migration complete.');
      await mongoose.connection.close();
      return;
    }

    let updated = 0;
    for (const product of products) {
      const updateFields = {};
      
      // Set desc to empty string if missing
      if (!product.desc) {
        updateFields.desc = '';
      }
      
      // Set description to empty string if missing, or sync from desc
      if (!product.description) {
        updateFields.description = product.desc || '';
      }

      if (Object.keys(updateFields).length > 0) {
        await Product.findByIdAndUpdate(
          product._id,
          { $set: updateFields },
          { runValidators: false }
        );
        updated++;
        
        if (updated % 100 === 0) {
          console.log(`Updated ${updated} products...`);
        }
      }
    }

    console.log(`\nMigration complete! Updated ${updated} products.`);
    console.log('All products now have desc and description fields with default empty strings.');

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

// Run the migration
migrateDescriptions();
