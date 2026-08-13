export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { loadHandoffPresets, saveHandoffPresets } from "@/lib/handoff-presets";
import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_SIZE_BYTES,
  looksLikeImage,
} from "@/lib/uploads";
import {
  tgUploadPhotoGetFileId,
  tgUploadVideoGetFileId,
  tgUploadDocumentGetFileId,
  humanizeTelegramSendError,
} from "@/lib/telegram/api";

/**
 * Admin settings for the call → Telegram handoff presets
 * (docs/superpowers/specs/2026-08-12-call-to-telegram-handoff-design.md §4.5).
 *
 * Same permission split as /api/settings/table-design: reading the config is a
 * normal order.view concern, changing it is an owner (pricing.edit) one.
 *
 * The POST is the reason this route exists. A business connection REJECTS a
 * fresh upload (BUSINESS_PEER_USAGE_MISSING), so every asset must be staged
 * ONCE into TELEGRAM_STAGING_CHAT_ID and referenced by its `file_id` forever
 * after. This route does that staging and hands the file_id back to the admin
 * screen, which stores it in the AppConfig row — no bytes are kept by the CRM.
 */

// Telegram's caption limit. Anything longer is silently truncated by Telegram,
// so reject it here instead of letting the owner think it was saved whole.
const MAX_CAPTION = 1024;

// sendDocument / sendVideo accept up to 50 MB over the Bot API.
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;

const captionSchema = z.string().max(MAX_CAPTION).optional();
const fileIdSchema = z.string().min(1).max(400);

const PresetsSchema = z
  .object({
    LOCATION: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        caption: captionSchema,
      })
      .optional(),
    // An empty list is legal: it simply means "not configured yet", and the
    // dispatcher skips it. What is NOT legal is a blank file_id in the list.
    VIDEOS: z.object({ fileIds: z.array(fileIdSchema), caption: captionSchema }).optional(),
    PHOTOS: z.object({ fileIds: z.array(fileIdSchema), caption: captionSchema }).optional(),
    PRICELIST: z.object({ fileId: fileIdSchema, caption: captionSchema }).optional(),
  })
  .strict();

const UPLOAD_KINDS = ["PHOTO", "VIDEO", "DOCUMENT"] as const;
type UploadKind = (typeof UPLOAD_KINDS)[number];

function isUploadKind(v: unknown): v is UploadKind {
  return typeof v === "string" && (UPLOAD_KINDS as readonly string[]).includes(v);
}

/** GET /api/settings/handoff-presets — the current preset config. */
export const GET = withPermission("order.view", async () => {
  return ok(await loadHandoffPresets());
});

/** PUT /api/settings/handoff-presets — persist the preset config. */
export const PUT = withPermission("pricing.edit", async (req: NextRequest) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail("Нотўғри сўров · Malformed request body", 400);
  }

  const parsed = PresetsSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    return fail(`Маълумот нотўғри · Validation failed — ${msg}`, 400);
  }

  await saveHandoffPresets(parsed.data);
  return ok(parsed.data);
});

/**
 * POST /api/settings/handoff-presets — stage one media file to Telegram and
 * return its `file_id`. Multipart body: `file` + `kind` = PHOTO|VIDEO|DOCUMENT.
 * Nothing is persisted here; the caller puts the file_id into the config and
 * PUTs it.
 */
export const POST = withPermission("pricing.edit", async (req: NextRequest) => {
  const form = await req.formData();
  const file = form.get("file");
  const kind = form.get("kind");

  if (!isUploadKind(kind)) {
    return fail("Файл тури нотўғри · kind must be PHOTO, VIDEO or DOCUMENT", 422);
  }
  if (!file || typeof file !== "object" || !("arrayBuffer" in file)) {
    return fail("Файл юборилмади · No file provided", 422);
  }

  const f = file as File;
  if (f.size === 0) return fail("Бўш файл · Empty file", 422);

  const maxBytes = kind === "PHOTO" ? MAX_IMAGE_SIZE_BYTES : MAX_FILE_SIZE_BYTES;
  if (f.size > maxBytes) {
    return kind === "PHOTO"
      ? fail("Расм катта (макс 8 МБ) · Image too large (max 8 MB)", 413)
      : fail("Файл катта (макс 50 МБ) · File too large (max 50 MB)", 413);
  }

  const mime = (f.type || "").toLowerCase();
  const buffer = Buffer.from(await f.arrayBuffer());

  // Same guard as the inbox reply-photo route: don't trust the declared MIME,
  // sniff the bytes. Photos go out as real Telegram photos, so a mislabeled
  // file would fail at send time instead of here.
  if (kind === "PHOTO") {
    if (!ALLOWED_IMAGE_MIME.has(mime)) {
      return fail("Фақат расм қабул қилинади · Only JPG, PNG or WEBP images are accepted", 422);
    }
    if (!looksLikeImage(buffer)) {
      return fail("Расм нотўғри · Not a valid image", 422);
    }
  }

  const stagingChat = process.env.TELEGRAM_STAGING_CHAT_ID;
  if (!stagingChat) {
    return fail(
      "Телеграм саҳналаш канали созланмаган · TELEGRAM_STAGING_CHAT_ID not set — " +
        "create a private channel, add the bot as an admin, and set its id.",
      503,
    );
  }

  const filename = f.name || (kind === "PHOTO" ? "photo.jpg" : kind === "VIDEO" ? "video.mp4" : "file");
  const contentType = mime || undefined;

  try {
    let fileId: string;
    if (kind === "PHOTO") {
      fileId = await tgUploadPhotoGetFileId(stagingChat, buffer, { filename, contentType });
    } else if (kind === "VIDEO") {
      fileId = await tgUploadVideoGetFileId(stagingChat, buffer, { filename, contentType });
    } else {
      fileId = await tgUploadDocumentGetFileId(stagingChat, buffer, { filename, contentType });
    }
    return ok({ fileId });
  } catch (err) {
    console.error("[handoff-presets stage]", err);
    const detail = humanizeTelegramSendError(err instanceof Error ? err.message : String(err));
    return fail(`Юкланмади · Staging upload failed — ${detail}`, 502);
  }
});
