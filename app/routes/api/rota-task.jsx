import { data } from "react-router";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { connect } from "../../config/db.server.js";
import { Rota } from "../../models/rota.server.js";

export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return data({ error: "Unauthorized" }, { status: 401 });
  }

  await connect();
  const formData = await request.formData();
  const rotaId = formData.get("rotaId");
  const taskStatus = formData.get("taskStatus"); // "completed" | "not_completed" | "pending"
  const taskNotes = (formData.get("taskNotes") || "").toString().trim();
  const taskReasonIfNotDone = (formData.get("taskReasonIfNotDone") || "").toString().trim();

  if (!rotaId) {
    return data({ error: "Rota Task ID is required." }, { status: 400 });
  }

  if (!taskStatus || !["completed", "not_completed", "pending"].includes(taskStatus)) {
    return data({ error: "Invalid task status." }, { status: 400 });
  }

  if (taskStatus === "not_completed" && !taskReasonIfNotDone) {
    return data(
      { error: "Please provide a reason explaining why the task was not completed." },
      { status: 400 }
    );
  }

  const rota = await Rota.findById(rotaId);
  if (!rota || rota.deleted) {
    return data({ error: "Rota task not found." }, { status: 404 });
  }

  // Ensure only assigned staff or admin/manager in the same organization can update
  const isSuperAdmin = user.roles?.includes("SUPER_ADMIN");
  const isOrgAdmin = user.roles?.includes("ADMIN") || user.roles?.includes("REGISTERED_MANAGER");
  const isAssignedStaff = rota.employee?.toString() === user.userId?.toString();

  if (!isSuperAdmin && !isAssignedStaff && !isOrgAdmin) {
    return data({ error: "You are not authorized to update this task." }, { status: 403 });
  }

  rota.taskStatus = taskStatus;
  rota.taskNotes = taskNotes;
  rota.taskReasonIfNotDone = taskStatus === "not_completed" ? taskReasonIfNotDone : "";
  rota.taskUpdatedAt = new Date();
  rota.taskUpdatedBy = user.userId;

  await rota.save();

  return data({
    success: true,
    message: "Task status updated successfully.",
    task: {
      id: rota._id.toString(),
      taskStatus: rota.taskStatus,
      taskNotes: rota.taskNotes,
      taskReasonIfNotDone: rota.taskReasonIfNotDone,
      taskUpdatedAt: rota.taskUpdatedAt,
    },
  });
}
