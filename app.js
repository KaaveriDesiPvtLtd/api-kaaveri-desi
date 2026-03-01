require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');



const port = 5000;
const app = express();

app.use(cors())
require('./model/user')
require('./model/Order')
require('./model/Review')
require('./model/Testimonial')
require('./model/Product')
require('./model/Settings')


// Middleware for request logging
app.use((req, res, next) => {
    console.log(`[DEBUG] ${req.method} ${req.path}`);
    next();
});

// ── CRM Routes (Priority - Bypass Security) ───────────────────────────────────
app.get('/api/crm/health', (req, res) => res.json({ 
    status: 'ok', 
    time: new Date(),
    message: 'CRM API is bypass-active'
}));
app.use('/api/crm/auth', require('./routes/crmAuthRoutes'));
app.use('/api/crm', require('./routes/crmRoutes'));

// ── Standard Content Parsing ──
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ── Legacy Security (Encryption) ──
app.use(require('./middleware/security'));

// ── Legacy Routes ─────────────────────────────────────────────────────────────
app.use('/otp', require('./routes/otpRoutes'));
app.use(require('./routes/auth'));
app.use(require('./routes/features'));
app.use(require('./routes/order'));
app.use(require('./routes/admin'));
app.use(require('./routes/reviews'));
app.use(require('./routes/testimonials'));
app.use(require('./routes/products'));

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: "Internal Server Error",
        message: "An unexpected internal server error occurred.",
        path: req.path
    });
});

if (require.main === module) {
    app.listen(port , () => {
        console.log(`Server is running on port ${port}`);
    })
}

module.exports = app;

const mongoose = require('mongoose');
const mongoURl = process.env.MONGO_URL;

mongoose.connect(mongoURl, {
    serverSelectionTimeoutMS: 5000 // 5 second timeout
}).then(async () => {
    console.log("Mongoose is connected");

    // Seed super admin user in admin DB
    try {
        const adminDb = mongoose.connection.useDb('crm_admin');
        if (!adminDb.models.AdminUser) {
            const adminUserSchema = require('./model/AdminUser');
            adminDb.model('AdminUser', adminUserSchema);
        }
        const AdminUser = adminDb.models.AdminUser;
        const superAdminExists = await AdminUser.findOne({ username: 'desisuperadmin' });
        if (!superAdminExists) {
            const superAdmin = new AdminUser({
                username: 'desisuperadmin',
                password: 'Desi@2026',
                name: 'Super Admin',
                role: 'superadmin',
                isActive: true
            });
            await superAdmin.save();
            console.log('Super admin user seeded successfully.');
        } else {
            console.log('Super admin user already exists.');
        }
    } catch (err) {
        console.error('Error seeding super admin:', err.message);
    }

    // Seed testimonials if needed
    const Testimonial = mongoose.model("Testimonial");
    const count = await Testimonial.countDocuments();
    if (count === 0) {
        console.log("Seeding testimonials...");
        const initialTestimonials = [
            {
                name: "Neelam Raghav",
                image: "/testimonial1.jpg",
                rating: 5,
                category: "A2 Cow Ghee",
                location: "Mumbai, Maharashtra",
                verified: true,
                text: "Nani's Bilona Ghee has earned a permanent spot in my pantry. Its purity and flavor are unmatched by any other brand I've tried. I love supporting a company that values tradition and quality."
            },
            {
                name: "Vishwajeet",
                image: "/testimonial2.jpg",
                rating: 5,
                category: "A2 Cow Ghee",
                location: "Delhi, NCR",
                verified: true,
                text: "I've been incorporating more Ayurvedic practices into my lifestyle, and Nani's Bilona Ghee fits perfectly into that philosophy. It's not just ghee; it's a holistic experience."
            },
            {
                name: "Ranju jha",
                image: "/testimonial3.jpg",
                rating: 5,
                category: "A2 Cow Ghee",
                location: "Bangalore, Karnataka",
                verified: true,
                text: "I've tried various brands claiming to offer authentic A2 cow ghee, but none match the richness and texture of Nani's Bilona Ghee. It's evident that they prioritize traditional methods and high-quality ingredients. My morning chai wouldn't be the same without it!"
            },
            {
                name: "Sourav",
                image: "/testimonial4.jpg",
                rating: 5,
                category: "Indian Buffalo Ghee",
                location: "Kolkata, West Bengal",
                verified: true,
                text: "Nani's Bilona Ghee has earned a permanent spot in my pantry. Its purity and flavor are unmatched by any other brand I've tried. I love supporting a company that values tradition and quality, and it's evident in every spoonful of this delicious ghee."
            },
            {
                name: "Naveen Sihag",
                image: "/testimonial5.jpg",
                rating: 5,
                category: "A2 Cow Ghee",
                location: "Jaipur, Rajasthan",
                verified: true,
                text: "Nani's Bilona Ghee has become a kitchen essential for me. Whether I'm sauteing vegetables or drizzling it over warm rotis, its rich flavor enhances every dish."
            }
        ];
        await Testimonial.insertMany(initialTestimonials);
        console.log("Testimonials seeded successfully!");
    }

    // Seed products if needed
    const Product = mongoose.model("Product");
    const productCount = await Product.countDocuments();
    if (productCount === 0) {
        console.log("Seeding products...");
        const initialProducts = [
          {
            id: 'milk',
            productId: 'KD-P001',
            name: 'Fresh Cow Milk',
            badge: 'Farm Fresh',
            description: 'Pure and creamy farm-fresh milk, packed with essential nutrients and calcium for your daily health.',
            image: '/Products/milk.jpg',
            image2: '/Products/milk.jpg',
            videoUrl: '/Vdos/milk.mp4',
            baseVariant: { label: '500 ml', quantity: 500, unit: 'ml', price: 499 },
            basePrice: '499',
            benefits: ['100% Pure', 'Rich in Calcium', 'Farm Fresh', 'No Preservatives'],
            color: 'from-blue-500 to-cyan-500',
            category: 'Dairy',
            quantity: 500,
            unit: 'ml',
            variants: [
              { label: '1 Liter', value: 1000, unit: 'ml', priceIncrement: 300 },
              { label: '2 Liter', value: 2000, unit: 'ml', priceIncrement: 500 }
            ]
          },
          {
            id: 'ghee',
            productId: 'KD-P002',
            name: 'Pure Desi Ghee',
            badge: 'Traditional Method',
            description: 'Handcrafted premium ghee clarified to perfection, delivering rich aroma and health benefits in every spoon.',
            image: '/Products/ghee.jpg',
            image2: '/Products/ghee.jpg',
            videoUrl: '/Vdos/ghee.mp4',
            baseVariant: { label: '500 ml', quantity: 500, unit: 'ml', price: 190 },
            basePrice: '190',
            benefits: ['Traditional Recipe', 'Rich Aroma', 'Health Benefits', 'Handcrafted'],
            color: 'from-amber-500 to-yellow-500',
            category: 'Dairy',
            quantity: 500,
            unit: 'ml',
            variants: [
              { label: '1 Liter', value: 1000, unit: 'ml', priceIncrement: 300 },
              { label: '2 Liter', value: 2000, unit: 'ml', priceIncrement: 500 }
            ]
          },
          {
            id: 'jag',
            productId: 'KD-P003',
            name: 'Organic Jaggery',
            badge: 'Natural Sweetener',
            description: 'Smooth and delicious unrefined sugar, perfect for a healthy lifestyle. Rich in iron and minerals.',
            image: '/Products/jagry.jpg',
            image2: '/Products/jagry.jpg',
            videoUrl: '/Vdos/jagrery.mp4',
            baseVariant: { label: '500 gm', quantity: 500, unit: 'gm', price: 699 },
            basePrice: '699',
            benefits: ['100% Organic', 'Rich in Iron', 'Natural', 'Unrefined'],
            color: 'from-orange-500 to-red-500',
            category: 'Groceries',
            quantity: 500,
            unit: 'gm',
            variants: [
              { label: '1 Kg', value: 1, unit: 'kg', priceIncrement: 300 },
              { label: '2 Kg', value: 2, unit: 'kg', priceIncrement: 500 }
            ]
          }
        ];
        await Product.insertMany(initialProducts);
        console.log("Products seeded successfully!");
    }

    // Auto-convert local paths to Base64
    const allProducts = await Product.find();
    const frontendPublicPath = path.join(__dirname, '..', 'KaaveriDesi_Frontend', 'public');

    for (const product of allProducts) {
        let updated = false;
        const updateData = {};

        const convertPath = (relPath) => {
            if (!relPath || relPath.startsWith('data:')) return null;
            const normalized = relPath.startsWith('/') ? relPath.substring(1) : relPath;
            const fullPath = path.join(frontendPublicPath, normalized.replace(/\//g, path.sep));
            if (fs.existsSync(fullPath)) {
                const content = fs.readFileSync(fullPath);
                const ext = path.extname(fullPath).toLowerCase();
                const mime = ext === '.mp4' ? 'video/mp4' : 'image/jpeg';
                return `data:${mime};base64,${content.toString('base64')}`;
            }
            return null;
        };

        const imgBase64 = convertPath(product.image);
        if (imgBase64) {
            updateData.image = imgBase64;
            updateData.image2 = imgBase64;
            updated = true;
        }

        const vidBase64 = convertPath(product.videoUrl);
        if (vidBase64) {
            updateData.videoUrl = vidBase64;
            updated = true;
        }

        if (updated) {
            await Product.findByIdAndUpdate(product._id, updateData);
            console.log(`Auto-converted media for ${product.id}`);
        }
    }
}).catch(err => {
    console.error("Mongoose connection error:", err.message);
});

mongoose.connection.on("error" , (err) => {
    console.log("Mongoose runtime error:", err);
});



