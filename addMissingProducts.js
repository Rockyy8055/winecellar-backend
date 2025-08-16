const axios = require('axios');

// Add the missing products with categories and prices
const products = [
  {
    name: 'Contesa Pecorino Abruzzo',
    category: ['WINE'],
    subCategory: 'WHITE WINE',
    img: '',
    price: 15.99,
    stock: 100,
    desc: 'Contesa Pecorino Abruzzo'
  },
  {
    name: "Chateau d'Esclans Whispering Angel Rose",
    category: ['WINE'],
    subCategory: 'ROSE WINE',
    img: '',
    price: 24.99,
    stock: 100,
    desc: "Chateau d'Esclans Whispering Angel Rose"
  },
  {
    name: 'Grey Goose',
    category: ['VODKA'],
    subCategory: '',
    img: '',
    price: 36.99,
    stock: 100,
    desc: 'Grey Goose Vodka'
  },
  {
    name: 'Ciroc Pineapple',
    category: ['VODKA'],
    subCategory: '',
    img: '',
    price: 36.99,
    stock: 100,
    desc: 'Ciroc Pineapple Vodka'
  },
  {
    name: 'Absolut Vodka',
    category: ['VODKA'],
    subCategory: '',
    img: '',
    price: 21.99,
    stock: 100,
    desc: 'Absolut Vodka'
  },
  {
    name: 'Altos Silver',
    category: ['TEQUILA'],
    subCategory: '',
    img: '',
    price: 41.99,
    stock: 100,
    desc: 'Altos Silver Tequila'
  }
];

async function run() {
  try {
    for (const p of products) {
      await axios.post('http://localhost:5001/api/product/add', p);
      console.log(`Added: ${p.name}`);
    }
    console.log('All missing products added.');
  } catch (e) {
    console.error('Error adding products:', e.response?.data || e.message);
  }
}

run();