import { useState } from "react";
import { Form, useActionData, useNavigation } from "react-router-dom";
import { redirect } from "react-router";

export async function loader({ request }) {
  const [{ getUserFromRequest }] = await Promise.all([import("../../utils/auth.server.js")]);
  const user = await getUserFromRequest(request);
  if (user) return redirect("/dashboard");
  return null;
}

export async function action({ request }) {
  const [{ validateLogin }] = await Promise.all([import("../../utils/validator.js")]);
  const [{ login, createUserSessionRedirect }] = await Promise.all([import("../../utils/auth.server.js")]);
  const { User } = await import("../../models/user.server.js");
  const { PendingLogin } = await import("../../models/pendingLogin.server.js");
  const { generateOTP, getOTPExpiration, canRequestOTP } = await import("../../utils/otp.server.js");
  const [{ connect }] = await Promise.all([import("../../config/db.server.js")]);

  await connect();

  const form = await request.formData();
  const step = String(form.get("step") || "email");
  const email = String(form.get("email") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const remember = form.get("remember") === "on";

  if (step === "email") {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
    if (!email) return { step: "email", errors: { email: "Email is required" }, values: { email } };
    if (!emailPattern.test(email)) {
      return { step: "email", errors: { email: "Enter a valid email address" }, values: { email } };
    }

    // Do NOT reveal whether the account exists — check silently
    const existingUser = await User.findOne({ email, deleted: { $ne: true } }).select("_id status").lean();

    // Always proceed to password step regardless of whether the account exists.
    // Invalid credentials will be caught at the password/OTP stage.
    if (!existingUser || existingUser.status !== 1) {
      // Return password step UI but login will fail at the next step — no enumeration leak
      return { step: "password", values: { email } };
    }

    return { step: "password", values: { email } };
  }

  const { valid, errors, values } = validateLogin({ email, password });
  if (!valid) return { errors, values };

  const result = await login({ email, password });
  if (result.status !== 200) {
    // Generic message — don't hint whether email or password was wrong
    return { errors: { email: "Incorrect email or password. Please try again." }, values: { email, password } };
  }

  /* OTP function hidden / commented out for now:
  try {
    const existingPending = await PendingLogin.findOne({ email });

    // Rate limiting: max 5 OTP requests per hour
    if (existingPending) {
      const allowed = canRequestOTP(existingPending.requestCount, existingPending.lastRequestAt, 5, 60);
      if (!allowed) {
        return { errors: { form: "Too many login attempts. Please wait before trying again." }, values: { email } };
      }
    }

    const otp = generateOTP();

    if (existingPending) {
      existingPending.otp = otp;
      existingPending.expiresAt = getOTPExpiration();
      existingPending.verified = false;
      existingPending.attempts = 0;
      existingPending.requestCount += 1;
      existingPending.lastRequestAt = new Date();
      await existingPending.save();
    } else {
      await PendingLogin.create({
        email,
        otp,
        expiresAt: getOTPExpiration(),
        verified: false,
        attempts: 0,
        requestCount: 1,
        lastRequestAt: new Date(),
      });
    }

    const template = emailTemplates.otpVerification({ otp, email });
    await sendEmail({ to: email, subject: template.subject, html: template.html, text: template.text });

    return redirect(`/auth/verify-login?email=${encodeURIComponent(email)}&remember=${remember}`);
  } catch (error) {
    console.error("Login OTP Error:", error);
    return { errors: { form: "Something went wrong. Please try again." }, values: { email } };
  }
  */

  // Direct login session creation while OTP is commented out:
  const user = result.user;
  return await createUserSessionRedirect({
    userId: String(user._id),
    roles: user.roles || [],
    agencyId: user.agencyId || null,
    remember,
    redirectTo: "/dashboard",
  });
}

function FieldError({ message }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-red-600">{message}</p>;
}

export default function Login() {
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [showPassword, setShowPassword] = useState(false);
  const isPasswordStep = actionData?.step === "password";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.16),_transparent_34%),linear-gradient(180deg,#faf9ff_0%,#f3efff_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center justify-center">
        <div className="relative w-full animate-fade-in overflow-hidden rounded-3xl border border-indigo-100/70 bg-white shadow-[0_30px_90px_-40px_rgba(99,102,241,0.32)]">

          <div className="relative z-10 border-b border-gray-100 px-8 pb-4 pt-8 text-center sm:px-10">
            <div className="mx-auto mb-1.5 flex items-center justify-center">
              <img src="/assets/logo/proplet.png" alt="Proplet" className="h-14 w-auto object-contain" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-600">Welcome back</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">Sign in</h1>
          </div>

          <div className="relative z-10 px-8 py-7 sm:px-10">
            {actionData?.errors?.form && (
              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.5a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zM10 14.5a1 1 0 100 2 1 1 0 000-2z"
                    clipRule="evenodd"
                  />
                </svg>
                <p className="text-sm text-red-700">{actionData.errors.form}</p>
              </div>
            )}

            {typeof window !== "undefined" && window.location.search.includes("reset=success") && !actionData?.errors && (
              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-sm text-green-700">Password reset successful. You can now log in.</p>
              </div>
            )}

            <Form method="post" className="space-y-5">
              <input type="hidden" name="step" value={isPasswordStep ? "password" : "email"} />
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">
                  Email address
                </label>
                <input
                  type="email"
                  name="email"
                  id="email"
                  defaultValue={actionData?.values?.email}
                  autoComplete="email"
                  required
                  placeholder="you@agencyname.co.uk"
                  readOnly={isPasswordStep}
                  className={`block w-full rounded-xl border bg-white px-3.5 py-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus:ring-4 focus:ring-indigo-500/10 ${
                    actionData?.errors?.email
                      ? "border-red-400 focus:border-red-400"
                      : "border-gray-300 focus:border-indigo-500"
                  } ${isPasswordStep ? "bg-gray-50" : ""}`}
                />
                <FieldError message={actionData?.errors?.email} />
              </div>

              {isPasswordStep && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-4">
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                      Password
                    </label>
                    <a href="/auth/forgot-password" className="text-xs font-medium text-indigo-600 hover:text-violet-600">
                      Forgot password?
                    </a>
                  </div>

                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      id="password"
                      autoComplete="current-password"
                      required
                      placeholder="Enter your password"
                      className={`block w-full rounded-xl border bg-white px-3.5 py-3 pr-11 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus:ring-4 focus:ring-indigo-500/10 ${
                        actionData?.errors?.password
                          ? "border-red-400 focus:border-red-400"
                          : "border-gray-300 focus:border-indigo-500"
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 flex items-center px-3.5 text-gray-400 transition hover:text-gray-600"
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
                          />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                          />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <FieldError message={actionData?.errors?.password} />
                </div>
              )}

              <div className="flex items-center justify-between gap-4">
                {isPasswordStep ? (
                  <label className="flex items-center gap-2">
                    <input
                      id="remember"
                      name="remember"
                      type="checkbox"
                      defaultChecked
                      className="h-4 w-4 rounded border-gray-300 text-indigo-500 focus:ring-indigo-500"
                    />
                    <span className="text-sm text-gray-600">Keep me signed in</span>
                  </label>
                ) : (
                  <span className="text-sm text-gray-500">We'll check your email first.</span>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#2657F7] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f49d4] focus:outline-none focus:ring-4 focus:ring-[#2657F7]/20 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSubmitting ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {isPasswordStep ? "Signing in..." : "Continue"}
                  </>
                ) : (
                  isPasswordStep ? "Sign in" : "Continue"
                )}
              </button>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
