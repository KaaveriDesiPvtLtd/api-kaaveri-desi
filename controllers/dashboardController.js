const ORDER = require('../model/Order');
const Product = require('../model/Product');

// ─── KPIs (stat cards) ───────────────────────────────────────────────────────
// GET /api/crm/dashboard/kpis
exports.getKpis = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const [
      ordersToday,
      revenueAgg,
      profitAgg,
      pendingCount,
      lowStockCount,
      revenueYesterdayAgg,
    ] = await Promise.all([
      ORDER.countDocuments({ createdAt: { $gte: today } }),
      ORDER.aggregate([
        { $match: { createdAt: { $gte: today } } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$revenue', '$totalAmount'] } } } },
      ]),
      ORDER.aggregate([
        { $match: { createdAt: { $gte: today } } },
        { $group: { _id: null, total: { $sum: '$netProfit' } } },
      ]),
      ORDER.countDocuments({ orderStatus: 'Pending', createdAt: { $gte: today } }),
      Product.countDocuments({ currentStock: { $lte: 10 }, isDeleted: false }),
      ORDER.aggregate([
        { $match: { createdAt: { $gte: yesterday, $lt: today } } },
        { $group: { _id: null, total: { $sum: { $ifNull: ['$revenue', '$totalAmount'] } } } },
      ]),
    ]);

    const revenueToday = revenueAgg[0]?.total || 0;
    const revenueYesterday = revenueYesterdayAgg[0]?.total || 0;
    const revenueChange = revenueYesterday > 0
      ? Math.round(((revenueToday - revenueYesterday) / revenueYesterday) * 100)
      : null;

    res.json({
      ordersToday,
      pendingOrders: pendingCount,
      revenueToday,
      revenueChangePercent: revenueChange,
      profitToday: profitAgg[0]?.total || 0,
      lowStockCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── Sales by channel ─────────────────────────────────────────────────────────
// GET /api/crm/dashboard/sales-by-channel?period=today|week|month|all
exports.getSalesByChannel = async (req, res) => {
  try {
    const { period = 'all' } = req.query;

    let dateFilter = {};
    if (period !== 'all') {
      const now = new Date();
      if (period === 'today') {
        const start = new Date(now); start.setHours(0, 0, 0, 0);
        dateFilter = { createdAt: { $gte: start } };
      } else if (period === 'week') {
        const start = new Date(now); start.setDate(now.getDate() - 7);
        dateFilter = { createdAt: { $gte: start } };
      } else if (period === 'month') {
        const start = new Date(now); start.setDate(now.getDate() - 30);
        dateFilter = { createdAt: { $gte: start } };
      }
    }

    const results = await ORDER.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: { $ifNull: ['$channel', 'Website'] },
          revenue: { $sum: { $ifNull: ['$revenue', '$totalAmount'] } },
          orders: { $sum: 1 },
        },
      },
      { $sort: { revenue: -1 } },
    ]);

    const chartData = results.map(r => ({
      name: r._id,
      revenue: Math.round(r.revenue),
      orders: r.orders,
    }));

    res.json(chartData);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ─── Low stock products ───────────────────────────────────────────────────────
// GET /api/crm/dashboard/low-stock
exports.getLowStock = async (req, res) => {
  try {
    const [products, stockStats] = await Promise.all([
      Product.find(
        { currentStock: { $lte: 10 }, isDeleted: false },
        { name: 1, currentStock: 1, unit: 1, quantity: 1, productId: 1 }
      ).sort({ currentStock: 1 }).limit(10),

      Product.aggregate([
        { $match: { isDeleted: false } },
        {
          $group: {
            _id: null,
            totalProducts: { $sum: 1 },
            activeProducts: { $sum: { $cond: ['$isActive', 1, 0] } },
            totalStock: { $sum: '$currentStock' },
          },
        },
      ]),
    ]);

    res.json({
      lowStockProducts: products.map(p => ({
        id: p._id,
        productId: p.productId,
        name: p.name,
        stock: p.currentStock,
        unit: p.unit || '',
      })),
      totalProducts: stockStats[0]?.totalProducts || 0,
      activeProducts: stockStats[0]?.activeProducts || 0,
      totalStock: stockStats[0]?.totalStock || 0,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
