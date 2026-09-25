import { connect } from "./app/config/db.server.js";
import { User } from "./app/models/user.server.js";
import { Rota } from "./app/models/rota.server.js";

async function main() {
  await connect();

  const user = await User.findOne({
    $or: [
      { firstName: { $regex: /mehran/i } },
      { lastName: { $regex: /javed/i } },
    ]
  }).lean();

  const rotas = await Rota.find({
    $or: [{ employee: user._id }, { assignedTo: user._id }],
    deleted: false
  }).sort({ date: 1, startTime: 1 }).lean();

  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  console.log(`Total active rotas for ${user.firstName} ${user.lastName}: ${rotas.length}`);

  const summary = rotas.map(r => {
    const dt = new Date(new Date(r.date || r.start).getTime() + 12 * 3600 * 1000);
    const dayName = daysOfWeek[dt.getUTCDay()];
    const dateStr = dt.toISOString().split("T")[0];
    return {
      id: r._id.toString(),
      dateStr,
      dayName,
      time: `${r.startTime} - ${r.endTime}`,
      assignedToName: r.assignedToName,
      description: r.description.substring(0, 70) + "..."
    };
  });

  console.log("=== SUMMARY BY DATE ===");
  console.log(JSON.stringify(summary, null, 2));

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
