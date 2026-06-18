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
import { createHash } from "crypto";

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

/**
 * Sniff the real image type from magic bytes and return its canonical
 * extension — or null if the payload is not a JPEG / PNG / WEBP. Used to both
 * validate uploads (don't trust the client-declared MIME) AND pin the stored
 * extension to the real type, so a mislabeled/renamed file can't keep a
 * dangerous extension (e.g. .svg/.html). Shared by every upload + copy path.
 */
export function imageExtFromBytes(b: Buffer): "png" | "jpg" | "webp" | null {
  if (b.length < 12) return null;
  // PNG
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  // JPEG
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  // WEBP: "RIFF"????"WEBP"
  if (
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) return "webp";
  return null;
}

/**
 * Magic-byte sniff — don't trust the client-declared MIME alone. Confirms the
 * payload really is a JPEG / PNG / WEBP before we persist it. Shared by every
 * upload route (inbox reply-photo, calculator draft drawings, …).
 */
export function looksLikeImage(b: Buffer): boolean {
  return imageExtFromBytes(b) !== null;
}

/**
 * Authorization gate for which uploaded image a saved project may copy into its
 * own media (see copyUploadToProject). `box.imagePath` is CLIENT-SUPPLIED, so a
 * project may only pull from:
 *   - its own media folder            `/uploads/projects/<projectId>/`
 *   - its linked chat's media         `/uploads/inbox/<conversationId>/`
 *   - the requesting operator's drafts `/uploads/drafts/<userId>/`
 * Anything else — another chat's media, another operator's drafts, arbitrary
 * uploads, or any `..` traversal — is rejected. Pure + side-effect free so it's
 * unit-testable in isolation.
 */
export function isAllowedAnnotationSource(
  src: unknown,
  opts: { projectId: string; conversationId: string | null; userId: string },
): boolean {
  if (typeof src !== "string") return false;
  if (!src.startsWith("/uploads/")) return false;
  if (src.includes("..")) return false; // no path traversal via the allow-list
  return (
    src.startsWith(`/uploads/projects/${opts.projectId}/`) ||
    (!!opts.conversationId && src.startsWith(`/uploads/inbox/${opts.conversationId}/`)) ||
    src.startsWith(`/uploads/drafts/${opts.userId}/`)
  );
}

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
  // Don't trust the client-declared MIME — confirm the bytes really are a
  // JPEG / PNG / WEBP before persisting, so a tampered client can't push a
  // non-image (e.g. .svg/.html) past the type check above.
  if (!imageExtFromBytes(buffer)) {
    throw new UploadError("File does not appear to be a valid JPG, PNG, or WEBP image", 422);
  }
  await fs.writeFile(filepath, buffer);

  // Posix-style URL even on Windows
  const url = `/uploads/${subdir}/${filename}`.replace(/\\/g, "/");
  return { url, filename, size: f.size, mime };
}

/**
 * Persist a raw buffer (e.g. media downloaded from Telegram) to the
 * uploads volume and return its public URL. Unlike saveImageFromFormData
 * this does no MIME/size validation — the caller already enforces limits.
 */
export async function saveBufferToUploads(
  buffer: Buffer,
  subdir: string,
  filename: string,
): Promise<string> {
  const dir = path.join(UPLOAD_ROOT, subdir);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, filename), buffer);
  return `/uploads/${subdir}/${filename}`.replace(/\\/g, "/");
}

/** Best-effort delete of an uploaded file by its public /uploads/... URL. */
export async function deleteUpload(publicUrl: string): Promise<void> {
  if (!publicUrl.startsWith("/uploads/")) return;
  await fs.unlink(path.join(PUBLIC_ROOT, publicUrl));
}

/**
 * Copy an existing uploaded image (referenced by its `/uploads/...` URL)
 * into a project-owned folder so the project's visual record survives
 * deletion of the source (e.g. an inbox conversation whose media folder is
 * removed on delete).
 *
 * Idempotent: a source already inside this project's folder is returned
 * unchanged (so re-saving a reopened draft doesn't re-copy). Throws
 * UploadError if the source escapes the uploads root.
 *
 * The dest filename is a hash of the source-relative path — stable (so the
 * copy dedupes + idempotent re-save works) but NON-reversible. We must NOT
 * embed the source folder name: for inbox media that folder is the
 * conversation id, and this path is served to non-inbox order.view users.
 */
export async function copyUploadToProject(
  projectId: string,
  sourceUrl: string,
): Promise<string> {
  if (!sourceUrl.startsWith("/uploads/")) {
    throw new UploadError("invalid source path", 400);
  }
  const ownedPrefix = `/uploads/projects/${projectId}/`;
  if (sourceUrl.startsWith(ownedPrefix)) return sourceUrl; // already project-owned

  const rel = sourceUrl.slice("/uploads/".length);
  const srcAbs = path.resolve(UPLOAD_ROOT, rel);
  // Path-traversal guard: the resolved source must stay within the uploads root.
  if (srcAbs !== UPLOAD_ROOT && !srcAbs.startsWith(UPLOAD_ROOT + path.sep)) {
    throw new UploadError("source path escapes uploads root", 400);
  }

  // Re-validate by CONTENT at copy time: inbox media can be any Telegram file
  // (PDF, video, .svg/.html document) and box.imagePath is client-supplied, so
  // confirm the bytes are a real image and PIN the stored extension to the
  // sniffed type. A non-image source is refused (the caller skips it) — this
  // keeps a non-image from being promoted into the public project media folder.
  const buffer = await fs.readFile(srcAbs);
  const ext = imageExtFromBytes(buffer);
  if (!ext) throw new UploadError("source is not a valid image", 400);
  const stem = createHash("sha1").update(rel).digest("hex").slice(0, 16);
  const filename = `${stem}.${ext}`;
  const destDir = path.join(UPLOAD_ROOT, "projects", projectId);
  await fs.mkdir(destDir, { recursive: true });
  await fs.writeFile(path.join(destDir, filename), buffer);
  return `/uploads/projects/${projectId}/${filename}`.replace(/\\/g, "/");
}
