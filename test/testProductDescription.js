/**
 * Test script for product description functionality
 * 
 * This script tests:
 * 1. Creating products with description
 * 2. Updating product descriptions
 * 3. Retrieving products with descriptions
 * 4. Field synchronization between desc and description
 * 
 * Prerequisites:
 * - Server must be running
 * - Valid admin JWT token required
 * - MongoDB connection active
 * 
 * Usage:
 * 1. Set ADMIN_TOKEN environment variable or update the token variable below
 * 2. Run: node test/testProductDescription.js
 */

const axios = require('axios');

// Configuration
const BASE_URL = process.env.API_URL || 'http://localhost:5001';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'YOUR_ADMIN_TOKEN_HERE';

// Test data
const testProduct = {
  name: 'Test Wine - Description Test',
  price: 99.99,
  description: 'This is a test wine with a detailed description for testing purposes',
  category: ['Red Wine'],
  stock: 100,
  SKU: 'TEST-DESC-001'
};

// Helper function to make authenticated requests
const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ADMIN_TOKEN}`
  }
});

// Test results tracker
const results = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, message) {
  const status = passed ? '✓ PASS' : '✗ FAIL';
  console.log(`${status}: ${name}`);
  if (message) console.log(`  ${message}`);
  
  results.tests.push({ name, passed, message });
  if (passed) results.passed++;
  else results.failed++;
}

async function runTests() {
  console.log('\n=== Product Description Functionality Tests ===\n');
  let createdProductId = null;

  try {
    // Test 1: Create product with description field
    console.log('Test 1: Creating product with description field...');
    try {
      const response = await apiClient.post('/api/product/add', testProduct);
      createdProductId = response.data._id;
      
      const hasDescription = response.data.description !== undefined;
      const hasDesc = response.data.desc !== undefined;
      const descriptionMatches = response.data.description === testProduct.description;
      const descSynced = response.data.desc === testProduct.description;
      
      logTest(
        'Create product with description',
        hasDescription && hasDesc && descriptionMatches && descSynced,
        `Product created with ID: ${createdProductId}, desc and description synced: ${descSynced}`
      );
    } catch (error) {
      logTest('Create product with description', false, error.message);
    }

    // Test 2: Create product with only desc field
    console.log('\nTest 2: Creating product with only desc field...');
    try {
      const productWithDesc = {
        ...testProduct,
        name: 'Test Wine - Desc Only',
        SKU: 'TEST-DESC-002',
        desc: 'Description provided via desc field',
        description: undefined
      };
      delete productWithDesc.description;
      
      const response = await apiClient.post('/api/product/add', productWithDesc);
      const descriptionSynced = response.data.description === productWithDesc.desc;
      
      logTest(
        'Create product with desc field only',
        descriptionSynced,
        `description field synced from desc: ${descriptionSynced}`
      );
      
      // Clean up
      await apiClient.delete(`/api/admin/products/${response.data._id}`);
    } catch (error) {
      logTest('Create product with desc field only', false, error.message);
    }

    // Test 3: Update product description
    if (createdProductId) {
      console.log('\nTest 3: Updating product description...');
      try {
        const updatedDescription = 'Updated description with new information';
        const response = await apiClient.patch(
          `/api/admin/products/${createdProductId}`,
          { description: updatedDescription }
        );
        
        const descriptionUpdated = response.data.description === updatedDescription;
        const descSynced = response.data.desc === updatedDescription;
        
        logTest(
          'Update product description',
          descriptionUpdated && descSynced,
          `Description updated and desc synced: ${descSynced}`
        );
      } catch (error) {
        logTest('Update product description', false, error.message);
      }
    }

    // Test 4: Get all products (public endpoint)
    console.log('\nTest 4: Retrieving products from public endpoint...');
    try {
      const response = await axios.get(`${BASE_URL}/api/product/get`);
      const products = response.data;
      
      if (createdProductId) {
        const testProduct = products.find(p => p.ProductId === createdProductId);
        const hasDescription = testProduct && testProduct.description !== undefined;
        const hasDesc = testProduct && testProduct.desc !== undefined;
        
        logTest(
          'Public endpoint returns descriptions',
          hasDescription && hasDesc,
          `Product has both desc and description fields`
        );
      } else {
        logTest('Public endpoint returns descriptions', false, 'Test product not found');
      }
    } catch (error) {
      logTest('Public endpoint returns descriptions', false, error.message);
    }

    // Test 5: Get admin product list
    console.log('\nTest 5: Retrieving products from admin endpoint...');
    try {
      const response = await apiClient.get('/api/admin/products?limit=10');
      const hasItems = response.data.items && response.data.items.length > 0;
      
      if (hasItems && createdProductId) {
        const testProduct = response.data.items.find(p => p._id === createdProductId);
        const hasDescription = testProduct && testProduct.description !== undefined;
        
        logTest(
          'Admin endpoint returns descriptions',
          hasDescription,
          `Product list includes description field`
        );
      } else {
        logTest('Admin endpoint returns descriptions', hasItems, 'Product list retrieved');
      }
    } catch (error) {
      logTest('Admin endpoint returns descriptions', false, error.message);
    }

    // Test 6: Update with desc field (test reverse sync)
    if (createdProductId) {
      console.log('\nTest 6: Updating with desc field (reverse sync)...');
      try {
        const updatedDesc = 'Updated via desc field';
        const response = await apiClient.patch(
          `/api/admin/products/${createdProductId}`,
          { desc: updatedDesc }
        );
        
        const descUpdated = response.data.desc === updatedDesc;
        const descriptionSynced = response.data.description === updatedDesc;
        
        logTest(
          'Update with desc field syncs to description',
          descUpdated && descriptionSynced,
          `desc updated and description synced: ${descriptionSynced}`
        );
      } catch (error) {
        logTest('Update with desc field syncs to description', false, error.message);
      }
    }

    // Test 7: Empty description handling
    if (createdProductId) {
      console.log('\nTest 7: Testing empty description handling...');
      try {
        const response = await apiClient.patch(
          `/api/admin/products/${createdProductId}`,
          { description: '' }
        );
        
        const descriptionEmpty = response.data.description === '';
        const descEmpty = response.data.desc === '';
        
        logTest(
          'Empty description handling',
          descriptionEmpty && descEmpty,
          `Empty strings handled correctly`
        );
      } catch (error) {
        logTest('Empty description handling', false, error.message);
      }
    }

    // Cleanup: Delete test product
    if (createdProductId) {
      console.log('\nCleaning up test product...');
      try {
        await apiClient.delete(`/api/admin/products/${createdProductId}`);
        console.log('Test product deleted successfully');
      } catch (error) {
        console.log('Failed to delete test product:', error.message);
      }
    }

  } catch (error) {
    console.error('Test suite error:', error.message);
  }

  // Print summary
  console.log('\n=== Test Summary ===');
  console.log(`Total Tests: ${results.tests.length}`);
  console.log(`Passed: ${results.passed}`);
  console.log(`Failed: ${results.failed}`);
  console.log(`Success Rate: ${((results.passed / results.tests.length) * 100).toFixed(1)}%`);
  
  if (results.failed > 0) {
    console.log('\nFailed Tests:');
    results.tests.filter(t => !t.passed).forEach(t => {
      console.log(`  - ${t.name}: ${t.message}`);
    });
  }
  
  console.log('\n');
  process.exit(results.failed > 0 ? 1 : 0);
}

// Run tests
if (ADMIN_TOKEN === 'YOUR_ADMIN_TOKEN_HERE') {
  console.error('Error: Please set ADMIN_TOKEN environment variable or update the token in the script');
  console.error('Usage: ADMIN_TOKEN=your_token node test/testProductDescription.js');
  process.exit(1);
}

runTests();
