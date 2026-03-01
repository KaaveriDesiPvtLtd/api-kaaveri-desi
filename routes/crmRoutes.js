const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');
const orderController = require('../controllers/orderController');
const stockController = require('../controllers/stockController');
const { authenticateCRM, authorize } = require('../middleware/crmAuth');

const dashboardController = require('../controllers/dashboardController');

const connectDB = require('../lib/db');

// All CRM routes require authentication
router.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

router.use(authenticateCRM);

// Dashboard
router.get('/dashboard/kpis',             authorize('dashboard', 'read'), dashboardController.getKpis);
router.get('/dashboard/sales-by-channel', authorize('dashboard', 'read'), dashboardController.getSalesByChannel);
router.get('/dashboard/low-stock',        authorize('dashboard', 'read'), dashboardController.getLowStock);
// Legacy (keep for backward compat)
router.get('/dashboard/stats', authorize('dashboard', 'read'), orderController.getDashboardStats);

// Inventory
router.get('/products', authorize('inventory', 'read'), inventoryController.getProducts);
router.post('/products', authorize('inventory', 'write'), inventoryController.addProduct);
router.put('/products/:id', authorize('inventory', 'write'), inventoryController.updateProduct);
router.delete('/products/:id', authorize('inventory', 'write'), inventoryController.deleteProduct);

// Stock Management
router.post('/stock/receive',          authorize('inventory', 'stock'), stockController.receiveStock);
router.post('/stock/sell',             authorize('inventory', 'write'), stockController.sellStock);
router.get('/stock/batches/:productId', authorize('inventory', 'read'),  stockController.getBatchWiseStock);

// Orders
router.get('/orders', authorize('orders', 'read'), orderController.getOrders);
router.post('/orders', authorize('orders', 'write'), orderController.createOrder);
router.patch('/orders/:id/status', authorize('orders', 'write'), orderController.updateOrderStatus);

module.exports = router;
