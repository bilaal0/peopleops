import "dotenv/config";
import mongoose from "mongoose";
import { connect } from "../app/config/db.server.js";
import { Property } from "../app/models/property.server.js";
import { User } from "../app/models/user.server.js";
import { Tenancy } from "../app/models/tenancy.server.js";
import { MaintenanceJob } from "../app/models/MaintenanceJob.server.js";
import { RentPayment } from "../app/models/rentPayment.server.js";
import { Document } from "../app/models/document.server.js";
import { DocumentType } from "../app/models/documentType.server.js";
import { Note } from "../app/models/note.server.js";
import { buildS3Key, uploadToS3 } from "../app/utils/s3.server.js";

const AGENCY_ID = "6a297429dc0c8765055d603f";
const SUPER_ADMIN_ID = "6a297428dc0c8765055d603d"; // assuming from previous inspect

const HOUSE_IMAGES = [
  "https://images.unsplash.com/photo-1504615755583-2916b52192a3?auto=format&fit=crop&w=800&q=80", // Suburban UK house
  "https://images.unsplash.com/photo-1469047616593-20bed1f1217a?auto=format&fit=crop&w=800&q=80", // London Flat
  "https://images.unsplash.com/photo-1547638599-d4bf222cf5d1?auto=format&fit=crop&w=800&q=80", // UK brick
  "https://images.unsplash.com/photo-1618660920685-4505debb785a?auto=format&fit=crop&w=800&q=80"  // UK Terraced
];

async function downloadImageToBuffer(url) {
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function uploadUnsplashToS3(url, entityId, type) {
  try {
    const buffer = await downloadImageToBuffer(url);
    const s3Key = buildS3Key(AGENCY_ID, "property", entityId, type, "photo.jpg");
    await uploadToS3(buffer, s3Key, "image/jpeg");
    return s3Key;
  } catch (err) {
    console.error("Failed to upload image to S3", err);
    return null;
  }
}

async function run() {
  await connect();
  console.log("Connected to DB. Starting demo seed...");

  // 1. CLEAR OLD TENANCIES, RENTS, MAINTENANCE FOR THIS AGENCY TO AVOID DUPLICATES
  await Tenancy.deleteMany({ agencyId: AGENCY_ID });
  await RentPayment.deleteMany({ agencyId: AGENCY_ID });
  await MaintenanceJob.deleteMany({ agencyId: AGENCY_ID });
  await Note.deleteMany({ agencyId: AGENCY_ID, isSystem: true });
  // Keep documents but clear certificates? Let's just clear compliance docs
  await Document.deleteMany({ agencyId: AGENCY_ID, entityType: "property" });

  // 2. GET OR CREATE LANDLORDS & TENANTS
  let landlords = await User.find({ agencyId: AGENCY_ID, roles: "LANDLORD" }).lean();
  if (landlords.length === 0) {
    const newLl = await User.create({
      agencyId: AGENCY_ID,
      email: "oliver.smith@example.com",
      firstName: "Oliver",
      lastName: "Smith",
      roles: ["LANDLORD"],
      landlordData: { amlResult: "pass" },
    });
    landlords = [newLl];
  }

  let tenants = await User.find({ agencyId: AGENCY_ID, roles: "TENANT" }).lean();
  while (tenants.length < 4) {
    const newT = await User.create({
      agencyId: AGENCY_ID,
      email: `tenant${tenants.length + 1}@example.com`,
      firstName: ["Charlotte", "George", "Mia", "Harry"][tenants.length] || "Demo",
      lastName: ["Jones", "Taylor", "Davies", "Evans"][tenants.length] || "Tenant",
      roles: ["TENANT"],
      tenantData: { rightToRentStatus: "pass" }
    });
    tenants.push(newT);
  }

  // 3. PREPARE PROPERTIES
  let properties = await Property.find({ agencyId: AGENCY_ID });
  while (properties.length < 4) {
    const prop = new Property({
      agencyId: AGENCY_ID,
      landlordId: landlords[0]._id,
      addressLine1: `New Property ${properties.length + 1}`,
      city: "Manchester",
      postcode: "M1 1DZ",
      createdBy: SUPER_ADMIN_ID
    });
    await prop.save();
    properties.push(prop);
  }

  const now = new Date();
  
  // SCENARIO 1: HMO Compliance Nightmare
  const p1 = properties[0];
  p1.propertyType = "hmo";
  p1.status = "let";
  p1.addressLine1 = "12 Victoria Road (HMO)";
  p1.bedrooms = 6;
  p1.hmoLicenceNo = "HMO-12345";
  p1.hmoLicenceExpiry = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000); // Expires in 5 days
  p1.epcRating = "C";
  p1.epcExpiryDate = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
  console.log("Uploading image for Prop 1...");
  p1.mainImage = await uploadUnsplashToS3(HOUSE_IMAGES[0], p1._id.toString(), "main_image") || p1.mainImage;
  await p1.save();

  // Create an expired Gas Safety for p1
  const gasSafetyType = await DocumentType.findOne({ key: "gas_safety_certificate" });
  if (gasSafetyType) {
    await Document.create({
      agencyId: AGENCY_ID,
      entityType: "property",
      entityId: p1._id,
      docType: gasSafetyType._id,
      fileName: "Old_Gas_Safety.pdf",
      s3Key: "dummy-key",
      uploadedBy: SUPER_ADMIN_ID,
      issueDate: new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000),
      expiryDate: new Date(now.getTime() - 35 * 24 * 60 * 60 * 1000), // Expired 35 days ago
    });
  }

  // SCENARIO 2: Arrears Risk
  const p2 = properties[1];
  p2.propertyType = "flat";
  p2.status = "let";
  p2.addressLine1 = "Apt 4B, The Hub";
  p2.bedrooms = 2;
  p2.epcRating = "B";
  p2.epcExpiryDate = new Date(now.getTime() + 500 * 24 * 60 * 60 * 1000);
  console.log("Uploading image for Prop 2...");
  p2.mainImage = await uploadUnsplashToS3(HOUSE_IMAGES[1], p2._id.toString(), "main_image") || p2.mainImage;
  await p2.save();

  // SCENARIO 3: Maintenance Headache
  const p3 = properties[2];
  p3.propertyType = "terraced";
  p3.status = "let";
  p3.addressLine1 = "88 Coronation Street";
  p3.bedrooms = 3;
  p3.epcRating = "D";
  p3.epcExpiryDate = new Date(now.getTime() + 200 * 24 * 60 * 60 * 1000);
  console.log("Uploading image for Prop 3...");
  p3.mainImage = await uploadUnsplashToS3(HOUSE_IMAGES[2], p3._id.toString(), "main_image") || p3.mainImage;
  await p3.save();

  // SCENARIO 4: Void Period
  const p4 = properties[3];
  p4.propertyType = "detached";
  p4.status = "available";
  p4.addressLine1 = "1 The Grange";
  p4.bedrooms = 4;
  p4.epcRating = "F"; // MEES failure
  p4.epcExemption = false;
  p4.epcExpiryDate = new Date(now.getTime() + 100 * 24 * 60 * 60 * 1000);
  console.log("Uploading image for Prop 4...");
  p4.mainImage = await uploadUnsplashToS3(HOUSE_IMAGES[3], p4._id.toString(), "main_image") || p4.mainImage;
  await p4.save();

  // 4. CREATE TENANCIES & RENT PAYMENTS
  const t1Start = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000); // 6 months ago
  const t1 = await Tenancy.create({
    agencyId: AGENCY_ID,
    propertyId: p1._id,
    landlordId: p1.landlordId,
    tenantIds: [tenants[0]._id, tenants[1]._id],
    status: "active",
    tenancyType: "ast",
    rent: {
      amount: 3000,
      frequency: "monthly",
      dueDate: 1
    },
    startDate: t1Start,
    endDate: new Date(t1Start.getTime() + 365 * 24 * 60 * 60 * 1000),
    createdBy: SUPER_ADMIN_ID
  });

  const t2Start = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000); // 3 months ago
  const t2 = await Tenancy.create({
    agencyId: AGENCY_ID,
    propertyId: p2._id,
    landlordId: p2.landlordId,
    tenantIds: [tenants[2]._id],
    status: "active",
    tenancyType: "ast",
    rent: {
      amount: 1200,
      frequency: "monthly",
      dueDate: 1
    },
    startDate: t2Start,
    endDate: new Date(t2Start.getTime() + 365 * 24 * 60 * 60 * 1000),
    createdBy: SUPER_ADMIN_ID
  });

  // T2 Rent Payments (Arrears scenario)
  // Month 1: Paid
  await RentPayment.create({
    agencyId: AGENCY_ID,
    propertyId: p2._id,
    landlordId: p2.landlordId,
    tenancyId: t2._id,
    amountDue: 1200,
    amountPaid: 1200,
    dueDate: new Date(now.getFullYear(), now.getMonth() - 2, 1),
    periodStart: new Date(now.getFullYear(), now.getMonth() - 2, 1),
    periodEnd: new Date(now.getFullYear(), now.getMonth() - 1, 0),
    paidDate: new Date(now.getFullYear(), now.getMonth() - 2, 3),
    status: "paid",
    reference: "RENT-M1"
  });
  // Month 2: Partial
  await RentPayment.create({
    agencyId: AGENCY_ID,
    propertyId: p2._id,
    landlordId: p2.landlordId,
    tenancyId: t2._id,
    amountDue: 1200,
    amountPaid: 600,
    dueDate: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    periodStart: new Date(now.getFullYear(), now.getMonth() - 1, 1),
    periodEnd: new Date(now.getFullYear(), now.getMonth(), 0),
    paidDate: new Date(now.getFullYear(), now.getMonth() - 1, 5),
    status: "partial",
    reference: "RENT-M2"
  });
  // Month 3 (Current): Overdue
  await RentPayment.create({
    agencyId: AGENCY_ID,
    propertyId: p2._id,
    landlordId: p2.landlordId,
    tenancyId: t2._id,
    amountDue: 1200,
    amountPaid: 0,
    dueDate: new Date(now.getFullYear(), now.getMonth(), 1),
    periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
    periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    status: "overdue",
    reference: "RENT-M3"
  });

  const t3Start = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000); // 2 months ago
  const t3 = await Tenancy.create({
    agencyId: AGENCY_ID,
    propertyId: p3._id,
    landlordId: p3.landlordId,
    tenantIds: [tenants[3]._id],
    status: "active",
    tenancyType: "ast",
    rent: {
      amount: 950,
      frequency: "monthly",
      dueDate: 1
    },
    startDate: t3Start,
    endDate: new Date(t3Start.getTime() + 365 * 24 * 60 * 60 * 1000),
    createdBy: SUPER_ADMIN_ID
  });
  // T3 Rent: Paid
  await RentPayment.create({
    agencyId: AGENCY_ID,
    propertyId: p3._id,
    landlordId: p3.landlordId,
    tenancyId: t3._id,
    amountDue: 950,
    amountPaid: 950,
    dueDate: new Date(now.getFullYear(), now.getMonth(), 1),
    periodStart: new Date(now.getFullYear(), now.getMonth(), 1),
    periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0),
    paidDate: new Date(now.getFullYear(), now.getMonth(), 1),
    status: "paid",
    reference: "RENT-T3-M1"
  });

  // 5. MAINTENANCE TICKETS
  await MaintenanceJob.create({
    agencyId: AGENCY_ID,
    jobRef: "MJ-1001",
    propertyId: p3._id,
    landlordId: p3.landlordId,
    tenancyId: t3._id,
    reportedByUserId: tenants[3]._id,
    title: "Boiler losing pressure constantly",
    description: "Have to repressurise the boiler every day to get hot water.",
    category: "plumbing",
    priority: "urgent",
    status: "reported",
    reportedDate: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000), // 15 days ago (Overdue!)
    targetDate: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000),
    createdBy: SUPER_ADMIN_ID
  });

  await MaintenanceJob.create({
    agencyId: AGENCY_ID,
    jobRef: "MJ-1002",
    propertyId: p3._id,
    landlordId: p3.landlordId,
    tenancyId: t3._id,
    reportedByUserId: tenants[3]._id,
    title: "Dripping tap in kitchen",
    description: "The cold tap is dripping constantly.",
    category: "plumbing",
    priority: "routine",
    status: "in_progress",
    reportedDate: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
    targetDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
    createdBy: SUPER_ADMIN_ID
  });

  // 6. ACTIVITY LOGS (using Note)
  await Note.create({
    agencyId: AGENCY_ID,
    entityType: "tenancy",
    entityId: t2._id,
    addedBy: tenants[2]._id,
    eventType: "rent_payment_partial",
    text: "Partial rent payment received. £600 received for Apt 4B. £600 remaining.",
    isSystem: true,
    metadata: { amount: 600 },
    createdAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000)
  });

  await Note.create({
    agencyId: AGENCY_ID,
    entityType: "property",
    entityId: p3._id,
    addedBy: tenants[3]._id,
    eventType: "maintenance_job_created",
    text: "Maintenance reported: Boiler losing pressure constantly at 88 Coronation Street",
    isSystem: true,
    createdAt: new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000)
  });

  console.log("Demo seed complete! Dashboard is ready.");
  process.exit(0);
}
run().catch(console.error);
