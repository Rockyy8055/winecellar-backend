const { uploadProductImage, parseDataUrl, validateImageFile } = require('../services/imageUploadService');

// Test different image types
const testImages = {
  jpeg: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwA/8A8A',
  png: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  webp: 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBAAAAwAQCdASoBAAEAAQAcJaQAA3AA/v3AgAA==',
  gif: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  svg: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iNSIgY3k9IjUiIHI9IjUiIGZpbGw9InJlZCIvPjwvc3ZnPg==',
  bmp: 'data:image/bmp;base64,Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABABgAAAAAAAQAADEDgAAxA4AAAAAAAAAAAAA'
};

async function testAllImageTypes() {
  try {
    console.log('Testing all image types...\n');
    
    for (const [imageType, dataUrl] of Object.entries(testImages)) {
      console.log(`Testing ${imageType.toUpperCase()}...`);
      
      try {
        // Test parsing
        const parsed = parseDataUrl(dataUrl);
        console.log(`  ✅ Parsed: ${parsed.mimeType} (${parsed.buffer.length} bytes)`);
        
        // Test validation
        validateImageFile(parsed.buffer, parsed.mimeType);
        console.log(`  ✅ Validation passed`);
        
        // Test upload
        const productId = `test-${imageType}`;
        const result = await uploadProductImage(productId, dataUrl);
        console.log(`  ✅ Upload successful: ${result.url}`);
        console.log(`  📁 File: ${result.filename}`);
        
      } catch (error) {
        console.log(`  ❌ Failed: ${error.message}`);
      }
      
      console.log('');
    }
    
    console.log('🎉 All image types test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run test if this file is executed directly
if (require.main === module) {
  testAllImageTypes();
}

module.exports = { testAllImageTypes };
