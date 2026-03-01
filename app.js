require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');



const port = 5000;
const app = express();

app.use(cors())
require('./model/user')
require('./model/Order')
require('./model/Review')
require('./model/Testimonial')
require('./model/Product')
require('./model/Settings')


// Middleware for request logging
app.use((req, res, next) => {
    console.log(`[DEBUG] ${req.method} ${req.path}`);
    next();
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(require('./middleware/security'));
app.use('/otp', require('./routes/otpRoutes'));
app.use(require('./routes/auth'))
app.use(require('./routes/features'))
app.use(require('./routes/order'))
app.use(require('./routes/admin'))
app.use(require('./routes/reviews'))
app.use(require('./routes/testimonials'))
app.use(require('./routes/products'))
app.use('/api/crm/auth', require('./routes/crmAuthRoutes'))
app.use('/api/crm', require('./routes/crmRoutes'))

// Debug endpoint to list all registered routes
app.get('/api/debug/routes', (req, res) => {
    const routes = [];
    app._router.stack.forEach((middleware) => {
        if (middleware.route) { // routes registered directly on the app
            routes.push(`${Object.keys(middleware.route.methods).join(', ').toUpperCase()} ${middleware.route.path}`);
        } else if (middleware.name === 'router') { // router middleware
            middleware.handle.stack.forEach((handler) => {
                if (handler.route) {
                    const path = handler.route.path;
                    const methods = Object.keys(handler.route.methods).join(', ').toUpperCase();
                    routes.push(`${methods} ${middleware.regexp.toString().replace('/^', '').replace('(?=\\/|$)/i', '')}${path}`);
                }
            });
        }
    });
    res.json({ count: routes.length, routes });
});

// 404 Handler
app.use((req, res) => {
    res.status(404).json({ error: "Route not found" });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ 
        error: "Internal Server Error",
        message: "An unexpected internal server error occurred.",
        path: req.path
    });
});

const serverless = require('serverless-http');

// ... (middleware and routes remain the same) ...

// Seeding and media conversion logic (REMOVED from global scope for serverless efficiency)
// This logic should ideally be triggered by a specific admin route or script.

module.exports = serverless(app);

// For local development
if (process.env.NODE_ENV !== 'production' && require.main === module) {
  const PORT = process.env.PORT || 8000;
  app.listen(PORT, () => {
    console.log(`Server is running locally on port ${PORT}`);
  });
}
module.exports.app = app; // Export for local testing if needed




