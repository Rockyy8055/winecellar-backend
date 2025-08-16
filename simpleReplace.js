const axios = require('axios');

// Your 2 new products
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

async function replaceAllProducts() {
  try {
    console.log('🚀 Starting simple product replacement...');
    
    // Step 1: Delete all existing products
    console.log('🗑️  Deleting all existing products...');
    const deleteResponse = await axios.delete('http://localhost:5001/api/product/delete-all');
    console.log(`✅ Deleted ${deleteResponse.data.deletedCount} products`);
    
    // Step 2: Add new products
    console.log('➕ Adding new products...');
    for (const product of newProducts) {
      const addResponse = await axios.post('http://localhost:5001/api/product/add', product);
      console.log(`✅ Added: ${product.name}`);
    }
    
    console.log('🎉 All done! Your new products are now in the database!');
    console.log('📱 Check your frontend at http://localhost:4000 to see them!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

// Run the script
replaceAllProducts(); 