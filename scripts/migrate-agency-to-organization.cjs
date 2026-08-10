const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env"), override: true });

async function runMigration() {
  if (!process.env.MONGODB_URI) {
    console.error("No MONGODB_URI found in .env");
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    const db = mongoose.connection.db;

    // 1. Rename the `agencies` collection to `organizations` (if it exists)
    const collections = await db.listCollections().toArray();
    const hasAgencies = collections.some((c) => c.name === "agencies");
    if (hasAgencies) {
      console.log("Renaming collection 'agencies' to 'organizations'...");
      await db.collection("agencies").rename("organizations");
    } else {
      console.log("Collection 'agencies' not found, maybe already renamed?");
    }

    // 2. Rename `agencyId` field to `organizationId` in all relevant collections
    const collectionsToUpdate = [
      "users",
      "properties",
      "tenancies",
      "rentpayments",
      "rotas",
      "plannedmaintenanceschedules",
      "obligations",
      "notes",
      "maintenancelogs",
      "maintenancejobs",
      "documents"
    ];

    for (const collName of collectionsToUpdate) {
      const exists = collections.some((c) => c.name === collName);
      if (exists) {
        console.log(`Updating ${collName}...`);
        const result = await db.collection(collName).updateMany(
          { agencyId: { $exists: true } },
          { $rename: { agencyId: "organizationId" } }
        );
        console.log(` - Modified ${result.modifiedCount} documents in ${collName}`);
      }
    }

    console.log("Migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  }
}

runMigration();
