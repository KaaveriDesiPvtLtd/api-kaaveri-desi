const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Product = mongoose.model("Product");

// Get all products
router.get('/allproducts', async (req, res) => {
  try {
    const products = await Product.find().sort({ createdAt: -1 });
    
    // JIT Migration: Assign productId if missing
    for (const p of products) {
      if (!p.productId) {
        const idMapping = { 'milk': 'KD-P001', 'ghee': 'KD-P002', 'jag': 'KD-P003' };
        p.productId = idMapping[p.id] || `KD-P${Math.floor(100 + Math.random() * 900)}`;
        await p.save();
      }
    }

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

module.exports = router;
