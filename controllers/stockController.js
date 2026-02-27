const { receiveStock, sellStock, getBatchWiseStock } = require('../services/stockService');

exports.receiveStock = async (req, res) => {
  try {
    const { productId, batchData, quantity, performedBy } = req.body;

    if (!productId) return res.status(400).json({ error: 'productId is required' });
    if (!batchData || !batchData.batchCode) return res.status(400).json({ error: 'batchData.batchCode is required' });
    if (!quantity || quantity <= 0) return res.status(400).json({ error: 'quantity must be a positive number' });

    const result = await receiveStock(productId, batchData, quantity, performedBy || 'CRM');
    res.status(201).json({
      success: true,
      message: `Received ${quantity} units into batch ${batchData.batchCode}`,
      batch: result.batch,
      currentStock: result.computedStock
    });
  } catch (error) {
    console.error('Error receiving stock:', error);
    res.status(400).json({ error: error.message });
  }
};

exports.sellStock = async (req, res) => {
  try {
    const { productId, quantity, orderId, performedBy } = req.body;

    if (!productId) return res.status(400).json({ error: 'productId is required' });
    if (!quantity || quantity <= 0) return res.status(400).json({ error: 'quantity must be a positive number' });

    const result = await sellStock(productId, quantity, orderId, performedBy || 'CRM');
    res.json({
      success: true,
      message: `Sold ${quantity} units (FIFO across ${result.transactions.length} batch(es))`,
      transactions: result.transactions,
      currentStock: result.computedStock
    });
  } catch (error) {
    console.error('Error selling stock:', error);
    res.status(400).json({ error: error.message });
  }
};

exports.getBatchWiseStock = async (req, res) => {
  try {
    const { productId } = req.params;
    if (!productId) return res.status(400).json({ error: 'productId is required' });

    const batches = await getBatchWiseStock(productId);
    res.json({ success: true, batches });
  } catch (error) {
    console.error('Error fetching batch stock:', error);
    res.status(500).json({ error: error.message });
  }
};
