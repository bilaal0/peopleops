// utils/validator.js
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function validateLogin(values = {}) {
  const rawEmail = String(values.email || "");
  const password = String(values.password || "");

  const email = rawEmail.trim().toLowerCase();
  const errors = {};

  if (!email) errors.email = "Email is required";
  else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address";

  if (!password) errors.password = "Password is required";
  else if (password.length < 8) errors.password = "Password must be at least 8 characters";

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    values: { email }, // never echo password
  };
}

export function validateSignup(values = {}) {
  const rawEmail = String(values.email || "");
  const password = String(values.password || "");
  const confirmPassword = String(values.confirmPassword || "");

  const email = rawEmail.trim().toLowerCase();
  const errors = {};

  if (!email) errors.email = "Email is required";
  else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address";

  if (!password) errors.password = "Password is required";
  else if (password.length < 8) errors.password = "Password must be at least 8 characters";

  if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match";

  return {
    valid: Object.keys(errors).length === 0,
    errors,
    values: { email }, // never echo password
  };
}

export function validateAgency(values = {}) {
    const errors = {};
    const name = String(values.name || "").trim();
    const isBranch = Boolean(values.isBranch);
    const parentId = String(values.parentId || "").trim();
    const propertyLimit = Number(values.propertyLimit);
    const userLimit = Number(values.userLimit);
    
    // Admin Details Validation
    const firstName = String(values.firstName || "").trim();
    const lastName = String(values.lastName || "").trim();
    const email = String(values.email || "").trim();
    const phone = String(values.phone || "").trim();

    if (!name) {
        errors.name = "Agency name is required";
    }

    // Require admin details for new agencies (assuming this validator is used for creation)
    if (!firstName) {
        errors.firstName = "First Name is required";
    }
    if (!lastName) {
        errors.lastName = "Last Name is required";
    }

    if (!email) {
        errors.email = "Primary Admin Email is required";
    } else if (!EMAIL_RE.test(email)) {
        errors.email = "Enter a valid email address";
    }

    if (!phone) {
        errors.phone = "Primary Admin Phone is required";
    }

    if (isBranch && !parentId) {
        errors.parentId = "Parent Agency ID is required for branches";
    }

    if (isNaN(propertyLimit) || propertyLimit < 0) {
        errors.propertyLimit = "Property limit must be a positive number";
    }

    if (isNaN(userLimit) || userLimit < 0) {
        errors.userLimit = "User limit must be a positive number";
    }

    return {
        valid: Object.keys(errors).length === 0,
        errors,
    }
}

export function validateTenancy(values = {}) {
    const errors = {};

    // ══════════════════════════════════════════════════════════════════════════════
    // BASIC FIELD VALIDATIONS
    // ══════════════════════════════════════════════════════════════════════════════

    if (!values.propertyId) {
        errors.propertyId = "Property is required";
    }

    if (!values.landlordId) {
        errors.landlordId = "Landlord ID is required";
    }

    // Tenant IDs (support joint tenancy - multiple tenants)
    let tenantIds = [];
    if (values.tenantIds) {
        tenantIds = Array.isArray(values.tenantIds) ? values.tenantIds : [values.tenantIds];
    }
    if (!tenantIds || tenantIds.length === 0 || !tenantIds[0]) {
        errors.tenantIds = "At least one tenant is required";
    }

    if (!values.tenancyType || !["ast", "apt"].includes(values.tenancyType)) {
        errors.tenancyType = "Tenancy type must be AST or APT";
    }

    if (!values.startDate) {
        errors.startDate = "Start date is required";
    }

    // Tenancy type specific validations
    if (values.tenancyType === "ast" && !values.endDate) {
        errors.endDate = "End date is required for AST tenancies";
    }

    if (values.startDate && values.endDate && values.tenancyType === "ast") {
        const start = new Date(values.startDate);
        const end = new Date(values.endDate);
        if (end <= start) {
            errors.endDate = "End date must be after start date";
        }
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // RENT VALIDATIONS
    // ══════════════════════════════════════════════════════════════════════════════

    const rentAmount = parseFloat(values.rentAmount) || 0;
    if (!rentAmount || rentAmount <= 0) {
        errors.rentAmount = "Rent amount must be greater than 0";
    }

    const rentDueDay = parseInt(values.rentDueDay) || 1;
    if (rentDueDay < 1 || rentDueDay > 28) {
        errors.rentDueDay = "Rent due day must be between 1 and 28";
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // DEPOSIT VALIDATIONS (if deposit taken)
    // ══════════════════════════════════════════════════════════════════════════════

    if (values.depositTaken === "true") {
        const depositAmount = parseFloat(values.depositAmount) || 0;
        if (!depositAmount || depositAmount <= 0) {
            errors.depositAmount = "Deposit amount must be greater than 0";
        }

        if (!values.depositScheme) {
            errors.depositScheme = "Deposit scheme is required when deposit is taken";
        }

        // Check legal maximum (5 weeks rent)
        const maxDeposit = (rentAmount * 5) / 4.33;
        if (depositAmount > maxDeposit) {
            errors.depositAmount = `Deposit exceeds legal maximum of £${maxDeposit.toFixed(
                2
            )} (5 weeks rent)`;
        }
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // HOW-TO-RENT VALIDATIONS (if served)
    // ══════════════════════════════════════════════════════════════════════════════

    if (values.howToRentServed === "true") {
        if (!values.howToRentDate) {
            errors.howToRentDate = "Date served is required when How-to-Rent guide is served";
        }
        if (!values.howToRentVersion?.trim()) {
            errors.howToRentVersion = "Guide version is required when How-to-Rent guide is served";
        }
    }

    return {
        valid: Object.keys(errors).length === 0,
        errors,
    };
}
