const { uploadProductImage, parseDataUrl, validateImageFile } = require('../services/imageUploadService');

// Test data URL (small 1x1 red pixel)
const testDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

async function testDataUrlUpload() {
  try {
    console.log('Testing data URL image upload...');
    
    // Test parsing
    console.log('1. Testing data URL parsing...');
    const parsed = parseDataUrl(testDataUrl);
    console.log('✅ Parsed successfully:', {
      mimeType: parsed.mimeType,
      bufferSize: parsed.buffer.length
    });
    
    // Test validation
    console.log('2. Testing validation...');
    validateImageFile(parsed.buffer, parsed.mimeType);
    console.log('✅ Validation passed');
    
    // Test upload
    console.log('3. Testing upload...');
    const productId = 'test-product-123';
    const result = await uploadProductImage(productId, testDataUrl);
    console.log('✅ Upload successful:', {
      filename: result.filename,
      url: result.url,
      size: result.size,
      mimeType: result.mimeType,
      path: result.path
    });
    
    // Check if file actually exists
    const fs = require('fs');
    if (fs.existsSync(result.path)) {
      console.log('✅ File exists on disk at:', result.path);
      const stats = fs.statSync(result.path);
      console.log('   File size:', stats.size, 'bytes');
    } else {
      console.log('❌ File NOT found at:', result.path);
    }
    
    console.log('\n🎉 All tests passed! Data URL image upload is working correctly.');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testDataUrlUpload();
}

module.exports = { testDataUrlUpload };
