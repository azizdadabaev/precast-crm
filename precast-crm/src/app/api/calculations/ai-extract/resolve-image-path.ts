import path from "path";

const IMAGE_EXT_RE = /\.(jpe?g|png|webp)$/i;

/**
 * Authorization gate for the `imagePath` input mode of POST /api/calculations/
 * ai-extract. `imagePath` is CLIENT-SUPPLIED, so an operator may only read back
 * a drawing from their OWN drafts folder: `/uploads/drafts/<userId>/…`.
 *
 * Pure + side-effect free (no fs) so it's unit-testable in isolation. Returns
 * the on-disk path under `public/` on success, or null on ANY violation:
 *   - not exactly the caller's `/uploads/drafts/<userId>/` prefix
 *   - contains `..`, a backslash, or a null byte (traversal / smuggling)
 *   - does not end in an image extension (.jpg/.jpeg/.png/.webp)
 */
export function resolveOwnDraftImagePath(imagePath: string, userId: string): string | null {
  if (typeof imagePath !== "string") return null;
  if (imagePath.includes("..") || imagePath.includes("\\") || imagePath.includes("\0")) {
    return null;
  }
  const prefix = `/uploads/drafts/${userId}/`;
  if (!imagePath.startsWith(prefix)) return null;
  // No further path segments — must be a file directly in the drafts folder.
  const rest = imagePath.slice(prefix.length);
  if (rest.length === 0 || rest.includes("/")) return null;
  if (!IMAGE_EXT_RE.test(imagePath)) return null;
  return path.join(process.cwd(), "public", imagePath);
}
