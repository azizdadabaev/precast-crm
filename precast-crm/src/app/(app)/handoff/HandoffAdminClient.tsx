"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Save,
  Check,
  X,
  MapPin,
  Video,
  ImageIcon,
  FileText,
  Upload,
  PhoneForwarded,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/fetcher";
import { useT } from "@/lib/i18n";
import { cn, formatDateTime } from "@/lib/utils";
// Type-only: src/lib/handoff-presets.ts imports Prisma, so its runtime
// exports must never reach the client bundle.
import type { HandoffPresetConfig } from "@/lib/handoff-presets";

/**
 * Admin screen for the call → Telegram handoff
 * (docs/superpowers/specs/2026-08-12-call-to-telegram-handoff-design.md §4.3, §4.5).
 *
 * Section A configures WHAT a caller receives; Section B shows WHO was sent a
 * link and who never replied. Read-only on the right, editable on the left —
 * the follow-up rows are created by the phone app and consumed by the Telegram
 * webhook, never by this page.
 */

const MAX_CAPTION = 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FILE_BYTES = 50 * 1024 * 1024;

type UploadKind = "PHOTO" | "VIDEO" | "DOCUMENT";

interface FollowUpRow {
  id: string;
  phone: string;
  presets: string[];
  status: string;
  createdAt: string;
  consumedAt: string | null;
  expiresAt: string;
  conversationId: string | null;
}

/** Editable mirror of HandoffPresetConfig. Numbers stay strings while typing. */
interface Draft {
  lat: string;
  lng: string;
  locCaption: string;
  videoIds: string[];
  videoCaption: string;
  photoIds: string[];
  photoCaption: string;
  priceId: string;
  priceCaption: string;
}

const EMPTY_DRAFT: Draft = {
  lat: "",
  lng: "",
  locCaption: "",
  videoIds: [],
  videoCaption: "",
  photoIds: [],
  photoCaption: "",
  priceId: "",
  priceCaption: "",
};

function draftFromConfig(cfg: HandoffPresetConfig): Draft {
  return {
    lat: cfg.LOCATION ? String(cfg.LOCATION.lat) : "",
    lng: cfg.LOCATION ? String(cfg.LOCATION.lng) : "",
    locCaption: cfg.LOCATION?.caption ?? "",
    videoIds: cfg.VIDEOS?.fileIds ?? [],
    videoCaption: cfg.VIDEOS?.caption ?? "",
    photoIds: cfg.PHOTOS?.fileIds ?? [],
    photoCaption: cfg.PHOTOS?.caption ?? "",
    priceId: cfg.PRICELIST?.fileId ?? "",
    priceCaption: cfg.PRICELIST?.caption ?? "",
  };
}

function trimmedOrUndefined(s: string): string | undefined {
  const v = s.trim();
  return v ? v : undefined;
}

/**
 * Turn the draft into the stored config, or explain why it can't be.
 *
 * A preset is written ONLY when it is complete. A half-filled location (one
 * coordinate) is an error rather than a silent omission — that is exactly the
 * case where the owner thinks the pin is set and it is not.
 */
function buildConfig(d: Draft): { cfg: HandoffPresetConfig } | { error: [string, string] } {
  const cfg: HandoffPresetConfig = {};

  const latRaw = d.lat.trim();
  const lngRaw = d.lng.trim();
  if (latRaw || lngRaw) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!latRaw || !lngRaw || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return {
        error: [
          "Жойлашув учун кенглик ва узунлик — иккаласи ҳам керак.",
          "Location needs both latitude and longitude.",
        ],
      };
    }
    if (lat < -90 || lat > 90) {
      return { error: ["Кенглик −90 дан 90 гача бўлиши керак.", "Latitude must be between −90 and 90."] };
    }
    if (lng < -180 || lng > 180) {
      return { error: ["Узунлик −180 дан 180 гача бўлиши керак.", "Longitude must be between −180 and 180."] };
    }
    cfg.LOCATION = { lat, lng, caption: trimmedOrUndefined(d.locCaption) };
  }

  if (d.videoIds.length) {
    cfg.VIDEOS = { fileIds: d.videoIds, caption: trimmedOrUndefined(d.videoCaption) };
  }
  if (d.photoIds.length) {
    cfg.PHOTOS = { fileIds: d.photoIds, caption: trimmedOrUndefined(d.photoCaption) };
  }
  if (d.priceId.trim()) {
    cfg.PRICELIST = { fileId: d.priceId.trim(), caption: trimmedOrUndefined(d.priceCaption) };
  }

  return { cfg };
}

/** Stage one file to Telegram and get back the file_id we keep forever. */
async function stageFile(file: File, kind: UploadKind): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);
  const res = await fetch("/api/settings/handoff-presets", {
    method: "POST",
    body: fd,
    credentials: "include",
  });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : {};
  if (!res.ok || payload?.ok === false) {
    throw new Error(payload?.error || `HTTP ${res.status}`);
  }
  return (payload?.data as { fileId: string }).fileId;
}

/** file_id strings are long and opaque — show enough to tell two apart. */
function shortFileId(id: string): string {
  return id.length <= 20 ? id : `${id.slice(0, 10)}…${id.slice(-6)}`;
}

// ─────────────────────────────────────────────────────────────────
// Pieces
// ─────────────────────────────────────────────────────────────────

function Section({
  icon: Icon,
  title,
  sub,
  configured,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  sub: string;
  configured: boolean;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3 bg-muted/30">
        <Icon className="h-[15px] w-[15px] text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold leading-none">{title}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
        </div>
        {configured ? (
          <Badge variant="success" className="shrink-0">
            {t("Созланган", "Configured")}
          </Badge>
        ) : (
          <Badge variant="outline" className="shrink-0 text-muted-foreground">
            {t("Созланмаган", "Not configured")}
          </Badge>
        )}
      </div>
      <div className="p-4 space-y-3 bg-card border-t border-border">
        {!configured && (
          <p className="text-xs text-muted-foreground">
            {t(
              "Созланмаган — мижоз жавоб берганда бу тавсия юборилмайди, жимгина ўтказиб юборилади.",
              "Not configured — this preset is silently skipped when the customer replies.",
            )}
          </p>
        )}
        {children}
      </div>
    </div>
  );
}

function CaptionField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const t = useT();
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{t("Изоҳ", "Caption")}</span>
        <span className="text-[10px] font-mono tabular-nums text-muted-foreground">
          {value.length}/{MAX_CAPTION}
        </span>
      </div>
      <textarea
        value={value}
        maxLength={MAX_CAPTION}
        rows={2}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("Ихтиёрий · мижоз кўради", "Optional · the customer sees this")}
        className="text-xs border border-border rounded px-2 py-1.5 bg-background w-full resize-y focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </div>
  );
}

function FileIdChip({ value, onRemove }: { value: string; onRemove: () => void }) {
  const t = useT();
  return (
    <span
      title={value}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 pl-2.5 pr-1 py-0.5"
    >
      <span className="text-[11px] font-mono text-muted-foreground">{shortFileId(value)}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("Ўчириш", "Remove")}
        title={t("Ўчириш", "Remove")}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function UploadButton({
  kind,
  accept,
  label,
  busy,
  onPicked,
}: {
  kind: UploadKind;
  accept: string;
  label: string;
  busy: boolean;
  onPicked: (file: File, kind: UploadKind) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // let the same file be picked again
          if (file) onPicked(file, kind);
        }}
      />
      <Button variant="outline" size="sm" disabled={busy} onClick={() => ref.current?.click()}>
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
        ) : (
          <Upload className="h-3.5 w-3.5 mr-1.5" />
        )}
        {label}
      </Button>
    </>
  );
}

const PRESET_LABELS: Record<string, [string, string]> = {
  LOCATION: ["Жойлашув", "Location"],
  VIDEOS: ["Видеолар", "Videos"],
  PHOTOS: ["Расмлар", "Photos"],
  PRICELIST: ["Прайс-лист", "Price list"],
};

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────
export function HandoffAdminClient() {
  const t = useT();
  const qc = useQueryClient();

  const { data: saved, isLoading } = useQuery<HandoffPresetConfig>({
    queryKey: ["handoff-presets"],
    queryFn: () => api<HandoffPresetConfig>("/api/settings/handoff-presets"),
    staleTime: 5 * 60 * 1000,
  });

  const [draft, setDraft] = useState<Draft | null>(null);
  const bootstrapped = useRef(false);
  if (saved && !bootstrapped.current) {
    bootstrapped.current = true;
    if (!draft) setDraft(draftFromConfig(saved));
  }
  const d = draft ?? EMPTY_DRAFT;

  const [uploadTarget, setUploadTarget] = useState<"VIDEOS" | "PHOTOS" | "PRICELIST" | null>(null);
  const [error, setError] = useState<[string, string] | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  function patch(next: Partial<Draft>) {
    setDraft((prev) => ({ ...(prev ?? EMPTY_DRAFT), ...next }));
  }

  // Mirrors isPresetConfigured() in src/lib/handoff-presets.ts — the dispatcher
  // skips anything this reports as false, so the two must agree.
  const locConfigured =
    !!d.lat.trim() && !!d.lng.trim() && Number.isFinite(Number(d.lat)) && Number.isFinite(Number(d.lng));
  const videosConfigured = d.videoIds.length > 0;
  const photosConfigured = d.photoIds.length > 0;
  const priceConfigured = !!d.priceId.trim();

  async function handlePick(file: File, kind: UploadKind, target: "VIDEOS" | "PHOTOS" | "PRICELIST") {
    setError(null);
    const max = kind === "PHOTO" ? MAX_IMAGE_BYTES : MAX_FILE_BYTES;
    if (file.size === 0) {
      setError(["Бўш файл.", "Empty file."]);
      return;
    }
    if (file.size > max) {
      setError(
        kind === "PHOTO"
          ? ["Расм катта (макс 8 МБ).", "Image too large (max 8 MB)."]
          : ["Файл катта (макс 50 МБ).", "File too large (max 50 MB)."],
      );
      return;
    }
    setUploadTarget(target);
    try {
      const fileId = await stageFile(file, kind);
      // Functional update: the upload is async, so `d` may be a render behind.
      setDraft((prev) => {
        const base = prev ?? EMPTY_DRAFT;
        if (target === "VIDEOS") return { ...base, videoIds: [...base.videoIds, fileId] };
        if (target === "PHOTOS") return { ...base, photoIds: [...base.photoIds, fileId] };
        return { ...base, priceId: fileId };
      });
    } catch (err) {
      setError([
        `Файл юкланмади${err instanceof Error ? `: ${err.message}` : ""}`,
        `Upload failed${err instanceof Error ? `: ${err.message}` : ""}`,
      ]);
    } finally {
      setUploadTarget(null);
    }
  }

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: (cfg: HandoffPresetConfig) =>
      api<HandoffPresetConfig>("/api/settings/handoff-presets", { method: "PUT", json: cfg }),
    onSuccess: (updated) => {
      qc.setQueryData(["handoff-presets"], updated);
      setDraft(draftFromConfig(updated));
      setError(null);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    },
    onError: (err: unknown) => {
      setError([
        `Сақланмади${err instanceof Error ? `: ${err.message}` : ""}`,
        `Save failed${err instanceof Error ? `: ${err.message}` : ""}`,
      ]);
    },
  });

  function onSave() {
    const built = buildConfig(d);
    if ("error" in built) {
      setError(built.error);
      return;
    }
    setError(null);
    save(built.cfg);
  }

  // ── Section B data ───────────────────────────────────────────
  const {
    data: followUps,
    isLoading: loadingFollowUps,
    error: followUpsError,
  } = useQuery<FollowUpRow[]>({
    queryKey: ["handoff-followups"],
    queryFn: () => api<FollowUpRow[]>("/api/handoff"),
    staleTime: 30 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">{t("Юкланмоқда…", "Loading…")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Page header ────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight leading-tight flex items-center gap-2">
            <PhoneForwarded className="h-5 w-5 text-muted-foreground" />
            Қўнғироқдан Telegram’га
            <span className="lang-en text-muted-foreground font-normal"> · Call handoff</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            {t(
              "Қўнғироқдан сўнг мижозга SMS орқали ҳавола юборилади. Мижоз ёзгач, қуйида созланган материаллар автоматик юборилади.",
              "After a call the customer gets an SMS link. Once they write in, the material configured below is sent automatically.",
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {savedOk && (
            <span className="flex items-center gap-1 text-xs text-emerald-600">
              <Check className="h-3.5 w-3.5" />
              {t("Сақланди", "Saved")}
            </span>
          )}
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            )}
            {t("Сақлаш", "Save")}
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {t(error[0], error[1])}
        </div>
      )}

      {/* ── Section A · presets ────────────────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Тайёр материаллар
            <span className="lang-en text-muted-foreground font-normal"> · Presets</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            {t(
              "Ҳар бир файл Telegram’га бир марта юкланади ва кейин фақат унинг file_id си ишлатилади. Созланмаган тавсиялар ўтказиб юборилади — нотўғри манзил юборгандан кўра ҳеч нарса юбормаган афзал.",
              "Each file is uploaded to Telegram once; only its file_id is reused afterwards. Unconfigured presets are skipped — sending nothing beats sending a wrong pin.",
            )}
          </p>
        </div>

        {/* Location */}
        <Section
          icon={MapPin}
          title={t("Жойлашув", "Location")}
          sub={t("Заводнинг харитадаги нуқтаси", "The factory pin sent to callers")}
          configured={locConfigured}
        >
          <div className="flex flex-wrap gap-3">
            <label className="grid gap-1">
              <span className="text-xs font-medium text-foreground">{t("Кенглик", "Latitude")}</span>
              <Input
                type="number"
                step="any"
                inputMode="decimal"
                value={d.lat}
                placeholder="40.9983"
                onChange={(e) => patch({ lat: e.target.value })}
                className="h-9 w-40 font-mono tabular-nums text-sm"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-medium text-foreground">{t("Узунлик", "Longitude")}</span>
              <Input
                type="number"
                step="any"
                inputMode="decimal"
                value={d.lng}
                placeholder="71.6726"
                onChange={(e) => patch({ lng: e.target.value })}
                className="h-9 w-40 font-mono tabular-nums text-sm"
              />
            </label>
          </div>
          <CaptionField value={d.locCaption} onChange={(v) => patch({ locCaption: v })} />
        </Section>

        {/* Videos */}
        <Section
          icon={Video}
          title={t("Видеолар", "Videos")}
          sub={t("Монтаж видеолари", "Installation videos")}
          configured={videosConfigured}
        >
          {d.videoIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {d.videoIds.map((id, i) => (
                <FileIdChip
                  key={`${id}-${i}`}
                  value={id}
                  onRemove={() => patch({ videoIds: d.videoIds.filter((_, j) => j !== i) })}
                />
              ))}
            </div>
          )}
          <UploadButton
            kind="VIDEO"
            accept="video/*"
            label={t("Видео қўшиш", "Add video")}
            busy={uploadTarget === "VIDEOS"}
            onPicked={(f, k) => handlePick(f, k, "VIDEOS")}
          />
          <CaptionField value={d.videoCaption} onChange={(v) => patch({ videoCaption: v })} />
        </Section>

        {/* Photos */}
        <Section
          icon={ImageIcon}
          title={t("Расмлар", "Photos")}
          sub={t("Маҳсулот расмлари", "Product photos")}
          configured={photosConfigured}
        >
          {d.photoIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {d.photoIds.map((id, i) => (
                <FileIdChip
                  key={`${id}-${i}`}
                  value={id}
                  onRemove={() => patch({ photoIds: d.photoIds.filter((_, j) => j !== i) })}
                />
              ))}
            </div>
          )}
          <UploadButton
            kind="PHOTO"
            accept="image/jpeg,image/png,image/webp"
            label={t("Расм қўшиш", "Add photo")}
            busy={uploadTarget === "PHOTOS"}
            onPicked={(f, k) => handlePick(f, k, "PHOTOS")}
          />
          <CaptionField value={d.photoCaption} onChange={(v) => patch({ photoCaption: v })} />
        </Section>

        {/* Price list */}
        <Section
          icon={FileText}
          title={t("Прайс-лист", "Price list")}
          sub={t("Битта ҳужжат (PDF)", "A single document (PDF)")}
          configured={priceConfigured}
        >
          {priceConfigured && (
            <div className="flex flex-wrap gap-2">
              <FileIdChip value={d.priceId} onRemove={() => patch({ priceId: "" })} />
            </div>
          )}
          <UploadButton
            kind="DOCUMENT"
            accept=".pdf,application/pdf"
            label={priceConfigured ? t("Алмаштириш", "Replace") : t("Ҳужжат юклаш", "Upload document")}
            busy={uploadTarget === "PRICELIST"}
            onPicked={(f, k) => handlePick(f, k, "PRICELIST")}
          />
          <CaptionField value={d.priceCaption} onChange={(v) => patch({ priceCaption: v })} />
        </Section>
      </section>

      {/* ── Section B · recent follow-ups ──────────────────── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">
            Сўнгги кузатувлар
            <span className="lang-en text-muted-foreground font-normal"> · Recent follow-ups</span>
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5 max-w-2xl">
            {t(
              "Кимга ҳавола юборилган ва ким жавоб бермаган. Фақат кўриш учун.",
              "Who was sent a link and who never replied. Read-only.",
            )}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-card overflow-hidden">
          {loadingFollowUps ? (
            <div className="p-6 text-sm text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>
          ) : followUpsError ? (
            <div className="p-6 text-sm text-muted-foreground">
              {t("Рўйхатни кўриш учун рухсат йўқ.", "You don't have permission to view this list.")}
            </div>
          ) : !followUps || followUps.length === 0 ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              {t("Ҳозирча кузатувлар йўқ.", "No follow-ups yet.")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 whitespace-nowrap">{t("Телефон", "Phone")}</th>
                    <th className="text-left px-3 py-2">{t("Материаллар", "Presets")}</th>
                    <th className="text-left px-3 py-2 whitespace-nowrap">{t("Ҳолат", "Status")}</th>
                    <th className="text-left px-3 py-2 whitespace-nowrap">{t("Юборилди", "Created")}</th>
                    <th className="text-left px-3 py-2 whitespace-nowrap">{t("Муддати", "Expires")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {followUps.map((row) => (
                    <FollowUpTableRow key={row.id} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/**
 * One follow-up row. The important case is PENDING whose expiry has passed:
 * the DB still says PENDING (nothing sweeps the table), but for the owner that
 * row means "this caller never replied" — so it gets its own badge and a muted
 * row instead of hiding behind the generic pending styling.
 */
function FollowUpTableRow({ row }: { row: FollowUpRow }) {
  const t = useT();
  const expired = row.status === "PENDING" && new Date(row.expiresAt).getTime() < Date.now();

  return (
    <tr className={cn("hover:bg-muted/20", expired && "bg-muted/30")}>
      <td className="px-3 py-2 font-mono tabular-nums whitespace-nowrap">{row.phone}</td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1">
          {row.presets.map((p) => {
            const label = PRESET_LABELS[p];
            return (
              <span
                key={p}
                className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground"
              >
                {label ? t(label[0], label[1]) : p}
              </span>
            );
          })}
        </div>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <StatusBadge status={row.status} expired={expired} />
      </td>
      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
        {formatDateTime(row.createdAt)}
      </td>
      <td
        className={cn(
          "px-3 py-2 text-xs tabular-nums whitespace-nowrap",
          expired ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {formatDateTime(row.expiresAt)}
      </td>
    </tr>
  );
}

function StatusBadge({ status, expired }: { status: string; expired: boolean }) {
  const t = useT();

  if (expired) {
    return (
      <Badge
        variant="outline"
        className="border-destructive/50 text-destructive"
        title={t("Муддат тугади, мижоз ёзмади", "Expired without a reply")}
      >
        {t("Жавоб йўқ", "No reply")}
      </Badge>
    );
  }

  switch (status) {
    case "CONSUMED":
      return <Badge variant="success">{t("Жавоб берди", "Replied")}</Badge>;
    case "EXPIRED":
      return (
        <Badge variant="outline" className="border-destructive/50 text-destructive">
          {t("Муддати тугади", "Expired")}
        </Badge>
      );
    case "CANCELED":
      return (
        <Badge variant="outline" className="text-muted-foreground">
          {t("Бекор қилинди", "Canceled")}
        </Badge>
      );
    default:
      return <Badge variant="warning">{t("Кутилмоқда", "Pending")}</Badge>;
  }
}
