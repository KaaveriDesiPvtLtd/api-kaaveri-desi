require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./lib/db');

const app = express();

/* ==============================
   MIDDLEWARE
============================== */

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(require('./middleware/security'));

/* ==============================
   DATABASE CONNECTION (CRITICAL)
   This runs BEFORE routes
============================== */

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("Database connection failed:", err);
    return res.status(500).json({
      error: "Database connection failed"
    });
  }
});

/* ==============================
   MODELS (Keep if required)
============================== */

require('./model/user');
require('./model/Order');
require('./model/Review');
require('./model/Testimonial');
require('./model/Product');
require('./model/Settings');

/* ==============================
   ROUTES
============================== */

app.use('/otp', require('./routes/otpRoutes'));
app.use(require('./routes/auth'));
app.use(require('./routes/features'));
app.use(require('./routes/order'));
app.use(require('./routes/admin'));
app.use(require('./routes/reviews'));
app.use(require('./routes/testimonials'));
app.use(require('./routes/products'));
app.use('/api/crm/auth', require('./routes/crmAuthRoutes'));
app.use('/api/crm', require('./routes/crmRoutes'));

/* ==============================
   DEBUG ROUTE
============================== */

app.get('/api/debug/routes', (req, res) => {
  res.json({ message: "API working" });
});

/* ==============================
   404 HANDLER
============================== */

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

/* ==============================
   ERROR HANDLER
============================== */

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message
  });
});

/* ==============================
   EXPORT FOR VERCEL
============================== */

module.exports = app;

/* ==============================
   LOCAL SERVER (Only Local)
============================== */

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => {
    console.log(`Server running locally on port ${PORT}`);
  });
}