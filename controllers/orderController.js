const CrmOrder = require('../model/CrmOrder');
const CrmProduct = require('../model/CrmProduct');
const StockTransaction = require('../model/StockTransaction');
const Settings = require('../model/Settings');

exports.createOrder = async (req, res) => {
  try {
    const { items, channel, customer, shippingCost } = req.body;
    
    // 1. Validate stock and calculate totals
    let revenue = 0;
    let totalCost = 0;
    const orderItems = [];
    
    for (const item of items) {
      const product = await CrmProduct.findById(item.productId);
      if (!product || product.isDeleted || !product.isActive) {
        throw new Error(`Product ${item.sku || item.productId} not available`);
      }
      if (product.currentStock < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }
      
      revenue += product.sellingPrice * item.quantity;
      totalCost += product.costPrice * item.quantity;
      
      orderItems.push({
        productId: product._id,
        sku: product.sku,
        name: product.name,
        quantity: item.quantity,
        price: product.sellingPrice,
        cost: product.costPrice
      });
      
      // Stock Sync: Deduct stock
      product.currentStock -= item.quantity;
      await product.save();
      
      // Log OUT transaction
      await StockTransaction.create({
        transactionType: 'OUT',
        productId: product._id,
        sku: product.sku,
        quantity: item.quantity,
        reason: `Order Sale - ${channel}`
      });
    }
    
    // 2. Calculate profit based on channel commission
    const settings = await Settings.findOne() || { channels: [] };
    const channelSettings = settings.channels.find(c => c.name === channel);
    const commissionRate = channelSettings ? channelSettings.commissionRate : 0;
    const platformCommission = revenue * (commissionRate / 100);
    
    const netProfit = revenue - totalCost - platformCommission - (shippingCost || 0);
    
    const order = new CrmOrder({
      orderId: `ORD-${Date.now()}`,
      items: orderItems,
      channel,
      revenue,
      platformCommission,
      shippingCost,
      netProfit,
      customer,
      status: 'Pending'
    });
    
    await order.save();
    res.status(201).json(order);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const { channel, status, startDate, endDate } = req.query;
    const query = {};
    if (channel) query.channel = channel;
    if (status) query.status = status;
    if (startDate && endDate) {
      query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    
    const orders = await CrmOrder.find(query).sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const stats = {
      totalProducts: await CrmProduct.countDocuments({ isDeleted: false }),
      activeProducts: await CrmProduct.countDocuments({ isActive: true, isDeleted: false }),
      stockUnits: (await CrmProduct.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: null, total: { $sum: "$currentStock" } } }]))[0]?.total || 0,
      ordersToday: await CrmOrder.countDocuments({ createdAt: { $gte: today } }),
      revenueToday: (await CrmOrder.aggregate([{ $match: { createdAt: { $gte: today } } }, { $group: { _id: null, total: { $sum: "$revenue" } } }]))[0]?.total || 0,
      lowStockCount: await CrmProduct.countDocuments({ currentStock: { $lte: 10 }, isDeleted: false }),
      profitToday: (await CrmOrder.aggregate([{ $match: { createdAt: { $gte: today } } }, { $group: { _id: null, total: { $sum: "$netProfit" } } }]))[0]?.total || 0
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
