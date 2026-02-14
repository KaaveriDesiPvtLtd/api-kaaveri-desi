const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  productId: {
    type: String,
    required: true,
    unique: true
  },
  name: {
    type: String,
    required: true
  },
  badge: {
    type: String
  },
  description: {
    type: String,
    required: true
  },
  image: {
    type: String,
    required: true
  },
  image2: {
    type: String
  },
  videoUrl: {
    type: String
  },
  basePrice: {
    type: String,
    required: true
  },
  benefits: {
    type: [String],
    default: []
  },
  color: {
    type: String,
    default: 'from-blue-500 to-cyan-500'
  },
  category: {
    type: String
  },
  variants: [{
    label: { type: String, required: true },
    value: { type: Number, required: true },
    priceIncrement: { type: Number, default: 0 }
  }]
}, { timestamps: true });

mongoose.model("Product", productSchema);
