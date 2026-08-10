const mongoose = require("mongoose");
const uri1 = "mongodb+srv://bilalhofficial7_db_user:HHnO3dq9Q9iEJugO@cluster0.d4ld55k.mongodb.net/?appName=Cluster0";
const uri2 = "mongodb+srv://propletofficial_db_user:XLrKkQnkoHI9IpT9@proplet.nzawfz3.mongodb.net/?appName=proplet";

async function test(uri, name) {
    try {
        console.log(`Testing ${name}...`);
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
        console.log(`${name} CONNECTED!`);
        await mongoose.disconnect();
    } catch(e) {
        console.log(`${name} FAILED:`, e.message);
    }
}

async function run() {
    await test(uri1, "Localhost URI");
    await test(uri2, "Real Mongodb URI");
    process.exit(0);
}
run();
