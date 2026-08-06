// routes/obligations/upload.jsx — Upload a document for an obligation
// (stub — full S3 upload implementation in Day 2)
import { useLoaderData } from "react-router-dom";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect } from "react-router";
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
    .populate("obligationTypeId", "name")
    .lean();

  if (!obligation) return redirect("/compliance");
  return { obligation };
}

export default function UploadDocument() {
  const { obligation } = useLoaderData();

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Upload Document</h1>
      <p className="text-sm text-gray-500 mb-6">For: {obligation.obligationTypeId?.name}</p>
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <p className="text-gray-500 mb-4">Document upload coming in Day 2 (S3 integration)</p>
        <a href={`/obligations/${obligation._id}/log`} className="text-indigo-600 hover:underline text-sm">
          ← Log this obligation without document
        </a>
      </div>
    </div>
  );
}
