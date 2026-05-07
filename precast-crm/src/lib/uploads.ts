/**
 * Filesystem-backed uploads for the CRM.
 *
 * Files are written to `public/uploads/<subdir>/<filename>` so Next.js
 * serves them as static assets at `/uploads/<subdir>/<filename>` without
 * needing a custom route. The relative URL is what we return — what gets
 * stored in the DB and rendered in <img src=…/>.
 *
 * Caveats / future work:
 *   - public/ files inside a Next.js project are part of the build output.
 *     For a self-hosted single-tenant deployment (which is the target here)
 *     this is fine and survives `next start`. If you ever move to a multi-
 *     instance deployment behind a load balancer, swap this for object
 *     storage (S3 / R2) — only the path inside the API handler needs to
 *     change; the consumer just sees a URL.
 *   - There's no cleanup on order delete. Orders are soft-deleted (canceled),
 *     so this is acceptable; the image stays for audit.
 */

import { promises as fs } from "fs";
import path from "path";

const PUBLIC_ROOT = path.join(process.cwd(), "public");
const UPLOAD_ROOT = path.join(PUBLIC_ROOT, "uploads");

const IMG_EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const ALLOWED_IMAGE_MIME = new Set(Object.keys(IMG_EXT_BY_MIME));
export const MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

export class UploadError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "UploadError";
  }
}

/**
 * Persist a File (from the browser's FormData) to disk and return the
 * public URL. Throws UploadError for validation failures so the route
 * handler can map them to clean HTTP status codes.
 */
export async function saveImageFromFormData(
  file: unknown,
  subdir: string,
  basename: string,
): Promise<{ url: string; filename: string; size: number; mime: string }> {
  if (!file || typeof file !== "object" || !("arrayBuffer" in file) || !("type" in file) || !("size" in file)) {
    throw new UploadError("file is required", 422);
  }
  const f = file as File;
  const mime = (f.type || "").toLowerCase();

  if (!ALLOWED_IMAGE_MIME.has(mime)) {
    throw new UploadError(
      `Only JPG, PNG, or WEBP images are accepted (got "${mime || "unknown"}")`,
      422,
    );
  }
  if (f.size > MAX_IMAGE_SIZE_BYTES) {
    throw new UploadError("Image is too large (max 8 MB)", 413);
  }
  if (f.size === 0) {
    throw new UploadError("Image is empty", 422);
  }

  const ext = IMG_EXT_BY_MIME[mime] ?? "jpg";
  const filename = `${basename}.${ext}`;

  const dir = path.join(UPLOAD_ROOT, subdir);
  await fs.mkdir(dir, { recursive: true });

  const filepath = path.join(dir, filename);
  const buffer = Buffer.from(await f.arrayBuffer());
  await fs.writeFile(filepath, buffer);

  // Posix-style URL even on Windows
  const url = `/uploads/${subdir}/${filename}`.replace(/\\/g, "/");
  return { url, filename, size: f.size, mime };
}
