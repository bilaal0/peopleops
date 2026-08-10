const mongoose = require("mongoose");
require("dotenv").config({ path: require("path").join(__dirname, "../.env"), override: true });

async function check() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const users = await db.collection("users").find({ roles: "SUPER_ADMIN" }).toArray();
    console.log("SUPER ADMIN USERS:");
    users.forEach(u => {
      console.log(`- ${u.email} : ${u.roles}`);
    });
    
    // Let's also check if there's an ADMIN user who might think they are SUPER_ADMIN
    const allUsers = await db.collection("users").find({}).limit(5).toArray();
    console.log("\nSAMPLE USERS:");
    allUsers.forEach(u => {
      console.log(`- ${u.email} : ${u.roles}`);
    });

    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
check();
