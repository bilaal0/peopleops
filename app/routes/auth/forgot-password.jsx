import { Form, useActionData, useNavigation } from "react-router-dom";
import crypto from "crypto";

export async function action({ request }) {
  const { emailTemplates, sendEmail } = await import("../../utils/email.server.js");
  const { connect } = await import("../../config/db.server.js");
  const { User } = await import("../../models/user.server.js");
  await connect();

  const form = await request.formData();
  const email = String(form.get("email") || "").trim().toLowerCase();

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
  if (!email) return { errors: { email: "Email is required" }, values: { email } };
  if (!emailPattern.test(email)) {
    return { errors: { email: "Enter a valid email address" }, values: { email } };
  }

  try {
    const existingUser = await User.findOne({ email, deleted: { $ne: true } }).select("_id status").lean();

    // Do NOT reveal whether the account exists — always return success
    if (existingUser && existingUser.status === 1) {
      const resetToken = crypto.randomBytes(32).toString("hex");
      const resetExpires = new Date(Date.now() + 3600000); // 1 hour

      await User.updateOne(
        { _id: existingUser._id },
        {
          $set: {
            resetPasswordToken: resetToken,
            resetPasswordExpires: resetExpires,
          },
        }
      );

      const siteUrl = process.env.SITE_URL || "http://localhost:5173";
      const resetLink = `${siteUrl}/auth/reset-password?token=${resetToken}`;

      const template = emailTemplates.forgotPassword({ email, resetLink });
      await sendEmail({
        to: email,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });
    }

    return { success: true, message: "If an account exists for this email, we have sent a password reset link." };
  } catch (error) {
    console.error("Forgot Password Error:", error);
    return { errors: { form: "Something went wrong. Please try again." }, values: { email } };
  }
}

function FieldError({ message }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-red-600">{message}</p>;
}

export default function ForgotPassword() {
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.16),_transparent_34%),linear-gradient(180deg,#faf9ff_0%,#f3efff_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center justify-center">
        <div className="relative w-full animate-fade-in overflow-hidden rounded-3xl border border-indigo-100/70 bg-white shadow-[0_30px_90px_-40px_rgba(99,102,241,0.32)]">
          <div className="relative z-10 border-b border-gray-100 px-8 pb-4 pt-8 text-center sm:px-10">
            <div className="mx-auto mb-1.5 flex items-center justify-center">
              <img src="/assets/logo/proplet.png" alt="Proplet" className="h-14 w-auto object-contain" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-600">Recovery</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">Forgot Password</h1>
          </div>

          <div className="relative z-10 px-8 py-7 sm:px-10">
            {actionData?.errors?.form && (
              <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.5a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zM10 14.5a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-red-700">{actionData.errors.form}</p>
              </div>
            )}

            {actionData?.success ? (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                  <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900">Check your inbox</h3>
                <p className="mt-2 text-sm text-gray-500">{actionData.message}</p>
                <div className="mt-6">
                  <a href="/login" className="text-sm font-semibold text-indigo-600 hover:text-indigo-500">
                    Return to login
                  </a>
                </div>
              </div>
            ) : (
              <Form method="post" className="space-y-5">
                <p className="text-sm text-gray-500 text-center mb-6">
                  Enter the email address associated with your account and we'll send you a link to reset your password.
                </p>

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
                    placeholder="you@organizationname.co.uk"
                    className={`block w-full rounded-xl border bg-white px-3.5 py-3 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus:ring-4 focus:ring-indigo-500/10 ${
                      actionData?.errors?.email
                        ? "border-red-400 focus:border-red-400"
                        : "border-gray-300 focus:border-indigo-500"
                    }`}
                  />
                  <FieldError message={actionData?.errors?.email} />
                </div>

                <div className="flex items-center justify-between gap-4 mt-2 mb-4">
                  <a href="/login" className="text-sm font-medium text-indigo-600 hover:text-violet-600">
                    Back to login
                  </a>
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
                      Sending...
                    </>
                  ) : (
                    "Send Reset Link"
                  )}
                </button>
              </Form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
