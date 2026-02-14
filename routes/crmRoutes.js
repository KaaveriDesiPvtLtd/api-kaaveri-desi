const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const orderController = require('../controllers/orderController');

// Dashboard
router.get('/dashboard/stats', orderController.getDashboardStats);

// Inventory
router.get('/products', inventoryController.getProducts);
router.post('/products', inventoryController.addProduct);
router.put('/products/:id', inventoryController.updateProduct);
router.delete('/products/:id', inventoryController.deleteProduct);

// Orders
router.get('/orders', orderController.getOrders);
router.post('/orders', orderController.createOrder);

module.exports = router;
