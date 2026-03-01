const ORDER = require('../model/Order');
const Product = require('../model/Product');
const Settings = require('../model/Settings');
const { sellStock } = require('../services/stockService');
const { convertToBaseUnit } = require('../utils/unitConversion');

// Helper to normalize orders for the CRM UI
const normalizeOrder = (order) => {
  const o = order.toObject ? order.toObject() : order;
  const rawStatus = o.orderStatus || o.status || 'Pending';
  const status = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1).toLowerCase();
  
  return {
    ...o,
    status,
    revenue: o.revenue || o.totalAmount || 0,
    items: o.items || (o.orderItems || []).map(item => ({
      productId: item.productId,
      name: item.title,
      quantity: item.quantity,
      price: item.price,
      sku: item.productId // Fallback
    })),
    customer: o.customer || {
      name: o.shippingAddress?.fullName || 'Unknown',
      phone: o.shippingAddress?.phone || 'N/A',
      email: 'N/A', // Website orders might not store email in shippingAddress
      address: `${o.shippingAddress?.addressLine1}, ${o.shippingAddress?.city}`
    }
  };
};

exports.createOrder = async (req, res) => {
  try {
    const { items, channel, customer, shippingCost } = req.body;
    
    let revenue = 0;
    let totalCost = 0;
    const itemsForOrder = [];
    
    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || product.isDeleted || !product.isActive) {
        throw new Error(`Product ${item.sku || item.productId} not available`);
      }
      // Extract correct variant/base unit size from item.quantityType
      const baseUnit = product.baseVariant?.unit || product.unit || '';
      const qType = item.quantityType ? Number(item.quantityType) : 1; 
      let variantUnit = baseUnit;
      
      if (product.baseVariant && Number(product.baseVariant.quantity) === qType) {
        variantUnit = product.baseVariant.unit || baseUnit;
      } else if (product.variants && product.variants.length > 0) {
        const matched = product.variants.find(v => Number(v.value) === qType);
        if (matched) variantUnit = matched.unit || baseUnit;
      }
      
      // Calculate true deduction: (size in base unit) * quantity
      const convertedAmount = convertToBaseUnit(qType || 0, variantUnit, baseUnit);
      const decrementAmount = (convertedAmount || 1) * item.quantity;

      if (product.currentStock < decrementAmount) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }
      
      const price = parseFloat(product.basePrice) || product.sellingPrice || 0;
      revenue += price * item.quantity;
      totalCost += (product.costPrice || 0) * item.quantity;
      
      itemsForOrder.push({
        productId: product._id,
        sku: product.sku || product.productId,
        name: product.name,
        quantity: item.quantity,
        price: price,
        cost: product.costPrice || 0
      });
      
      // Stock Sync: Deduct stock via batch-aware FIFO service
      try {
        await sellStock(product._id, decrementAmount, null, 'OrderSystem');
      } catch (stockErr) {
        // Fallback: direct deduction for products without batch data
        console.warn(`sellStock fallback for ${product.name}: ${stockErr.message}`);
        product.currentStock -= decrementAmount;
        await product.save();
      }
    }
    
    const settings = await Settings.findOne() || { channels: [] };
    const channelSettings = settings.channels.find(c => c.name === channel);
    const commissionRate = channelSettings ? channelSettings.commissionRate : 0;
    const platformCommission = revenue * (commissionRate / 100);
    
    const netProfit = revenue - totalCost - platformCommission - (shippingCost || 0);
    
    const order = new ORDER({
      orderId: `ORD-${Date.now()}`,
      items: itemsForOrder,
      channel,
      revenue,
      platformCommission,
      shippingCost,
      netProfit,
      customer,
      orderStatus: 'Pending',
      paymentMethod: 'Cash', // Default for CRM added orders
      paymentStatus: 'Pending',
      userId: 'CRM' // Track orders created via CRM
    });
    
    await order.save();
    res.status(201).json(normalizeOrder(order));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const { channel, status, startDate, endDate } = req.query;
    const query = {};
    if (channel) query.channel = channel;
    
    // Status can be in orderStatus or status (legacy)
    if (status) {
        query.$or = [
            { orderStatus: status },
            { orderStatus: status.toLowerCase() },
            { status: status }
        ];
    }

    if (startDate && endDate) {
      query.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }
    
    const orders = await ORDER.find(query).sort({ createdAt: -1 });
    const normalizedOrders = orders.map(normalizeOrder);
    res.json(normalizedOrders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const stats = {
      totalProducts: await Product.countDocuments({ isDeleted: false }),
      activeProducts: await Product.countDocuments({ isActive: true, isDeleted: false }),
      stockUnits: (await Product.aggregate([{ $match: { isDeleted: false } }, { $group: { _id: null, total: { $sum: "$currentStock" } } }]))[0]?.total || 0,
      ordersToday: await ORDER.countDocuments({ createdAt: { $gte: today } }),
      revenueToday: (await ORDER.aggregate([{ $match: { createdAt: { $gte: today } } }, { $group: { _id: null, total: { $sum: { $ifNull: ["$revenue", "$totalAmount"] } } } }]))[0]?.total || 0,
      lowStockCount: await Product.countDocuments({ currentStock: { $lte: 10 }, isDeleted: false }),
      profitToday: (await ORDER.aggregate([{ $match: { createdAt: { $gte: today } } }, { $group: { _id: null, total: { $sum: "$netProfit" } } }]))[0]?.total || 0
    };
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    // Use the id directly to find the order in the unified collection
    const order = await ORDER.findById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Update both potential fields for compatibility
    order.orderStatus = status;
    if (order.status) order.status = status; 
    
    await order.save();
    res.json(normalizeOrder(order));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
