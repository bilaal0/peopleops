import "dotenv/config";
import { connect } from "../app/config/db.server.js";
import { Property } from "../app/models/property.server.js";
import { User } from "../app/models/user.server.js";
import { Tenancy } from "../app/models/tenancy.server.js";
import { MaintenanceJob } from "../app/models/MaintenanceJob.server.js";
import { Document } from "../app/models/document.server.js";

async function run() {
  await connect();
  const agencyId = "6a297429dc0c8765055d603f";
  const props = await Property.find({ agencyId }).lean();
  console.log(props.length, "properties found");
  console.log(JSON.stringify(props, null, 2));
  process.exit(0);
}
run().catch(console.error);
