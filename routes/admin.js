const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');
const User = mongoose.model("USER");



// Get all users with pagination
router.get('/users', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const search = req.query.search || '';
        const skip = (page - 1) * limit;

        const query = search ? {
            $or: [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } },
                { userName: { $regex: search, $options: 'i' } }
            ]
        } : {};

        const users = await User.find(query)
            .select('-password')
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 });

        const total = await User.countDocuments(query);

        res.json({
            users,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single user details
router.get('/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id).select('-password');
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
    try {
        const user = await User.findByIdAndDelete(req.params.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ message: 'User deleted successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get all orders with pagination and filters
router.get('/orders', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const status = req.query.status;
        const search = req.query.search || '';

        const pipeline = [
            { $unwind: '$placedOrders' },
            {
                $match: {
                    ...(status && { 'placedOrders.orderStatus': status }),
                    ...(search && {
                        $or: [
                            { 'placedOrders.orderId': { $regex: search, $options: 'i' } },
                            { name: { $regex: search, $options: 'i' } },
                            { email: { $regex: search, $options: 'i' } }
                        ]
                    })
                }
            },
            {
                $project: {
                    orderId: '$placedOrders.orderId',
                    orderDate: '$placedOrders.orderDate',
                    totalAmount: '$placedOrders.totalAmount',
                    orderStatus: '$placedOrders.orderStatus',
                    paymentMethod: '$placedOrders.paymentMethod',
                    paymentStatus: '$placedOrders.paymentStatus',
                    customerName: '$name',
                    customerEmail: '$email',
                    userId: '$_id',
                    orderItems: '$placedOrders.orderItems',
                    shippingAddress: '$placedOrders.shippingAddress',
                    trackingId: '$placedOrders.trackingId'
                }
            },
            { $sort: { orderDate: -1 } }
        ];

        const allOrders = await User.aggregate(pipeline);
        const total = allOrders.length;
        const orders = allOrders.slice((page - 1) * limit, page * limit);

        res.json({
            orders,
            totalPages: Math.ceil(total / limit),
            currentPage: page,
            total
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update order status
router.patch('/orders/:userId/:orderId', async (req, res) => {
    try {
        const { userId, orderId } = req.params;
        const { orderStatus, trackingId, paymentStatus } = req.body;

        const updateFields = {};
        if (orderStatus) updateFields['placedOrders.$.orderStatus'] = orderStatus;
        if (trackingId) updateFields['placedOrders.$.trackingId'] = trackingId;
        if (paymentStatus) updateFields['placedOrders.$.paymentStatus'] = paymentStatus;

        if (orderStatus === 'delivered') {
            updateFields['placedOrders.$.deliveredAt'] = new Date();
        }
        if (orderStatus === 'cancelled') {
            updateFields['placedOrders.$.cancelledAt'] = new Date();
        }

        const user = await User.findOneAndUpdate(
            { _id: userId, 'placedOrders.orderId': orderId },
            { $set: updateFields },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ error: 'Order not found' });
        }

        const updatedOrder = user.placedOrders.find(o => o.orderId === orderId);
        res.json({ message: 'Order updated successfully', order: updatedOrder });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get dashboard statistics
router.get('/stats', async (req, res) => {
    try {
        const totalUsers = await User.countDocuments();
        
        const orderStats = await User.aggregate([
            { $unwind: '$placedOrders' },
            {
                $group: {
                    _id: null,
                    totalOrders: { $sum: 1 },
                    totalRevenue: { $sum: '$placedOrders.totalAmount' },
                    pendingOrders: {
                        $sum: { $cond: [{ $eq: ['$placedOrders.orderStatus', 'pending'] }, 1, 0] }
                    },
                    processingOrders: {
                        $sum: { $cond: [{ $eq: ['$placedOrders.orderStatus', 'processing'] }, 1, 0] }
                    },
                    shippedOrders: {
                        $sum: { $cond: [{ $eq: ['$placedOrders.orderStatus', 'shipped'] }, 1, 0] }
                    },
                    deliveredOrders: {
                        $sum: { $cond: [{ $eq: ['$placedOrders.orderStatus', 'delivered'] }, 1, 0] }
                    }
                }
            }
        ]);

        res.json({
            totalUsers,
            ...(orderStats[0] || {
                totalOrders: 0,
                totalRevenue: 0,
                pendingOrders: 0,
                processingOrders: 0,
                shippedOrders: 0,
                deliveredOrders: 0
            })
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get recent orders
router.get('/orders/recent', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 5;

        const recentOrders = await User.aggregate([
            { $unwind: '$placedOrders' },
            { $sort: { 'placedOrders.orderDate': -1 } },
            { $limit: limit },
            {
                $project: {
                    orderId: '$placedOrders.orderId',
                    orderDate: '$placedOrders.orderDate',
                    totalAmount: '$placedOrders.totalAmount',
                    orderStatus: '$placedOrders.orderStatus',
                    customerName: '$name',
                    customerEmail: '$email'
                }
            }
        ]);

        res.json(recentOrders);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});




























module.exports = router;
