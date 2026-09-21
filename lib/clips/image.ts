/**
 * Validation for uploaded analytics screenshots. We trust the FILE'S BYTES, never the browser-supplied
 * MIME type or filename: only PNG, JPEG and WebP are accepted (no SVG/GIF/PDF/anything scriptable).
 */

export const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB

export type ImageKind = { contentType: "image/png" | "image/jpeg" | "image/webp"; ext: "png" | "jpg" | "webp" };

const startsWith = (b: Uint8Array, sig: number[], offset = 0) => sig.every((v, i) => b[offset + i] === v);

/** Identify a PNG/JPEG/WebP by its magic bytes; null for anything else (or too short to tell). */
export function detectImageKind(bytes: Uint8Array): ImageKind | null {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { contentType: "image/png", ext: "png" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { contentType: "image/jpeg", ext: "jpg" };
  // WebP: "RIFF" <4 size bytes> "WEBP"
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { contentType: "image/webp", ext: "webp" };
  }
  return null;
}

/** Throws a creator-friendly Error if the upload isn't an acceptable screenshot; otherwise returns its kind. */
export function validateScreenshot(bytes: Uint8Array): ImageKind {
  if (bytes.length === 0) throw new Error("That file is empty. Please choose a screenshot image.");
  if (bytes.length > MAX_SCREENSHOT_BYTES) {
    throw new Error("That image is too large (4 MB maximum). Try a smaller screenshot.");
  }
  const kind = detectImageKind(bytes);
  if (!kind) throw new Error("Only PNG, JPEG or WebP screenshots are accepted.");
  return kind;
}
