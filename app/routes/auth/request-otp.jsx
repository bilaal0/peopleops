import { redirect } from "react-router";
import { User } from "../../models/user.server.js";
import { PendingSignup } from "../../models/pendingSignup.server.js";
import { generateOTP, canRequestOTP, getOTPExpiration } from "../../utils/otp.server.js";
import { sendEmail, emailTemplates } from "../../utils/email.server.js";
import { connect } from "../../config/db.server.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function action({ request }) {
  await connect();
  const formData = await request.formData();
  const email = String(formData.get("email") || "").trim().toLowerCase();

  // Validate email format
  if (!email || !EMAIL_RE.test(email)) {
    return { error: "Please enter a valid email address" };
  }

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      // Send "email already exists" notification
      const template = emailTemplates.emailAlreadyExists({ email });
      await sendEmail({
        to: email,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });
      
      // Return success message (don't reveal that email exists)
      return {
        success: true,
        message: "If this email is not registered, we've sent a verification code. Please check your inbox.",
      };
    }

    // Check for existing pending signup
    const existingPending = await PendingSignup.findOne({ email });

    // Check rate limiting
    if (existingPending) {
      const canRequest = canRequestOTP(
        existingPending.requestCount,
        existingPending.lastRequestAt
      );

      if (!canRequest) {
        return { error: "Too many requests. Please try again in an hour." };
      }

      // Update existing record
      const otp = generateOTP();
      existingPending.otp = otp; // Will be hashed by pre-save hook
      existingPending.expiresAt = getOTPExpiration();
      existingPending.verified = false;
      existingPending.attempts = 0;
      existingPending.requestCount += 1;
      existingPending.lastRequestAt = new Date();
      await existingPending.save();

      // Send OTP email
      const template = emailTemplates.otpVerification({ otp, email });
      await sendEmail({
        to: email,
        subject: template.subject,
        html: template.html,
        text: template.text,
      });

      return {
        success: true,
        message: "Verification code sent! Please check your email.",
      };
    }

    // Create new pending signup
    const otp = generateOTP();
    await PendingSignup.create({
      email,
      otp, // Will be hashed by pre-save hook
      expiresAt: getOTPExpiration(),
      verified: false,
      attempts: 0,
      requestCount: 1,
      lastRequestAt: new Date(),
    });

    // Send OTP email
    const template = emailTemplates.otpVerification({ otp, email });
    await sendEmail({
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });

    return {
      success: true,
      message: "Verification code sent! Please check your email.",
    };
  } catch (error) {
    console.error("Error in request-otp:", error);
    return { error: "Something went wrong. Please try again." };
  }
}
