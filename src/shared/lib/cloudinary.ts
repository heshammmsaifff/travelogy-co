import "server-only";

import { createHash } from "node:crypto";
import { getServerEnv } from "@/shared/lib/env";

/**
 * Cloudinary signing (CLAUDE.md §4, §8).
 *
 * CLOUDINARY_API_SECRET never leaves the server. The flow is:
 *   1. client compresses the image to WebP and asks POST /api/media/signature
 *   2. this module returns a signature valid for one specific upload
 *   3. client PUTs the bytes straight to Cloudinary with that signature
 *   4. the returned public_id / URL is what gets persisted to Supabase
 *
 * The bytes never pass through our server, so a large upload costs us no
 * bandwidth and no serverless execution time (CLAUDE.md §11).
 */

/**
 * Upload folders. Restricting the folder server-side means a client cannot
 * scatter uploads across the Cloudinary account by passing an arbitrary path.
 */
export const UPLOAD_FOLDERS = {
  "phase0-test": "last-line-travel/phase0-test",
  hotels: "last-line-travel/hotels",
  banners: "last-line-travel/banners",
  documents: "last-line-travel/documents",
} as const;

export type UploadFolder = keyof typeof UPLOAD_FOLDERS;

export type UploadSignature = {
  signature: string;
  timestamp: number;
  apiKey: string;
  cloudName: string;
  folder: string;
  uploadUrl: string;
};

/**
 * Builds a Cloudinary upload signature.
 *
 * Cloudinary's rule: sort the signed params alphabetically, join as
 * `k=v&k=v`, append the API secret, and SHA-1 the result. Any param signed
 * here MUST also be sent by the client, and any param the client sends that
 * isn't signed here will be rejected — that asymmetry is the security value.
 */
export function createUploadSignature(folder: UploadFolder): UploadSignature {
  const env = getServerEnv();
  const timestamp = Math.floor(Date.now() / 1000);
  const resolvedFolder = UPLOAD_FOLDERS[folder];

  const signedParams: Record<string, string | number> = {
    folder: resolvedFolder,
    timestamp,
  };

  const paramsToSign = Object.keys(signedParams)
    .sort()
    .map((key) => `${key}=${signedParams[key]}`)
    .join("&");

  const signature = createHash("sha1")
    .update(paramsToSign + env.CLOUDINARY_API_SECRET)
    .digest("hex");

  return {
    signature,
    timestamp,
    apiKey: env.CLOUDINARY_API_KEY,
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    folder: resolvedFolder,
    uploadUrl: `https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/image/upload`,
  };
}
