const mongoose = require('mongoose');
const Product = require('../model/Product');
const Batch = require('../model/Batch');
const StockTransaction = require('../model/StockTransaction');

/**
 * Receive stock into inventory.
 * Creates a Batch record and an IN StockTransaction, then syncs product.currentStock.
 * Wrapped in a MongoDB session transaction for atomicity.
 */
async function receiveStock(productId, batchData, quantity, performedBy) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const product = await Product.findById(productId).session(session);
    if (!product) throw new Error('Product not found');

    if (!batchData.batchCode) throw new Error('batchCode is required');
    if (!quantity || quantity <= 0) throw new Error('quantity must be positive');

    // Create or update the batch
    let batch = await Batch.findOne({
      productId: product._id,
      batchCode: batchData.batchCode
    }).session(session);

    if (batch) {
      // Batch exists — add to it
      batch.remainingQuantity += quantity;
      batch.initialQuantity += quantity;
      if (batchData.expiryDate) batch.expiryDate = batchData.expiryDate;
      if (batchData.manufacturedDate) batch.manufacturedDate = batchData.manufacturedDate;
      if (batchData.purchasePricePerUnit !== undefined) batch.purchasePricePerUnit = batchData.purchasePricePerUnit;
      batch.isActive = true;
      await batch.save({ session });
    } else {
      // New batch
      batch = new Batch({
        productId: product._id,
        batchCode: batchData.batchCode,
        manufacturedDate: batchData.manufacturedDate || null,
        expiryDate: batchData.expiryDate || null,
        purchasePricePerUnit: batchData.purchasePricePerUnit || 0,
        initialQuantity: quantity,
        remainingQuantity: quantity,
        unit: batchData.unit || product.unit || '',
        isActive: true
      });
      await batch.save({ session });
    }

    // Create IN transaction
    await new StockTransaction({
      transactionType: 'IN',
      productId: product._id,
      sku: product.sku || product.productId,
      quantity,
      reason: batchData.reason || 'Stock received',
      batchId: batchData.batchCode,
      metadata: { performedBy }
    }).save({ session });

    // Sync product.currentStock from aggregated transactions
    const computedStock = await Product.calculateCurrentStock(product._id);
    product.currentStock = computedStock;
    await product.save({ session });

    await session.commitTransaction();
    session.endSession();

    return { batch, computedStock };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
}

/**
 * Sell / deduct stock using FIFO (oldest active batch first).
 * Creates one OUT StockTransaction per batch consumed.
 * Prevents selling expired batches and going negative.
 * Wrapped in a MongoDB session transaction.
 */
async function sellStock(productId, quantity, orderId, performedBy) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const product = await Product.findById(productId).session(session);
    if (!product) throw new Error('Product not found');

    if (!quantity || quantity <= 0) throw new Error('quantity must be positive');

    // Validate total available stock
    const computedStock = await Product.calculateCurrentStock(product._id);
    if (computedStock < quantity) {
      throw new Error(`Insufficient stock for ${product.name}. Available: ${computedStock}, Requested: ${quantity}`);
    }

    // Fetch active, non-expired batches sorted oldest-first (FIFO)
    const now = new Date();
    const batches = await Batch.find({
      productId: product._id,
      isActive: true,
      remainingQuantity: { $gt: 0 },
      $or: [
        { expiryDate: null },
        { expiryDate: { $gt: now } }
      ]
    })
      .sort({ createdAt: 1 })
      .session(session);

    let remaining = quantity;
    const transactions = [];

    for (const batch of batches) {
      if (remaining <= 0) break;

      const deduct = Math.min(remaining, batch.remainingQuantity);
      batch.remainingQuantity -= deduct;

      // Mark batch inactive if fully consumed
      if (batch.remainingQuantity === 0) {
        batch.isActive = false;
      }

      await batch.save({ session });

      // Create one OUT transaction per batch deduction
      const txn = new StockTransaction({
        transactionType: 'OUT',
        productId: product._id,
        sku: product.sku || product.productId,
        quantity: deduct,
        reason: orderId ? `Order ${orderId}` : 'Stock sold',
        batchId: batch.batchCode,
        metadata: { orderId, performedBy }
      });
      await txn.save({ session });
      transactions.push(txn);

      remaining -= deduct;
    }

    if (remaining > 0) {
      throw new Error(`Could not fully deduct stock. ${remaining} units could not be allocated from active batches.`);
    }

    // Sync product.currentStock
    const newStock = await Product.calculateCurrentStock(product._id);
    product.currentStock = newStock;
    await product.save({ session });

    await session.commitTransaction();
    session.endSession();

    return { transactions, computedStock: newStock };
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
}

/**
 * Get batch-wise stock breakdown for a product.
 */
async function getBatchWiseStock(productId) {
  const batches = await Batch.find({ productId })
    .sort({ createdAt: 1 })
    .lean();

  return batches.map(b => ({
    batchCode: b.batchCode,
    remainingQuantity: b.remainingQuantity,
    initialQuantity: b.initialQuantity,
    expiryDate: b.expiryDate,
    manufacturedDate: b.manufacturedDate,
    isActive: b.isActive,
    createdAt: b.createdAt
  }));
}

module.exports = { receiveStock, sellStock, getBatchWiseStock };
