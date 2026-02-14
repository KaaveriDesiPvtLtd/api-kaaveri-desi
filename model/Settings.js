const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  channels: [{
    name: {
      type: String,
      required: true,
      unique: true
    },
    commissionRate: {
      type: Number,
      required: true,
      default: 0
    },
    defaultShippingCost: {
      type: Number,
      default: 0
    }
  }],
  lowStockThresholdGlobal: {
    type: Number,
    default: 10
  }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);
