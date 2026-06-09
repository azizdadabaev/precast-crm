// Curated proof-media library (Plan 2026-06-09) — videos/photos the agent can
// send the moment a customer reaches the PROOF stage ("videosi bormi?").
//
// Owner-managed (uploaded via /agent), stored as one AppConfig JSON row — same
// migration-free pattern as the KB and table.design. Each item is durably
// identified by its Telegram `file_id` (captured once at curation; cheap to
// resend, no per-send upload). The selection logic is pure + unit-testable.

import { z } from 'zod';

export const PROOF_MEDIA_KEY = 'agent.proof_media';

/** Cap on clips sent in one PROOF response — never spam the customer. */
export const PROOF_MEDIA_SEND_CAP = 3;

export const ProofMediaItemSchema = z.object({
  id: z.string(),
  kind: z.enum(['VIDEO', 'PHOTO']),
  /** Telegram file_id (already staged) — what we resend. */
  fileId: z.string().min(1),
  title: z.string().max(120).default(''),
  /** Lowercase topic tags, e.g. "montaj", "tayyor_obyekt", "monolit", "zina", "gazoblok". */
  tags: z.array(z.string()).default([]),
  /** Optional caption sent with the clip (uz-latin, like the share card). */
  caption: z.string().max(1024).nullable().optional(),
  enabled: z.boolean().default(true),
  /** Curation order — drives the default set + send order. */
  order: z.number().int().default(0),
  /** Local preview copy for the CRM UI (owner-only; not customer-facing). */
  previewPath: z.string().nullable().optional(),
});
export type ProofMediaItem = z.infer<typeof ProofMediaItemSchema>;

const ProofMediaConfigSchema = z.object({ items: z.array(ProofMediaItemSchema).default([]) });
export type ProofMediaConfig = z.infer<typeof ProofMediaConfigSchema>;

const EMPTY: ProofMediaConfig = { items: [] };

/** Normalize a free-text topic to the tag space (lowercase, spaces→underscore). */
export function normalizeTopic(topic: string): string {
  return topic.trim().toLowerCase().replace(/\s+/g, '_');
}

/**
 * Pure selection: enabled items, matched by topic tag when given, else the
 * default set (lowest `order` first). Capped at `cap`. A topic with no tag
 * match falls back to the default set so the agent always has SOMETHING to send
 * when a library exists.
 */
export function selectProofMedia(
  items: ReadonlyArray<ProofMediaItem>,
  opts?: { topic?: string | null; cap?: number },
): ProofMediaItem[] {
  const cap = opts?.cap ?? PROOF_MEDIA_SEND_CAP;
  const enabled = items.filter((i) => i.enabled && i.fileId).sort((a, b) => a.order - b.order);
  if (enabled.length === 0) return [];

  const topic = opts?.topic ? normalizeTopic(opts.topic) : null;
  if (topic) {
    const tagged = enabled.filter((i) => i.tags.map((t) => normalizeTopic(t)).includes(topic));
    if (tagged.length > 0) return tagged.slice(0, cap);
  }
  return enabled.slice(0, cap);
}

/** Validate/normalize a stored config (tolerant — drops malformed items). */
export function parseProofMediaConfig(raw: unknown): ProofMediaConfig {
  const parsed = ProofMediaConfigSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  // Tolerant fallback: keep only the items that individually validate.
  if (raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown }).items)) {
    const items = ((raw as { items: unknown[] }).items)
      .map((i) => ProofMediaItemSchema.safeParse(i))
      .filter((r): r is { success: true; data: ProofMediaItem } => r.success)
      .map((r) => r.data);
    return { items };
  }
  return EMPTY;
}

export async function loadProofMedia(): Promise<ProofMediaConfig> {
  const { prisma } = await import('@/lib/prisma');
  const row = await prisma.appConfig.findUnique({ where: { key: PROOF_MEDIA_KEY } });
  if (!row) return EMPTY;
  return parseProofMediaConfig(row.value);
}

export async function saveProofMedia(config: ProofMediaConfig): Promise<void> {
  const { prisma } = await import('@/lib/prisma');
  await prisma.appConfig.upsert({
    where: { key: PROOF_MEDIA_KEY },
    create: { key: PROOF_MEDIA_KEY, value: config as unknown as object },
    update: { value: config as unknown as object },
  });
}
