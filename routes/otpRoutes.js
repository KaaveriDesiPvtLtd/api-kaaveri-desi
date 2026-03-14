const express = require('express');
const crypto = require('crypto');
const bcryptjs = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const connectDB = require('../lib/db');
const router = express.Router();

const OTP_JWT_SECRET = process.env.OTP_JWT_SECRET || 'otp-fallback-secret';

// ── In-memory OTP store ─────────────────────────────────────────────────────
// Key: email, Value: { hash, expiresAt, attempts, channel }
const otpStore = new Map();

// Rate limiting: key = email, value = { count, windowStart }
const rateLimitStore = new Map();
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const OTP_EXPIRY = 5 * 60 * 1000; // 5 minutes
const MAX_VERIFY_ATTEMPTS = 5;
const RESEND_COOLDOWN = 30 * 1000; // 30 seconds

// Track last send time for cooldown
const lastSendStore = new Map();

// ── Email transporter (Nodemailer + Gmail) ──────────────────────────────────
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });
};

// ── Twilio client ───────────────────────────────────────────────────────────
let twilioClient = null;
const getTwilioClient = () => {
  if (!twilioClient && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const generateOTP = () => {
  return crypto.randomInt(100000, 999999).toString();
};

const checkRateLimit = (email) => {
  const key = email.toLowerCase();
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW) {
    rateLimitStore.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false;
  }

  entry.count++;
  return true;
};

const checkCooldown = (email) => {
  const key = email.toLowerCase();
  const lastSend = lastSendStore.get(key);
  if (lastSend && Date.now() - lastSend < RESEND_COOLDOWN) {
    const remainingSec = Math.ceil((RESEND_COOLDOWN - (Date.now() - lastSend)) / 1000);
    return remainingSec;
  }
  return 0;
};

// ── Send email OTP ──────────────────────────────────────────────────────────
const sendEmailOTP = async (email, otp) => {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: `"KAAVERI देशी" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: 'Your Verification Code — KAAVERI देशी',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #fff; border-radius: 12px; border: 1px solid #eee;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #8B1F1F; font-size: 24px; margin: 0;">KAAVERI देशी</h1>
          <p style="color: #666; font-size: 14px;">Email Verification</p>
        </div>
        <div style="text-align: center; padding: 24px; background: #f9f9f9; border-radius: 8px; margin-bottom: 24px;">
          <p style="color: #333; font-size: 14px; margin: 0 0 12px;">Your verification code is:</p>
          <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #8B1F1F;">${otp}</div>
        </div>
        <p style="color: #999; font-size: 12px; text-align: center;">This code expires in 5 minutes. Do not share it with anyone.</p>
      </div>
    `,
  });
};

// ── Send SMS OTP ────────────────────────────────────────────────────────────
const sendSmsOTP = async (phone, otp) => {
  const client = getTwilioClient();
  if (!client) {
    throw new Error('SMS service not configured. Please contact support.');
  }
  await client.messages.create({
    body: `Your KAAVERI Desi verification code is: ${otp}. Valid for 5 minutes.`,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: phone,
  });
};

// ═════════════════════════════════════════════════════════════════════════════
// POST /otp/send
// Body: { email, phone?, channel: "email" | "sms" }
// ═════════════════════════════════════════════════════════════════════════════
router.post('/send', async (req, res) => {
  try {
    await connectDB();
    const { email, phone, channel = 'email' } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required.' });
    }

    if (channel === 'sms' && !phone) {
      return res.status(400).json({ error: 'Phone number is required for SMS OTP.' });
    }

    // NEW: Check if user exists before sending OTP for password reset/auth
    const mongoose = require('mongoose');
    // Ensure model is registered or explicitly access it
    const USER = mongoose.models.USER || require('../model/user');
    // Use case-insensitive regex for email lookup
    const existingUser = await USER.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
    
    if (!existingUser) {
        return res.status(404).json({ error: 'No account found with this email address.' });
    }

    // Rate limit check
    if (!checkRateLimit(email)) {
      return res.status(429).json({ error: 'Too many OTP requests. Please try again later.' });
    }

    // Cooldown check
    const cooldown = checkCooldown(email);
    if (cooldown > 0) {
      return res.status(429).json({ error: `Please wait ${cooldown} seconds before requesting a new OTP.`, cooldown });
    }

    // Generate OTP
    const otp = generateOTP();
    const hashedOtp = await bcryptjs.hash(otp, 10);

    // Store OTP
    otpStore.set(email.toLowerCase(), {
      hash: hashedOtp,
      expiresAt: Date.now() + OTP_EXPIRY,
      attempts: 0,
      channel,
    });

    lastSendStore.set(email.toLowerCase(), Date.now());

    // Send OTP
    if (channel === 'sms') {
      await sendSmsOTP(phone, otp);
    } else {
      await sendEmailOTP(email, otp);
    }

    console.log(`OTP sent via ${channel} to ${channel === 'sms' ? phone : email}`);

    res.json({
      success: true,
      message: `OTP sent to your ${channel === 'sms' ? 'mobile number' : 'email'}.`,
      expiresIn: OTP_EXPIRY / 1000,
    });
  } catch (error) {
    console.error('OTP send error:', error);
    res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /otp/verify
// Body: { email, otp }
// Returns: { success, verificationToken }
// ═════════════════════════════════════════════════════════════════════════════
router.post('/verify', async (req, res) => {
  try {
    await connectDB();
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and OTP are required.' });
    }

    const key = email.toLowerCase();
    const stored = otpStore.get(key);

    if (!stored) {
      return res.status(400).json({ error: 'No OTP found. Please request a new one.' });
    }

    // Check expiry
    if (Date.now() > stored.expiresAt) {
      otpStore.delete(key);
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    // Brute-force protection
    if (stored.attempts >= MAX_VERIFY_ATTEMPTS) {
      otpStore.delete(key);
      return res.status(429).json({ error: 'Too many failed attempts. Please request a new OTP.' });
    }

    stored.attempts++;

    // Verify OTP
    const isMatch = await bcryptjs.compare(otp, stored.hash);
    if (!isMatch) {
      const remaining = MAX_VERIFY_ATTEMPTS - stored.attempts;
      return res.status(400).json({
        error: `Invalid OTP. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`,
      });
    }

    // OTP verified — clean up and issue token
    otpStore.delete(key);

    const verificationToken = jwt.sign(
      { email: key, verified: true },
      OTP_JWT_SECRET,
      { expiresIn: '10m' }
    );

    res.json({
      success: true,
      message: 'OTP verified successfully.',
      verificationToken,
    });
  } catch (error) {
    console.error('OTP verify error:', error);
    res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

module.exports = router;
