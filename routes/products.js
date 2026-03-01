const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const connectDB = require('../lib/db');

const getProductModel = async () => {
    await connectDB();
    return mongoose.model("Product");
};

// Get all products
router.get('/allproducts', async (req, res) => {
  try {
    const Product = await getProductModel();
    const products = await Product.find({ isDeleted: { $ne: true } }).sort({ createdAt: -1 });
    
    // JIT Migration: Assign productId, quantity, and unit if missing
    for (const p of products) {
      let updated = false;
      if (!p.productId) {
        const idMapping = { 'milk': 'KD-P001', 'ghee': 'KD-P002', 'jag': 'KD-P003' };
        p.productId = idMapping[p.id] || `KD-P${Math.floor(100 + Math.random() * 900)}`;
        updated = true;
      }
      
      // Fix quantity and unit if they are default/empty
      if (!p.unit || p.unit === "" || p.quantity === undefined || p.quantity === 0) {
        const isKgProduct = p.id === 'jag' || (p.productId && p.productId === 'KD-P003') || 
                            (p.category && p.category.toLowerCase().includes('grocery')) ||
                            (p.name && p.name.toLowerCase().includes('jaggery'));
        
        if (!p.unit || p.unit === "") {
          p.unit = isKgProduct ? 'kg' : 'ml';
        }
        if (p.quantity === undefined || p.quantity === 0) {
          p.quantity = isKgProduct ? 1 : 500;
        }
        updated = true;
      }
      
      if (updated) {
        await p.save();
        console.log(`JIT Migrated product: ${p.name} -> ${p.quantity} ${p.unit}`);
      }
    }

    console.log('Returning products:', products.map(p => ({ name: p.name, qty: p.quantity, unit: p.unit })));

    res.status(200).json({
      success: true,
      products
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Add a product (for seeding/admin)
router.post('/addproduct', async (req, res) => {
  try {
    const Product = await getProductModel();
    const productData = req.body;
    
    // Check if product with same id already exists
    const existingProduct = await Product.findOne({ id: productData.id });
    if (existingProduct) {
        return res.status(400).json({
            success: false,
            message: `Product with id ${productData.id} already exists`
        });
    }

    const newProduct = new Product(productData);
    await newProduct.save();

    res.status(201).json({
      success: true,
      message: 'Product added successfully',
      product: newProduct
    });
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Get product by ID or productId
router.get('/product/:productId', async (req, res) => {
  try {
    const Product = await getProductModel();
    const { productId } = req.params;
    // Search by both website id and CRM productId
    let product = await Product.findOne({ 
      $and: [
        { $or: [{ productId: productId }, { id: productId }] },
        { isDeleted: { $ne: true } }
      ]
    });
    
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found'
      });
    }

    // JIT Migration for single product
    let updated = false;
    if (!product.productId) {
      const idMapping = { 'milk': 'KD-P001', 'ghee': 'KD-P002', 'jag': 'KD-P003' };
      product.productId = idMapping[product.id] || `KD-P${Math.floor(100 + Math.random() * 900)}`;
      updated = true;
    }
    if (!product.unit || product.unit === "" || product.quantity === undefined || product.quantity === 0) {
      const isKgProduct = product.id === 'jag' || (product.productId && product.productId === 'KD-P003') || 
                          (product.category && product.category.toLowerCase().includes('grocery')) ||
                          (product.name && product.name.toLowerCase().includes('jaggery'));
      if (!product.unit || product.unit === "") product.unit = isKgProduct ? 'kg' : 'ml';
      if (product.quantity === undefined || product.quantity === 0) product.quantity = isKgProduct ? 1 : 500;
      updated = true;
    }
    if (updated) await product.save();

    res.status(200).json({
      success: true,
      product
    });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;
