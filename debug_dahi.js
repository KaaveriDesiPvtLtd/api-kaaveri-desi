const mongoose = require('mongoose');
require('dotenv').config();
require('./model/Product');
const Product = mongoose.model('Product');

async function debugDahi() {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log('Connected to MongoDB');
        
        const products = await Product.find({ name: /Dahi/i });
        console.log(`Found ${products.length} products with 'Dahi' in name.`);
        
        for (const p of products) {
            console.log('--- PRODUCT DATA ---');
            console.log(JSON.stringify(p.toObject(), null, 2));
            console.log('-------------------');
        }
        
        await mongoose.disconnect();
    } catch (err) {
        console.error('Debug failed:', err);
    }
}

debugDahi();
