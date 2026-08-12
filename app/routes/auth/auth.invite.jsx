import { redirect } from "react-router";
import { useLoaderData, useActionData, Form } from "react-router";
import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
import toast, { Toaster } from "react-hot-toast";

// ── Loader: validate invite token ─────────────────────────────────────────────
export async function loader({ request }) {
  const { connect } = await import("../../config/db.server.js");
  const { User } = await import("../../models/user.server.js");

  await connect();

  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    throw new Response("Missing or invalid invite link.", { status: 400 });
  }

  const user = await User.findOne({
    inviteToken: token,
    inviteExpires: { $gt: new Date() },
  }).lean();

  if (!user) {
    throw new Response(
      "This invite link has expired or is invalid. Please contact AgentShield support.",
      { status: 400 }
    );
  }

  return { email: user.email, token };
}

// ── Action: set password + auto-login ─────────────────────────────────────────
export async function action({ request }) {
  const { connect } = await import("../../config/db.server.js");
  const { User } = await import("../../models/user.server.js");
  const { createUserSessionRedirect } = await import("../../utils/auth.server.js");

  await connect();

  const formData = await request.formData();
  const token = String(formData.get("token") || "");
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");

  // — Validation —
  const errors = {};
  if (!password) errors.password = "Password is required.";
  else if (password.length < 8) errors.password = "Password must be at least 8 characters.";
  if (password !== confirmPassword) errors.confirmPassword = "Passwords do not match.";

  if (Object.keys(errors).length > 0) return { errors };

  try {
    const user = await User.findOne({
      inviteToken: token,
      inviteExpires: { $gt: new Date() },
      email,
    });

    if (!user) {
      return { error: "This invite link has expired. Please contact AgentShield support." };
    }

    // Activate account
    user.password = password; // Hashed by pre-save hook
    user.inviteToken = undefined;
    user.inviteExpires = undefined;
    user.emailVerified = true;
    user.status = 1; // Active

    await user.save();

    // Auto-login with full session (including organizationId)
    return await createUserSessionRedirect({
      userId: String(user._id),
      roles: user.roles || [],
      organizationId: user.organizationId ? String(user.organizationId) : null,
      remember: true,
      redirectTo: "/dashboard",
    });
  } catch (err) {
    console.error("[accept-invite] Error:", err);
    return { error: "Something went wrong. Please try again or contact support." };
  }
}

// ── UI ────────────────────────────────────────────────────────────────────────
export default function AcceptInvite() {
  const { email, token } = useLoaderData();
  const actionData = useActionData();
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData.error);
    }
  }, [actionData]);

  const fieldClass = (name) =>
    `block w-full rounded-lg border px-3.5 py-2.5 pr-11 text-sm text-gray-900 placeholder-gray-400 shadow-sm outline-none transition focus:ring-2 focus:ring-indigo-500/30 ${
      actionData?.errors?.[name]
        ? "border-red-400 focus:border-red-400"
        : "border-gray-300 focus:border-indigo-500"
    }`;

  return (
    <div className="flex min-h-screen font-sans">
      <Toaster position="top-right" toastOptions={{ duration: 5000 }} />

      {/* ── Left panel ─────────────────────────────── */}
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

        <div className="relative z-10 flex items-center gap-3">
          <div className="bg-white/90 p-2 rounded-xl backdrop-blur-sm shadow-sm border border-white/50">
            <img src="/assets/logo/Peopleops.png" alt="PeopleOps" className="h-10 w-auto object-contain drop-shadow-sm" />
          </div>
        </div>

        <div className="relative z-10">
          <h2 className="text-white text-4xl font-bold leading-tight mb-4 drop-shadow-sm">
            Smarter letting,<br />
            <span className="text-white/80">starts today.</span>
          </h2>
          <p className="text-indigo-100 text-base leading-relaxed max-w-sm">
            Set your password to activate your PeopleOps account and experience the future of HR management.
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
          © {new Date().getFullYear()} PeopleOps · Built for modern HR
        </p>
      </div>

      {/* ── Right panel — form ────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12 sm:px-12">
        {/* Mobile logo */}
        <div className="mb-8 flex items-center justify-center lg:hidden">
          <img src="/assets/logo/Peopleops.png" alt="PeopleOps" className="h-10 w-auto object-contain" />
        </div>

        <div className="w-full max-w-md">
          {/* Invite badge */}
          <div className="mb-2 flex items-center justify-center gap-2 rounded-full bg-green-50 border border-green-200 px-4 py-1.5 w-fit mx-auto">
            <svg className="h-3.5 w-3.5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-xs font-medium text-green-700">{email}</span>
          </div>

          <div className="mb-6 mt-4 text-center">
            <h1 className="text-2xl font-bold text-gray-900">Accept Your Invitation</h1>
            <p className="mt-1.5 text-sm text-gray-500">
              Set a secure password to activate your AgentShield account.
            </p>
          </div>

          <Form method="post" className="space-y-4" onSubmit={() => setIsSubmitting(true)}>
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="email" value={email} />

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1.5">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPass ? "text" : "password"}
                  name="password"
                  id="password"
                  className={fieldClass("password")}
                  placeholder="Min. 8 characters"
                  required
                  disabled={isSubmitting}
                  autoFocus
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
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1.5">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  name="confirmPassword"
                  id="confirmPassword"
                  className={fieldClass("confirmPassword")}
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

            {/* Password hint */}
            <p className="text-xs text-gray-400">
              At least 8 characters. We recommend using a passphrase.
            </p>

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
                  Activating account…
                </>
              ) : (
                "Set Password & Activate Account"
              )}
            </button>

            <p className="text-center text-sm text-gray-500">
              Already have a password?{" "}
              <Link to="/login" className="font-medium text-indigo-600 hover:text-indigo-700">
                Sign in
              </Link>
            </p>
          </Form>
        </div>
      </div>
    </div>
  );
}
