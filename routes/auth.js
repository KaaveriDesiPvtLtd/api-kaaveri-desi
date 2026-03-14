const express = require("express");
const mongoose = require("mongoose");
const connectDB = require("../lib/db");
const router = express.Router()

const bcryptjs = require('bcryptjs');
const jwt = require("jsonwebtoken")


const TEACHER = mongoose.model("USER");
const Jwt_secret = process.env.JWT_SECRET;






const OTP_JWT_SECRET = process.env.OTP_JWT_SECRET || 'otp-fallback-secret';

router.post("/signup" , async (req,res, next)=> {
    try {
        await connectDB();
        const {name , password , email, phone, otpVerificationToken} = req.body;

        console.log("[DEBUG] Signup Request body keys:", Object.keys(req.body));
        if(!name ||!password ||!email || !phone){
            return res.status(422).json({error : "Please fill all required fields."})
        }

        // Verify OTP verification token
        if (!otpVerificationToken) {
            return res.status(403).json({ error: "OTP verification is required before signup." });
        }

        try {
            const decoded = jwt.verify(otpVerificationToken, OTP_JWT_SECRET);
            if (!decoded.verified || decoded.email !== email.toLowerCase()) {
                return res.status(403).json({ error: "Invalid OTP verification. Please verify your email again." });
            }
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(403).json({ error: "OTP verification has expired. Please verify again." });
            }
            return res.status(403).json({ error: "Invalid OTP verification token." });
        }

        // Use case-insensitive regex for email lookup
        const savedUser = await TEACHER.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
        if(savedUser){
            return res.status(422).json({error : "User already exists with that Email."})
        }

        const hashedPassword = await bcryptjs.hash(password , 12);
        // Generate a unique userid
        const userid = `KD-${Date.now()}${Math.random().toString(36).substring(2, 5)}`.toUpperCase();

        const teacher = new TEACHER ({
            name , 
            email,
            phone,
            password:hashedPassword, //hiding password,
            userid: userid
        });
    
        await teacher.save();
        return res.json({message : "Account created successfully."});

    } catch (err) {
        console.error("[ERROR] during signup:", err);
        next(err);
    }
})



router.post("/signin" , async (req , res, next) => {
    try {
        await connectDB();
        const {email , password} = req.body;

        if(!email || !password){
            console.log(`[DEBUG] Signin Failed: Missing fields. Body keys:`, Object.keys(req.body));
            return res.status(422).json({error: "Please provide both email and password."})
        }

        // Use case-insensitive regex for email lookup
        const savedUser = await TEACHER.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
        if(!savedUser){
            console.log(`[DEBUG] Signin Failed: User not found for email:`, email);
            return res.status(422).json({error:"Invalid Email or Password."})
        }

        const match = await bcryptjs.compare(password , savedUser.password);
        if(match){
            console.log(`[DEBUG] Signin Success for:`, email);
            const token = jwt.sign({_id:savedUser.id} , Jwt_secret)
            const {_id ,name , email: userEmail, userid} = savedUser
            return res.json({token , user:{_id ,name , email: userEmail, userid }})
        } else {
            console.log(`[DEBUG] Signin Failed: Password mismatch for:`, email);
            return res.status(422).json({error :"Invalid Email or Password." })
        }
    } catch (err) {
        console.error("[ERROR] during signin:", err);
        next(err);
    }
})

// Forgot Password - Reset Password endpoint
router.post('/reset-password', async (req, res, next) => {
    try {
        await connectDB();
        const { email, password, otpVerificationToken } = req.body;

        if (!email || !password || !otpVerificationToken) {
            return res.status(422).json({ error: "Please provide email, new password, and verification token." });
        }

        // Verify the token
        try {
            const decoded = jwt.verify(otpVerificationToken, OTP_JWT_SECRET);
            if (!decoded.verified || decoded.email !== email.toLowerCase()) {
                return res.status(403).json({ error: "Invalid verification token. Please verify your OTP again." });
            }
        } catch (err) {
            if (err.name === 'TokenExpiredError') {
                return res.status(403).json({ error: "Verification token has expired. Please verify OTP again." });
            }
            return res.status(403).json({ error: "Invalid verification token." });
        }

        // Find user by email (case-insensitive)
        const user = await TEACHER.findOne({ email: { $regex: new RegExp(`^${email}$`, 'i') } });
        if (!user) {
            return res.status(404).json({ error: "User not found with this email." });
        }

        // Hash the new password
        const hashedPassword = await bcryptjs.hash(password, 12);
        
        // Update user's password
        user.password = hashedPassword;
        await user.save();

        console.log(`[DEBUG] Password reset successful for:`, email);
        return res.json({ message: "Password updated successfully. You can now sign in with your new password." });

    } catch (err) {
        console.error("[ERROR] during password reset:", err);
        next(err);
    }
});
















































module.exports = router;