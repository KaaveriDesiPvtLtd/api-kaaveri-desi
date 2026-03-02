const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.API_ENCRYPTION_KEY; 
const IV = process.env.API_ENCRYPTION_IV;
const ALGORITHM = 'aes-256-cbc';

function encrypt(text) {
    if (!text) return text;
    try {
        const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), Buffer.from(IV));
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return encrypted.toString('base64');
    } catch (error) {
        console.error('Encryption failed:', error.message);
        return null;
    }
}

function decrypt(text) {
    if (!text) return text;
    try {
        console.log(`[CRYPTO] Attempting to decrypt payload of length ${text.length}`);
        if (!ENCRYPTION_KEY || !IV) {
            console.error('[CRYPTO] Missing encryption key or IV');
            return null;
        }
        const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), Buffer.from(IV));
        let decrypted = decipher.update(Buffer.from(text, 'base64'));
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (error) {
        console.error('[CRYPTO] Decryption failed:', error.message);
        return null;
    }
}

module.exports = { encrypt, decrypt };
