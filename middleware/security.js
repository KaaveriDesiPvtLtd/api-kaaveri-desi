const { encrypt, decrypt } = require('../utils/crypto-utils');

const securityMiddleware = (req, res, next) => {
    // Exempt certain routes from encryption/decryption
    if (req.path === '/allproducts' || 
        req.path.startsWith('/product/') ||
        req.path === '/api/testimonials' || 
        req.path.startsWith('/api/crm')) {
        return next();
    }

    // 1. Decrypt Request Body
    if (req.body && req.body.encryptedData) {
        console.log(`[SECURITY] Attempting decryption...`);
        try {
            const decryptedString = decrypt(req.body.encryptedData);
            if (decryptedString) {
                console.log(`[SECURITY] Decryption successful.`);
                req.body = JSON.parse(decryptedString);
            } else {
                console.log(`[SECURITY] Decryption returned null.`);
            }
        } catch (error) {
            console.error('Security Middleware: Decryption failed for request', error.message);
            return res.status(400).json({ 
                success: false, 
                message: 'Invalid encrypted payload' 
            });
        }
    }

    // 2. Encrypt Response Body
    const originalJson = res.json;
    const originalSend = res.send;

    res.json = function (data) {
        if (data && !data.encryptedData && typeof data === 'object') {
            const encryptedStr = encrypt(JSON.stringify(data));
            if (encryptedStr) {
                return originalJson.call(this, { encryptedData: encryptedStr });
            }
        }
        return originalJson.call(this, data);
    };

    res.send = function (data) {
        // If it's already a string and looks like JSON, we might want to encrypt it
        // But res.json is usually used for our API responses.
        // If data is a buffer or something else, we let it through unencrypted.
        if (typeof data === 'string' && !data.includes('encryptedData')) {
            try {
                // Check if it's JSON string
                JSON.parse(data);
                const encryptedStr = encrypt(data);
                return originalSend.call(this, JSON.stringify({ encryptedData: encryptedStr }));
            } catch (e) {
                // Not JSON, send as is
            }
        }
        return originalSend.call(this, data);
    };

    next();
};

module.exports = securityMiddleware;
