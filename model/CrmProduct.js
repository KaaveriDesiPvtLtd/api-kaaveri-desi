const mongoose = require('mongoose');

const crmProductSchema = new mongoose.Schema({
  sku: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    required: true,
    enum: ['Ghee', 'Pickles', 'Jaggery', 'Milk', 'Other']
  },
  subType: {
    type: String,
    trim: true
  },
  size: {
    type: String,
    required: true
  },
  unit: {
    type: String,
    required: true,
    enum: ['ml', 'L', 'g', 'kg', 'units']
  },
  costPrice: {
    type: Number,
    required: true,
    min: 0
  },
  sellingPrice: {
    type: Number,
    required: true,
    min: 0
  },
  currentStock: {
    type: Number,
    required: true,
    default: 0,
    min: 0
  },
  lowStockThreshold: {
    type: Number,
    required: true,
    default: 10,
    min: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

// Index for search
crmProductSchema.index({ name: 'text', category: 'text' });

module.exports = mongoose.model('CrmProduct', crmProductSchema);
