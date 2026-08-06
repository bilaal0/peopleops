// routes/document-types/index.jsx
// SUPER_ADMIN only dashboard to manage dynamic document types
import { useState, useEffect, useMemo } from "react";
import { useLoaderData, useSubmit, useActionData } from "react-router-dom";
import { getUserFromRequest } from "../../utils/auth.server.js";
import { redirect, data } from "react-router";
import { DocumentType } from "../../models/documentType.server.js";
import { connect } from "../../config/db.server.js";
import DataTable from "../../components/ui/DataTable.jsx";

// ── CONSTANTS ─────────────────────────────────────────────────────────────────
const ENTITIES   = ["landlord", "property", "tenant", "tenancy"];
const CATEGORIES = ["certificate", "licence", "safety", "insurance", "inspection", "identity", "compliance", "financial", "reference", "legal", "general"];

const ENTITY_COLORS = {
  landlord: "bg-purple-100 text-purple-700",
  property: "bg-indigo-100 text-indigo-700",
  tenant:   "bg-blue-100 text-blue-700",
  tenancy:  "bg-amber-100 text-amber-700",
};

const CAT_COLORS = {
  certificate:    "bg-emerald-100 text-emerald-700",
  licence:        "bg-fuchsia-100 text-fuchsia-700",
  safety:         "bg-red-100 text-red-700",
  insurance:      "bg-teal-100 text-teal-700",
  inspection:     "bg-sky-100 text-sky-700",
  identity:       "bg-cyan-100 text-cyan-700",
  compliance:     "bg-violet-100 text-violet-700",
  financial:      "bg-orange-100 text-orange-700",
  reference:      "bg-lime-100 text-lime-700",
  legal:          "bg-rose-100 text-rose-700",
  general:        "bg-gray-100 text-gray-700",
};

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

// ── SERVER LOADER ─────────────────────────────────────────────────────────────
export async function loader({ request }) {
  const user = await getUserFromRequest(request);
  if (!user || !user.roles?.includes("SUPER_ADMIN")) {
    return redirect("/dashboard");
  }

  await connect();
  const types = await DocumentType.find().sort({ entity: 1, name: 1 }).lean();

  return {
    types: types.map(t => ({
      ...t,
      _id: t._id.toString(),
      createdBy: t.createdBy?.toString(),
    }))
  };
}

// ── SERVER ACTION ─────────────────────────────────────────────────────────────
export async function action({ request }) {
  const user = await getUserFromRequest(request);
  if (!user || !user.roles?.includes("SUPER_ADMIN")) return data({ error: "Unauthorised" }, { status: 403 });

  const formData = await request.formData();
  const intent   = formData.get("intent");
  
  await connect();

  try {
    if (intent === "create") {
      const name     = formData.get("name")?.trim();
      const key      = formData.get("key")?.trim();
      const entity   = formData.getAll("entity").filter(Boolean);
      const category = formData.get("category") || "general";
      const hasExpiry           = formData.get("hasExpiry") === "true";
      const expiryDays          = formData.get("expiryDays") ? Number(formData.get("expiryDays")) : null;
      const requiresVerification = formData.get("requiresVerification") === "true";

      if (!name) return data({ error: "Name is required" }, { status: 400 });
      if (!key)  return data({ error: "Key is required" }, { status: 400 });
      if (entity.length === 0) return data({ error: "At least one entity is required" }, { status: 400 });

      // Check for duplicate key
      const existingKey = await DocumentType.findOne({ key });
      if (existingKey) return data({ error: `Key "${key}" already exists.` }, { status: 400 });

      // Check for duplicate name
      const existingName = await DocumentType.findOne({ name: { $regex: new RegExp(`^${name}$`, "i") } });
      if (existingName) return data({ error: `Document type "${name}" already exists.` }, { status: 400 });

      await DocumentType.create({
        key, name, entity, category,
        hasExpiry, expiryDays, requiresVerification,
        isActive: true,
        createdBy: user.userId,
      });
      return data({ success: true, intent: "create", message: "Document type created successfully" });
    }

    if (intent === "update") {
      const id       = formData.get("id");
      const name     = formData.get("name")?.trim();
      const entity   = formData.getAll("entity").filter(Boolean);
      const category = formData.get("category") || "general";
      const hasExpiry           = formData.get("hasExpiry") === "true";
      const expiryDays          = formData.get("expiryDays") ? Number(formData.get("expiryDays")) : null;
      const requiresVerification = formData.get("requiresVerification") === "true";

      if (!name) return data({ error: "Name is required" }, { status: 400 });
      if (entity.length === 0) return data({ error: "At least one entity is required" }, { status: 400 });

      // Check for duplicate name (excluding this record)
      const existing = await DocumentType.findOne({
        _id: { $ne: id },
        name: { $regex: new RegExp(`^${name}$`, "i") },
      });
      if (existing) return data({ error: `Document type "${name}" already exists.` }, { status: 400 });

      // Key is immutable once created — not updated here
      await DocumentType.findByIdAndUpdate(id, {
        name, entity, category,
        hasExpiry, expiryDays, requiresVerification,
      });
      return data({ success: true, intent: "update", message: "Document type updated successfully" });
    }

    if (intent === "toggle") {
      const id = formData.get("id");
      const isActive = formData.get("isActive") === "true";
      await DocumentType.findByIdAndUpdate(id, { isActive });
      return data({ success: true, intent: "toggle" });
    }

  } catch (err) {
    console.error("Action error:", err);
    return data({ error: "Server error occurred" }, { status: 500 });
  }

  return null;
}

// ── TOGGLE PILL ───────────────────────────────────────────────────────────────
function TogglePill({ label, active, onClick, colorClass }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2 py-0.5 rounded-md text-xs font-medium capitalize border transition ${
        active
          ? `${colorClass} border-current/20 ring-1 ring-current/10`
          : "bg-white text-gray-400 border-gray-200 hover:border-gray-300"
      }`}
    >
      {label}
    </button>
  );
}

// ── CLIENT COMPONENT ──────────────────────────────────────────────────────────
export default function DocumentTypesAdmin() {
  const { types } = useLoaderData();
  const actionData = useActionData();
  const submit = useSubmit();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);

  // Create form state
  const [createName, setCreateName] = useState("");
  const [createKey, setCreateKey] = useState("");
  const [createKeyManual, setCreateKeyManual] = useState(false);
  const [createEntity, setCreateEntity] = useState([]);
  const [createCategory, setCreateCategory] = useState("general");
  const [createHasExpiry, setCreateHasExpiry] = useState(false);
  const [createExpiryDays, setCreateExpiryDays] = useState("");
  const [createRequiresVerification, setCreateRequiresVerification] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState("");
  const [editEntity, setEditEntity] = useState([]);
  const [editCategory, setEditCategory] = useState("general");
  const [editHasExpiry, setEditHasExpiry] = useState(false);
  const [editExpiryDays, setEditExpiryDays] = useState("");
  const [editRequiresVerification, setEditRequiresVerification] = useState(false);

  // Auto-generate key from name
  useEffect(() => {
    if (!createKeyManual && createName) {
      setCreateKey(slugify(createName));
    }
  }, [createName, createKeyManual]);

  // Auto-hide forms on success
  useEffect(() => {
    if (actionData?.success) {
      if (actionData.intent === "create") {
        setShowForm(false);
        resetCreateForm();
      }
      if (actionData.intent === "update") setEditingId(null);
    }
  }, [actionData]);

  function resetCreateForm() {
    setCreateName("");
    setCreateKey("");
    setCreateKeyManual(false);
    setCreateEntity([]);
    setCreateCategory("general");
    setCreateHasExpiry(false);
    setCreateExpiryDays("");
    setCreateRequiresVerification(false);
  }

  function handleToggle(id, currentActive) {
    const fd = new FormData();
    fd.set("intent", "toggle");
    fd.set("id", id);
    fd.set("isActive", (!currentActive).toString());
    submit(fd, { method: "post" });
  }

  function startEdit(docType) {
    const entities = Array.isArray(docType.entity) ? docType.entity : [docType.entity];
    setEditingId(docType._id);
    setEditName(docType.name);
    setEditEntity(entities);
    setEditCategory(docType.category || "general");
    setEditHasExpiry(docType.hasExpiry || false);
    setEditExpiryDays(docType.expiryDays?.toString() || "");
    setEditRequiresVerification(docType.requiresVerification || false);
    setShowForm(false);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  function handleCreateSubmit(e) {
    e.preventDefault();
    const fd = new FormData();
    fd.set("intent", "create");
    fd.set("name", createName.trim());
    fd.set("key", createKey.trim());
    createEntity.forEach(e => fd.append("entity", e));
    fd.set("category", createCategory);
    fd.set("hasExpiry", createHasExpiry.toString());
    if (createHasExpiry && createExpiryDays) fd.set("expiryDays", createExpiryDays);
    fd.set("requiresVerification", createRequiresVerification.toString());
    submit(fd, { method: "post" });
  }

  function handleEditSubmit() {
    if (!editName.trim() || editEntity.length === 0) return;
    const fd = new FormData();
    fd.set("intent", "update");
    fd.set("id", editingId);
    fd.set("name", editName.trim());
    editEntity.forEach(e => fd.append("entity", e));
    fd.set("category", editCategory);
    fd.set("hasExpiry", editHasExpiry.toString());
    if (editHasExpiry && editExpiryDays) fd.set("expiryDays", editExpiryDays);
    fd.set("requiresVerification", editRequiresVerification.toString());
    submit(fd, { method: "post" });
  }

  function toggleCreateEntity(e) {
    setCreateEntity(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  }

  function toggleEditEntity(e) {
    setEditEntity(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  }

  const columns = useMemo(() => [
    {
      accessorKey: "key",
      header: "Key",
      cell: ({ getValue }) => (
        <span className="text-xs font-mono text-gray-500 bg-gray-50 px-1.5 py-0.5 rounded">{getValue()}</span>
      ),
    },
    {
      accessorKey: "name",
      header: "Name",
      cell: ({ row }) => {
        const t = row.original;
        if (editingId === t._id) {
          return (
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="w-full border-gray-300 rounded-lg px-2.5 py-1.5 text-sm font-medium focus:ring-indigo-500 focus:border-indigo-500"
              autoFocus
            />
          );
        }
        return <span className="text-sm font-medium text-gray-900">{t.name}</span>;
      },
    },
    {
      accessorKey: "entity",
      header: "Entity",
      cell: ({ row }) => {
        const t = row.original;
        if (editingId === t._id) {
          return (
            <div className="flex flex-wrap gap-1">
              {ENTITIES.map(e => (
                <TogglePill key={e} label={e} active={editEntity.includes(e)} onClick={() => toggleEditEntity(e)} colorClass={ENTITY_COLORS[e]} />
              ))}
            </div>
          );
        }
        const entities = Array.isArray(t.entity) ? t.entity : [t.entity];
        return (
          <div className="flex flex-wrap gap-1">
            {entities.map(e => (
              <span key={e} className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium capitalize ${ENTITY_COLORS[e]}`}>{e}</span>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => {
        const t = row.original;
        if (editingId === t._id) {
          return (
            <select
              value={editCategory}
              onChange={e => setEditCategory(e.target.value)}
              className="border-gray-300 rounded-lg px-2 py-1 text-xs focus:ring-indigo-500"
            >
              {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
            </select>
          );
        }
        return (
          <span className={`inline-flex px-2 py-0.5 rounded-md text-xs font-medium capitalize ${CAT_COLORS[t.category] || CAT_COLORS.general}`}>
            {t.category}
          </span>
        );
      },
    },
    {
      id: "flags",
      header: "Flags",
      enableSorting: false,
      cell: ({ row }) => {
        const t = row.original;
        if (editingId === t._id) {
          return (
            <div className="flex flex-col gap-1.5">
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs">
                <input type="checkbox" checked={editHasExpiry} onChange={e => setEditHasExpiry(e.target.checked)} className="rounded border-gray-300 text-indigo-600" />
                <span>Expiry</span>
                {editHasExpiry && (
                  <input
                    type="number"
                    value={editExpiryDays}
                    onChange={e => setEditExpiryDays(e.target.value)}
                    placeholder="days"
                    className="w-16 border-gray-300 rounded px-1.5 py-0.5 text-xs"
                  />
                )}
              </label>
              <label className="inline-flex items-center gap-1.5 cursor-pointer text-xs">
                <input type="checkbox" checked={editRequiresVerification} onChange={e => setEditRequiresVerification(e.target.checked)} className="rounded border-gray-300 text-indigo-600" />
                <span>Verification</span>
              </label>
            </div>
          );
        }
        return (
          <div className="flex flex-wrap gap-1.5">
            {t.hasExpiry && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
                ⏱ {t.expiryDays ? `${t.expiryDays}d` : "Manual"}
              </span>
            )}
            {t.requiresVerification && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                ✓ Verify
              </span>
            )}
            {!t.hasExpiry && !t.requiresVerification && (
              <span className="text-xs text-gray-300">—</span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: "isActive",
      header: "Status",
      cell: ({ row }) => (
        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${row.original.isActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
          {row.original.isActive ? "Active" : "Archived"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Action",
      enableSorting: false,
      meta: { style: { textAlign: "right" } },
      cell: ({ row }) => {
        const t = row.original;

        if (editingId === t._id) {
          return (
            <div className="flex justify-end gap-2">
              <button onClick={cancelEdit} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
                Cancel
              </button>
              <button
                onClick={handleEditSubmit}
                disabled={!editName.trim() || editEntity.length === 0}
                className="text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-40"
              >
                Save
              </button>
            </div>
          );
        }

        return (
          <div className="flex justify-end gap-2">
            <button onClick={() => startEdit(t)} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
              Edit
            </button>
            <button
              onClick={() => handleToggle(t._id, t.isActive)}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition ${
                t.isActive ? "border-red-200 text-red-600 hover:bg-red-50" : "border-green-200 text-green-600 hover:bg-green-50"
              }`}
            >
              {t.isActive ? "Archive" : "Activate"}
            </button>
          </div>
        );
      },
    },
  ], [editingId, editName, editEntity, editCategory, editHasExpiry, editExpiryDays, editRequiresVerification]);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Document Types</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage globally available document classifications.</p>
        </div>
        {!showForm && !editingId && (
          <button onClick={() => setShowForm(true)} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
            + Add New Type
          </button>
        )}
      </div>

      {actionData?.error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm border border-red-200">
          {actionData.error}
        </div>
      )}

      {actionData?.success && actionData?.message && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm border border-green-200 flex items-center gap-2">
          <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {actionData.message}
        </div>
      )}

      {/* ── CREATE FORM ────────────────────────────────────────────────────── */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Create New Document Type</h3>
          <form onSubmit={handleCreateSubmit} className="space-y-4">
            {/* Row 1: Name + Key */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  required
                  placeholder="e.g. Gas Safety Certificate (CP12)"
                  className="w-full border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Key
                  <span className="text-xs text-gray-400 ml-1">(auto-generated, immutable once saved)</span>
                </label>
                <input
                  type="text"
                  value={createKey}
                  onChange={e => { setCreateKey(e.target.value); setCreateKeyManual(true); }}
                  required
                  placeholder="e.g. gas_safety_certificate"
                  className="w-full border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* Row 2: Entity + Category */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Entity <span className="text-xs text-gray-400">(who this applies to)</span></label>
                <div className="flex flex-wrap gap-2 border border-gray-300 rounded-lg px-3 py-2.5">
                  {ENTITIES.map(e => (
                    <TogglePill key={e} label={e} active={createEntity.includes(e)} onClick={() => toggleCreateEntity(e)} colorClass={ENTITY_COLORS[e]} />
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category <span className="text-xs text-gray-400">(what kind of document)</span></label>
                <select
                  value={createCategory}
                  onChange={e => setCreateCategory(e.target.value)}
                  className="w-full border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-indigo-500"
                >
                  {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                </select>
              </div>
            </div>

            {/* Row 3: Flags */}
            <div className="flex flex-wrap items-center gap-6">
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={createHasExpiry} onChange={e => setCreateHasExpiry(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-sm text-gray-700">Has expiry</span>
              </label>
              {createHasExpiry && (
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Auto-calc days:</label>
                  <input
                    type="number"
                    value={createExpiryDays}
                    onChange={e => setCreateExpiryDays(e.target.value)}
                    placeholder="e.g. 365"
                    className="w-24 border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:ring-indigo-500"
                  />
                  <span className="text-xs text-gray-400">(leave blank for manual)</span>
                </div>
              )}
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={createRequiresVerification} onChange={e => setCreateRequiresVerification(e.target.checked)} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-sm text-gray-700">Requires verification</span>
              </label>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => { setShowForm(false); resetCreateForm(); }} className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition">
                Cancel
              </button>
              <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition">
                Save
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── TABLE ──────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        {types.length === 0 ? (
          <div className="text-center py-10 text-gray-500 text-sm">No document types created yet.</div>
        ) : (
          <DataTable
            columns={columns}
            data={types}
            searchPlaceholder="Search document types…"
            emptyMessage="No document types match your search"
          />
        )}
      </div>
    </div>
  );
}
