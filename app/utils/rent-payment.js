// utils/rent-payment.js
// Pure utility functions for rent payment management.
// No DB calls — import and call directly in actions/loaders.

// ================================================================
// GENERATE PAYMENT PERIODS
// ================================================================
// Generates first N months of pending payment records.
// Pure function — returns array, does NOT write to DB.
// Caller uses: RentPayment.insertMany(payments)
// Cron job handles subsequent months automatically.

export function generatePaymentPeriods(tenancy, property, count = 3) {
  const payments = [];
  const startDate = new Date(tenancy.startDate);

  for (let i = 0; i < count; i++) {
    // Calculate period start (1st of each month)
    const periodStart = new Date(
      startDate.getFullYear(),
      startDate.getMonth() + i,
      1
    );

    // Calculate period end (last day of month)
    const periodEnd = new Date(
      periodStart.getFullYear(),
      periodStart.getMonth() + 1,
      0 // day 0 of next month = last day of current month
    );

    // Calculate due date based on tenancy rent.dueDay
    const dueDate = new Date(
      periodStart.getFullYear(),
      periodStart.getMonth(),
      tenancy.rent.dueDay
    );

    payments.push({
      agencyId:          tenancy.agencyId,
      tenancyId:         tenancy._id,
      propertyId:        tenancy.propertyId,
      landlordId:        tenancy.landlordId,
      periodStart,
      periodEnd,
      dueDate,
      amountDue:         tenancy.rent.amount,
      amountPaid:        0,
      amountOutstanding: tenancy.rent.amount,
      commissionType:    property.commission?.type  || null,
      commissionRate:    property.commission?.rate  || null,
      commissionAmount:  null, // calculated when paid
      vatAmount:         0,
      netToLandlord:     null, // calculated when paid
      status:            "pending",
    });
  }

  return payments;
}

// ================================================================
// COMMISSION CALCULATION
// ================================================================
// Call this when agent marks a payment as paid.
// Returns commissionAmount, vatAmount, netToLandlord.

export function calculateCommission(amountPaid, property) {
  const commission = property.commission;

  if (!commission || !commission.rate) {
    return {
      commissionAmount: 0,
      vatAmount:        0,
      netToLandlord:    amountPaid,
    };
  }

  let commissionAmount = 0;

  if (commission.type === "percentage") {
    commissionAmount = (amountPaid * commission.rate) / 100;
  } else if (commission.type === "fixed") {
    // Fixed fee capped at amount paid
    // (cannot charge more commission than rent received)
    commissionAmount = Math.min(commission.rate, amountPaid);
  }

  // Round to 2 decimal places
  commissionAmount = Math.round(commissionAmount * 100) / 100;

  // VAT on commission (20%) only if agency is VAT registered
  const vatAmount = commission.vatRegistered
    ? Math.round(commissionAmount * 0.20 * 100) / 100
    : 0;

  const netToLandlord = Math.round(
    (amountPaid - commissionAmount - vatAmount) * 100
  ) / 100;

  return {
    commissionAmount,
    vatAmount,
    netToLandlord,
  };
}

// ================================================================
// ARREARS CALCULATION
// ================================================================
// Call this in your tenancy detail loader.
// Used by compliance strip and Section 8 eligibility banner.

export function calculateArrearsStatus(rentPayments) {
  const overduePayments = rentPayments.filter(
    (p) => p.status === "overdue"
  );
  const partialPayments = rentPayments.filter(
    (p) => p.status === "partial"
  );

  const totalArrears = [
    ...overduePayments,
    ...partialPayments,
  ].reduce(
    (sum, p) => sum + (p.amountDue - p.amountPaid), 0
  );

  const monthsArrears = overduePayments.length;

  return {
    totalArrears:             Math.round(totalArrears * 100) / 100,
    monthsArrears,
    hasArrears:               totalArrears > 0,
    section8Ground8Eligible:  monthsArrears >= 2,
    // Ground 8: mandatory possession if 2+ months arrears
    // at both notice date AND court hearing date
    section8Ground10Eligible: totalArrears > 0,
    // Ground 10: some arrears (discretionary)
  };
}
