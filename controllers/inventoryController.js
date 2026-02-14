const CrmProduct = require('../model/CrmProduct');
const Product = require('../model/Product');
const StockTransaction = require('../model/StockTransaction');

const generateSKU = (category, subType, size) => {
  const cat = category.substring(0, 3).toUpperCase();
  const sub = subType ? subType.substring(0, 3).toUpperCase() : 'GEN';
  return `${cat}-${sub}-${size}`;
};

exports.getProducts = async (req, res) => {
  try {
    // Fetch from existing products collection
    const products = await Product.find({});
    res.json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.addProduct = async (req, res) => {
  try {
    const { name, category, subType, size, unit, costPrice, sellingPrice, currentStock, lowStockThreshold } = req.body;
    
    const sku = generateSKU(category, subType, size);
    
    const product = new CrmProduct({
      sku, name, category, subType, size, unit, costPrice, sellingPrice, currentStock, lowStockThreshold
    });
    
    await product.save();
    
    // Log initial stock movement if it's > 0
    if (currentStock > 0) {
      await StockTransaction.create({
        transactionType: 'IN',
        productId: product._id,
        sku: product.sku,
        quantity: currentStock,
        reason: 'Initial stock'
      });
    }
    
    res.status(201).json(product);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await CrmProduct.findByIdAndUpdate(id, req.body, { new: true });
    res.json(product);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await CrmProduct.findById(id);
    
    if (!product) return res.status(404).json({ error: 'Product not found' });
    
    // Safety check: Block if currentStock > 0
    if (product.currentStock > 0) {
      return res.status(400).json({ error: 'Cannot delete product with remaining stock' });
    }
    
    // Check for order history (simulated by checking StockTransactions for 'OUT')
    const hasOrders = await StockTransaction.exists({ productId: id, transactionType: 'OUT' });
    
    if (hasOrders) {
      product.isActive = false;
      product.isDeleted = true; // Soft delete
      await product.save();
      res.json({ message: 'Product soft deleted due to existing order history', product });
    } else {
      await CrmProduct.findByIdAndDelete(id); // Hard delete
      res.json({ message: 'Product permanently removed' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
