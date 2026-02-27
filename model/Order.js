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
        enum: ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'Pending'
    },
    channel: {
        type: String,
        default: 'Website',
        enum: ['Website', 'WhatsApp', 'In-Person', 'Amazon', 'Blinkit', 'Flipkart', 'Swiggy Instamart']
    },
    revenue: {
        type: Number,
        default: 0
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
        default: 0
    },
    customer: {
        name: String,
        phone: String,
        email: String,
        address: String
    },
    paymentMethod: {
        type: String,
        enum: ['cod', 'razorpay', 'online', 'card', 'upi', 'netbanking', 'Cash', 'Online'],
        required: true
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'completed', 'failed', 'refunded', 'Pending', 'Paid'],
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
            type: String
        },
        phone: {
            type: String
        },
        addressLine1: {
            type: String
        },
        addressLine2: {
            type: String,
            default: ''
        },
        city: {
            type: String
        },
        state: {
            type: String
        },
        pincode: {
            type: String
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

orderSchema.index({ userId: 1, channel: 1, orderStatus: 1 });

// Add index for faster queries on userId
orderSchema.index({ userId: 1 });

module.exports = mongoose.model("ORDER", orderSchema);
