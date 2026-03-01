const mongoose = require("mongoose");

const MONGO_URI = process.env.MONGO_URL; // Using existing variable name from app.js

if (!MONGO_URI) {
  throw new Error("Please define the MONGO_URL environment variable");
}

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development and across function invocations in serverless environments.
 */
let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
    };

    cached.promise = mongoose.connect(MONGO_URI, opts).then((mongoose) => {
      return mongoose;
    });
  }
  
  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

module.exports = connectDB;
