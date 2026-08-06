import { redirect } from "react-router";
import { Link, Form, useActionData, useNavigation, useSearchParams } from "react-router-dom";
import { useState, useEffect } from "react";
import toast, { Toaster } from "react-hot-toast";

const MAX_ATTEMPTS = 5;

export async function action({ request }) {
  // ── Server-only imports (never bundled to client) ──
  const { connect } = await import("../../config/db.server.js");
  const { PendingSignup } = await import("../../models/pendingSignup.server.js");
  const { verifyOTP, isOTPExpired } = await import("../../utils/otp.server.js");

  await connect();

  const formData = await request.formData();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const otp = String(formData.get("otp") || "").trim();

  if (!email || !otp) {
    return { error: "Email and verification code are required." };
  }

  if (!/^\d{6}$/.test(otp)) {
    return { error: "Please enter a valid 6-digit code." };
  }

  try {
    const pending = await PendingSignup.findOne({ email }).select("+otp");

    if (!pending) {
      return { error: "No verification request found. Please start signup again." };
    }

    if (pending.verified) {
      return redirect(`/auth/complete-signup?email=${encodeURIComponent(email)}`);
    }

    if (isOTPExpired(pending.expiresAt)) {
      return { error: "This code has expired. Please request a new one." };
    }

    if (pending.attempts >= MAX_ATTEMPTS) {
      return { error: "Too many failed attempts. Please request a new code." };
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

    // ✅ Mark verified → proceed to complete signup
    pending.verified = true;
    await pending.save();

    return redirect(`/auth/complete-signup?email=${encodeURIComponent(email)}`);
  } catch (err) {
    console.error("[verify-otp] Error:", err);
    return { error: "Something went wrong. Please try again." };
  }
}

export default function VerifyOTP() {
  const [searchParams] = useSearchParams();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [otp, setOtp] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isSending, setIsSending] = useState(false);
  const email = searchParams.get("email") || "";

  // Show error toasts when server returns errors
  useEffect(() => {
    if (actionData?.error) {
      toast.error(actionData.error);
    }
  }, [actionData]);

  // Resend cooldown countdown
  useEffect(() => {
    if (resendCooldown > 0) {
      const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
      return () => clearTimeout(t);
    }
  }, [resendCooldown]);

  const handleResend = async () => {
    setIsSending(true);
    try {
      const fd = new FormData();
      fd.append("email", email);
      const res = await fetch("/auth/request-otp", { method: "POST", body: fd });
      if (res.ok) {
        setResendCooldown(60);
        toast.success("A new verification code has been sent.");
      } else {
        toast.error("Could not resend code. Please try again.");
      }
    } catch {
      toast.error("Failed to resend code. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

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
            Smarter letting,<br />
            <span className="text-white/80">starts today.</span>
          </h2>
          <p className="text-indigo-100 text-base leading-relaxed max-w-sm">
            Verify your identity to securely access your Proplet account and experience the future of property management.
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
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6 py-12 sm:px-12">
        {/* Mobile logo */}
        <div className="mb-10 flex items-center gap-2 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600">
            <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
          </div>
          <span className="font-bold text-gray-900 text-lg tracking-tight">AgentShield</span>
        </div>

        <div className="w-full max-w-md">
          {/* Email badge */}
          <div className="mb-2 flex items-center justify-center gap-2 rounded-full bg-indigo-50 border border-indigo-100 px-4 py-1.5 w-fit mx-auto">
            <svg className="h-3.5 w-3.5 text-indigo-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
            </svg>
            <span className="text-xs font-medium text-indigo-700">{email}</span>
          </div>

          <div className="mb-8 mt-4 text-center">
            <h1 className="text-2xl font-bold text-gray-900">Check your email</h1>
            <p className="mt-1.5 text-sm text-gray-500">
              We sent a 6-digit verification code. It expires in 10 minutes.
            </p>
          </div>

          <Form method="post" className="space-y-5">
            <input type="hidden" name="email" value={email} />

            {/* OTP Input */}
            <div>
              <label htmlFor="otp" className="block text-sm font-medium text-gray-700 mb-1.5">
                Verification Code
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
                className="block w-full rounded-lg border border-gray-300 px-3.5 py-3 text-center text-2xl font-mono tracking-[0.5em] shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                placeholder="000000"
                maxLength={6}
                autoComplete="one-time-code"
                required
                disabled={isSubmitting}
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || otp.length !== 6}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Verifying…
                </>
              ) : (
                "Verify & Continue"
              )}
            </button>
          </Form>

          {/* Resend */}
          <div className="mt-5 text-center">
            {resendCooldown > 0 ? (
              <p className="text-sm text-gray-500">
                Resend code in <span className="font-medium text-indigo-600">{resendCooldown}s</span>
              </p>
            ) : (
              <button
                type="button"
                onClick={handleResend}
                disabled={isSending}
                className="text-sm font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
              >
                {isSending ? "Sending…" : "Didn't receive it? Resend code"}
              </button>
            )}
          </div>

          <p className="mt-4 text-center text-sm text-gray-500">
            Wrong email?{" "}
            <Link to="/signup" className="font-medium text-indigo-600 hover:text-indigo-700">
              Start over
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
