const mongoose = require('mongoose');
require('dotenv').config();
require('./model/Product');
const Product = mongoose.model('Product');

async function debugAll() {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log('Connected to MongoDB');
        
        const products = await Product.find({}, 'name id productId quantity unit category');
        console.log(`Found ${products.length} products.`);
        
        for (const p of products) {
            console.log(`Product: "${p.name}" (ID: ${p.id}, PID: ${p.productId}) Qty: ${p.quantity}, Unit: "${p.unit}", Cat: ${p.category}`);
        }
        
        await mongoose.disconnect();
    } catch (err) {
        console.error('Debug failed:', err);
    }
}

debugAll();
