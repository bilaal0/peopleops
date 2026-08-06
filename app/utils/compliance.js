// ── Compliance Helper Functions ──────────────────────────────────────────────
// File: utils/compliance.js
//
// Import wherever you need compliance status calculations.
// Used in: property detail loader, landlord detail loader,
//          compliance strip UI, certificates tab, dashboard.

// ── Certificate Status ───────────────────────────────────────

export function getCertificateStatus(expiryDate) {
  if (!expiryDate) return "not_uploaded";

  const today = new Date();
  const expiry = new Date(expiryDate);
  const daysUntil = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));

  if (daysUntil < 0) return "expired";
  if (daysUntil <= 30) return "expiring_soon";
  return "valid";
}

// ── Certificate Status Label ─────────────────────────────────

export function getCertificateLabel(status) {
  switch (status) {
    case "expired":       return "Expired";
    case "expiring_soon": return "Expiring Soon";
    case "valid":         return "Valid";
    case "not_uploaded":  return "Not Uploaded";
    default:              return "Unknown";
  }
}

// ── Certificate Status Colour ────────────────────────────────

export function getCertificateColour(status) {
  switch (status) {
    case "expired":       return "red";
    case "expiring_soon": return "amber";
    case "valid":         return "green";
    case "not_uploaded":  return "grey";
    default:              return "grey";
  }
}

// ── Days Until Expiry Label ──────────────────────────────────
// Returns a human-readable string only when close to expiry.
// Returns null when valid with plenty of time remaining.

export function getDaysLabel(expiryDate) {
  if (!expiryDate) return null;

  const today = new Date();
  const expiry = new Date(expiryDate);
  const daysUntil = Math.floor((expiry - today) / (1000 * 60 * 60 * 24));

  if (daysUntil < 0)   return `Expired ${Math.abs(daysUntil)} days ago`;
  if (daysUntil === 0) return "Expires today";
  if (daysUntil === 1) return "Expires tomorrow";
  if (daysUntil <= 30) return `Expires in ${daysUntil} days`;
  return null;
  // null means valid with plenty of time – no urgent label needed
}

// ── AML Status ───────────────────────────────────────────────

export function getAmlStatus(amlResult) {
  switch (amlResult) {
    case "pass":  return { colour: "green", label: "AML Passed" };
    case "refer": return { colour: "amber", label: "AML Referred" };
    case "fail":  return { colour: "red",   label: "AML Failed" };
    default:      return { colour: "grey",  label: "AML Pending" };
    // default covers null = check not yet done
  }
}

// ── EPC Status ───────────────────────────────────────────────
// EPC has extra logic: F/G rating is always red regardless of expiry.

export function getEpcStatus(property) {
  // F or G without exemption – always red, cannot legally let
  if (
    (property.epcRating === "F" || property.epcRating === "G") &&
    !property.epcExemption
  ) {
    return { colour: "red", label: "Below Minimum Standard" };
  }

  // No rating recorded yet
  if (!property.epcRating) {
    return { colour: "grey", label: "Not Recorded" };
  }

  // Check expiry date
  const status = getCertificateStatus(property.epcExpiryDate);
  const colour = getCertificateColour(status);
  const label = status === "valid"
    ? `EPC: ${property.epcRating}` // e.g. 'EPC: C'
    : getCertificateLabel(status);

  return { colour, label };
}

// ── EPC Rating Colour ────────────────────────────────────────
// Used for the large EPC badge on property detail and list.

export function getEpcRatingColour(rating) {
  switch (rating) {
    case "A": return "dark-green";
    case "B": return "green";
    case "C": return "light-green";
    case "D": return "yellow";
    case "E": return "amber";
    case "F": return "orange";
    case "G": return "red";
    default:  return "grey";
  }
}

// ── Selective Licence Status ─────────────────────────────────

export function getSelectiveLicenceStatus(property) {
  // Not required – grey, not a problem
  if (!property.selectiveLicenceRequired) {
    return { colour: "grey", label: "Not Required" };
  }

  // Required but no licence number recorded
  if (!property.selectiveLicenceNo) {
    return { colour: "red", label: "Licence Required" };
  }

  // Has licence number – check expiry
  const status = getCertificateStatus(property.selectiveLicenceExpiry);
  return {
    colour: getCertificateColour(status),
    label:  getCertificateLabel(status),
  };
}

// ── Build Full Compliance Strip Object ───────────────────────
// Call this in your loader and pass the result to the UI.
// UI reads complianceStrip.gas.colour etc – no logic in UI.

export function buildComplianceStrip(property, certificates) {
  const gasStatus  = getCertificateStatus(certificates.gas?.expiryDate);
  const eicrStatus = getCertificateStatus(certificates.eicr?.expiryDate);

  return {
    gas: {
      status:    gasStatus,
      colour:    getCertificateColour(gasStatus),
      label:     getCertificateLabel(gasStatus),
      daysLabel: getDaysLabel(certificates.gas?.expiryDate),
    },
    eicr: {
      status:    eicrStatus,
      colour:    getCertificateColour(eicrStatus),
      label:     getCertificateLabel(eicrStatus),
      daysLabel: getDaysLabel(certificates.eicr?.expiryDate),
    },
    epc:              getEpcStatus(property),
    selectiveLicence: getSelectiveLicenceStatus(property),
    aml:              getAmlStatus(
      property.landlordId?.landlordData?.amlResult
    ),
  };
}

// ── Right to Rent Status ─────────────────────────────────────

export function getRightToRentStatus(tenant) {
  const td = tenant?.tenantData;

  // Not checked at all
  if (!td?.rightToRentChecked) {
    return {
      status:   'not_checked',
      colour:   'red',
      label:    'Not Checked',
      canRent:  false,
      message:  'Right to Rent check has not been completed.',
    };
  }

  // Checked but no expiry (UK/Irish citizens – unlimited)
  if (!td.rightToRentExpiry) {
    return {
      status:   'valid',
      colour:   'green',
      label:    'Valid',
      canRent:  true,
      message:  null,
    };
  }

  // Has expiry date – check status
  const today = new Date();
  const expiry = new Date(td.rightToRentExpiry);
  const daysUntil = Math.floor(
    (expiry - today) / (1000 * 60 * 60 * 24)
  );

  if (daysUntil < 0) {
    return {
      status:   'expired',
      colour:   'red',
      label:    'Expired',
      canRent:  false,
      daysUntil,
      message:  `Right to Rent expired ${Math.abs(daysUntil)} days ago. Re-check required immediately.`,
    };
  }

  if (daysUntil <= 28) {
    return {
      status:   'expiring_soon',
      colour:   'amber',
      label:    `Expires in ${daysUntil} days`,
      canRent:  true,
      daysUntil,
      message:  `Right to Rent expires in ${daysUntil} days. Re-check must be completed before expiry.`,
    };
  }

  if (daysUntil <= 60) {
    return {
      status:   'expiring_soon',
      colour:   'amber',
      label:    `Expires in ${daysUntil} days`,
      canRent:  true,
      daysUntil,
      message:  `Right to Rent expires in ${daysUntil} days. Schedule re-check soon.`,
    };
  }

  return {
    status:   'valid',
    colour:   'green',
    label:    'Valid',
    canRent:  true,
    daysUntil,
    message:  null,
  };
}
