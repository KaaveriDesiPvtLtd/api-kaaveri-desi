const mongoose = require('mongoose');
require('dotenv').config();
require('./model/Product');
const Product = mongoose.model('Product');

async function forceMigrate() {
    try {
        await mongoose.connect(process.env.MONGO_URL);
        console.log('Connected to MongoDB');
        
        const products = await Product.find({});
        console.log(`Found ${products.length} products total.`);
        
        for (const p of products) {
            console.log(`Checking: ${p.name}...`);
            let updated = false;
            
            // Force values for quantity and unit if they are missing or empty
            if (p.quantity === undefined || p.quantity === null || p.quantity === 0) {
                p.quantity = (p.id === 'jag' || p.productId === 'KD-P003') ? 1 : 500;
                updated = true;
            }
            
            if (!p.unit || p.unit.trim() === '') {
                p.unit = (p.id === 'jag' || p.productId === 'KD-P003') ? 'kg' : 'ml';
                updated = true;
            }
            
            if (updated) {
                await Product.updateOne({ _id: p._id }, { 
                    $set: { 
                        quantity: p.quantity, 
                        unit: p.unit 
                    } 
                });
                console.log(`  Updated ${p.name} to ${p.quantity} ${p.unit}`);
            } else {
                console.log(`  ${p.name} already has ${p.quantity} ${p.unit}`);
            }
        }
        
        console.log('Migration complete.');
        await mongoose.disconnect();
    } catch (err) {
        console.error('Migration failed:', err);
    }
}

forceMigrate();
