import mongoose from "mongoose";
import * as dotenv from "dotenv";
dotenv.config();

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

async function connect() {
  if (mongoose.connection?.readyState === 1) {
    return mongoose;
  }

  if (cached.conn && cached.conn.connection?.readyState === 1) {
    return cached.conn;
  }

  if (!cached.promise) {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      const err = new Error("MONGODB_URI is not defined in environment variables. Please configure it in your Vercel Project Settings.");
      console.error(err.message);
      throw err;
    }

    const opts = {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 10000,
      maxPoolSize: 10,
      maxIdleTimeMS: 60000,
    };

    cached.promise = mongoose.connect(mongoUri, opts).then((mongooseInstance) => {
      return mongooseInstance;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e) {
    cached.promise = null;
    console.error("Failed to connect to MongoDB:", e.message || e);
    throw e;
  }

  return cached.conn;
}

export { mongoose, connect };
