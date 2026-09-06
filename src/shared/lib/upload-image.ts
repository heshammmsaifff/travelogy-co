"use client";

import imageCompression from "browser-image-compression";
import type { UploadFolder } from "@/shared/lib/cloudinary";

/**
 * Client-side half of the media pipeline (CLAUDE.md §8, steps 1–3).
 *
 * 1. compress + convert to WebP in the browser
 * 2. fetch a one-shot signature from our Route Handler
 * 3. upload the bytes directly to Cloudinary
 *
 * Only the type import from ./cloudinary crosses the boundary here — types are
 * erased at build time, so no server code or secret reaches the bundle.
 */

/** Per-use-case compression budgets. Hotel photos are the demanding case. */
const COMPRESSION_PRESETS = {
  /** Max ~1600px on the long edge, per CLAUDE.md §8. */
  photo: { maxSizeMB: 0.6, maxWidthOrHeight: 1600 },
  /** Wide marketing banners keep more horizontal resolution. */
  banner: { maxSizeMB: 0.8, maxWidthOrHeight: 2000 },
  /** Scanned licences/certificates — legibility matters more than weight. */
  document: { maxSizeMB: 1, maxWidthOrHeight: 2200 },
} as const;

export type CompressionPreset = keyof typeof COMPRESSION_PRESETS;

export type UploadResult = {
  secureUrl: string;
  publicId: string;
  width: number;
  height: number;
  /** Size of the file the user picked, before compression. */
  originalBytes: number;
  /** Size actually uploaded, after compression to WebP. */
  uploadedBytes: number;
};

export class ImageUploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageUploadError";
  }
}

export async function compressImage(
  file: File,
  preset: CompressionPreset = "photo",
): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new ImageUploadError("Selected file is not an image.");
  }

  const { maxSizeMB, maxWidthOrHeight } = COMPRESSION_PRESETS[preset];

  return imageCompression(file, {
    maxSizeMB,
    maxWidthOrHeight,
    useWebWorker: true,
    // WebP everywhere: broadly supported and materially smaller than JPEG at
    // equivalent perceived quality.
    fileType: "image/webp",
  });
}

export async function uploadImage(
  file: File,
  options: {
    folder: UploadFolder;
    preset?: CompressionPreset;
    onStage?: (stage: "compressing" | "uploading") => void;
  },
): Promise<UploadResult> {
  const { folder, preset = "photo", onStage } = options;

  onStage?.("compressing");
  const compressed = await compressImage(file, preset);

  onStage?.("uploading");

  const signatureResponse = await fetch("/api/media/signature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder }),
  });

  if (!signatureResponse.ok) {
    throw new ImageUploadError(
      `Could not obtain an upload signature (${signatureResponse.status}).`,
    );
  }

  const signature = (await signatureResponse.json()) as {
    signature: string;
    timestamp: number;
    apiKey: string;
    folder: string;
    uploadUrl: string;
  };

  // Every field here must match what the server signed, or Cloudinary rejects it.
  const form = new FormData();
  form.append("file", compressed);
  form.append("api_key", signature.apiKey);
  form.append("timestamp", String(signature.timestamp));
  form.append("folder", signature.folder);
  form.append("signature", signature.signature);

  const uploadResponse = await fetch(signature.uploadUrl, { method: "POST", body: form });

  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text();
    throw new ImageUploadError(`Cloudinary rejected the upload: ${detail.slice(0, 200)}`);
  }

  const uploaded = (await uploadResponse.json()) as {
    secure_url: string;
    public_id: string;
    width: number;
    height: number;
    bytes: number;
  };

  return {
    secureUrl: uploaded.secure_url,
    publicId: uploaded.public_id,
    width: uploaded.width,
    height: uploaded.height,
    originalBytes: file.size,
    uploadedBytes: uploaded.bytes,
  };
}
