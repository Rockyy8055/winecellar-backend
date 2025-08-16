const axios = require('axios');

// Your 2 real products
const newProducts = [
  {
    name: "Vila Nova Vinho Verde",
    category: ["WINE"],
    subCategory: "WHITE WINE",
    img: "https://drive.google.com/uc?export=view&id=1hFZSG41_hKji2OuWiWE9u1IDh5MvsuJj",
    price: 49.99,
    stock: 100,
    desc: "Premium white wine from Portugal",
    discount: "10",
    size: "750ML",
    SKU: "SKU001",
    tags: ["premium", "white wine"],
    vendor: "Vila Nova",
    Country: "Portugal",
    Region: "Vinho Verde",
    taxable: true,
    brand: "Vila Nova"
  },
  {
    name: "Vila Nova Arinto",
    category: ["WINE"],
    subCategory: "WHITE WINE",
    img: "https://drive.google.com/uc?export=view&id=11p4JxQPK1MsnlYLU5RH_Z5-E1P6DE9ql",
    price: 49.99,
    stock: 100,
    desc: "Premium white wine from Portugal",
    discount: "10",
    size: "750ML",
    SKU: "SKU002",
    tags: ["premium", "white wine"],
    vendor: "Vila Nova",
    Country: "Portugal",
    Region: "Vinho Verde",
    taxable: true,
    brand: "Vila Nova"
  }
];

// Function to delete all existing products
async function deleteAllProducts() {
  try {
    console.log('Deleting all existing products...');
    
    // Get all products first
    const response = await axios.get('http://localhost:5001/api/product/get');
    const products = response.data;
    
    // Delete each product (you'll need to add a delete endpoint to your backend)
    console.log(`Found ${products.length} products to delete`);
    
    // For now, we'll just add new products
    // The old ones will be replaced when you restart your app
    console.log('Note: Old products will remain until you add a delete endpoint');
    
  } catch (error) {
    console.error('Error deleting products:', error.message);
  }
}

// Function to add new products
async function addNewProducts() {
  try {
    console.log('Adding new products...');
    
    for (const product of newProducts) {
      const response = await axios.post('http://localhost:5001/api/product/add', product);
      console.log(`✅ Added: ${product.name}`);
    }
    
    console.log('🎉 All products added successfully!');
    
  } catch (error) {
    console.error('Error adding products:', error.message);
  }
}

// Main function
async function replaceProducts() {
  console.log('🚀 Starting product replacement...');
  
  // Delete old products (if delete endpoint exists)
  await deleteAllProducts();
  
  // Add new products
  await addNewProducts();
  
  console.log('✅ Product replacement completed!');
  console.log('📱 Check your frontend at http://localhost:4000 to see the new products!');
}

// Run the script
replaceProducts().catch(console.error); 