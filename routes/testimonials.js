const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const connectDB = require('../lib/db');

const getTestimonialModel = async () => {
    await connectDB();
    return mongoose.model("Testimonial");
};

// Get all testimonials
router.get('/api/testimonials', async (req, res) => {
  try {
    const Testimonial = await getTestimonialModel();
    const testimonials = await Testimonial.find().sort({ createdAt: -1 });
    
    // JIT Migration: Fix local image paths on the fly if they exist
    let needsSave = false;
    for (const t of testimonials) {
      if (t.image && !t.image.startsWith('http')) {
        const fallbackId = t.name ? t.name.replace(/\s+/g, '') : t._id;
        t.image = `https://i.pravatar.cc/300?u=${encodeURIComponent(fallbackId)}`;
        await t.save();
        needsSave = true;
      }
    }

    res.json(testimonials);
  } catch (err) {
    console.error('Error fetching testimonials:', err);
    res.status(500).json({ error: "Failed to fetch testimonials" });
  }
});

module.exports = router;
