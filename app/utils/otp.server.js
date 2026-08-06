// utils/otp.server.js
import { randomInt } from "crypto";
import { compare } from "bcryptjs";

/**
 * Generate a cryptographically secure random 6-digit OTP.
 * Uses Node's crypto.randomInt — NOT Math.random() which is not a CSPRNG.
 */
export function generateOTP() {
  // randomInt(min, max) is inclusive of min, exclusive of max
  return randomInt(100000, 1000000).toString();
}

/**
 * Verify OTP against hashed version stored in DB
 * @param {string} plainOTP  - Plain text OTP from user input
 * @param {string} hashedOTP - bcrypt-hashed OTP from database
 */
export async function verifyOTP(plainOTP, hashedOTP) {
  return compare(plainOTP, hashedOTP);
}

/**
 * Check if OTP has expired
 * @param {Date} expiresAt - Expiration timestamp from DB
 */
export function isOTPExpired(expiresAt) {
  if (!expiresAt) return true; // treat missing expiry as expired
  return new Date() > new Date(expiresAt);
}

/**
 * Check if user can request a new OTP (rate limiting).
 * Allows max 3 requests per 60-minute window.
 *
 * @param {number} requestCount     - Number of requests made in current window
 * @param {Date|null} lastRequestAt - Timestamp of last request (null = first ever request)
 * @param {number} maxRequests      - Maximum requests allowed (default: 3)
 * @param {number} windowMinutes    - Time window in minutes (default: 60)
 */
export function canRequestOTP(
  requestCount,
  lastRequestAt,
  maxRequests = 3,
  windowMinutes = 60
) {
  // First request ever — always allowed
  if (!lastRequestAt) return true;

  const now = new Date();
  const lastRequest = new Date(lastRequestAt);
  const minutesSinceLastRequest = (now - lastRequest) / 1000 / 60;

  // Window has reset — allow and caller should reset the counter
  if (minutesSinceLastRequest >= windowMinutes) return true;

  // Within the window — check against limit
  return requestCount < maxRequests;
}

/**
 * Get OTP expiration timestamp (10 minutes from now)
 */
export function getOTPExpiration() {
  const expiration = new Date();
  expiration.setMinutes(expiration.getMinutes() + 10);
  return expiration;
}
