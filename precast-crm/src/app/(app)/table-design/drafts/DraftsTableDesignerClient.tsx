"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import {
  DEFAULT_DRAFTS_TABLE_DESIGN,
  type DraftsColumn,
  type DraftsColumnKey,
  type DraftsTableDesignConfig,
  type DraftsTablePalette,
} from "@/lib/drafts-table-design";
import { draftsTableStyleVars } from "@/lib/drafts-table-style";
import { Button } from "@/components/ui/button";
import {
  AlignJustify,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Columns,
  Loader2,
  Palette,
  RotateCcw,
  Save,
  Type,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";

// ─────────────────────────────────────────────────────────────────
// Column metadata — labels shown in the editor and the preview.
// The real table (/projects) keeps its own header markup because its
// headers also carry sort/filter affordances; only the wording is
// shared, and it is deliberately kept identical here.
// ─────────────────────────────────────────────────────────────────
const COLUMN_LABELS: Record<DraftsColumnKey, { uz: string; en: string }> = {
  client: { uz: "Мижоз", en: "Client" },
  phone: { uz: "Тел", en: "Phone" },
  address: { uz: "Манзил", en: "Address" },
  rooms: { uz: "Хоналар", en: "Rooms" },
  slabL: { uz: "Монолит Б", en: "Slab L" },
  area: { uz: "Майдон", en: "Area" },
  weight: { uz: "Оғирлик", en: "Weight" },
  subtotal: { uz: "Сумма", en: "Subtotal" },
  status: { uz: "Ҳолат", en: "Status" },
  updated: { uz: "Янгиланди", en: "Updated" },
  operator: { uz: "Оператор", en: "Operator" },
};

/** Text alignment per column — mirrors the real drafts table. */
const COLUMN_ALIGN: Record<DraftsColumnKey, "left" | "right" | "center"> = {
  client: "left",
  phone: "left",
  address: "left",
  rooms: "center",
  slabL: "right",
  area: "right",
  weight: "right",
  subtotal: "right",
  status: "left",
  updated: "left",
  operator: "left",
};

/** Columns whose value is rendered in the secondary (muted) color. */
const MUTED_COLUMNS: DraftsColumnKey[] = ["address", "slabL", "weight", "updated"];

// ─────────────────────────────────────────────────────────────────
// Preview rows — realistic shapes: long name, missing phone, big sum
// ─────────────────────────────────────────────────────────────────
const MOCK_ROWS: Record<DraftsColumnKey, string>[] = [
  {
    client: "Азизжон Умаров",
    phone: "+998 90 123 45 67",
    address: "Тошкент, Юнусобод",
    rooms: "4",
    slabL: "15,7 m",
    area: "95,54 m²",
    weight: "17 197 кг",
    subtotal: "86 686 800",
    status: "Лойиҳа",
    updated: "29/05/2026",
    operator: "Нодира",
  },
  {
    client: "Шаҳноза Каримова-Тошматова",
    phone: "—",
    address: "Самарқанд, Ургут тумани",
    rooms: "2",
    slabL: "8,4 m",
    area: "41,20 m²",
    weight: "7 416 кг",
    subtotal: "34 210 000",
    status: "№2026-05-0012",
    updated: "28/05/2026",
    operator: "🤖 AI",
  },
  {
    client: "Бекзод Раҳимов",
    phone: "+998 91 555 22 11",
    address: "Фарғона, Қўқон",
    rooms: "7",
    slabL: "26,1 m",
    area: "162,08 m²",
    weight: "29 174 кг",
    subtotal: "148 900 500",
    status: "Лойиҳа",
    updated: "27/05/2026",
    operator: "Жасур",
  },
  {
    client: "Мадина Юсупова",
    phone: "+998 93 481 33 30",
    address: "Бухоро, Когон",
    rooms: "1",
    slabL: "4,2 m",
    area: "18,90 m²",
    weight: "3 402 кг",
    subtotal: "9 450 000",
    status: "Архив",
    updated: "26/05/2026",
    operator: "—",
  },
];

// ─────────────────────────────────────────────────────────────────
// Font family options — the table lives in the app, so "inherit"
// (the app's own font stack) is the sensible default.
// ─────────────────────────────────────────────────────────────────
const FONTS = [
  { label: "Илова шрифти · Inherit (default)", value: "inherit" },
  { label: "System Sans-serif", value: "ui-sans-serif, system-ui, sans-serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica Neue", value: '"Helvetica Neue", Helvetica, sans-serif' },
  { label: "Tahoma / Geneva", value: "Tahoma, Geneva, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: '"Trebuchet MS", sans-serif' },
  { label: "Georgia (Serif)", value: "Georgia, serif" },
  { label: "Times New Roman", value: '"Times New Roman", Times, serif' },
  { label: "System Monospace", value: "ui-monospace, Menlo, monospace" },
  { label: "Consolas", value: "Consolas, monospace" },
];

const WEIGHTS = [
  { label: "100 · Thin", value: 100 },
  { label: "200 · Extra Light", value: 200 },
  { label: "300 · Light", value: 300 },
  { label: "400 · Regular", value: 400 },
  { label: "500 · Medium", value: 500 },
  { label: "600 · Semi-Bold", value: 600 },
  { label: "700 · Bold", value: 700 },
  { label: "800 · Extra Bold", value: 800 },
  { label: "900 · Black", value: 900 },
];

// ─────────────────────────────────────────────────────────────────
// Primitive controls — same widgets as the share-card designer
// ─────────────────────────────────────────────────────────────────

/** Range slider with a click-to-type value badge. */
function Slider({
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  unit = "px",
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState("");

  function commitEdit() {
    const n = parseFloat(raw);
    if (Number.isFinite(n)) onChange(Math.min(max, Math.max(min, n)));
    setEditing(false);
  }

  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{label}</span>
        {editing ? (
          <input
            type="number"
            value={raw}
            min={min}
            max={max}
            step={step}
            onChange={(e) => setRaw(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit();
              if (e.key === "Escape") setEditing(false);
            }}
            className="w-20 text-xs font-mono text-right border border-primary rounded px-2 py-0.5 bg-background outline-none"
            autoFocus
          />
        ) : (
          <button
            type="button"
            title="Аниқ қиймат ёзиш · Click to type"
            onClick={() => {
              setRaw(String(value));
              setEditing(true);
            }}
            className="text-xs font-mono tabular-nums text-muted-foreground hover:text-foreground hover:bg-muted rounded px-2 py-0.5 cursor-text transition-colors"
          >
            {value}
            {unit}
          </button>
        )}
      </div>
      {hint && <p className="text-[10px] text-muted-foreground leading-none">{hint}</p>}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground tabular-nums">{min}</span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1 accent-primary h-1.5 cursor-pointer"
        />
        <span className="text-[10px] text-muted-foreground tabular-nums">{max}</span>
      </div>
    </div>
  );
}

/** Color picker with hex input. */
function ColorPicker({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);

  function commitHex(raw: string) {
    const v = raw.startsWith("#") ? raw : `#${raw}`;
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
    setHex(value); // reset if invalid
  }

  return (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground">{label}</div>
        {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <input
          type="color"
          value={value}
          onChange={(e) => {
            setHex(e.target.value);
            onChange(e.target.value);
          }}
          className="h-8 w-8 rounded border border-border cursor-pointer p-0 shrink-0"
          title={label}
        />
        <input
          type="text"
          value={hex.toUpperCase()}
          onChange={(e) => setHex(e.target.value)}
          onBlur={(e) => commitHex(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitHex((e.target as HTMLInputElement).value);
          }}
          maxLength={7}
          className="w-20 text-xs font-mono border border-border rounded px-2 py-1 bg-background"
        />
      </div>
    </div>
  );
}

/** Select / dropdown. */
function Select<T extends string | number>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: { label: string; value: T }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground">{label}</div>
        {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <select
        value={String(value)}
        onChange={(e) => {
          const raw = e.target.value;
          onChange((typeof value === "number" ? Number(raw) : raw) as T);
        }}
        className="text-xs border border-border rounded px-2 py-1.5 bg-background min-w-[160px] max-w-[220px]"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Collapsible section wrapper
// ─────────────────────────────────────────────────────────────────
function Section({
  title,
  sub,
  icon: Icon,
  children,
  defaultOpen = true,
}: {
  title: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-border overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 bg-muted/30 hover:bg-muted/60 transition-colors text-left"
      >
        <Icon className="h-[15px] w-[15px] text-muted-foreground shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold leading-none">{title}</div>
          {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
        </div>
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>
      {open && <div className="p-4 space-y-4 bg-card border-t border-border">{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Column list — order (↑/↓), visibility, width
// ─────────────────────────────────────────────────────────────────
function ColumnsEditor({
  columns,
  onChange,
}: {
  columns: DraftsColumn[];
  onChange: (v: DraftsColumn[]) => void;
}) {
  const t = useT();
  const visible = columns.filter((c) => c.visible);
  const sum = visible.reduce((s, c) => s + c.width, 0);
  const rounded = Math.round(sum * 10) / 10;
  // Same ±1% tolerance the API enforces on PUT.
  const ok = visible.length === 0 || Math.abs(sum - 100) <= 1;

  function patch(idx: number, patchValue: Partial<DraftsColumn>) {
    onChange(columns.map((c, i) => (i === idx ? { ...c, ...patchValue } : c)));
  }

  function move(idx: number, delta: number) {
    const target = idx + delta;
    if (target < 0 || target >= columns.length) return;
    const next = [...columns];
    const [moved] = next.splice(idx, 1);
    next.splice(target, 0, moved);
    onChange(next);
  }

  /** Spread 100% evenly over the VISIBLE columns; hidden ones keep their width. */
  function autoDistribute() {
    if (visible.length === 0) return;
    const each = parseFloat((100 / visible.length).toFixed(1));
    let remaining = 100;
    let seen = 0;
    onChange(
      columns.map((c) => {
        if (!c.visible) return c;
        seen += 1;
        const width = seen === visible.length ? parseFloat(remaining.toFixed(1)) : each;
        remaining -= each;
        return { ...c, width };
      }),
    );
  }

  return (
    <div className="space-y-3">
      {/* Sum status */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span
          className={cn(
            "text-xs font-mono tabular-nums",
            ok ? "text-success" : "text-destructive",
          )}
        >
          {t("Кўринадиган устунлар", "Visible columns")}: {rounded}%{" "}
          {ok ? "✓" : `(${rounded > 100 ? "+" : ""}${(rounded - 100).toFixed(1)})`}
        </span>
        <button
          type="button"
          onClick={autoDistribute}
          className="text-[10px] text-muted-foreground hover:text-foreground underline"
        >
          Тенг тақсимлаш<span className="lang-en"> · Equal distribute</span>
        </button>
      </div>

      {!ok && (
        <p className="text-[10px] text-destructive">
          {t(
            "Кўринадиган устунлар эни жами 100% (±1) бўлмаса, сақлаш рад этилади.",
            "Saving is rejected unless visible widths total 100% (±1).",
          )}
        </p>
      )}

      {/* Proportion bar — hidden columns take no space */}
      <div className="flex h-2 rounded-full overflow-hidden border border-border">
        {columns.map((c, i) =>
          c.visible ? (
            <div
              key={c.key}
              title={`${COLUMN_LABELS[c.key].uz}: ${c.width}%`}
              style={{
                width: `${Math.max(0, c.width)}%`,
                backgroundColor: `hsl(${i * 33}, 60%, 55%)`,
              }}
            />
          ) : null,
        )}
      </div>

      {/* Rows */}
      <div className="space-y-1.5">
        {columns.map((c, i) => (
          <div
            key={c.key}
            className={cn(
              "flex items-center gap-2 rounded-md border border-border px-2 py-1.5",
              !c.visible && "opacity-50",
            )}
          >
            <div className="flex flex-col shrink-0">
              <button
                type="button"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                aria-label={t("Юқорига", "Move up")}
                className="text-muted-foreground hover:text-foreground disabled:opacity-25"
              >
                <ChevronUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                disabled={i === columns.length - 1}
                onClick={() => move(i, 1)}
                aria-label={t("Пастга", "Move down")}
                className="text-muted-foreground hover:text-foreground disabled:opacity-25"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>

            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: `hsl(${i * 33}, 60%, 55%)` }}
            />

            <label className="flex flex-1 min-w-0 items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={c.visible}
                onChange={(e) => patch(i, { visible: e.target.checked })}
                title={t("Устунни кўрсатиш", "Show column")}
              />
              <span className="text-[11px] truncate">
                {COLUMN_LABELS[c.key].uz}
                <span className="lang-en text-muted-foreground"> · {COLUMN_LABELS[c.key].en}</span>
              </span>
            </label>

            <div className="flex items-center gap-1 shrink-0">
              <input
                type="number"
                min={1}
                max={60}
                step={0.5}
                value={c.width}
                disabled={!c.visible}
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  if (Number.isFinite(n)) patch(i, { width: Math.min(100, Math.max(0, n)) });
                }}
                className="w-16 text-[11px] font-mono tabular-nums text-right border border-border rounded px-1.5 py-1 bg-background"
                aria-label={`${COLUMN_LABELS[c.key].uz} — %`}
              />
              <span className="text-[10px] text-muted-foreground">%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Live preview — the real /projects markup in miniature
// ─────────────────────────────────────────────────────────────────
function DraftsTablePreview({
  config,
  isDark,
}: {
  config: DraftsTableDesignConfig;
  isDark: boolean;
}) {
  const visible = config.columns.filter((c) => c.visible);
  const palette = isDark ? config.dark : config.light;

  if (visible.length === 0) {
    return (
      <div className="p-8 text-center text-xs text-muted-foreground">
        Барча устунлар яширилган<span className="lang-en"> · All columns hidden</span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto" style={{ backgroundColor: palette.evenRowBg }}>
      <table
        className="drafts-table w-full table-fixed"
        style={draftsTableStyleVars(config, isDark)}
      >
        <colgroup>
          {visible.map((c) => (
            <col key={c.key} style={{ width: `${c.width}%` }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {visible.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "uppercase tracking-wider",
                  COLUMN_ALIGN[c.key] === "right"
                    ? "text-right"
                    : COLUMN_ALIGN[c.key] === "center"
                      ? "text-center"
                      : "text-left",
                )}
              >
                {COLUMN_LABELS[c.key].uz}
                <span className="lang-en"> · {COLUMN_LABELS[c.key].en}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MOCK_ROWS.map((row, ri) => (
            <tr key={ri}>
              {visible.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    COLUMN_ALIGN[c.key] === "right"
                      ? "text-right tabular-nums"
                      : COLUMN_ALIGN[c.key] === "center"
                        ? "text-center"
                        : "text-left",
                    MUTED_COLUMNS.includes(c.key) && "dt-muted",
                    c.key === "subtotal" && "dt-accent tabular-nums",
                  )}
                >
                  {row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────
export function DraftsTableDesignerClient() {
  const t = useT();
  const qc = useQueryClient();
  const [savedOk, setSavedOk] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  /** Which palette is being edited AND previewed — the two stay in sync
      so it is always obvious which theme a color affects. */
  const [paletteTab, setPaletteTab] = useState<"light" | "dark">("light");

  const { data: saved, isLoading } = useQuery<DraftsTableDesignConfig>({
    queryKey: ["drafts-table-design"],
    queryFn: () => api<DraftsTableDesignConfig>("/api/settings/drafts-table-design"),
    staleTime: 5 * 60 * 1000,
  });

  const [draft, setDraft] = useState<DraftsTableDesignConfig | null>(null);
  const bootstrapped = useRef(false);
  if (saved && !bootstrapped.current) {
    bootstrapped.current = true;
    if (!draft) setDraft({ ...DEFAULT_DRAFTS_TABLE_DESIGN, ...saved });
  }

  const cfg = draft ?? saved ?? DEFAULT_DRAFTS_TABLE_DESIGN;

  const set = useCallback(
    <K extends keyof DraftsTableDesignConfig>(key: K, value: DraftsTableDesignConfig[K]) => {
      setDraft((prev) => ({ ...(prev ?? DEFAULT_DRAFTS_TABLE_DESIGN), [key]: value }));
    },
    [],
  );

  const setColor = useCallback(
    (theme: "light" | "dark", key: keyof DraftsTablePalette, value: string) => {
      setDraft((prev) => {
        const base = prev ?? DEFAULT_DRAFTS_TABLE_DESIGN;
        return { ...base, [theme]: { ...base[theme], [key]: value } };
      });
    },
    [],
  );

  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: (c: DraftsTableDesignConfig) =>
      api<DraftsTableDesignConfig>("/api/settings/drafts-table-design", {
        method: "PUT",
        json: c,
      }),
    onSuccess: (updated) => {
      qc.setQueryData(["drafts-table-design"], updated);
      setDraft({ ...DEFAULT_DRAFTS_TABLE_DESIGN, ...updated });
      setErrorMsg(null);
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    },
    onError: (e: Error) => setErrorMsg(e.message),
  });

  const { mutate: resetToDefaults, isPending: resetting } = useMutation({
    mutationFn: () =>
      api<DraftsTableDesignConfig>("/api/settings/drafts-table-design", { method: "PATCH" }),
    onSuccess: (defaults) => {
      setDraft({ ...defaults });
      setErrorMsg(null);
    },
    onError: (e: Error) => setErrorMsg(e.message),
  });

  const visibleCols = cfg.columns.filter((c) => c.visible);
  const colSum = visibleCols.reduce((s, c) => s + c.width, 0);
  const colSumOk = visibleCols.length === 0 || Math.abs(colSum - 100) <= 1;
  const palette = paletteTab === "dark" ? cfg.dark : cfg.light;

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
          <h1 className="text-xl font-bold tracking-tight leading-tight">
            Лойиҳалар жадвали дизайнери
            <span className="lang-en text-muted-foreground font-normal">
              {" "}
              · Drafts Table Designer
            </span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            {t(
              "«Лойиҳалар» саҳифасидаги сақланган ҳисоб-китоблар жадвалини созланг. Созламалар умумий — барча операторлар шу кўринишни кўради.",
              "Configure the saved-drafts table on the Projects page. The setting is global — every operator sees this layout.",
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetToDefaults()}
            disabled={resetting}
            title={t("Барча қийматларни асл ҳолатга қайтариш", "Reset all values to defaults")}
          >
            {resetting ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Аслига<span className="lang-en">&nbsp;· Reset</span>
          </Button>

          {!colSumOk && (
            <span className="text-xs text-destructive font-medium tabular-nums">
              {t("Устунлар", "Columns")}: {colSum.toFixed(1)}% / 100%
            </span>
          )}
          <Button size="sm" onClick={() => save(cfg)} disabled={saving || !colSumOk}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : savedOk ? (
              <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            )}
            {savedOk ? t("Сақланди!", "Saved!") : "Сақлаш · Save"}
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
          {t("Сақлашда хатолик", "Could not save")}: {errorMsg}
        </div>
      )}

      {/* ── Two-pane layout ─────────────────────────────────── */}
      {/* `items-stretch` keeps the right column as tall as the settings
          column so the sticky preview has somewhere to travel. */}
      <div className="flex gap-6 items-stretch">
        {/* ── Left: Controls ────────────────────────────────── */}
        <div className="w-[420px] shrink-0 space-y-3 pb-24">
          <Section
            title="Устунлар · Columns"
            sub="Тартиб, кўриниш, кенглик — жами 100%"
            icon={Columns}
          >
            <ColumnsEditor columns={cfg.columns} onChange={(v) => set("columns", v)} />
          </Section>

          <Section title="Шрифт · Typography" sub="Оила, ўлчам, қалинлик" icon={Type}>
            <Select
              label={t("Шрифт оиласи", "Font family")}
              hint="Inherit = илова шрифти"
              value={cfg.fontFamily}
              options={FONTS}
              onChange={(v) => set("fontFamily", v)}
            />
            <div className="h-px bg-border" />
            <Slider
              label={t("Сарлавҳа (th) ўлчами", "Header (th) size")}
              value={cfg.headerFontSize}
              min={8}
              max={24}
              onChange={(v) => set("headerFontSize", v)}
            />
            <Slider
              label={t("Асосий (td) ўлчами", "Body (td) size")}
              value={cfg.bodyFontSize}
              min={8}
              max={24}
              onChange={(v) => set("bodyFontSize", v)}
            />
            <div className="h-px bg-border" />
            <Select
              label={t("Сарлавҳа қалинлиги", "Header weight")}
              value={cfg.headerFontWeight}
              options={WEIGHTS}
              onChange={(v) => set("headerFontWeight", v)}
            />
            <Select
              label={t("Асосий матн қалинлиги", "Body weight")}
              value={cfg.bodyFontWeight}
              options={WEIGHTS}
              onChange={(v) => set("bodyFontWeight", v)}
            />
          </Section>

          <Section title="Интервал · Spacing" sub="Қатор ва ячейка бўшлиқлари" icon={AlignJustify}>
            <Slider
              label={t("Сарлавҳа (th) вертикал", "Header (th) vertical")}
              value={cfg.headerRowPaddingY}
              min={0}
              max={40}
              onChange={(v) => set("headerRowPaddingY", v)}
            />
            <Slider
              label={t("Асосий (td) вертикал", "Body (td) vertical")}
              value={cfg.bodyRowPaddingY}
              min={0}
              max={40}
              onChange={(v) => set("bodyRowPaddingY", v)}
            />
            <Slider
              label={t("Ячейка горизонтал", "Cell horizontal")}
              hint={t("Барча ячейкалар — чап + ўнг", "All cells — left + right")}
              value={cfg.cellPaddingX}
              min={0}
              max={40}
              onChange={(v) => set("cellPaddingX", v)}
            />
          </Section>

          <Section title="Ранглар · Colors" sub="Кундузги ва тунги режим алоҳида" icon={Palette}>
            {/* Theme tabs — also switch the preview, so it is always clear
                which mode the colors below apply to. */}
            <div className="flex rounded-md border border-border overflow-hidden">
              {(
                [
                  { key: "light", uz: "Кундузги", en: "Light" },
                  { key: "dark", uz: "Тунги", en: "Dark" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setPaletteTab(tab.key)}
                  className={cn(
                    "flex-1 px-3 h-8 text-xs font-semibold uppercase tracking-wider transition-colors",
                    paletteTab === tab.key
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {tab.uz}
                  <span className="lang-en"> · {tab.en}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {t(
                "Ҳозир таҳрирланмоқда: ",
                "Now editing: ",
              )}
              <span className="font-semibold text-foreground">
                {paletteTab === "dark" ? "Тунги · Dark" : "Кундузги · Light"}
              </span>
              {t(
                " — қуйидаги ранглар фақат шу режимга тегишли.",
                " — the colors below affect only this mode.",
              )}
            </p>

            <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider pt-1">
              Сарлавҳа · Header
            </div>
            <ColorPicker
              label={t("Сарлавҳа фони", "Header background")}
              value={palette.headerBg}
              onChange={(v) => setColor(paletteTab, "headerBg", v)}
            />
            <ColorPicker
              label={t("Сарлавҳа матни", "Header text")}
              value={palette.headerText}
              onChange={(v) => setColor(paletteTab, "headerText", v)}
            />

            <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider pt-1">
              Қаторлар · Rows
            </div>
            <ColorPicker
              label={t("Жуфт қатор фони", "Even row background")}
              hint="1, 3, 5…"
              value={palette.evenRowBg}
              onChange={(v) => setColor(paletteTab, "evenRowBg", v)}
            />
            <ColorPicker
              label={t("Тоқ қатор фони", "Odd row background")}
              hint="2, 4, 6…"
              value={palette.oddRowBg}
              onChange={(v) => setColor(paletteTab, "oddRowBg", v)}
            />
            <ColorPicker
              label={t("Асосий матн", "Body text")}
              value={palette.bodyText}
              onChange={(v) => setColor(paletteTab, "bodyText", v)}
            />
            <ColorPicker
              label={t("Иккинчи даражали матн", "Secondary text")}
              hint={t("Манзил, монолит, оғирлик, сана", "Address, slab, weight, date")}
              value={palette.mutedText}
              onChange={(v) => setColor(paletteTab, "mutedText", v)}
            />

            <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider pt-1">
              Акцент ва чегара · Accent & border
            </div>
            <ColorPicker
              label={t("Сумма устуни ранги", "Subtotal column color")}
              value={palette.accentText}
              onChange={(v) => setColor(paletteTab, "accentText", v)}
            />
            <ColorPicker
              label={t("Чегара ранги", "Border color")}
              value={palette.borderColor}
              onChange={(v) => setColor(paletteTab, "borderColor", v)}
            />
          </Section>
        </div>

        {/* ── Right: Sticky live preview ───────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="sticky top-4 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Жонли кўриниш<span className="lang-en"> · Live Preview</span>
              </span>
              <span className="text-[11px] text-muted-foreground">
                {paletteTab === "dark" ? "Тунги · Dark" : "Кундузги · Light"}
              </span>
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <DraftsTablePreview config={cfg} isDark={paletteTab === "dark"} />
            </div>

            <p className="text-[10px] text-muted-foreground">
              {t(
                "Танлаш ва ўчириш устунлари созланмайди — улар доим биринчи ва охирги бўлиб чиқади.",
                "The select and delete columns are not configurable — they always render first and last.",
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
