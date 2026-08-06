// routes/api/maintenance/run-cron.jsx
// Cron-triggered API endpoint to automatically generate recurring maintenance jobs.
// Can be hit by system scheduler (e.g. GitHub Actions, AWS EventBridge, Vercel Cron).

import { connect } from "../../../config/db.server.js";
import { generatePlannedMaintenanceJobs } from "../../../utils/maintenance.server.js";

const jsonResponse = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export async function loader({ request }) {
  // Optional security token check
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && token !== cronSecret) {
    return jsonResponse({ error: "Unauthorized access token" }, 401);
  }

  try {
    await connect();
    const result = await generatePlannedMaintenanceJobs();
    return jsonResponse({
      success: true,
      message: "Cron generation run completed successfully.",
      ...result,
    });
  } catch (error) {
    console.error("Cron generation run failed:", error);
    return jsonResponse({ error: "Internal server error: " + error.message }, 500);
  }
}

export async function action({ request }) {
  // Accept POST triggers too
  return loader({ request });
}
