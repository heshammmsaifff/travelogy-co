/**
 * Cloudinary delivery-URL helpers (CLAUDE.md §8, step 4).
 *
 * We persist the `secure_url` Cloudinary returns and inject transformations
 * into it, rather than storing the cloud name separately and rebuilding URLs
 * from public_id. That keeps the cloud name out of the client env entirely and
 * means a stored URL is always renderable on its own.
 */

export type CloudinaryTransform = {
  /** Target width in px; Cloudinary scales down only, never up. */
  width?: number;
  height?: number;
  /** Crop mode. `fill` for fixed-ratio thumbnails, `limit` to fit within bounds. */
  crop?: "fill" | "limit" | "fit";
};

/**
 * Inserts a transformation into a Cloudinary secure_url.
 *
 * `f_auto,q_auto` is always applied: Cloudinary then picks the best format
 * (AVIF/WebP/JPEG) and quality per requesting browser. This is complementary
 * to the client-side WebP compression — that one saves upload bandwidth and
 * stored bytes, this one saves delivery bandwidth.
 */
export function cloudinaryUrl(secureUrl: string, transform: CloudinaryTransform = {}): string {
  const marker = "/upload/";
  const markerIndex = secureUrl.indexOf(marker);

  // Not a Cloudinary delivery URL — hand it back untouched rather than
  // producing something broken.
  if (markerIndex === -1) return secureUrl;

  const parts = ["f_auto", "q_auto"];
  if (transform.crop) parts.push(`c_${transform.crop}`);
  if (transform.width) parts.push(`w_${transform.width}`);
  if (transform.height) parts.push(`h_${transform.height}`);

  const insertAt = markerIndex + marker.length;
  return `${secureUrl.slice(0, insertAt)}${parts.join(",")}/${secureUrl.slice(insertAt)}`;
}
