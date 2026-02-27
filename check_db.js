const mongoose = require('mongoose');
require('dotenv').config();
const Product = require('./model/Product');

async function checkProducts() {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log('Connected to MongoDB');
        const products = await Product.find({}, 'name id productId quantity unit');
        console.log('PRODUCTS_DATA_START');
        console.log(JSON.stringify(products, null, 2));
        console.log('PRODUCTS_DATA_END');
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
}

checkProducts();
