// utils/s3.server.js
// ─────────────────────────────────────────────────────────────────────────────
// AWS S3 helpers for file upload, secure streaming download, and deletion.
// S3 key convention: {agencyId}/{entityType}/{entityId}/{docType}/{uuid}.{ext}
// NEVER expose raw S3 keys or presigned URLs to the client.
// ─────────────────────────────────────────────────────────────────────────────
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomBytes } from "crypto";
import path from "path";

// ── S3 Client ─────────────────────────────────────────────────────────────────
const s3 = new S3Client({
  region: process.env.STORAGE_REGION || "eu-west-2",
  credentials: {
    accessKeyId:     process.env.STORAGE_ACCESS_KEY,
    secretAccessKey: process.env.STORAGE_SECRET,
  },
});

const BUCKET = process.env.STORAGE_BUCKET || "aiufs-bucket";

// ── Allowed types ─────────────────────────────────────────────────────────────
export const ALLOWED_MIME_TYPES = {
  "application/pdf":                                                    ".pdf",
  "image/jpeg":                                                         ".jpg",
  "image/png":                                                          ".png",
  "application/msword":                                                 ".doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
};

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// ── Key generation ────────────────────────────────────────────────────────────
/**
 * Build an S3 key for a document.
 * e.g. "agency123/landlord/landlord456/aml_report/abc123.pdf"
 */
export function buildS3Key(agencyId, entityType, entityId, docType, originalName) {
  const ext  = path.extname(originalName).toLowerCase() || ".bin";
  const uuid = randomBytes(8).toString("hex");
  return `${agencyId}/${entityType}/${entityId}/${docType}/${uuid}${ext}`;
}

export async function uploadToS3(fileBuffer, s3Key, contentType) {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET,
      Key: s3Key,
      Body: fileBuffer,
      ContentType: contentType,
    });
    await s3.send(command);
    return s3Key;
  } catch (error) {
    console.error("Error uploading to S3:", error);
    throw new Error(`Failed to upload file to S3: ${error.message}`);
  }
}

/**
 * Convert File/Blob to Buffer (for server-side processing)
 */
export async function fileToBuffer(file) {
  const arrayBuffer = await file.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ── Presigned download URL ────────────────────────────────────────────────────
/**
 * Generate a time-limited presigned URL for downloading a file.
 * Default: 1 hour expiry. Never share the raw S3 key with the browser.
 * @param {string} s3Key
 * @param {number} expiresIn  Seconds until URL expires (default 3600 = 1hr)
 */
export async function getPresignedUrl(s3Key, expiresIn = 3600) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
  return getSignedUrl(s3, command, { expiresIn });
}

// ── Secure stream download (Backend Proxy) ─────────────────────────────────
/**
 * Stream a file from S3 through the server.
 * The user never sees an AWS URL — complete security.
 * @param {string} s3Key
 * @returns {{ body: ReadableStream, contentType: string, contentLength: number }}
 */
export async function streamFromS3(s3Key) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: s3Key });
  const response = await s3.send(command);
  return {
    body:          response.Body,
    contentType:   response.ContentType || "application/octet-stream",
    contentLength: response.ContentLength,
  };
}

// ── Delete ────────────────────────────────────────────────────────────────────
/**
 * Permanently delete a file from S3.
 * Call this when the Document record is hard-deleted.
 */
export async function deleteFromS3(s3Key) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: s3Key }));
}

// ── File validation ───────────────────────────────────────────────────────────
/**
 * Validate file type and size.
 * Returns { valid: true } or { valid: false, error: string }
 */
export function validateFile(file) {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB.` };
  }
  if (!ALLOWED_MIME_TYPES[file.type]) {
    return { valid: false, error: `File type not allowed. Accepted: PDF, JPG, PNG, DOC, DOCX.` };
  }
  return { valid: true };
}
