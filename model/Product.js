const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
    },
    productId: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    badge: {
      type: String,
    },
    description: {
      type: String,
      required: true,
    },
    image: {
      type: String,
    },
    image2: {
      type: String,
    },
    videoUrl: {
      type: String,
    },
    media: {
      type: [String],
      default: [],
    },
    baseVariant: {
      label: { type: String, required: true },
      quantity: { type: Number, required: true },
      unit: { type: String, enum: ["kg", "ltr", "ml", "gm", ""], default: "" },
      price: { type: Number, required: true },
    },
    // Legacy fields kept for backward compatibility with existing products
    basePrice: {
      type: String,
    },
    benefits: {
      type: [String],
      default: [],
    },
    color: {
      type: String,
      default: "from-blue-500 to-cyan-500",
    },
    category: {
      type: String,
    },
    sku: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
    },
    costPrice: {
      type: Number,
      default: 0,
    },
    sellingPrice: {
      type: Number,
      default: 0,
    },
    quantity: {
      type: Number,
      default: 0,
    },
    unit: {
      type: String,
      enum: ["kg", "ltr", "ml", "gm", ""],
      default: "",
    },
    currentStock: {
      type: Number,
      default: 0,
    },
    lowStockThreshold: {
      type: Number,
      default: 10,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    discountPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    variants: [
      {
        label: { type: String, required: true },
        value: { type: Number, required: true },
        unit: {
          type: String,
          enum: ["kg", "ltr", "ml", "gm", ""],
          default: "",
        },
        priceIncrement: { type: Number, default: 0 },
      },
    ],
  },
  { timestamps: true },
);

productSchema.index({ name: "text", category: "text", sku: 1 });

/**
 * Derive the current stock for a product entirely from StockTransaction records.
 * IN → add, OUT/DELETE → subtract, ADJUSTMENT → add (value can be negative).
 */
productSchema.statics.calculateCurrentStock = async function (productId) {
  const StockTransaction = require('mongoose').model('StockTransaction');

  const result = await StockTransaction.aggregate([
    { $match: { productId: new (require('mongoose').Types.ObjectId)(productId) } },
    {
      $group: {
        _id: null,
        total: {
          $sum: {
            $switch: {
              branches: [
                { case: { $eq: ['$transactionType', 'IN'] }, then: '$quantity' },
                { case: { $eq: ['$transactionType', 'OUT'] }, then: { $multiply: ['$quantity', -1] } },
                { case: { $eq: ['$transactionType', 'DELETE'] }, then: { $multiply: ['$quantity', -1] } },
                { case: { $eq: ['$transactionType', 'ADJUSTMENT'] }, then: '$quantity' }
              ],
              default: 0
            }
          }
        }
      }
    }
  ]);

  return result.length > 0 ? result[0].total : 0;
};

module.exports = mongoose.model("Product", productSchema);
