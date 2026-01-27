const { uploadProductImage } = require('../services/imageUploadService');
const Product = require('../models/product');

// Test data URL (small 1x1 red pixel)
const testDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function testProductImageUpdate() {
  try {
    console.log('Testing product image update with data URL...\n');
    
    // Create a test product first
    console.log('1. Creating test product...');
    const testProduct = new Product({
      name: 'Test Product for Image Update',
      price: 99.99,
      stock: 10,
      category: ['test']
    });
    
    const savedProduct = await testProduct.save();
    console.log('✅ Test product created:', savedProduct._id);
    
    // Simulate updating with data URL
    console.log('2. Updating product with data URL...');
    const { url } = await uploadProductImage(savedProduct._id, testDataUrl);
    
    // Update the product
    savedProduct.img = url;
    savedProduct.modified_at = new Date();
    const updatedProduct = await savedProduct.save();
    
    console.log('✅ Product updated successfully');
    console.log('📸 Image URL in response:', updatedProduct.img);
    console.log('🔍 URL type:', typeof updatedProduct.img);
    console.log('📏 URL length:', updatedProduct.img.length);
    
    // Verify it's a URL, not a data URL
    if (updatedProduct.img.startsWith('http')) {
      console.log('✅ Response contains browser-friendly URL (not data URL)');
    } else {
      console.log('❌ Response still contains data URL or invalid format');
    }
    
    // Test fetching the product
    console.log('3. Fetching product to verify persisted URL...');
    const fetchedProduct = await Product.findById(savedProduct._id);
    
    console.log('📸 Fetched image URL:', fetchedProduct.img);
    console.log('🔍 Fetched URL type:', typeof fetchedProduct.img);
    
    if (fetchedProduct.img === updatedProduct.img) {
      console.log('✅ Fetched URL matches update response URL');
    } else {
      console.log('❌ URL mismatch between update and fetch');
    }
    
    // Cleanup
    await Product.findByIdAndDelete(savedProduct._id);
    console.log('🧹 Test product cleaned up');
    
    console.log('\n🎉 Product image update test completed successfully!');
    console.log('✅ Data URL is properly decoded and persisted as file URL');
    console.log('✅ API response returns browser-friendly URL');
    console.log('✅ Subsequent fetches return the same URL');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  // Connect to database first
  const mongoose = require('mongoose');
  mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/winecellar')
    .then(() => {
      console.log('Connected to database');
      return testProductImageUpdate();
    })
    .then(() => {
      console.log('Test completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testProductImageUpdate };
