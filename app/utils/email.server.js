// app/utils/email.server.js
import nodemailer from "nodemailer";

let transporter;
function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error("SMTP configuration is missing");
  }

  const isSecure = String(SMTP_SECURE) === "true";

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: isSecure, // true for 465, false for other ports (587/25)
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 10000,
    socketTimeout: 10000,
  });
  return transporter;
}

// Generic sender you can use with any template
export async function sendEmail({ to, subject, html, text, from, replyTo }) {
  try {
    const t = getTransporter();
    const fromAddr = from || process.env.SMTP_FROM || `PeopleOps <${process.env.SMTP_USER}>`;
    return await t.sendMail({ from: fromAddr, to, subject, html, text, ...(replyTo ? { replyTo } : {}) });
  } catch (error) {
    console.error("Failed to send email via SMTP:", error.message);

    // Fallback for development: Log to console so dev flow still works
    if (process.env.NODE_ENV === "development") {
      console.log("\n[DEV] Email sending failed — logging to console instead:\n");
      console.log("==================================================");
      console.log(`From: ${from || "default"}`);
      console.log(`To: ${to}`);
      if (replyTo) console.log(`Reply-To: ${replyTo}`);
      console.log(`Subject: ${subject}`);
      console.log("--------------------------------------------------");
      console.log(text || "No plain text version");
      console.log("--------------------------------------------------");
      console.log("HTML Content (snippet):", html ? html.substring(0, 200) + "..." : "None");
      console.log("==================================================\n");

      // Return a fake success so the UI flow continues in dev
      return { messageId: "DEV-MOCK-ID-" + Date.now() };
    }

    throw error;
  }
}

// Simple helpers for brand/context
function brand() {
  return {
    companyName: process.env.SITENAME || "PeopleOps",
    logoUrl: process.env.SITE_LOGO_URL || "",
    supportEmail: process.env.WEB_ADMIN_EMAIL || "support@peopleops.co.uk",
    siteUrl: process.env.SITE_URL || "http://localhost:5173",
  };
}

// Templates return { subject, html, text }
function otpVerificationTemplate({ otp, email }) {
  const { companyName, supportEmail } = brand();
  const subject = `${companyName} — your verification code`;
  const html = `
  <div style="font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#f6f7fb; padding:24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden;">
      <tr>
        <td style="padding:20px 24px; background:linear-gradient(135deg,#4f46e5,#7c3aed); color:#fff;">
          <h1 style="margin:0; font-size:18px; font-weight:700;">${companyName}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 24px; text-align:center;">
          <h2 style="margin:0 0 12px; font-size:24px; color:#111827;">Verify Your Email</h2>
          <p style="margin:0 0 24px; color:#6b7280; font-size:15px;">Enter this code to complete the process:</p>
          <div style="background:#f3f4f6; border-radius:8px; padding:20px; margin:24px 0;">
            <div style="font-size:36px; font-weight:700; letter-spacing:8px; color:#4f46e5; font-family:monospace;">${otp}</div>
          </div>
          <p style="margin:24px 0 8px; color:#374151; font-size:14px;">This code will expire in <strong>10 minutes</strong>.</p>
          <p style="margin:8px 0; color:#9ca3af; font-size:13px;">If you didn't request this code, please ignore this email.</p>
          <div style="margin-top:24px; padding-top:24px; border-top:1px solid #e5e7eb;">
            <p style="margin:0; color:#ef4444; font-size:13px; background:#fef2f2; padding:12px; border-radius:6px;">
              Not in your inbox? Please check your spam/junk folder.
            </p>
          </div>
          <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;">
          <p style="margin:0; color:#9ca3af; font-size:12px;">Need help? Contact us at ${supportEmail}</p>
        </td>
      </tr>
    </table>
  </div>`;
  const text = `Your ${companyName} verification code is: ${otp}\n\nThis code will expire in 10 minutes.\n\nIf you didn't request this code, please ignore this email.\n\nPlease check your spam/junk folder if you don't see this email in your inbox.`;
  return { subject, html, text };
}

function emailAlreadyExistsTemplate({ email }) {
  const { companyName, supportEmail, siteUrl } = brand();
  const subject = `${companyName} — account already exists`;
  const loginUrl = `${siteUrl}/login`;
  const resetUrl = `${siteUrl}/auth/request-otp`;

  const html = `
  <div style="font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#f6f7fb; padding:24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden;">
      <tr>
        <td style="padding:20px 24px; background:linear-gradient(135deg,#4f46e5,#7c3aed); color:#fff;">
          <h1 style="margin:0; font-size:18px; font-weight:700;">${companyName}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 24px;">
          <h2 style="margin:0 0 16px; font-size:22px; color:#111827;">Account Already Exists</h2>
          <p style="margin:0 0 16px; color:#374151; font-size:15px;">Someone tried to create an account with your email address (<strong>${email}</strong>).</p>
          <p style="margin:0 0 24px; color:#374151; font-size:15px;">If this was you, you already have an account with us. Please log in instead:</p>
          <div style="margin:24px 0;">
            <a href="${loginUrl}" style="display:inline-block; background:#4f46e5; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600; margin-right:12px;">Log In</a>
            <a href="${resetUrl}" style="display:inline-block; background:#6b7280; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">Forgot Password</a>
          </div>
          <div style="margin-top:24px; padding:16px; background:#fef3c7; border-left:4px solid #f59e0b; border-radius:4px;">
            <p style="margin:0; color:#92400e; font-size:13px;">
              <strong>Security Notice:</strong> If you didn't attempt to sign up, you can safely ignore this email. Your account is secure.
            </p>
          </div>
          <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;">
          <p style="margin:0; color:#9ca3af; font-size:12px;">Need help? Contact us at ${supportEmail}</p>
        </td>
      </tr>
    </table>
  </div>`;
  const text = `Account Already Exists\n\nSomeone tried to create an account with your email address (${email}).\n\nIf this was you, you already have an account. Please log in: ${loginUrl}\n\nForgot your password? Reset it here: ${resetUrl}\n\nIf you didn't attempt to sign up, you can safely ignore this email.`;
  return { subject, html, text };
}

function organizationInviteTemplate({ email, inviteLink, orgName }) {
  const { companyName, supportEmail } = brand();
  const subject = `You've been invited to join ${orgName || companyName}`;

  const html = `
  <div style="font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#f6f7fb; padding:24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden;">
      <tr>
        <td style="padding:20px 24px; background:linear-gradient(135deg,#4f46e5,#7c3aed); color:#fff;">
          <h1 style="margin:0; font-size:18px; font-weight:700;">${companyName}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 24px;">
          <h2 style="margin:0 0 16px; font-size:22px; color:#111827;">Welcome to ${orgName || companyName}!</h2>
          <p style="margin:0 0 16px; color:#374151; font-size:15px;">You have been invited to join <strong>${orgName}</strong> on ${companyName} — Know exactly what happened in every tenancy.</p>
          <p style="margin:0 0 24px; color:#374151; font-size:15px;">Click below to set your password and activate your account:</p>
          <div style="margin:24px 0;">
            <a href="${inviteLink}" style="display:inline-block; background:#4f46e5; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">Accept Invitation</a>
          </div>
          <p style="margin:24px 0 8px; color:#6b7280; font-size:13px;">This link will expire in 48 hours for your security.</p>
          <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;">
          <p style="margin:0; color:#9ca3af; font-size:12px;">Need help? Contact us at ${supportEmail}</p>
        </td>
      </tr>
    </table>
  </div>`;

  const text = `Welcome to ${orgName || companyName}!\n\nYou have been invited to join ${orgName} as an administrator.\n\nPlease accept your invitation here:\n${inviteLink}\n\nThis link expires in 48 hours.`;

  return { subject, html, text };
}

function forgotPasswordTemplate({ email, resetLink }) {
  const { companyName, supportEmail } = brand();
  const subject = `Reset your ${companyName} password`;

  const html = `
  <div style="font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#f6f7fb; padding:24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden;">
      <tr>
        <td style="padding:20px 24px; background:linear-gradient(135deg,#4f46e5,#7c3aed); color:#fff;">
          <h1 style="margin:0; font-size:18px; font-weight:700;">${companyName}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 24px;">
          <h2 style="margin:0 0 16px; font-size:22px; color:#111827;">Password Reset Request</h2>
          <p style="margin:0 0 16px; color:#374151; font-size:15px;">We received a request to reset the password for your account associated with <strong>${email}</strong>.</p>
          <p style="margin:0 0 24px; color:#374151; font-size:15px;">Click the button below to choose a new password:</p>
          <div style="margin:24px 0;">
            <a href="${resetLink}" style="display:inline-block; background:#4f46e5; color:#fff; padding:12px 24px; border-radius:8px; text-decoration:none; font-weight:600;">Reset Password</a>
          </div>
          <p style="margin:24px 0 8px; color:#6b7280; font-size:13px;">This link will expire in 1 hour for your security.</p>
          <div style="margin-top:24px; padding:16px; background:#fef3c7; border-left:4px solid #f59e0b; border-radius:4px;">
            <p style="margin:0; color:#92400e; font-size:13px;">
              <strong>Security Notice:</strong> If you did not request a password reset, you can safely ignore this email. Your password will remain unchanged.
            </p>
          </div>
          <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0;">
          <p style="margin:0; color:#9ca3af; font-size:12px;">Need help? Contact us at ${supportEmail}</p>
        </td>
      </tr>
    </table>
  </div>`;

  const text = `Password Reset Request\n\nWe received a request to reset the password for your account (${email}).\n\nPlease click the link below to reset your password:\n${resetLink}\n\nThis link will expire in 1 hour.\n\nIf you didn't request a password reset, you can safely ignore this email.`;

  return { subject, html, text };
}

function documentUploadedTemplate({ recipientName, docTypeName, fileName, loginLink, notes, expiryDate, organizationName, contactEmail }) {
  const { companyName: defaultCompanyName, supportEmail: defaultSupportEmail, siteUrl } = brand();
  const orgDisplayName = organizationName || defaultCompanyName;
  const helpContact = contactEmail || (organizationName ? `${organizationName} Support` : defaultSupportEmail);
  const subject = `Your "${docTypeName}" has been uploaded — ${orgDisplayName}`;
  const targetLoginUrl = loginLink || `${siteUrl}/login`;

  const html = `
  <div style="font-family:system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:#f6f7fb; padding:24px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:0 auto; background:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
      <tr>
        <td style="padding:20px 24px; background:linear-gradient(135deg,#4f46e5,#7c3aed); color:#fff;">
          <h1 style="margin:0; font-size:18px; font-weight:700;">${orgDisplayName}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 24px;">
          <h2 style="margin:0 0 16px; font-size:22px; color:#111827;">Document Uploaded</h2>
          <p style="margin:0 0 16px; color:#374151; font-size:15px;">Hello ${recipientName || "there"},</p>
          <p style="margin:0 0 20px; color:#374151; font-size:15px;">
            Your <strong>"${docTypeName}"</strong> has been successfully uploaded to your profile on ${orgDisplayName}.
          </p>
          
          <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:16px 20px; margin:20px 0;">
            <table width="100%" cellpadding="4" cellspacing="0" style="font-size:14px; color:#475569;">
              <tr>
                <td style="font-weight:600; width:130px; color:#1e293b;">Document Type:</td>
                <td>${docTypeName}</td>
              </tr>
              ${fileName ? `<tr><td style="font-weight:600; color:#1e293b;">File Name:</td><td>${fileName}</td></tr>` : ""}
              ${expiryDate ? `<tr><td style="font-weight:600; color:#1e293b;">Expiry Date:</td><td>${expiryDate}</td></tr>` : ""}
              ${notes ? `<tr><td style="font-weight:600; color:#1e293b;">Notes:</td><td>${notes}</td></tr>` : ""}
            </table>
          </div>

          <p style="margin:24px 0 16px; color:#374151; font-size:15px;">Please log in to your account to view and access your documents:</p>
          
          <div style="margin:24px 0;">
            <a href="${targetLoginUrl}" style="display:inline-block; background:#4f46e5; color:#ffffff; padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:600; font-size:14px; box-shadow:0 2px 4px rgba(79,70,229,0.3);">
              Log In to View Documents
            </a>
          </div>

          <p style="margin:16px 0 0; color:#64748b; font-size:13px; word-break:break-all;">
            Login link: <a href="${targetLoginUrl}" style="color:#4f46e5; text-decoration:underline;">${targetLoginUrl}</a>
          </p>

          <hr style="border:none; border-top:1px solid #e5e7eb; margin:28px 0 20px;">
          <p style="margin:0; color:#9ca3af; font-size:12px;">Need help or have questions? Contact ${helpContact}</p>
        </td>
      </tr>
    </table>
  </div>`;

  const text = `Hello ${recipientName || "there"},\n\nYour "${docTypeName}" has been uploaded to your profile on ${orgDisplayName}.\n\nDocument Type: ${docTypeName}\n${fileName ? `File Name: ${fileName}\n` : ""}${expiryDate ? `Expiry Date: ${expiryDate}\n` : ""}${notes ? `Notes: ${notes}\n` : ""}\nPlease log in to your account to view your documents:\n${targetLoginUrl}\n\nNeed help? Contact ${helpContact}`;

  return { subject, html, text };
}

// Export templates
export const emailTemplates = {
  otpVerification: otpVerificationTemplate,
  emailAlreadyExists: emailAlreadyExistsTemplate,
  organizationInvite: organizationInviteTemplate,
  forgotPassword: forgotPasswordTemplate,
  documentUploaded: documentUploadedTemplate,
};
