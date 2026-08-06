// utils/bundleTemplate.server.js
// Renders the self-contained HTML string that Puppeteer converts to PDF.
// RULES: inline CSS only, no external images, en-GB dates throughout.

// ── Date helpers ──────────────────────────────────────────────────────────────
function fmtDate(date) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "2-digit", month: "short", year: "numeric",
  });
}
function fmtPeriod(date) {
  if (!date) return "—";
  return new Date(date).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}
function ordinal(n) {
  const s = ["th","st","nd","rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function fmtAddress(a) {
  if (!a) return "Not recorded";
  return [a.line1, a.line2, a.city, a.postcode].filter(Boolean).join(", ");
}
function fmtPropertyType(t) {
  return { terraced:"Terraced House", semi_detached:"Semi-Detached", detached:"Detached",
    flat:"Flat", bungalow:"Bungalow", maisonette:"Maisonette",
    studio:"Studio", hmo:"HMO", other:"Other" }[t] || t || "—";
}
function fmtPaymentMethod(m) {
  return { standing_order:"Standing Order", bacs_transfer:"BACS Transfer",
    direct_debit:"Direct Debit", cash:"Cash", cheque:"Cheque", other:"Other" }[m] || "—";
}
function fmtRTRDocType(t) {
  return { uk_passport:"UK Passport", eu_settled_status:"EU Settled Status",
    eu_pre_settled_status:"EU Pre-Settled Status",
    biometric_residence_permit:"Biometric Residence Permit",
    visa:"Visa", certificate_of_naturalisation:"Certificate of Naturalisation",
    other_uk_right:"Other UK Right to Rent" }[t] || t || "Not recorded";
}
function fmtMoney(n) {
  if (n == null) return "—";
  return "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Badge helpers ─────────────────────────────────────────────────────────────
function badge(cls, text) {
  return `<span class="badge badge-${cls}">${text}</span>`;
}
function amlBadge(result) {
  if (!result) return badge("grey", "PENDING");
  return badge({ pass:"green", refer:"amber", fail:"red" }[result] || "grey", result.toUpperCase());
}
function rtrLabel(tenant) {
  if (!tenant.tenantData?.rightToRentChecked) return "NOT CHECKED";
  const expiry = tenant.tenantData?.rightToRentExpiry;
  if (!expiry) return "VALID";
  const days = Math.floor((new Date(expiry) - new Date()) / 86400000);
  if (days < 0) return "EXPIRED";
  if (days <= 28) return `EXPIRES IN ${days} DAYS`;
  return "VALID";
}
function rtrBadge(tenant) {
  const label = rtrLabel(tenant);
  const cls = label === "VALID" ? "green" : label === "NOT CHECKED" || label === "EXPIRED" ? "red" : "amber";
  return badge(cls, label);
}
function certBadge(cert) {
  if (!cert) return badge("grey", "NOT UPLOADED");
  if (!cert.expiryDate) return badge("blue", "UPLOADED");
  const days = Math.floor((new Date(cert.expiryDate) - new Date()) / 86400000);
  if (days < 0) return badge("red", "EXPIRED");
  if (days <= 30) return badge("amber", `EXPIRES IN ${days} DAYS`);
  return badge("green", "VALID");
}
function payBadge(status) {
  return badge({ paid:"green", partial:"amber", overdue:"red", due:"amber",
    pending:"grey", waived:"grey" }[status] || "grey", status.toUpperCase());
}
function noticeBadge(outcome) {
  return badge({ pending:"amber", withdrawn:"grey", complied:"green",
    court_filed:"red", accepted:"green", challenged:"red" }[outcome] || "grey",
    (outcome || "PENDING").toUpperCase().replace("_", " "));
}
function depositStatusHtml(tenancy) {
  if (!tenancy.deposit?.amount) return "No deposit taken";
  if (!tenancy.deposit?.protectedDate) {
    const deadline = new Date(tenancy.startDate);
    deadline.setDate(deadline.getDate() + 30);
    return badge("red", `NOT PROTECTED — deadline was ${fmtDate(deadline)}`);
  }
  return fmtDate(tenancy.deposit.protectedDate);
}
function prescribedInfoHtml(tenancy) {
  if (!tenancy.deposit?.amount) return "No deposit taken";
  if (!tenancy.deposit?.prescribedInfoServedDate) return badge("red", "NOT SERVED");
  return fmtDate(tenancy.deposit.prescribedInfoServedDate);
}
function formatRRAMethod(method) {
  const map = {
    email_attachment: "Email attachment (PDF)",
    post:             "Post (printed copy)",
    hand_delivered:   "Hand delivered (printed copy)",
  };
  return map[method] || "Not recorded";
}


// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:Arial,sans-serif; font-size:11px; color:#1E293B; line-height:1.6; }
h1 { font-size:22px; color:#1E293B; margin-bottom:6px; }
h2 { font-size:13px; color:#2563EB; margin:24px 0 8px;
     padding-bottom:4px; border-bottom:2px solid #DBEAFE; }
h3 { font-size:12px; color:#1E293B; margin:14px 0 6px; font-weight:bold; }
.cover-container {
  margin: -22mm -15mm -22mm -15mm;
  padding: 25mm 20mm;
  height: 297mm;
  background: #ffffff;
  color: #0f172a;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.cover-header {
  display: flex;
  align-items: center;
  gap: 8px;
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 12px;
}
.cover-logo-text {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 2px;
  color: #475569;
}
.cover-body {
  margin-top: 12mm;
  flex-grow: 1;
}
.cover-image-container {
  width: 100%;
  height: 90mm;
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 20px;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.cover-image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: #94a3b8;
}
.cover-image-placeholder svg {
  width: 48px;
  height: 48px;
  stroke: #cbd5e1;
}
.cover-image-placeholder span {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.5px;
}
.cover-tag {
  font-size: 9px;
  font-weight: 700;
  color: #2563eb;
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 8px;
}
.cover-title {
  font-size: 28px;
  font-weight: 800;
  line-height: 1.25;
  color: #0f172a;
  margin-bottom: 4px;
}
.cover-subtitle {
  font-size: 12px;
  color: #475569;
  margin-bottom: 20px;
  font-weight: 400;
}
.cover-divider {
  width: 100%;
  height: 1px;
  background: #e2e8f0;
  margin-bottom: 20px;
}
.cover-meta-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  background: #f8fafc;
  padding: 16px;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}
.cover-meta-item {
  padding-left: 0;
}
.cover-meta-label {
  font-size: 8px;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  margin-bottom: 2px;
}
.cover-meta-value {
  font-size: 11px;
  font-weight: 600;
  color: #0f172a;
}
.cover-footer {
  font-size: 9px;
  color: #64748b;
  border-top: 1px solid #e2e8f0;
  padding-top: 16px;
  display: flex;
  justify-content: space-between;
}
.section { margin-bottom:16px; }
.grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:8px; }
.card { background:#EFF6FF; padding:12px; border-radius:4px; }
.card .lbl { font-size:9px; color:#64748B; display:block; margin-bottom:2px; text-transform:uppercase; letter-spacing:0.5px; }
.card .val { font-size:11px; color:#1E293B; font-weight:600; }
table { width:100%; border-collapse:collapse; margin-top:8px; font-size:10px; }
th { background:#1E3A5F; color:white; padding:6px 8px; text-align:left; font-size:9px; text-transform:uppercase; letter-spacing:0.5px; }
td { padding:5px 8px; color:#1E293B; border-bottom:1px solid #E2E8F0; vertical-align:top; }
tr:nth-child(even) td { background:#F8FAFF; }
.badge { display:inline-block; padding:2px 8px; border-radius:3px; font-size:9px; font-weight:bold; white-space:nowrap; }
.badge-green  { background:#DCFCE7; color:#16A34A; }
.badge-amber  { background:#FEF3C7; color:#D97706; }
.badge-red    { background:#FEE2E2; color:#DC2626; }
.badge-grey   { background:#F1F5F9; color:#64748B; }
.badge-blue   { background:#DBEAFE; color:#2563EB; }
.arrears-box  { background:#FEE2E2; padding:10px 14px; border-radius:4px; margin-bottom:12px; border-left:4px solid #DC2626; }
.arrears-box strong { color:#DC2626; }
.disclaimer { margin-top:32px; padding:12px 14px; background:#FEF3C7;
              border-radius:4px; font-size:9px; color:#92400E; line-height:1.6; }
.page-break { page-break-after:always; }
.tenant-block { margin-bottom:16px; padding-bottom:16px; border-bottom:1px solid #E2E8F0; }
.empty-row td { color:#64748B; font-style:italic; }
`;

// ── Section renderers ─────────────────────────────────────────────────────────
function renderCover(data) {
  const { tenancy, agency, generatedAt, generatedBy, propertyImageUrl } = data;
  const p = tenancy.propertyId;
  const tenancyPeriod = `${fmtDate(tenancy.startDate)} – ${tenancy.endDate ? fmtDate(tenancy.endDate) : "Periodic (APT)"}`;
  
  const imageHtml = propertyImageUrl
    ? `<img src="${propertyImageUrl}" class="cover-image" />`
    : `<div class="cover-image-placeholder">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
          <polyline points="9 22 9 12 15 12 15 22"></polyline>
        </svg>
        <span>No Property Image Available</span>
      </div>`;

  return `
    <div class="cover-container">
      <div class="cover-header">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <span class="cover-logo-text">PROPLET SECURE VAULT</span>
      </div>
      
      <div class="cover-body">
        <div class="cover-image-container">
          ${imageHtml}
        </div>
        
        <div class="cover-tag">Compliance Evidence Bundle</div>
        <h1 class="cover-title">${p.addressLine1}</h1>
        <div class="cover-subtitle">${[p.addressLine2, p.city, p.postcode].filter(Boolean).join(", ")}</div>
        <div class="cover-divider"></div>
        
        <div class="cover-meta-grid">
          <div class="cover-meta-item">
            <div class="cover-meta-label">Tenancy Period</div>
            <div class="cover-meta-value">${tenancyPeriod}</div>
          </div>
          <div class="cover-meta-item">
            <div class="cover-meta-label">Monthly Rent</div>
            <div class="cover-meta-value">£${Number(tenancy.rent.amount).toLocaleString("en-GB")}</div>
          </div>
          <div class="cover-meta-item">
            <div class="cover-meta-label">Tenancy Type</div>
            <div class="cover-meta-value">${tenancy.tenancyType === "apt" ? "Assured Periodic Tenancy (APT)" : "Assured Shorthold Tenancy (AST)"}</div>
          </div>
          <div class="cover-meta-item">
            <div class="cover-meta-label">Current Status</div>
            <div class="cover-meta-value" style="text-transform: capitalize;">${tenancy.status || "Active"}</div>
          </div>
          <div class="cover-meta-item">
            <div class="cover-meta-label">Generated On</div>
            <div class="cover-meta-value">${fmtDate(generatedAt)}</div>
          </div>
          <div class="cover-meta-item">
            <div class="cover-meta-label">Authorized Agent</div>
            <div class="cover-meta-value">${generatedBy || "System Generated"}</div>
          </div>
        </div>
      </div>
      
      <div class="cover-footer">
        <div>Agency: ${agency?.name || "Proplet Partner"}</div>
        <div>Security ID: ${tenancy._id.toString().toUpperCase()}</div>
      </div>
    </div>
    <div class="page-break"></div>`;
}

function renderProperty(tenancy) {
  const p = tenancy.propertyId;
  return `
    <div class="section">
      <h2>1. Property Details</h2>
      <div class="grid-2">
        <div class="card">
          <span class="lbl">Address</span>
          <div class="val">${[p.addressLine1, p.addressLine2, p.city, p.postcode].filter(Boolean).join("<br>")}</div>
        </div>
        <div class="card">
          <span class="lbl">Property Type</span><div class="val">${fmtPropertyType(p.propertyType)}</div>
          <span class="lbl" style="margin-top:8px;">Local Authority</span><div class="val">${p.localAuthority || "Not recorded"}</div>
        </div>
        <div class="card">
          <span class="lbl">EPC Rating</span>
          <div class="val">${p.epcRating || "Not recorded"}${p.epcExpiryDate ? ` (Expires: ${fmtDate(p.epcExpiryDate)})` : ""}</div>
        </div>
        <div class="card">
          <span class="lbl">HMO</span>
          <div class="val">${p.propertyType === "hmo" ? `Yes — Licence: ${p.hmoLicenceNo || "Not recorded"}` : "Not an HMO"}</div>
        </div>
      </div>
    </div>`;
}

function renderLandlord(tenancy) {
  const l = tenancy.landlordId;
  return `
    <div class="section">
      <h2>2. Landlord Details</h2>
      <div class="grid-2">
        <div class="card">
          <span class="lbl">Name</span><div class="val">${l.title ? l.title + ' ' : ''}${l.firstName} ${l.lastName}</div>
          <span class="lbl" style="margin-top:8px;">Email</span><div class="val">${l.email || "—"}</div>
          <span class="lbl" style="margin-top:8px;">Phone</span><div class="val">${l.phone || "Not recorded"}</div>
        </div>
        <div class="card">
          <span class="lbl">AML Check</span><div class="val">${amlBadge(l.landlordData?.amlResult)}</div>
          <span class="lbl" style="margin-top:8px;">AML Check Date</span>
          <div class="val">${l.landlordData?.amlCheckedAt ? fmtDate(l.landlordData.amlCheckedAt) : "Not completed"}</div>
          <span class="lbl" style="margin-top:8px;">PEP Check</span>
          <div class="val">${l.landlordData?.pepResult ? l.landlordData.pepResult.toUpperCase() : "Not completed"}</div>
        </div>
      </div>
    </div>`;
}

function renderTenants(tenancy) {
  const rows = tenancy.tenantIds.map((t) => `
    <div class="tenant-block">
      <h3>${t.title ? t.title + ' ' : ''}${t.firstName} ${t.lastName}</h3>
      <div class="grid-2">
        <div class="card">
          <span class="lbl">Email</span><div class="val">${t.email || "—"}</div>
          <span class="lbl" style="margin-top:8px;">Phone</span><div class="val">${t.phone || "Not recorded"}</div>
          <span class="lbl" style="margin-top:8px;">Address</span><div class="val">${fmtAddress(t.address)}</div>
        </div>
        <div class="card">
          <span class="lbl">Right to Rent</span><div class="val">${rtrBadge(t)}</div>
          <span class="lbl" style="margin-top:8px;">Document Type</span>
          <div class="val">${fmtRTRDocType(t.tenantData?.rightToRentDocumentType)}</div>
          <span class="lbl" style="margin-top:8px;">Check Date</span>
          <div class="val">${t.tenantData?.rightToRentCheckDate ? fmtDate(t.tenantData.rightToRentCheckDate) : "Not recorded"}</div>
          <span class="lbl" style="margin-top:8px;">Expiry</span>
          <div class="val">${t.tenantData?.rightToRentExpiry ? fmtDate(t.tenantData.rightToRentExpiry) : "No expiry (UK/Irish citizen)"}</div>
        </div>
      </div>
    </div>`).join("");
  return `<div class="section"><h2>3. Tenant Details</h2>${rows}</div>`;
}

function renderTenancyDetails(tenancy) {
  return `
    <div class="section">
      <h2>4. Tenancy Details</h2>
      <div class="grid-2">
        <div class="card">
          <span class="lbl">Tenancy Type</span>
          <div class="val">${tenancy.tenancyType === "apt" ? "Assured Periodic Tenancy (APT)" : "Assured Shorthold Tenancy (AST)"}</div>
          <span class="lbl" style="margin-top:8px;">Start Date</span><div class="val">${fmtDate(tenancy.startDate)}</div>
          <span class="lbl" style="margin-top:8px;">End Date</span>
          <div class="val">${tenancy.endDate ? fmtDate(tenancy.endDate) : "Periodic — no fixed end date"}</div>
          <span class="lbl" style="margin-top:8px;">Status</span>
          <div class="val">${badge(tenancy.status === "active" ? "green" : "grey", (tenancy.status || "").toUpperCase())}</div>
        </div>
        <div class="card">
          <span class="lbl">Monthly Rent</span><div class="val">£${Number(tenancy.rent.amount).toLocaleString("en-GB")}</div>
          <span class="lbl" style="margin-top:8px;">Rent Due Day</span>
          <div class="val">${ordinal(tenancy.rent.dueDay)} of each month</div>
          <span class="lbl" style="margin-top:8px;">Payment Method</span>
          <div class="val">${fmtPaymentMethod(tenancy.rent.paymentMethod)}</div>
          <span class="lbl" style="margin-top:8px;">Next Rent Review</span>
          <div class="val">${tenancy.rent.reviewDate ? fmtDate(tenancy.rent.reviewDate) : "Not set"}</div>
        </div>
      </div>
    </div>`;
}

function renderDeposit(tenancy) {
  const d = tenancy.deposit || {};
  return `
    <div class="section">
      <h2>5. Deposit Protection</h2>
      <div class="grid-2">
        <div class="card">
          <span class="lbl">Deposit Amount</span>
          <div class="val">${d.amount ? fmtMoney(d.amount) : "No deposit taken"}</div>
          <span class="lbl" style="margin-top:8px;">Protection Scheme</span>
          <div class="val">${d.scheme ? d.scheme.toUpperCase() : "Not protected"}</div>
          <span class="lbl" style="margin-top:8px;">Reference</span>
          <div class="val">${d.reference || "Not recorded"}</div>
        </div>
        <div class="card">
          <span class="lbl">Protected Date</span>
          <div class="val">${depositStatusHtml(tenancy)}</div>
          <span class="lbl" style="margin-top:8px;">Prescribed Info Served</span>
          <div class="val">${prescribedInfoHtml(tenancy)}</div>
        </div>
      </div>
    </div>`;
}

function renderDocumentsServedToTenant(tenancy) {
  const h = tenancy.howToRent || {};
  const RRA_CUTOFF = new Date("2026-05-01");
  const isPostMay = tenancy.startDate && new Date(tenancy.startDate) >= RRA_CUTOFF;
  const rra = tenancy.rrainformationSheet || {};

  const rraHtml = isPostMay
    ? `<p style="font-size:10px; color:#64748B; margin-top:12px;">
         <strong>RRA Information Sheet 2026:</strong> Not required — tenancy created after 1 May 2026.
       </p>`
    : `<h3 style="font-size:11px; color:#1E293B; margin:16px 0 4px; font-weight:bold;">RRA Information Sheet 2026</h3>
       <div class="grid-2">
         <div class="card">
           <span class="lbl">Served</span>
           <div class="val">${rra.served ? badge("green", "YES") : badge("red", "NOT RECORDED")}</div>
           <span class="lbl" style="margin-top:8px;">Date Served</span>
           <div class="val">${rra.servedDate ? fmtDate(rra.servedDate) : "—"}</div>
           <span class="lbl" style="margin-top:8px;">Delivery Method</span>
           <div class="val">${formatRRAMethod(rra.method)}</div>
           <span class="lbl" style="margin-top:8px;">Served To</span>
           <div class="val">${rra.servedToTenantIds?.length > 0 ? `${rra.servedToTenantIds.length} named tenant(s)` : "—"}</div>
           <span class="lbl" style="margin-top:8px;">Proof of Delivery</span>
           <div class="val">${rra.proofDocumentId ? badge("green", "UPLOADED") : badge("grey", "NOT UPLOADED")}</div>
         </div>
       </div>`;

  return `
    <div class="section">
      <h2>6. Documents Served to Tenant</h2>
      <h3 style="font-size:11px; color:#1E293B; margin:0 0 6px; font-weight:bold;">How to Rent Guide</h3>
      <div class="grid-2">
        <div class="card">
          <span class="lbl">Served to Tenant</span>
          <div class="val">${h.served ? badge("green", "YES") : badge("red", "NOT SERVED")}</div>
          <span class="lbl" style="margin-top:8px;">Date Served</span>
          <div class="val">${h.servedDate ? fmtDate(h.servedDate) : "Not recorded"}</div>
          <span class="lbl" style="margin-top:8px;">Version Served</span>
          <div class="val">${h.version || "Not recorded"}</div>
        </div>
      </div>
      ${rraHtml}
    </div>`;
}


function renderCertificates(certificates) {
  const rows = [
    { label: "Gas Safety Certificate (CP12)", cert: certificates.gas },
    { label: "Electrical Installation Condition Report (EICR)", cert: certificates.eicr },
    { label: "Energy Performance Certificate (EPC)", cert: certificates.epc },
  ];
  return `
    <div class="section">
      <h2>7. Compliance Certificates</h2>
      <table>
        <tr>
          <th>Certificate</th><th>Issue Date</th><th>Expiry Date</th>
          <th>Status</th><th>Uploaded By</th>
        </tr>
        ${rows.map(({ label, cert }) => `
        <tr>
          <td><strong>${label}</strong></td>
          <td>${cert ? fmtDate(cert.issueDate || cert.createdAt) : "—"}</td>
          <td>${cert?.expiryDate ? fmtDate(cert.expiryDate) : "—"}</td>
          <td>${certBadge(cert)}</td>
          <td>${cert?.uploadedBy ? `${cert.uploadedBy.title ? cert.uploadedBy.title + ' ' : ''}${cert.uploadedBy.firstName} ${cert.uploadedBy.lastName}` : "Not uploaded"}</td>
        </tr>`).join("")}
      </table>
    </div>`;
}

function renderSection8(tenancy) {
  if (!tenancy.section8Notices?.length) return "";
  return `
    <div class="section">
      <h2>8. Section 8 Notices</h2>
      <table>
        <tr><th>Served Date</th><th>Grounds</th><th>Expiry Date</th><th>Outcome</th><th>Notes</th></tr>
        ${tenancy.section8Notices.map((n) => `
        <tr>
          <td>${fmtDate(n.servedDate)}</td>
          <td>${(n.grounds || []).join(", ")}</td>
          <td>${fmtDate(n.expiryDate)}</td>
          <td>${noticeBadge(n.outcome)}</td>
          <td>${n.notes || "—"}</td>
        </tr>`).join("")}
      </table>
    </div>`;
}

function renderSection13(tenancy) {
  if (!tenancy.section13Notices?.length) return "";
  return `
    <div class="section">
      <h2>9. Section 13 Rent Increase Notices</h2>
      <table>
        <tr><th>Served Date</th><th>Current Rent</th><th>Proposed Rent</th><th>Effective Date</th><th>Outcome</th></tr>
        ${tenancy.section13Notices.map((n) => `
        <tr>
          <td>${fmtDate(n.servedDate)}</td>
          <td>${fmtMoney(n.currentRent)}</td>
          <td>${fmtMoney(n.proposedRent)}</td>
          <td>${fmtDate(n.effectiveDate)}</td>
          <td>${noticeBadge(n.outcome)}</td>
        </tr>`).join("")}
      </table>
    </div>`;
}

function renderRentHistory(rentPayments, arrearsStatus) {
  const arrearsHtml = arrearsStatus.hasArrears ? `
    <div class="arrears-box">
      <strong>⚠ Rent Arrears:</strong> ${fmtMoney(arrearsStatus.totalArrears)} outstanding
      (${arrearsStatus.monthsArrears} month(s) overdue)
      ${arrearsStatus.section8Ground8Eligible ? " — Ground 8 Section 8 may be available." : ""}
    </div>` : "";

  const rows = rentPayments.length
    ? rentPayments.map((p) => `
      <tr>
        <td>${fmtPeriod(p.periodStart)}</td>
        <td>${fmtDate(p.dueDate)}</td>
        <td>${fmtMoney(p.amountDue)}</td>
        <td>${p.amountPaid > 0 ? fmtMoney(p.amountPaid) : "—"}</td>
        <td>${payBadge(p.status)}</td>
        <td>${p.paidDate ? fmtDate(p.paidDate) : "—"}</td>
        <td>${fmtPaymentMethod(p.paymentMethod)}</td>
      </tr>`).join("")
    : `<tr class="empty-row"><td colspan="7">No payment records found.</td></tr>`;

  return `
    <div class="section">
      <h2>10. Rent Payment History</h2>
      ${arrearsHtml}
      <table>
        <tr>
          <th>Period</th><th>Due Date</th><th>Amount Due</th>
          <th>Amount Paid</th><th>Status</th><th>Paid Date</th><th>Method</th>
        </tr>
        ${rows}
      </table>
    </div>`;
}

function renderDocumentIndex(documents) {
  const rows = documents.length
    ? documents.map((d) => `
      <tr>
        <td>${d.docType?.name || "Other"}</td>
        <td>${d.fileName}</td>
        <td>${d.title || "—"}</td>
        <td>${d.uploadedBy ? `${d.uploadedBy.title ? d.uploadedBy.title + ' ' : ''}${d.uploadedBy.firstName} ${d.uploadedBy.lastName}` : "—"}</td>
        <td>${fmtDate(d.createdAt)}</td>
        <td>${d.expiryDate ? fmtDate(d.expiryDate) : "—"}</td>
        <td>${d.verifiedAt ? badge("green", "VERIFIED") : badge("grey", "PENDING")}</td>
      </tr>`).join("")
    : `<tr class="empty-row"><td colspan="7">No documents uploaded.</td></tr>`;

  return `
    <div class="section">
      <h2>11. Document Index</h2>
      <table>
        <tr>
          <th>Type</th><th>File Name</th><th>Title</th>
          <th>Uploaded By</th><th>Upload Date</th><th>Expiry</th><th>Status</th>
        </tr>
        ${rows}
      </table>
    </div>`;
}

function renderMaintenanceHistory(closedJobs) {
  if (!closedJobs || closedJobs.length === 0) {
    return `
      <div class="section">
        <h2>12. Maintenance History</h2>
        <p style="font-style:italic; color:#64748B;">No closed maintenance work orders recorded for this tenancy.</p>
      </div>`;
  }

  const rows = closedJobs.map((job) => `
    <tr>
      <td>${fmtDate(job.closedAt || job.completedDate || job.createdAt)}</td>
      <td style="text-transform: capitalize;">${(job.category || "").replace(/_/g, " ")}</td>
      <td><strong>${job.title}</strong>${job.description ? `<br><span style="color:#64748B; font-size:9px;">${job.description}</span>` : ""}</td>
      <td>${job.actualCost != null ? fmtMoney(job.actualCost) : job.estimatedCost != null ? `${fmtMoney(job.estimatedCost)} (Est.)` : "—"}</td>
      <td>${job.contractorId?.name || "—"}</td>
    </tr>`).join("");

  return `
    <div class="section">
      <h2>12. Maintenance History</h2>
      <table>
        <tr>
          <th>Date</th><th>Category</th><th>Description</th><th>Cost</th><th>Contractor</th>
        </tr>
        ${rows}
      </table>
    </div>`;
}

// ── Activity log helpers (Section 13) ───────────────────────────────────────
function formatTime(date) {
  if (!date) return "";
  return new Date(date).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getEventColour(eventType) {
  if (!eventType) return "#94A3B8"; // manual note — slate
  if (eventType.startsWith("rent_"))        return "#16A34A"; // green
  if (eventType.startsWith("tenancy_"))     return "#2563EB"; // blue
  if (eventType.startsWith("maintenance_")) return "#D97706"; // amber
  if (eventType.startsWith("document_"))   return "#7C3AED"; // purple
  if (eventType.startsWith("property_"))   return "#2563EB"; // blue
  if (eventType.startsWith("evidence_"))   return "#0891B2"; // teal
  return "#64748B"; // grey default
}

function getEventLabel(eventType) {
  const labels = {
    tenancy_created:                        "Tenancy Created",
    tenancy_updated:                        "Tenancy Updated",
    tenancy_deposit_protected:              "Deposit Protected",
    tenancy_deposit_prescribed_info_served: "Prescribed Info Served",
    tenancy_how_to_rent_served:             "How to Rent Served",
    tenancy_rra_information_sheet_served:   "RRA Information Sheet Served",
    tenancy_section8_notice_created:        "Section 8 Notice Recorded",
    tenancy_section8_outcome_updated:       "Section 8 Outcome Updated",
    tenancy_section13_notice_created:       "Section 13 Notice Recorded",
    tenancy_section13_outcome_updated:      "Section 13 Outcome Updated",
    tenancy_ended:                          "Tenancy Ended",
    tenancy_tenant_notice_received:         "Tenant Notice Received",
    rent_payment_received:                  "Rent Received",
    rent_payment_partial:                   "Partial Rent Payment",
    rent_payment_waived:                    "Rent Payment Waived",
    rent_payment_overdue:                   "Rent Marked Overdue",
    property_gas_cert_uploaded:             "Gas Certificate Uploaded",
    property_eicr_uploaded:                 "EICR Uploaded",
    property_epc_uploaded:                  "EPC Uploaded",
    property_document_uploaded:             "Document Uploaded",
    property_status_changed:                "Property Status Changed",
    maintenance_job_created:                "Maintenance Job Created",
    maintenance_job_completed:              "Maintenance Job Completed",
    maintenance_job_closed:                 "Maintenance Job Closed",
    document_uploaded:                      "Document Uploaded",
    document_verified:                      "Document Verified",
    evidence_bundle_generated:              "Evidence Bundle Generated",
    email_sent:                             "Email Sent",
    call_logged:                            "Call Logged",
  };
  return labels[eventType] || (eventType ? eventType.replace(/_/g, " ") : "Note");
}

function renderMetadataPills(eventType, metadata) {
  if (!metadata) return "";
  const pills = [];

  if (eventType === "rent_payment_received" || eventType === "rent_payment_partial") {
    if (metadata.period)     pills.push(metadata.period);
    if (metadata.amountPaid) pills.push(`£${Number(metadata.amountPaid).toLocaleString("en-GB")}`);
    if (metadata.method)     pills.push(fmtPaymentMethod(metadata.method));
  }

  if (eventType === "tenancy_deposit_protected") {
    if (metadata.scheme)    pills.push(String(metadata.scheme).toUpperCase());
    if (metadata.reference) pills.push(`Ref: ${metadata.reference}`);
    if (metadata.amount)    pills.push(`£${Number(metadata.amount).toLocaleString("en-GB")}`);
  }

  if (eventType === "tenancy_deposit_prescribed_info_served") {
    if (metadata.servedDate) pills.push(fmtDate(metadata.servedDate));
  }

  if (eventType === "tenancy_how_to_rent_served") {
    if (metadata.version)    pills.push(`Version: ${metadata.version}`);
    if (metadata.servedDate) pills.push(fmtDate(metadata.servedDate));
  }

  if (eventType === "tenancy_rra_information_sheet_served") {
    if (metadata.method)   pills.push(formatRRAMethod(metadata.method));
    if (metadata.servedTo) pills.push(`To: ${metadata.servedTo}`);
  }

  if (eventType === "tenancy_section8_notice_created") {
    if (metadata.grounds)    pills.push(`Grounds: ${Array.isArray(metadata.grounds) ? metadata.grounds.join(", ") : metadata.grounds}`);
    if (metadata.servedDate) pills.push(`Served: ${fmtDate(metadata.servedDate)}`);
  }

  if (eventType === "tenancy_section13_notice_created") {
    if (metadata.proposedRent)  pills.push(`New rent: £${Number(metadata.proposedRent).toLocaleString("en-GB")}`);
    if (metadata.effectiveDate) pills.push(`From: ${fmtDate(metadata.effectiveDate)}`);
  }

  if (eventType === "property_gas_cert_uploaded" ||
      eventType === "property_eicr_uploaded" ||
      eventType === "property_epc_uploaded") {
    if (metadata.expiryDate) pills.push(`Expires: ${fmtDate(metadata.expiryDate)}`);
  }

  if (eventType === "tenancy_ended") {
    if (metadata.endReason) {
      const reasons = {
        tenant_notice:    "Tenant gave notice",
        section8:         "Section 8 possession",
        mutual_agreement: "Mutual agreement",
        fixed_term_end:   "Fixed term expired",
        abandonment:      "Abandonment",
        other:            "Other",
      };
      pills.push(reasons[metadata.endReason] || metadata.endReason);
    }
    if (metadata.actualEndDate) pills.push(fmtDate(metadata.actualEndDate));
  }

  if (eventType === "tenancy_created") {
    if (metadata.tenancyType) pills.push(metadata.tenancyType === "apt" ? "APT" : "AST");
    if (metadata.rent)        pills.push(`£${Number(metadata.rent).toLocaleString("en-GB")} pcm`);
  }

  if (pills.length === 0) return "";

  return `<div style="margin-top:4px; display:flex; gap:5px; flex-wrap:wrap;">${
    pills.map(p =>
      `<span style="background:#F1F5F9; color:#475569; padding:1px 6px; border-radius:3px; font-size:9px; white-space:nowrap;">${p}</span>`
    ).join("")
  }</div>`;
}

function renderActivityLog(activityLog) {
  if (!activityLog || activityLog.length === 0) {
    return `
    <div class="section">
      <h2>13. Activity Log</h2>
      <p style="font-size:10px; color:#64748B; margin-bottom:8px;">
        System-generated record of key actions taken during this tenancy.
        Generated by Proplet. Cannot be edited or deleted.
      </p>
      <p style="font-size:10px; color:#64748B; font-style:italic;">No activity events recorded.</p>
    </div>`;
  }

  const rows = activityLog.map((event) => {
    const colour    = getEventColour(event.eventType);
    const label     = getEventLabel(event.eventType);
    const pills     = renderMetadataPills(event.eventType, event.metadata);
    const recordedBy = event.addedBy
      ? `${event.addedBy.title ? event.addedBy.title + ' ' : ''}${event.addedBy.firstName} ${event.addedBy.lastName}`
      : "System";

    return `
      <div style="display:flex; gap:12px; margin-bottom:10px; padding-bottom:10px; border-bottom:1px solid #F1F5F9;">

        <div style="width:90px; flex-shrink:0; font-size:9px; color:#64748B; padding-top:2px; line-height:1.5;">
          ${fmtDate(event.createdAt)}<br>${formatTime(event.createdAt)}
        </div>

        <div style="width:8px; height:8px; border-radius:50%; flex-shrink:0; margin-top:4px; background:${colour};"></div>

        <div style="flex:1; min-width:0;">
          <div style="font-size:10px; color:#1E293B; font-weight:bold; margin-bottom:2px;">${label}</div>
          <div style="font-size:10px; color:#475569; line-height:1.5;">${event.text}</div>
          ${pills}
        </div>

        <div style="width:90px; flex-shrink:0; text-align:right; font-size:9px; color:#94A3B8; line-height:1.5;">
          ${recordedBy}
        </div>

      </div>`;
  }).join("");

  return `
    <div class="section">
      <h2>13. Activity Log</h2>
      <p style="font-size:10px; color:#64748B; margin-bottom:12px;">
        System-generated record of key actions taken during this tenancy.
        Oldest events first. Generated by Proplet. Cannot be edited or deleted.
      </p>
      <div>${rows}</div>
    </div>`;
}


function renderDisclaimer(generatedAt, generatedBy) {
  return `
    <div class="disclaimer">
      <strong>Important Notice:</strong> This evidence bundle was generated by Proplet property
      management software on ${fmtDate(generatedAt)} by ${generatedBy || "—"}.
      Proplet is a record-keeping tool. This document does not constitute legal advice and does not
      guarantee compliance with any legislation. Always consult a qualified solicitor for specific
      legal guidance. The accuracy of this document depends entirely on the completeness and accuracy
      of data entered into Proplet by the agency.
    </div>`;
}


// ── Main export ───────────────────────────────────────────────────────────────
export function renderBundleHTML(data) {
  const {
    tenancy, documents, certificates,
    rentPayments, arrearsStatus, generatedAt, generatedBy,
    closedJobs, activityLog,
  } = data;

  const body = [
    renderCover(data),
    renderProperty(tenancy),
    renderLandlord(tenancy),
    renderTenants(tenancy),
    renderTenancyDetails(tenancy),
    renderDeposit(tenancy),
    renderDocumentsServedToTenant(tenancy),
    `<div class="page-break"></div>`,
    renderCertificates(certificates),
    renderSection8(tenancy),
    renderSection13(tenancy),
    renderRentHistory(rentPayments, arrearsStatus),
    `<div class="page-break"></div>`,
    renderDocumentIndex(documents),
    renderMaintenanceHistory(closedJobs),
    `<div class="page-break"></div>`,
    renderActivityLog(activityLog || []),
    renderDisclaimer(generatedAt, generatedBy),
  ].join("\n");

  return `<!DOCTYPE html>
|<html>
|<head>
|  <meta charset="UTF-8">
|  <style>${CSS}</style>
|</head>
|<body>
|${body}
|</body>
|</html>`.replace(/\|/g, "");
}
