import { redirect } from "react-router";
import { Link, Form, useActionData, useNavigation, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import toast, { Toaster } from "react-hot-toast";

const MAX_ATTEMPTS = 5;

export async function action({ request }) {
  const { connect } = await import("../../config/db.server.js");
  const { PendingLogin } = await import("../../models/pendingLogin.server.js");
  const { User } = await import("../../models/user.server.js");
  const { verifyOTP, isOTPExpired } = await import("../../utils/otp.server.js");
  const { createUserSessionRedirect } = await import("../../utils/auth.server.js");

  await connect();

  const formData = await request.formData();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const otp = String(formData.get("otp") || "").trim();
  const remember = formData.get("remember") === "true";

  if (!email || !otp) {
    return { error: "Email and verification code are required." };
  }

  if (!/^\d{6}$/.test(otp)) {
    return { error: "Please enter a valid 6-digit code." };
  }

  try {
    const pending = await PendingLogin.findOne({ email }).select("+otp");

    if (!pending) {
      return { error: "No verification request found. Please login again." };
    }

    if (pending.verified) {
      return { error: "This code has already been used. Please login again." };
    }

    if (isOTPExpired(pending.expiresAt)) {
      return { error: "This code has expired. Please login again." };
    }

    if (pending.attempts >= MAX_ATTEMPTS) {
      return { error: "Too many failed attempts. Please login again." };
    }

    const isValid = await verifyOTP(otp, pending.otp);

    if (!isValid) {
      pending.attempts += 1;
      await pending.save();
      const attemptsLeft = MAX_ATTEMPTS - pending.attempts;
      return {
        error: `Incorrect code. ${attemptsLeft} attempt${attemptsLeft !== 1 ? "s" : ""} remaining.`,
      };
    }

    pending.verified = true;
    await pending.save();

    const user = await User.findOne({ email, deleted: { $ne: true } })
      .select("_id roles agencyId")
      .lean();

    if (!user) {
      return { error: "Account not found. Please contact support." };
    }

    await PendingLogin.deleteOne({ email });

    return await createUserSessionRedirect({
      userId: String(user._id),
      roles: user.roles || [],
      agencyId: user.agencyId ? String(user.agencyId) : null,
      remember,
      redirectTo: "/dashboard",
    });
  } catch (err) {
    console.error("[verify-login] Error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

export default function VerifyLogin() {
  const actionData = useActionData();
  const navigation = useNavigation();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || "";
  const remember = searchParams.get("remember") || "false";
  const isSubmitting = navigation.state === "submitting";
  const [otp, setOtp] = useState("");

  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData.error);
    }
  }, [actionData]);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.16),_transparent_34%),linear-gradient(180deg,#faf9ff_0%,#f3efff_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />

      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center justify-center">
        <div className="relative w-full animate-fade-in overflow-hidden rounded-3xl border border-indigo-100/70 bg-white shadow-[0_30px_90px_-40px_rgba(99,102,241,0.32)]">

          <div className="relative z-10 border-b border-gray-100 px-8 pb-4 pt-8 text-center sm:px-10">
            <div className="mx-auto mb-1.5 flex items-center justify-center">
              <img src="/assets/logo/proplet.png" alt="Proplet" className="h-14 w-auto object-contain" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-600">Secure login</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">Verify your login</h1>
          </div>

          <div className="relative z-10 px-8 py-7 sm:px-10">
            <div className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Code sent to</p>
              <p className="mt-1 break-all text-sm text-gray-700">{email}</p>
            </div>

            <div className="mb-6 text-center">
              <p className="text-sm leading-6 text-gray-500">
                Enter the 6-digit code we emailed you. It expires in 10 minutes.
              </p>
            </div>

            <Form method="post" className="space-y-5">
              <input type="hidden" name="email" value={email} />
              <input type="hidden" name="remember" value={remember} />

              <div>
                <label htmlFor="otp" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Verification code
                </label>
                <input
                  type="text"
                  name="otp"
                  id="otp"
                  value={otp}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                    setOtp(v);
                  }}
                  className="block w-full rounded-xl border border-gray-300 bg-white px-3.5 py-3 text-center text-2xl font-semibold tracking-[0.45em] text-gray-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10"
                  placeholder="000000"
                  maxLength={6}
                  autoComplete="one-time-code"
                  pattern="\d{6}"
                  required
                  autoFocus
                  disabled={isSubmitting}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting || otp.length !== 6}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2657F7] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f49d4] focus:outline-none focus:ring-4 focus:ring-[#2657F7]/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Verifying...
                  </>
                ) : (
                  "Verify & Sign In"
                )}
              </button>
            </Form>

            <p className="mt-5 text-center text-sm text-gray-500">
              <Link to="/login" className="font-medium text-indigo-600 hover:text-violet-600">
                Back to login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
