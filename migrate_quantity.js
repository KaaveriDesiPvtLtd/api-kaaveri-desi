const mongoose = require('mongoose');
require('dotenv').config();
require('./model/Product');
const Product = mongoose.model('Product');

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log('Connected to MongoDB');
        
        const products = await Product.find({});
        console.log(`Found ${products.length} products`);
        
        for (const p of products) {
            let updated = false;
            
            if (!p.unit || p.unit === '') {
                p.unit = (p.id === 'jag' || p.productId === 'KD-P003') ? 'kg' : 'ml';
                updated = true;
            }
            
            if (!p.quantity || p.quantity === 0) {
                p.quantity = (p.id === 'jag' || p.productId === 'KD-P003') ? 1 : 500;
                updated = true;
            }
            
            if (updated) {
                await p.save();
                console.log(`Updated product: ${p.name} (${p.productId || p.id}) -> ${p.quantity} ${p.unit}`);
            }
        }
        
        console.log('Migration complete');
        await mongoose.disconnect();
    } catch (err) {
        console.error('Migration failed:', err);
    }
}

migrate();
