import imageCompression from "browser-image-compression";

// Smallest/fastest tier (operator choice): tiny JPEGs upload fast on old phones.
const MAX_DIMENSION = 1280;
const JPEG_QUALITY = 0.65;

/** True when the file is an iPhone HEIC/HEIF (by MIME or extension). */
export function isHeic(file: { type?: string; name?: string }): boolean {
  const type = (file.type ?? "").toLowerCase();
  if (type === "image/heic" || type === "image/heif") return true;
  const name = (file.name ?? "").toLowerCase();
  return name.endsWith(".heic") || name.endsWith(".heif");
}

/** Rewrite a filename's extension to `.jpg` (adds it when none). */
export function jpgName(name: string): string {
  return /\.[^.]+$/.test(name) ? name.replace(/\.[^.]+$/, ".jpg") : `${name}.jpg`;
}

/**
 * Compress/convert any phone photo to a small JPEG before upload. HEIC/HEIF is
 * converted first via a lazy-loaded heic2any (its ~1.4 MB libheif wasm is only
 * fetched when a HEIC is actually picked). Everything is then resized to
 * ≤1280px and re-encoded JPEG (~0.65). A non-HEIC failure falls back to the
 * original file so the upload still works; a HEIC that won't convert throws
 * (the server can't accept HEIC).
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  let input: File = file;
  if (isHeic(file)) {
    const heic2any = (await import("heic2any")).default as (
      opts: { blob: Blob; toType?: string; quality?: number },
    ) => Promise<Blob | Blob[]>;
    const out = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.8 });
    const blob = Array.isArray(out) ? out[0] : out;
    input = new File([blob], jpgName(file.name), { type: "image/jpeg" });
  }
  try {
    const compressed = await imageCompression(input, {
      maxWidthOrHeight: MAX_DIMENSION,
      initialQuality: JPEG_QUALITY,
      useWebWorker: true,
      fileType: "image/jpeg",
    });
    return new File([compressed], jpgName(input.name), { type: "image/jpeg" });
  } catch (e) {
    if (isHeic(file)) throw e;
    return file;
  }
}
