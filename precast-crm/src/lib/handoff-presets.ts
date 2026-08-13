import { prisma } from "@/lib/prisma";

const APP_CONFIG_KEY = "handoff.presets";

/**
 * What the owner can promise a caller: a map pin, installation videos, product
 * photos, or the price list. Stored as ONE AppConfig JSON row (the existing
 * key-value pattern — no migration).
 *
 * Media MUST be referenced by Telegram `file_id`, never by raw bytes: Business
 * connections reject fresh uploads with BUSINESS_PEER_USAGE_MISSING, which is
 * why the codebase stages assets through TELEGRAM_STAGING_CHAT_ID first
 * (src/lib/telegram/api.ts:117-126). Each asset is uploaded once by an admin and
 * only its file_id is kept here.
 */
export const HANDOFF_PRESET_KEYS = [
  "LOCATION",
  "VIDEOS",
  "PHOTOS",
  "PRICELIST",
] as const;

export type HandoffPresetKey = (typeof HANDOFF_PRESET_KEYS)[number];

export interface LocationPreset {
  lat: number;
  lng: number;
  caption?: string;
}
export interface MediaListPreset {
  fileIds: string[];
  caption?: string;
}
export interface DocumentPreset {
  fileId: string;
  caption?: string;
}

export interface HandoffPresetConfig {
  LOCATION?: LocationPreset;
  VIDEOS?: MediaListPreset;
  PHOTOS?: MediaListPreset;
  PRICELIST?: DocumentPreset;
}

/**
 * Empty by design. Nothing is invented: until the owner uploads the assets and
 * sets the factory coordinates, a preset is simply "not configured" and the
 * dispatcher skips it rather than sending a wrong pin.
 */
export const DEFAULT_HANDOFF_PRESETS: HandoffPresetConfig = {};

export function isHandoffPresetKey(v: unknown): v is HandoffPresetKey {
  return typeof v === "string" && (HANDOFF_PRESET_KEYS as readonly string[]).includes(v);
}

/** True when this preset has everything it needs to actually be sent. */
export function isPresetConfigured(
  cfg: HandoffPresetConfig,
  key: HandoffPresetKey,
): boolean {
  switch (key) {
    case "LOCATION": {
      const p = cfg.LOCATION;
      return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
    }
    case "VIDEOS":
      return !!cfg.VIDEOS?.fileIds?.length;
    case "PHOTOS":
      return !!cfg.PHOTOS?.fileIds?.length;
    case "PRICELIST":
      return !!cfg.PRICELIST?.fileId;
  }
}

/** Which of the requested presets can actually be delivered right now. */
export function configuredPresets(
  cfg: HandoffPresetConfig,
  requested: readonly string[],
): HandoffPresetKey[] {
  return requested.filter(
    (k): k is HandoffPresetKey => isHandoffPresetKey(k) && isPresetConfigured(cfg, k),
  );
}

export async function loadHandoffPresets(): Promise<HandoffPresetConfig> {
  const row = await prisma.appConfig.findUnique({ where: { key: APP_CONFIG_KEY } });
  if (!row || typeof row.value !== "object" || row.value === null) {
    return DEFAULT_HANDOFF_PRESETS;
  }
  return { ...DEFAULT_HANDOFF_PRESETS, ...(row.value as HandoffPresetConfig) };
}

export async function saveHandoffPresets(cfg: HandoffPresetConfig): Promise<void> {
  await prisma.appConfig.upsert({
    where: { key: APP_CONFIG_KEY },
    create: { key: APP_CONFIG_KEY, value: cfg as unknown as object },
    update: { value: cfg as unknown as object },
  });
}
