import { buildS3Key, uploadToS3, fileToBuffer } from "./s3.server.js";
import fs from "fs";
import path from "path";

/**
 * Handle upload of agency logo file.
 * Tries AWS S3 first, then falls back to local public directory if S3 is unconfigured or fails.
 * 
 * @param {string} agencyId 
 * @param {File|Blob|null} file 
 * @returns {Promise<string|null>} Returns the S3 key or local static URL path
 */
export async function uploadAgencyLogo(agencyId, file) {
  if (!file || typeof file === "string" || file.size === 0) {
    return null;
  }

  const buffer = await fileToBuffer(file);
  const s3Key = buildS3Key(agencyId.toString(), "agency", agencyId.toString(), "logo", file.name || "logo.png");

  // Try S3 if credentials exist
  if (process.env.STORAGE_ACCESS_KEY && process.env.STORAGE_SECRET) {
    try {
      const resultKey = await uploadToS3(buffer, s3Key, file.type || "image/png");
      return resultKey;
    } catch (err) {
      console.warn("S3 upload failed for agency logo, falling back to local storage:", err.message);
    }
  }

  // Fallback: Save to public/uploads/agencies
  try {
    const uploadsDir = path.join(process.cwd(), "public", "uploads", "agencies");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const ext = path.extname(file.name || ".png") || ".png";
    const filename = `${agencyId}_logo_${Date.now()}${ext}`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, buffer);
    return `/uploads/agencies/${filename}`;
  } catch (err) {
    console.error("Local logo save failed:", err);
    return null;
  }
}
