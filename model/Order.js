const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
    userId: {
        type: String, // KD-userid
        required: true
    },
    orderId: {
        type: String,
        required: true,
        unique: true
    },
    orderDate: {
        type: Date,
        default: Date.now
    },
    orderItems: [{
        productId: {
            type: String,
            required: true
        },
        image: {
            type: String,
            default: ''
        },
        title: {
            type: String,
            required: true
        },
        price: {
            type: Number,
            required: true
        },
        quantity: {
            type: Number,
            required: true,
            default: 1
        }
    }],
    subTotal: {
        type: Number,
        default: 0
    },
    discountAmount: {
        type: Number,
        default: 0
    },
    couponDiscount: {
        type: Number,
        default: 0
    },
    totalAmount: {
        type: Number,
        required: true
    },
    orderStatus: {
        type: String,
        enum: ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'pending'
    },
    paymentMethod: {
        type: String,
        enum: ['cod', 'razorpay', 'online', 'card', 'upi', 'netbanking'],
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'completed', 'failed', 'refunded'],
        default: 'pending'
    },
    paymentDetails: {
        razorpay_payment_id: {
            type: String,
            default: ''
        },
        razorpay_order_id: {
            type: String,
            default: ''
        },
        razorpay_signature: {
            type: String,
            default: ''
        }
    },
    shippingAddress: {
        fullName: {
            type: String,
            required: true
        },
        phone: {
            type: String,
            required: true
        },
        addressLine1: {
            type: String,
            required: true
        },
        addressLine2: {
            type: String,
            default: ''
        },
        city: {
            type: String,
            required: true
        },
        state: {
            type: String,
            required: true
        },
        pincode: {
            type: String,
            required: true
        },
        country: {
            type: String,
            default: 'India'
        }
    },
    trackingId: {
        type: String,
        default: ''
    },
    deliveredAt: {
        type: Date
    },
    cancelledAt: {
        type: Date
    },
    cancellationReason: {
        type: String,
        default: ''
    },
    estimatedDelivery: {
        type: Date
    },
    shippedAt: {
        type: Date
    }
}, {
    timestamps: true
});

// Add index for faster queries on userId
orderSchema.index({ userId: 1 });

module.exports = mongoose.model("ORDER", orderSchema);
