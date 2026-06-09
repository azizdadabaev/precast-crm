export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { randomUUID } from "crypto";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { recordAudit } from "@/lib/audit";
import { saveBufferToUploads } from "@/lib/uploads";
import { tgUploadPhotoGetFileId, tgUploadVideoGetFileId } from "@/lib/telegram/api";
import { loadProofMedia, saveProofMedia, type ProofMediaItem } from "@/lib/agent/proof-media";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB — Telegram bot upload ceiling for our purposes

/**
 * POST /api/agent/proof-media/upload — owner-only. Multipart: { file, kind?,
 * title?, tags?, caption? }. Saves a local preview copy, STAGES the media to the
 * Telegram staging channel ONCE to capture a reusable `file_id`, and appends the
 * item to the library. The agent later resends by `file_id` (no re-upload).
 */
export const POST = withPermission("inbox.access", async (req: NextRequest, { user }) => {
  const stagingChat = process.env.TELEGRAM_STAGING_CHAT_ID;
  if (!stagingChat) return fail("TELEGRAM_STAGING_CHAT_ID not set — cannot stage media", 500);

  const form = await req.formData().catch(() => null);
  if (!form) return fail("expected multipart/form-data", 422);

  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) return fail("file is required", 422);
  if (file.size > MAX_BYTES) return fail("file too large (max 50 MB)", 413);

  const mime = file.type || "application/octet-stream";
  const explicitKind = String(form.get("kind") ?? "").toUpperCase();
  const kind: ProofMediaItem["kind"] =
    explicitKind === "VIDEO" || explicitKind === "PHOTO"
      ? (explicitKind as ProofMediaItem["kind"])
      : mime.startsWith("video/")
        ? "VIDEO"
        : "PHOTO";

  const title = String(form.get("title") ?? "").slice(0, 120);
  const caption = form.get("caption") ? String(form.get("caption")).slice(0, 1024) : null;
  const tags = String(form.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = kind === "VIDEO" ? "mp4" : mime.includes("png") ? "png" : "jpg";
  const filename = `${Date.now()}-${Math.round(buffer.length)}.${ext}`;

  // Local preview copy (owner UI) + stage to Telegram once → reusable file_id.
  let previewPath: string;
  let fileId: string;
  try {
    previewPath = await saveBufferToUploads(buffer, "agent-proof", filename);
    fileId =
      kind === "VIDEO"
        ? await tgUploadVideoGetFileId(stagingChat, buffer, { filename, contentType: mime })
        : await tgUploadPhotoGetFileId(stagingChat, buffer, { filename, contentType: mime });
  } catch (err) {
    console.error("[proof-media upload]", err);
    return fail("staging upload failed — check the bot token + staging chat", 502, {
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  const config = await loadProofMedia();
  const maxOrder = config.items.reduce((m, i) => Math.max(m, i.order), -1);
  const item: ProofMediaItem = {
    id: randomUUID(),
    kind,
    fileId,
    title,
    tags,
    caption,
    enabled: true,
    order: maxOrder + 1,
    previewPath,
  };
  await saveProofMedia({ items: [...config.items, item] });

  recordAudit({
    userId: user.id,
    action: "agent.proof_media.upload",
    targetType: "appConfig",
    targetId: "agent.proof_media",
    message: `AI proof media uploaded (${kind}${title ? `: ${title}` : ""})`,
  });

  return ok({ item });
});
