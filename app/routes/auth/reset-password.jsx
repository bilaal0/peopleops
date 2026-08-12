import { useState } from "react";
import { Form, useActionData, useNavigation, useLoaderData } from "react-router-dom";
import { redirect } from "react-router";

export async function loader({ request }) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) return redirect("/login");

  const { connect } = await import("../../config/db.server.js");
  const { User } = await import("../../models/user.server.js");
  await connect();

  const user = await User.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() }
  }).select("_id").lean();

  if (!user) {
    return { tokenError: true };
  }

  return { token };
}

export async function action({ request }) {
  const { connect } = await import("../../config/db.server.js");
  const { User } = await import("../../models/user.server.js");
  await connect();

  const form = await request.formData();
  const token = String(form.get("token") || "");
  const password = String(form.get("password") || "");
  const confirmPassword = String(form.get("confirmPassword") || "");

  if (!password || password.length < 8) {
    return { errors: { password: "Password must be at least 8 characters long" } };
  }

  if (password !== confirmPassword) {
    return { errors: { confirmPassword: "Passwords do not match" } };
  }

  try {
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return { errors: { form: "Reset token is invalid or has expired." } };
    }

    // pre-save hook handles hashing
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return redirect("/login?reset=success");
  } catch (error) {
    console.error("Reset Password Error:", error);
    return { errors: { form: "Something went wrong. Please try again." } };
  }
}

function FieldError({ message }) {
  if (!message) return null;
  return <p className="mt-1.5 text-xs text-red-600">{message}</p>;
}

export default function ResetPassword() {
  const { token, tokenError } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.16),_transparent_34%),linear-gradient(180deg,#faf9ff_0%,#f3efff_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md items-center justify-center">
        <div className="relative w-full animate-fade-in overflow-hidden rounded-3xl border border-indigo-100/70 bg-white shadow-[0_30px_90px_-40px_rgba(99,102,241,0.32)]">
          <div className="relative z-10 border-b border-gray-100 px-8 pb-4 pt-8 text-center sm:px-10">
            <div className="mx-auto mb-1.5 flex items-center justify-center">
              <img src="/assets/logo/Peopleops.png" alt="PeopleOps" className="h-14 w-auto object-contain" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-600">Recovery</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">Choose New Password</h1>
          </div>

          <div className="relative z-10 px-8 py-7 sm:px-10">
            {tokenError ? (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                  <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900">Link Expired</h3>
                <p className="mt-2 text-sm text-gray-500">This password reset link is invalid or has expired.</p>
                <div className="mt-6">
                  <a href="/auth/forgot-password" className="text-sm font-semibold text-indigo-600 hover:text-indigo-500">
                    Request a new link
                  </a>
                </div>
              </div>
            ) : (
              <>
                {actionData?.errors?.form && (
                  <div className="mb-5 flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.5a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zM10 14.5a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
                    </svg>
                    <p className="text-sm text-red-700">{actionData.errors.form}</p>
                  </div>
                )}

                <Form method="post" className="space-y-5">
                  <input type="hidden" name="token" value={token} />
                  
                  <div>
                    <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        id="password"
                        required
                        placeholder="At least 8 characters"
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
                    <FieldError message={actionData?.errors?.password} />
                  </div>

                  <div>
                    <label htmlFor="confirmPassword" className="mb-1.5 block text-sm font-medium text-gray-700">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        name="confirmPassword"
                        id="confirmPassword"
                        required
                        placeholder="Must match new password"
                        className={`block w-full rounded-xl border bg-white px-3.5 py-3 pr-11 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none transition focus:ring-4 focus:ring-indigo-500/10 ${
                          actionData?.errors?.confirmPassword
                            ? "border-red-400 focus:border-red-400"
                            : "border-gray-300 focus:border-indigo-500"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((v) => !v)}
                        className="absolute inset-y-0 right-0 flex items-center px-3.5 text-gray-400 transition hover:text-gray-600"
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? (
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
                    <FieldError message={actionData?.errors?.confirmPassword} />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#2657F7] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f49d4] focus:outline-none focus:ring-4 focus:ring-[#2657F7]/20 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSubmitting ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Saving...
                      </>
                    ) : (
                      "Reset Password"
                    )}
                  </button>
                </Form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
