const express = require("express");
const mongoose = require("mongoose");
const router = express.Router()

const bcryptjs = require('bcryptjs');
const jwt = require("jsonwebtoken")


const TEACHER = mongoose.model("USER");
const Jwt_secret = process.env.JWT_SECRET;






router.post("/signup" , (req,res)=> {
    const {name , userName , password ,email} = req.body;
    // const ip = req.headers['cf-connecting-ip'] ||
    //             req.headers['x-real-ip'] ||
    //             req.headers['x-forwarded-for'] ||
    //             req.socket.remoteAddress || '' ;

    console.log("req.body ", req.body)
    if(!name ||!userName ||!password ||!email){
        return res.status(422).json({error : "Please add all the fields"})
    }

    TEACHER.findOne({$or : [{email : email} , {userName: userName}]}).then((savedUser) => {
        if(savedUser){
            return res.status(422).json({error : "user already exist with that email or userName"})
        }


        bcryptjs.hash(password , 12).then((hashedPassword) => {
            // Generate a unique userid
            const userid = `KD-${Date.now()}${Math.random().toString(36).substring(2, 5)}`.toUpperCase();

            const teacher = new TEACHER ({
                name , 
                userName , 
                email,    
                password:hashedPassword, //hiding password,
                userid: userid
                // ip
            })
        
            teacher.save()
            .then(teacher => {res.json({message : "Data Saved"})})
            .catch(err => {console.log(err)})
        })
    })
})



router.post("/signin" , (req , res) => {
    const {email , password} = req.body;

    if(!email || !password){
        return res.status(422).json({error: "please add all the fields"})
    }

    TEACHER.findOne({email:email}).then((savedUser) => {
        if(!savedUser){
            return res.status(422).json({error:"Invalid Email"})
        }
        bcryptjs.compare(password , savedUser.password).then((match) => {
            if(match){
                // return res.status(200).json({message :"Signed In Successufully" })
                const token = jwt.sign({_id:savedUser.id} , Jwt_secret)
                const {_id ,name , email , userName, userid} = savedUser
                res.json({token , user:{_id ,name , email , userName, userid }})
                console.log({token , user:{_id ,name , email , userName, userid}})
            }else{
                return res.status(422).json({error :"Invalid password" })
            }
        })
        .catch(err => console.log(err))
        // console.log(savedUser)
    })
})

















































module.exports = router;