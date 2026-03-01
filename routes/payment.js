const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');
const Razorpay_key_id = process.env.RAZORPAY_KEY_ID;
const Razorpay_key_secret = process.env.RAZORPAY_KEY_SECRET;

// Initialize Razorpay instance
const razorpayInstance = new Razorpay({
  key_id: Razorpay_key_id,
  key_secret: Razorpay_key_secret,
});

const { convertToBaseUnit } = require('../utils/unitConversion');
const { sellStock } = require('../services/stockService');

const connectDB = require('../lib/db');

const getModels = async () => {
    await connectDB();
    return {
        USER: mongoose.model('USER'),
        Product: require('../model/Product')
    };
};

// Verify payment route
router.post('/createorder', async (req, res) => {
  try {
    const { USER } = await getModels();
    const { userId, amount, currency, cartItems, shippingDetails } = req.body;

    // Validate input
    if (!userId || !amount) {
      return res.status(400).json({
        success: false,
        message: 'User ID and amount are required',
      });
    }

    // Validate user exists
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format',
      });
    }

    const user = await USER.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Create Razorpay order
    const options = {
      amount: Math.round(amount * 100), // Razorpay expects amount in paise (multiply by 100)
      currency: currency || 'INR',
      receipt: `receipt_order_${Date.now()}`,
      notes: {
        userId: userId,
        customerName: shippingDetails?.fullName || user.name,
        customerEmail: shippingDetails?.email || user.email,
      },
    };

    const razorpayOrder = await razorpayInstance.orders.create(options);

    // Return order details to frontend
    res.status(200).json({
      success: true,
      orderId: razorpayOrder.id,
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      key_id: Razorpay_key_id,
    });

  } catch (error) {
    console.error('Error creating Razorpay order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message,
    });
  }
});

// 2. VERIFY PAYMENT ROUTE
router.post('/verifypayment', async (req, res) => {
  try {
    const { USER, Product } = await getModels();
    const {
      userId,
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      shippingDetails,
      cartItems,
      totalAmount,
      paymentMethod,
    } = req.body;

    // Validate required fields
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing payment verification parameters',
      });
    }

    // Verify signature
    const sign = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSign = crypto
      .createHmac('sha256', Razorpay_key_secret)
      .update(sign.toString())
      .digest('hex');

    if (razorpay_signature !== expectedSign) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature',
      });
    }

    // Signature is valid - Payment is successful
    // Generate unique order ID
    const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // Find user and update with order
    const user = await USER.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Create order object
    const newOrder = {
      orderId: orderId,
      orderDate: new Date(),
      orderItems: cartItems.map(item => ({
        productId: item.productId,
        image: item.image,
        title: item.title,
        price: item.price,
        quantity: item.quantity,
      })),
      totalAmount: totalAmount,
      orderStatus: 'processing',
      paymentMethod: paymentMethod || 'card',
      paymentStatus: 'completed',
      shippingAddress: {
        fullName: shippingDetails.fullName,
        phone: shippingDetails.phone,
        addressLine1: shippingDetails.addressLine1,
        addressLine2: shippingDetails.addressLine2,
        city: shippingDetails.city,
        state: shippingDetails.state,
        pincode: shippingDetails.pincode,
        country: shippingDetails.country,
      },
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
    };

    // Add order to user's placedOrders array
    if (!user.placedOrders) {
      user.placedOrders = [];
    }
    user.placedOrders.push(newOrder);

    // Clear cart after successful order
    user.cart = [];

    // Save user
    await user.save();

    // Atomically decrement stock for each product in the order (unit-aware)
    const validItems = cartItems.filter(item => item.productId);
    if (validItems.length > 0) {
      // Batch-fetch products to get base unit and variants
      const productIds = [...new Set(validItems.map(i => i.productId))];
      const products = await Product.find({ productId: { $in: productIds } }).lean();
      const productMap = {};
      products.forEach(p => { productMap[p.productId] = p; });

      // Track stock deductions via sellStock FIFO service
      for (const item of validItems) {
        const product = productMap[item.productId];
        const purchaseQty = Number(item.quantity) || 1;
        let decrementAmount = purchaseQty; // fallback

        if (product) {
          const baseUnit = product.baseVariant?.unit || product.unit || '';
          const qType = Number(item.quantityType);
          let variantUnit = baseUnit;
          
          if (product.baseVariant && Number(product.baseVariant.quantity) === qType) {
            variantUnit = product.baseVariant.unit || baseUnit;
          } else if (product.variants && product.variants.length > 0) {
            const matched = product.variants.find(v => Number(v.value) === qType);
            if (matched) variantUnit = matched.unit || baseUnit;
          }
          const convertedAmount = convertToBaseUnit(qType || 0, variantUnit, baseUnit);
          // If qType is 0 or missing, it implies item itself is a unit, but 
          // usually qType is the Variant size. So decrementAmount is variant size * quantity
          decrementAmount = (convertedAmount || 1) * purchaseQty;
        }

        try {
          await sellStock(item.productId, decrementAmount, orderId, 'CustomerOrder');
        } catch (stockErr) {
          console.error(`Error deducting stock for ${item.productId}:`, stockErr.message);
          // Fallback mechanism if sellStock fails
          await Product.updateOne(
            { productId: item.productId },
            { $inc: { currentStock: -decrementAmount } }
          );
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Payment verified and order placed successfully',
      orderId: orderId,
      order: newOrder,
    });

  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message,
    });
  }
});

// 3. PLACE ORDER ROUTE (for COD)
router.post('/placeorder', async (req, res) => {
  try {
    const { USER, Product } = await getModels();
    const {
      userId,
      orderItems,
      totalAmount,
      paymentMethod,
      paymentStatus,
      shippingDetails,
    } = req.body;

    // Validate input
    if (!userId || !orderItems || orderItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User ID and order items are required',
      });
    }

    // Validate user
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format',
      });
    }

    const user = await USER.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Validate shipping details
    if (!shippingDetails || !shippingDetails.fullName || !shippingDetails.phone) {
      return res.status(400).json({
        success: false,
        message: 'Complete shipping details are required',
      });
    }

    // Generate unique order ID
    const orderId = `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // Create order object
    const newOrder = {
      orderId: orderId,
      orderDate: new Date(),
      orderItems: orderItems.map(item => ({
        productId: item.productId,
        image: item.image,
        title: item.title,
        price: item.price,
        quantity: item.quantity,
      })),
      totalAmount: totalAmount,
      orderStatus: 'pending',
      paymentMethod: paymentMethod || 'cod',
      paymentStatus: paymentStatus || 'pending',
      shippingAddress: {
        fullName: shippingDetails.fullName,
        phone: shippingDetails.phone,
        addressLine1: shippingDetails.addressLine1,
        addressLine2: shippingDetails.addressLine2 || '',
        city: shippingDetails.city,
        state: shippingDetails.state,
        pincode: shippingDetails.pincode,
        country: shippingDetails.country || 'India',
      },
    };

    // Initialize placedOrders if it doesn't exist
    if (!user.placedOrders) {
      user.placedOrders = [];
    }

    // Add order to user's placedOrders array
    user.placedOrders.push(newOrder);

    // Clear cart after order placement
    user.cart = [];

    // Save user
    await user.save();

    // Atomically decrement stock for each product in the order (unit-aware)
    const validItems = orderItems.filter(item => item.productId);
    if (validItems.length > 0) {
      const productIds = [...new Set(validItems.map(i => i.productId))];
      const products = await Product.find({ productId: { $in: productIds } }).lean();
      const productMap = {};
      products.forEach(p => { productMap[p.productId] = p; });

      // Track stock deductions via sellStock FIFO service
      for (const item of validItems) {
        const product = productMap[item.productId];
        const purchaseQty = Number(item.quantity) || 1;
        let decrementAmount = purchaseQty; // fallback

        if (product) {
          const baseUnit = product.baseVariant?.unit || product.unit || '';
          const qType = Number(item.quantityType);
          let variantUnit = baseUnit;
          
          if (product.baseVariant && Number(product.baseVariant.quantity) === qType) {
            variantUnit = product.baseVariant.unit || baseUnit;
          } else if (product.variants && product.variants.length > 0) {
            const matched = product.variants.find(v => Number(v.value) === qType);
            if (matched) variantUnit = matched.unit || baseUnit;
          }
          const convertedAmount = convertToBaseUnit(qType || 0, variantUnit, baseUnit);
          decrementAmount = (convertedAmount || 1) * purchaseQty;
        }

        try {
          await sellStock(item.productId, decrementAmount, orderId, 'CustomerOrder');
        } catch (stockErr) {
          console.error(`Error deducting COD stock for ${item.productId}:`, stockErr.message);
          // Fallback mechanism if sellStock fails
          await Product.updateOne(
            { productId: item.productId },
            { $inc: { currentStock: -decrementAmount } }
          );
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Order placed successfully',
      orderId: orderId,
      order: newOrder,
    });

  } catch (error) {
    console.error('Error placing order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to place order',
      error: error.message,
    });
  }
});

// BONUS: Get Order Details by Order ID
router.get('/getorder/:orderId', async (req, res) => {
  try {
    const { USER } = await getModels();
    const { orderId } = req.params;
    const userId = req.query.userId || req.headers['user-id'];

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required',
      });
    }

    const user = await USER.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Find order in user's placedOrders
    const order = user.placedOrders.find(o => o.orderId === orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    res.status(200).json({
      success: true,
      order: order,
    });

  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
      error: error.message,
    });
  }
});

// BONUS: Get All Orders for a User
router.get('/getorders/:userId', async (req, res) => {
  try {
    const { USER } = await getModels();
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format',
      });
    }

    const user = await USER.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Sort orders by date (newest first)
    const orders = user.placedOrders || [];
    orders.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));

    res.status(200).json({
      success: true,
      orders: orders,
      totalOrders: orders.length,
    });

  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message,
    });
  }
});

// Use the same instance for consistency
router.post('/create-razorpay-order', async (req, res) => {
  try {
    await connectDB();
    const { amount, currency, receipt } = req.body;
    
    const options = {
      amount: amount, // amount in paise
      currency: currency || 'INR',
      receipt: receipt || `receipt_${Date.now()}`
    };
    
    const order = await razorpayInstance.orders.create(options);
    
    res.json({
      success: true,
      id: order.id,
      amount: order.amount,
      currency: order.currency
    });
  } catch (error) {
    console.error('Razorpay order creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
      error: error.message
    });
  }
});




module.exports = router;
