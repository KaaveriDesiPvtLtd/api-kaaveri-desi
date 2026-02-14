const mongoose = require('mongoose');

const stockTransactionSchema = new mongoose.Schema({
  transactionType: {
    type: String,
    required: true,
    enum: ['IN', 'OUT', 'DELETE', 'ADJUSTMENT']
  },
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CrmProduct',
    required: true
  },
  sku: String,
  quantity: {
    type: Number,
    required: true
  },
  reason: {
    type: String,
    required: true
  },
  batchId: {
    type: String,
    trim: true
  },
  metadata: {
    orderId: String,
    performedBy: String
  }
}, { timestamps: true });

stockTransactionSchema.index({ productId: 1 });
stockTransactionSchema.index({ transactionType: 1 });
stockTransactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('StockTransaction', stockTransactionSchema);
