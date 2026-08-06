import { connect } from './app/config/db.server.js';
import { Tenancy } from './app/models/tenancy.js';
import mongoose from 'mongoose';

async function run() {
  process.env.MONGODB_URI = "mongodb+srv://danish0003:6V4Dngh2B1o2iJqR@cluster0.hcdyq.mongodb.net/test?retryWrites=true&w=majority&appName=Cluster0";
  await connect();
  const t = await Tenancy.findOne().populate('landlordId').populate('propertyId').lean();
  console.log("t.landlordId:", JSON.stringify(t.landlordId));
  console.log("t.landlordId._id type:", typeof t.landlordId?._id);
  console.log("t.propertyId:", JSON.stringify(t.propertyId));
  process.exit(0);
}
run();
