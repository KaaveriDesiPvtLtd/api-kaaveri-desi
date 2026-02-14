// routes/reviews.js
const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
// const Review = require('Review');
const Review = mongoose.model("Review");

// POST route - Add review for a specific product (productId from URL)
router.post('/reviews/:productId', async (req, res) => {
    try {
        const { productId } = req.params;  // Get productId from URL
        const { userName, userEmail, rating, comment } = req.body;
        
        // Validation
        if (!userName || !userEmail || !rating || !comment) {
            return res.status(400).json({
                success: false,
                message: 'All fields are required (userName, userEmail, rating, comment)'
            });
        }
        
        // Validate rating range
        if (rating < 1 || rating > 5) {
            return res.status(400).json({
                success: false,
                message: 'Rating must be between 1 and 5'
            });
        }
        
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(userEmail)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }
        
        // Create new review
        const newReview = await Review.create({
            productId,
            userName,
            userEmail,
            rating,
            comment
        });
        
        res.status(201).json({
            success: true,
            message: 'Review added successfully',
            review: newReview
        });
        
    } catch (error) {
        console.error('Error adding review:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add review',
            error: error.message
        });
    }
});

// GET route - Get all reviews for a specific product
// router.get('/reviews/:productId', async (req, res) => {
//     try {
//         const { productId } = req.params;
        
//         const reviews = await Review.find({ productId })
//             .sort({ createdAt: -1 });
        
//         res.status(200).json({
//             success: true,
//             count: reviews.length,
//             reviews
//         });
        
//     } catch (error) {
//         res.status(500).json({
//             success: false,
//             message: 'Failed to fetch reviews',
//             error: error.message
//         });
//     }
// });


// routes/reviews.js
router.get('/reviews/:productId', async (req, res) => {
    try {
        const { productId } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 5;
        const skip = (page - 1) * limit;
        
        const reviews = await Review.find({ productId })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);
        
        const totalReviews = await Review.countDocuments({ productId });
        const totalPages = Math.ceil(totalReviews / limit);
        
        res.status(200).json({
            success: true,
            reviews,
            pagination: {
                currentPage: page,
                totalPages,
                totalReviews,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch reviews',
            error: error.message
        });
    }
});


module.exports = router;
