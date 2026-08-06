import { redirect } from "react-router";
import { useLoaderData, useFetcher, Link } from "react-router";
import { getUserFromSession } from "../../utils/auth.server.js";
import { Tenancy } from "../../models/tenancy.server.js";
import { connect } from "../../config/db.server.js";
import { ShieldCheck, Download, Loader2, ArrowLeft } from "lucide-react";
import { useEffect } from "react";

export async function loader({ request }) {
  const user = await getUserFromSession(request);
  if (!user) return redirect("/login");

  await connect();
  const tenancies = await Tenancy.find({ agencyId: user.agencyId, status: "active", deleted: false })
    .populate("propertyId", "addressLine1 postcode")
    .populate("tenantIds", "firstName lastName title")
    .lean();

  const serializedTenancies = tenancies.map(t => ({
    ...t,
    _id: String(t._id),
    propertyId: t.propertyId ? { ...t.propertyId, _id: String(t.propertyId._id) } : null,
    tenantIds: t.tenantIds ? t.tenantIds.map(tenant => ({ ...tenant, _id: String(tenant._id) })) : []
  }));

  return { tenancies: serializedTenancies };
}

export default function GenerateBundleSelector() {
  const { tenancies } = useLoaderData();
  
  return (
    <div className="mx-auto max-w-4xl p-6 md:p-8">
      <Link to="/dashboard" className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 mb-6">
        <ArrowLeft className="h-4 w-4" /> Back to Dashboard
      </Link>
      
      <div className="mb-8 border-b border-slate-100 pb-6">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-indigo-600" />
          Generate Evidence Bundle
        </h1>
        <p className="text-slate-500 mt-2 max-w-2xl">
          Select an active tenancy to compile a full compliance audit trail and document bundle. This will securely generate a PDF containing all necessary evidence for Section 8 or Section 21 proceedings.
        </p>
      </div>

      <div className="grid gap-4">
        {tenancies.map(tenancy => (
          <TenancyBundleCard key={tenancy._id} tenancy={tenancy} />
        ))}
        {tenancies.length === 0 && (
          <div className="text-center p-12 bg-slate-50 rounded-2xl border border-dashed border-slate-300">
            <p className="text-slate-500 font-medium">No active tenancies available.</p>
            <p className="text-sm text-slate-400 mt-1">You need an active tenancy to generate a bundle.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function TenancyBundleCard({ tenancy }) {
  const fetcher = useFetcher();
  const isGenerating = fetcher.state === "submitting" || fetcher.state === "loading";
  
  useEffect(() => {
    if (fetcher.data?.success && fetcher.data?.downloadUrl) {
      window.open(fetcher.data.downloadUrl, '_blank');
    }
  }, [fetcher.data]);

  const tenantNames = tenancy.tenantIds?.map(t => `${t.firstName} ${t.lastName}`).join(", ") || "Unknown Tenant";
  const address = tenancy.propertyId?.addressLine1 || "Unknown Property";

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between p-5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-indigo-200 transition group">
      <div className="mb-4 sm:mb-0">
        <p className="font-bold text-slate-900">{address}</p>
        <p className="text-sm text-slate-500 mt-0.5">Tenants: {tenantNames}</p>
        
        {fetcher.data?.error && (
          <p className="text-sm text-red-600 mt-2 font-medium">{fetcher.data.error}</p>
        )}
      </div>
      
      <fetcher.Form method="post" action={`/tenancies/${String(tenancy._id)}/evidence-bundle`}>
        <button
          type="submit"
          disabled={isGenerating}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-50 text-indigo-700 text-sm font-bold rounded-xl hover:bg-indigo-600 hover:text-white transition disabled:opacity-50 disabled:hover:bg-indigo-50 disabled:hover:text-indigo-700"
        >
          {isGenerating ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Download className="h-4 w-4" />
              Generate PDF
            </>
          )}
        </button>
      </fetcher.Form>
    </div>
  );
}
