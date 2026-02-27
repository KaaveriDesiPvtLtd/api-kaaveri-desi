const mongoose = require('mongoose');

const batchSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true
  },
  batchCode: {
    type: String,
    required: true,
    trim: true
  },
  manufacturedDate: {
    type: Date
  },
  expiryDate: {
    type: Date
  },
  purchasePricePerUnit: {
    type: Number,
    default: 0
  },
  initialQuantity: {
    type: Number,
    required: true,
    min: 0
  },
  remainingQuantity: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    enum: ['kg', 'ltr', 'ml', 'gm', ''],
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, { timestamps: true });

// Indexes
batchSchema.index({ productId: 1 });
batchSchema.index({ productId: 1, batchCode: 1 }, { unique: true });
batchSchema.index({ productId: 1, isActive: 1, createdAt: 1 }); // for FIFO queries

module.exports = mongoose.model('Batch', batchSchema);
