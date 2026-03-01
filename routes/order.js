const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const mongoose = require('mongoose');
const connectDB = require('../lib/db');

const getModels = async () => {
    await connectDB();
    return {
        USER: mongoose.model("USER"),
        ORDER: mongoose.model("ORDER"),
        Product: require('../model/Product')
    };
};

// Unit conversion helper: converts an amount from one unit to another
function convertToBaseUnit(amount, fromUnit, toUnit) {
  if (!fromUnit || !toUnit) return amount;
  const from = fromUnit.toLowerCase().trim();
  const to = toUnit.toLowerCase().trim();
  if (from === to) return amount;
  // Volume conversions
  if (from === 'ltr' && to === 'ml') return amount * 1000;
  if (from === 'ml' && to === 'ltr') return amount / 1000;
  // Weight conversions
  if (from === 'kg' && to === 'gm') return amount * 1000;
  if (from === 'gm' && to === 'kg') return amount / 1000;
  return amount;
}

router.post('/placeorder', async (req, res) => {
  try {
    const { USER, ORDER, Product } = await getModels();
    const {
      userId, // This is expected to be the _id from the frontend
      orderId,
      orderItems,
      subTotal,
      discountAmount,
      totalAmount,
      orderStatus,
      paymentMethod,
      paymentStatus,
      paymentDetails,
      shippingAddress,
      couponDiscount
    } = req.body;

    // Validate required fields
    if (!userId) {
      console.error('❌ Missing userId');
      return res.status(400).json({ success: false, message: 'User ID is required' });
    }

    if (!orderId) {
      console.error('❌ Missing orderId');
      return res.status(400).json({ success: false, message: 'Order ID is required' });
    }

    if (!orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
      console.error('❌ Invalid orderItems');
      return res.status(400).json({ success: false, message: 'Order items are required' });
    }

    if (!shippingAddress || !shippingAddress.fullName) {
      console.error('❌ Invalid shippingAddress');
      return res.status(400).json({ success: false, message: 'Complete shipping address is required' });
    }

    // Find user to get the string userid
    const user = await USER.findById(userId);
    
    if (!user) {
      console.error('❌ User not found:', userId);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    let userid = user.userid; // Get the custom userid

    // JIT: If userid is missing, generate it on the fly
    if (!userid) {
      userid = `KD-${Date.now()}${Math.random().toString(36).substring(2, 5)}`.toUpperCase();
      user.userid = userid;
      await user.save();
      console.log(`✅ Assigned missing userid ${userid} to user ${user.email} on-the-fly`);
    }

    // Create new order instance
    const newOrder = new ORDER({
      userId: userid, // Save our custom string userid
      orderId: orderId,
      orderDate: new Date(),
      orderItems: orderItems.map(item => ({
        productId: item.productId,
        title: item.title,
        price: parseFloat(item.price) || 0,
        quantity: parseInt(item.quantity) || 1,
        image: item.image || ''
      })),
      subTotal: parseFloat(subTotal) || 0,
      discountAmount: parseFloat(discountAmount) || 0,
      couponDiscount: parseFloat(couponDiscount) || 0,
      totalAmount: parseFloat(totalAmount) || 0,
      orderStatus: orderStatus || 'pending',
      paymentMethod: paymentMethod || 'cod',
      paymentStatus: paymentStatus || 'pending',
      paymentDetails: paymentDetails || {},
      shippingAddress: {
        fullName: shippingAddress.fullName?.trim() || '',
        phone: shippingAddress.phone?.trim() || '',
        addressLine1: shippingAddress.addressLine1?.trim() || '',
        addressLine2: shippingAddress.addressLine2?.trim() || '',
        city: shippingAddress.city?.trim() || '',
        state: shippingAddress.state?.trim() || '',
        pincode: shippingAddress.pincode?.trim() || '',
        country: shippingAddress.country || 'India'
      }
    });

    await newOrder.save();

    console.log('✅ Order saved successfully to ORDER collection for user:', user.email);

    // Atomically decrement stock for each product in the order (unit-aware)
    const validItems = orderItems.filter(item => item.productId);
    if (validItems.length > 0) {
      // Look up products by BOTH productId and id fields, since the cart may store either
      const itemProductIds = [...new Set(validItems.map(i => i.productId))];
      const products = await Product.find({
        $or: [
          { productId: { $in: itemProductIds } },
          { id: { $in: itemProductIds } }
        ]
      }).lean();

      // Build lookup map keyed by both productId and id
      const productMap = {};
      products.forEach(p => {
        if (p.productId) productMap[p.productId] = p;
        if (p.id) productMap[p.id] = p;
      });

      const stockOps = validItems.map(item => {
        const product = productMap[item.productId];
        const purchaseQty = Number(item.quantity) || 1;
        let decrementAmount = purchaseQty; // fallback: just the count

        if (product) {
          // The base unit that currentStock is tracked in
          const baseUnit = (product.baseVariant?.unit || product.unit || '').toLowerCase().trim();
          const qType = Number(item.quantityType);

          // Find the unit of the purchased variant
          let variantUnit = baseUnit;
          if (!isNaN(qType) && qType > 0) {
            // Check if it matches the baseVariant
            if (product.baseVariant && Number(product.baseVariant.quantity) === qType) {
              variantUnit = (product.baseVariant.unit || baseUnit).toLowerCase().trim();
            } else if (product.variants && product.variants.length > 0) {
              const matched = product.variants.find(v => Number(v.value) === qType);
              if (matched) {
                variantUnit = (matched.unit || baseUnit).toLowerCase().trim();
              }
            }
            // Convert the variant amount to the base unit
            const convertedAmount = convertToBaseUnit(qType, variantUnit, baseUnit);
            decrementAmount = convertedAmount * purchaseQty;
          }

          console.log(`📦 Stock decrement: product=${product.name}, baseUnit=${baseUnit}, qType=${qType}, variantUnit=${variantUnit}, convertedAmount=${convertToBaseUnit(qType || 0, variantUnit, baseUnit)}, purchaseQty=${purchaseQty}, finalDecrement=${decrementAmount}`);
        } else {
          console.warn(`⚠️ Product not found for productId: ${item.productId}, falling back to decrement by ${purchaseQty}`);
        }

        // Use _id for reliable filter since we looked up the product
        const filter = product
          ? { _id: product._id }
          : { $or: [{ productId: item.productId }, { id: item.productId }] };

        return {
          updateOne: {
            filter,
            update: { $inc: { currentStock: -decrementAmount } }
          }
        };
      });
      await Product.bulkWrite(stockOps);
      console.log('✅ Stock decremented for', stockOps.length, 'products');
    }

    res.status(200).json({
      success: true,
      message: 'Order placed successfully',
      orderId: orderId,
      order: newOrder
    });
    
  } catch (error) {
    console.error('❌ Error placing order:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Handle specific MongoDB/Mongoose errors
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      console.error('Validation errors:', messages);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        error: messages.join(', ')
      });
    }
    
    if (error.name === 'CastError') {
      console.error('Cast error:', error.message);
      return res.status(400).json({
        success: false,
        message: 'Invalid data format',
        error: error.message
      });
    }
    
    // Generic error response with details
    res.status(500).json({
      success: false,
      message: 'Server error while placing order',
      error: error.message || 'Internal server error'
    });
  }
});


router.post('/clearcart/:userId', async (req, res) => {
  try {
    const { USER } = await getModels();
    const { userId } = req.params;

    const user = await USER.findById(userId);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.cart = [];
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Cart cleared successfully'
    });
  } catch (error) {
    console.error('Error clearing cart:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});





router.get('/getorder/:userId/:orderId', async (req, res) => {
  try {
    const { USER, ORDER } = await getModels();
    const { userId, orderId } = req.params;

    // Use lean() to see fields not in current schema
    const user = await USER.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Ensure user has a userid
    let currentUserId = user.userid;
    if (!currentUserId) {
      currentUserId = `KD-${Date.now()}${Math.random().toString(36).substring(2, 5)}`.toUpperCase();
      await USER.updateOne({ _id: userId }, { $set: { userid: currentUserId } });
      console.log(`✅ Assigned missing userid ${currentUserId} to ${user.email} during single order fetch`);
    }

    const order = await ORDER.findOne({ userId: currentUserId, orderId: orderId });
    if (!order) {
      // Check if it's still in legacy array (unlikely but possible if getorders wasn't called)
      const legacyOrder = (user.placedOrders || []).find(o => o.orderId === orderId);
      if (legacyOrder) {
        const newOrder = new ORDER({ ...legacyOrder, userId: currentUserId, _id: undefined });
        await newOrder.save();
        return res.status(200).json({ success: true, order: newOrder });
      }
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    res.status(200).json({ success: true, order });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


router.get('/getorders/:userId', async (req, res) => {
  try {
    const { USER, ORDER } = await getModels();
    const { userId } = req.params;

    // Use lean() to see legacy fields
    const user = await USER.findById(userId).lean();
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Ensure user has a userid
    let currentUserId = user.userid;
    if (!currentUserId) {
      currentUserId = `KD-${Date.now()}${Math.random().toString(36).substring(2, 5)}`.toUpperCase();
      await USER.updateOne({ _id: userId }, { $set: { userid: currentUserId } });
      console.log(`✅ Assigned missing userid ${currentUserId} to ${user.email} during bulk order fetch`);
    }

    // JIT Migration: Check for legacy orders
    const legacyOrders = user.placedOrders || [];
    if (legacyOrders.length > 0) {
      console.log(`📦 Migrating ${legacyOrders.length} legacy orders for ${user.email}`);
      for (const orderData of legacyOrders) {
        if (!orderData.orderId) continue;
        const exists = await ORDER.findOne({ orderId: orderData.orderId });
        if (!exists) {
          const newOrderModel = new ORDER({
            ...orderData,
            userId: currentUserId,
            _id: undefined
          });
          await newOrderModel.save();
        }
      }
      // Cleanup legacy data
      await USER.updateOne({ _id: userId }, { $unset: { placedOrders: 1 } });
    }

    const orders = await ORDER.find({ userId: currentUserId }).sort({ orderDate: -1 });

    res.status(200).json({ success: true, orders });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});




// GET /checkcart - Check if product is in user's cart
router.get('/checkcart', async (req, res) => {
  try {
    const { USER } = await getModels();
    const { userId, productId, quantityType } = req.query;
    
    if (!userId || !productId) {
      return res.json({ success: false, message: 'Missing userId or productId' });
    }

    const user = await USER.findById(userId);
    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }

    // Check if product exists in cart with exact quantityType match
    const isInCart = user.cart.some(item => 
      item.productId === productId && 
      (!quantityType || item.quantityType == quantityType) // quantityType optional for backward compatibility
    );

    res.json({ 
      success: true, 
      isInCart,
      cartCount: user.cart.length 
    });
  } catch (error) {
    console.error('Check cart error:', error);
    res.json({ success: false, message: error.message });
  }
});

// GET /checkwishlist - Check if product is in user's wishlist
router.get('/checkwishlist', async (req, res) => {
  try {
    const { USER } = await getModels();
    const { userId, productId } = req.query;
    
    if (!userId || !productId) {
      return res.json({ success: false, message: 'Missing userId or productId' });
    }

    const user = await USER.findById(userId);
    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }

    const isInWishlist = user.wishlist.some(item => item.productId === productId);

    res.json({ 
      success: true, 
      isInWishlist,
      wishlistCount: user.wishlist.length 
    });
  } catch (error) {
    console.error('Check wishlist error:', error);
    res.json({ success: false, message: error.message });
  }
});



// 1. Check if first order
router.get('/check-first-order/:userId', async (req, res) => {
  try {
    const { USER, ORDER } = await getModels();
    const user = await USER.findById(req.params.userId);
    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }
    
    const orderCount = await ORDER.countDocuments({ userId: user.userid });
    const isFirstOrder = orderCount === 0;
    res.json({ success: true, isFirstOrder });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Apply coupon logic
router.post('/apply-coupon', async (req, res) => {
  try {
    const { USER, ORDER } = await getModels();
    const { userId, cartTotal, couponCode } = req.body;
    
    const user = await USER.findById(userId);
    if (!user) {
      return res.json({ success: false, message: 'User not found' });
    }
    
    let discount = 0;
    let discountType = '';
    
    const subTotal = parseFloat(cartTotal.toString());
    const orderCount = await ORDER.countDocuments({ userId: user.userid });
    
    switch (couponCode.toUpperCase()) {
      case 'FIRST10':
        if (orderCount === 0) {
          discount = Math.round(subTotal * 0.10);
          discountType = 'First Order 10% OFF';
        } else {
          return res.json({ 
            success: false, 
            message: 'This coupon is only for first-time buyers' 
          });
        }
        break;
        
      case 'BIG15':
        if (subTotal > 2000) {
          discount = Math.round(subTotal * 0.15);
          discountType = 'Big Shopper 15% OFF';
        } else {
          return res.json({ 
            success: false, 
            message: 'Minimum cart value ₹2000 required for this coupon' 
          });
        }
        break;
        
      default:
        return res.json({ 
          success: false, 
          message: 'Invalid coupon code. Use FIRST10 or BIG15' 
        });
    }
    
    res.json({ 
      success: true, 
      discount,
      discountType,
      message: `Coupon applied successfully! Save ₹${discount}`
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});


// Example Express.js endpoint

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

router.post('/create-razorpay-order', async (req, res) => {
  try {
    await connectDB();
    const { amount, currency, receipt } = req.body;
    
    const options = {
      amount: amount, // amount in paise
      currency: currency || 'INR',
      receipt: receipt || `receipt_${Date.now()}`
    };
    
    const order = await razorpay.orders.create(options);
    
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
