// routes/obligations/log.jsx — Log an obligation declaration
import { Form, useActionData, useNavigation, useLoaderData } from "react-router-dom";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect } from "react-router";
import { logObligation } from "../../services/obligationEngine.server.js";
import { Obligation } from "../../models/obligation.server.js";
import { connect } from "../../config/db.server.js";

export async function loader({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  await connect();
  const obligation = await Obligation.findOne({
    _id: params.id,
    agencyId: user.agencyId,
  })
    .populate("obligationTypeId", "name legislation fineDescription fineMaxGbp stage")
    .populate("tenancyId", "startDate rentPcm propertyId")
    .lean();

  if (!obligation) return redirect("/compliance");
  return { obligation };
}

export async function action({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");

  const formData = await request.formData();
  const declarationText = String(formData.get("declarationText") || "").trim();

  if (!declarationText) return { error: "Please confirm the declaration before logging." };
  if (declarationText.length < 10) return { error: "Declaration must be at least 10 characters." };

  const ipAddress = request.headers.get("x-forwarded-for") || "unknown";

  await logObligation({
    obligationId: params.id,
    userId: user.userId,
    agencyId: user.agencyId,
    tenancyId: null, // populated from obligation
    declarationText,
    ipAddress,
  });

  return redirect("/compliance");
}

export default function LogObligation() {
  const { obligation } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const type = obligation.obligationTypeId;

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Log Obligation</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h2 className="font-semibold text-gray-900 text-lg">{type?.name}</h2>
        <p className="text-sm text-gray-500 mt-1">{type?.legislation}</p>
        {type?.fineMaxGbp && (
          <p className="text-sm text-red-600 mt-1">Max penalty: £{type.fineMaxGbp.toLocaleString("en-GB")}</p>
        )}
        {obligation.dueDate && (
          <p className={`text-sm mt-1 font-medium ${obligation.status === "overdue" ? "text-red-600" : "text-yellow-600"}`}>
            {obligation.status === "overdue" ? "Overdue since" : "Due"}: {new Date(obligation.dueDate).toLocaleDateString("en-GB")}
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        {actionData?.error && <p className="mb-4 text-sm text-red-600 bg-red-50 rounded-lg p-3">{actionData.error}</p>}
        <Form method="post" className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Declaration Statement
            </label>
            <textarea
              name="declarationText"
              rows={4}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder={`e.g. "Gas safety inspection completed by Gas Safe engineer John Smith (Reg. 123456) on ${new Date().toLocaleDateString("en-GB")}. Certificate issued."`}
            />
            <p className="text-xs text-gray-500 mt-1">
              This declaration is logged immutably as evidence. Write clearly and factually.
            </p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-800">
            ⚖️ This record is stored as an immutable audit trail and may be used as legal evidence.
            By submitting, you confirm this information is accurate to the best of your knowledge.
          </div>
          <button type="submit" disabled={isSubmitting} className="w-full rounded-lg bg-green-600 py-2.5 text-white font-medium hover:bg-green-700 disabled:opacity-50">
            {isSubmitting ? "Logging..." : "✓ Log as Compliant"}
          </button>
        </Form>
      </div>
    </div>
  );
}
