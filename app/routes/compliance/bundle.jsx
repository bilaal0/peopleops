// routes/compliance/bundle.jsx — Evidence Vault bundle export (stub)
// Day 2: PDF generation using puppeteer/pdf-lib
import { useLoaderData, Link } from "react-router-dom";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect } from "react-router";
import { Tenancy } from "../../models/tenancy.server.js";
import { Obligation } from "../../models/obligation.server.js";
import { AuditLog } from "../../models/auditLog.server.js";
import { connect } from "../../config/db.server.js";

export async function loader({ request, params }) {
  const user = await getUserFromRequest(request);
  if (!user) return redirect("/login");
  if (!user.organizationId && !user.roles?.includes("SUPER_ADMIN")) return redirect("/dashboard");

  await connect();
  const tenancy = await Tenancy.findOne({ _id: params.tenancyId, organizationId: user.organizationId })
    .populate("propertyId", "addressLine1 postcode")
    .populate("landlordId", "title firstName lastName")
    .populate("tenantIds", "title firstName lastName")
    .lean();

  if (!tenancy) return redirect("/tenancies");

  const [obligations, auditLogs] = await Promise.all([
    Obligation.find({ tenancyId: params.tenancyId })
      .populate("obligationTypeId", "name legislation")
      .lean(),
    AuditLog.find({ tenancyId: params.tenancyId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean(),
  ]);

  return { tenancy, obligations, auditLogs };
}

export default function ComplianceBundle() {
  const { tenancy, obligations, auditLogs } = useLoaderData();
  const logged = obligations.filter((o) => o.status === "logged").length;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link to={`/tenancies/${tenancy._id}`} className="text-sm text-indigo-600 hover:underline mb-4 block">← Back to Tenancy</Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Evidence Bundle</h1>
          <p className="text-gray-500 text-sm">{tenancy.propertyId?.addressLine1}, {tenancy.propertyId?.postcode}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">Generated: {new Date().toLocaleDateString("en-GB")}</p>
          <p className="text-sm font-medium mt-1">{logged}/{obligations.length} obligations logged</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{logged}</p>
          <p className="text-xs text-green-600 mt-1">Logged</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-red-700">{obligations.filter((o) => o.status === "overdue").length}</p>
          <p className="text-xs text-red-600 mt-1">Overdue</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-yellow-700">{obligations.filter((o) => o.status === "pending").length}</p>
          <p className="text-xs text-yellow-600 mt-1">Pending</p>
        </div>
      </div>

      {/* Audit Trail */}
      <h2 className="text-lg font-semibold text-gray-900 mb-3">Audit Trail ({auditLogs.length} events)</h2>
      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {auditLogs.map((log) => (
          <div key={log._id} className="px-4 py-3 flex items-start gap-3">
            <span className="text-xs text-gray-400 whitespace-nowrap mt-0.5 w-28">
              {new Date(log.createdAt).toLocaleDateString("en-GB")}
            </span>
            <div>
              <p className="text-sm font-medium text-gray-900">{log.action.replace(/_/g, " ")}</p>
              {log.metadata?.declarationText && (
                <p className="text-xs text-gray-500 mt-0.5 italic">"{log.metadata.declarationText}"</p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* PDF export hint */}
      <div className="mt-6 bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-center">
        <p className="text-gray-600 text-sm">📄 PDF bundle export available in Day 2 — you'll be able to 1-click export this as a PDF for court or audit use.</p>
      </div>
    </div>
  );
}
