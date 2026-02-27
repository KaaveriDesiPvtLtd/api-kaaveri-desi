const mongoose = require('mongoose');

const crmOrderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    required: true,
    unique: true
  },
  items: [{
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CrmProduct',
      required: true
    },
    sku: String,
    name: String,
    quantity: {
      type: Number,
      required: true,
      min: 1
    },
    price: {
      type: Number,
      required: true
    },
    cost: {
      type: Number,
      required: true
    }
  }],
  channel: {
    type: String,
    required: true,
    enum: ['Website', 'WhatsApp', 'In-Person', 'Amazon', 'Blinkit', 'Flipkart', 'Swiggy Instamart']
  },
  revenue: {
    type: Number,
    required: true
  },
  shippingCost: {
    type: Number,
    default: 0
  },
  platformCommission: {
    type: Number,
    default: 0
  },
  netProfit: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
    default: 'Pending'
  },
  customer: {
    name: String,
    phone: String,
    email: String,
    address: String
  },
  orderDate: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

crmOrderSchema.index({ channel: 1 });
crmOrderSchema.index({ status: 1 });

module.exports = mongoose.model('CrmOrder', crmOrderSchema);
