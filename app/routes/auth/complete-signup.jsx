import { Link, Form, useActionData, useNavigation, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import toast, { Toaster } from "react-hot-toast";

export async function action({ request }) {
  // ── Server-only imports ──
  const { connect } = await import("../../config/db.server.js");
  const { User } = await import("../../models/user.server.js");
  const { PendingSignup } = await import("../../models/pendingSignup.server.js");
  const { Agency } = await import("../../models/agency.server.js");
  const { createUserSessionRedirect } = await import("../../utils/auth.server.js");

  await connect();

  const formData = await request.formData();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const title = String(formData.get("title") || "").trim();
  const firstName = String(formData.get("firstName") || "").trim() || "Admin";
  const lastName = String(formData.get("lastName") || "").trim() || "User";
  const agencyName = String(formData.get("agencyName") || "").trim() || (email ? `${email.split("@")[0]} Organization` : "Organization");
  const phone = String(formData.get("phone") || "").trim();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  // ── Validation ──
  const errors = {};
  if (!password) errors.password = "Password is required.";
  else if (password.length < 8) errors.password = "Password must be at least 8 characters.";
  if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match.";

  if (Object.keys(errors).length > 0) return { errors };


  try {
    const pending = await PendingSignup.findOne({ email });
    if (!pending) {
      return { error: "No verification found. Please start the signup process again." };
    }
    if (!pending.verified) {
      return { error: "Your email hasn't been verified yet. Please go back and verify your code." };
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return { error: "An account with this email already exists. Please sign in." };
    }

    // Create Agency (30-day trial)
    const agency = await Agency.create({
      name: agencyName,
      plan: "trial",
      status: "trialing",
      propertyLimit: 30,
      email,
      phone: phone || undefined,
    });

    // Create admin user linked to agency
    const user = await User.create({
      email,
      title: title || undefined,
      firstName,
      lastName,
      password, // Hashed by pre-save hook
      emailVerified: true,
      roles: ["ADMIN"],
      agencyId: agency._id,
      selfManaging: false,
      status: 1,
    });

    await PendingSignup.deleteOne({ email });

    return await createUserSessionRedirect({
      userId: String(user._id),
      roles: user.roles || [],
      agencyId: String(agency._id),
      remember: true,
      redirectTo: "/dashboard",
    });
  } catch (err) {
    console.error("[complete-signup] Error:", err);
    return { error: "Something went wrong creating your account. Please try again." };
  }
}

export default function CompleteSignup() {
  const [searchParams] = useSearchParams();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const email = searchParams.get("email") || "";
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Toast on top-level error
  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData.error);
    }
  }, [actionData]);

  const field = (name) =>
    `block w-full rounded-lg border px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 shadow-sm outline-none transition focus:ring-2 focus:ring-indigo-500/30 ${
      actionData?.errors?.[name]
        ? "border-red-400 focus:border-red-400"
        : "border-gray-300 focus:border-indigo-500"
    }`;

  return (
    <div className="flex min-h-screen font-sans">
      <Toaster position="top-right" toastOptions={{ duration: 4000 }} />

      {/* ── Left panel — branding ─────────────────────────── */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, #4f46e5 0%, #7c3aed 30%, #a855f7 55%, #6366f1 75%, #3b82f6 100%)",
        }}
      >
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(255,255,255,0.18) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 right-0 w-[360px] h-[360px] rounded-full blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(circle, rgba(99,102,241,0.45) 0%, transparent 70%)" }} />

        {/* Logo */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm border border-white/30">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <span className="text-white font-bold text-xl tracking-tight drop-shadow">Proplet</span>
        </div>

        {/* Centre copy */}
        <div className="relative z-10">
          <h2 className="text-white text-4xl font-bold leading-tight mb-4 drop-shadow-sm">
            One step away,<br />
            <span className="text-white/80">from smarter letting.</span>
          </h2>
          <p className="text-indigo-100 text-base leading-relaxed max-w-sm">
            Complete your profile to unlock the full power of Proplet and start managing properties the right way.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            {[
              { text: "End-to-end tenancy management" },
              { text: "Smart document intelligence" },
              { text: "Eliminate manual admin tasks" },
              { text: "Secure evidence vault with complete audit trails" },
            ].map((item) => (
              <div key={item.text} className="flex items-start gap-2.5">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/25 text-white text-xs font-bold mt-0.5">✓</span>
                <p className="text-indigo-100 text-sm">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative z-10 text-indigo-200/70 text-xs">
          © {new Date().getFullYear()} Proplet · Smarter property management
        </p>
      </div>

      {/* ── Right panel — form ────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12 sm:px-12 overflow-y-auto">
        {/* Mobile logo */}
        <div className="mb-8 flex items-center gap-2 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-lg tracking-tight">Proplet</span>
        </div>

        <div className="w-full max-w-md">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900">Set your password</h1>
            <p className="mt-1 text-sm text-gray-500">Set a password to complete your account setup.</p>
          </div>

          {/* Verified email badge */}
          <div className="mb-5 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3.5 py-2.5">
            <svg className="h-4 w-4 text-green-600 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-sm text-green-800 font-medium">{email}</span>
            <span className="ml-auto text-xs text-green-600 font-medium">Verified ✓</span>
          </div>

          <Form method="post" className="space-y-4">
            <input type="hidden" name="email" value={email} />

            {/* Password */}

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  name="password"
                  id="password"
                  className={`${field("password")} pr-11`}
                  placeholder="Min. 8 characters"
                  required
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showPass ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
              {actionData?.errors?.password && (
                <p className="mt-1.5 text-xs text-red-600">{actionData.errors.password}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  name="confirmPassword"
                  id="confirmPassword"
                  className={`${field("confirmPassword")} pr-11`}
                  placeholder="Re-enter your password"
                  required
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-gray-400 hover:text-gray-600"
                  tabIndex={-1}
                >
                  {showConfirm ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
              {actionData?.errors?.confirmPassword && (
                <p className="mt-1.5 text-xs text-red-600">{actionData.errors.confirmPassword}</p>
              )}
            </div>

            {/* Trial notice */}
            <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3.5 py-3 text-xs text-indigo-700">
              🎉 <strong>30-day free trial</strong> — no credit card required. Track up to 30 properties.
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Creating your account…
                </>
              ) : (
                "Start Free Trial"
              )}
            </button>

            <p className="text-center text-sm text-gray-500">
              Already have an account?{" "}
              <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-700">Sign in</Link>
            </p>
          </Form>
        </div>
      </div>
    </div>
  );
}
