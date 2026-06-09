"use client";

import {
  useState,
  useCallback,
  useEffect,
  useRef,
  type ChangeEvent,
} from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import {
  DEFAULT_TABLE_DESIGN,
  type TableDesignConfig,
} from "@/lib/table-design-config";
import {
  CalculationShareCard,
  type ShareData,
} from "@/components/share/CalculationShareCard";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Save,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Palette,
  Type,
  Columns,
  AlignJustify,
  Store,
  Download,
  Upload,
  Check,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Mock preview data — rich enough to exercise every column & section
// ─────────────────────────────────────────────────────────────────
const MOCK: ShareData = {
  title: "Буюртма №2026-05-0012",
  subtitle: "29/05/2026",
  clientName: "Азизжон Умаров",
  clientPhone: "+998901234567",
  clientAddress: "Toshkent, Yunusobod",
  scheduledLabel: "02/06/2026",
  payment: {
    totalPrice: 52_400_000,
    paid: 20_000_000,
    remaining: 32_400_000,
    badgeLabel: "ҚИСМАН · PARTIAL",
    badgeColorCls: "bg-amber-100 text-amber-800",
  },
  rows: [
    {
      name: "Хона 1",
      innerWidth: 3.6, innerLength: 5.8, bearing: 5.8,
      pattern: "GB", beamLength: 5.8, blocksPerRow: 7,
      totalBlocks: 42, beamCount: 5, monolithLength: 3.6, monolithArea: 20.88,
      m2Price: 850_000, subtotal: 17_748_000,
    },
    {
      name: "Хона 2",
      innerWidth: 4.2, innerLength: 6.3, bearing: 6.3,
      pattern: "BGB", patternAuto: "GB", beamLength: 6.3, blocksPerRow: 8,
      totalBlocks: 56, beamCount: 6, monolithLength: 4.2, monolithArea: 26.46,
      m2Price: 920_000, subtotal: 24_343_200,
    },
    {
      name: "Хона 3",
      innerWidth: 2.8, innerLength: 4.1, bearing: 4.1,
      pattern: "GBG", beamLength: 4.1, blocksPerRow: null,
      totalBlocks: 20, beamCount: 4, monolithLength: 2.8, monolithArea: 11.48,
      m2Price: 750_000, subtotal: 8_610_000,
    },
    {
      name: "Хона 4",
      innerWidth: 5.1, innerLength: 7.2, bearing: 7.2,
      pattern: "GB", beamLength: 7.2, blocksPerRow: 11,
      totalBlocks: 88, beamCount: 7, monolithLength: 5.1, monolithArea: 36.72,
      m2Price: 980_000, subtotal: 35_985_600,
    },
  ],
  totals: { blocks: 206, beams: 22, monolithLength: 15.7, monolithArea: 95.54, sum: 86_686_800 },
};

// ─────────────────────────────────────────────────────────────────
// Font family options — system fonts safe for html-to-image
// ─────────────────────────────────────────────────────────────────
const FONTS = [
  { label: "System Sans-serif (default)", value: "ui-sans-serif, system-ui, sans-serif" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Helvetica Neue", value: '"Helvetica Neue", Helvetica, sans-serif' },
  { label: "Tahoma / Geneva", value: "Tahoma, Geneva, sans-serif" },
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Trebuchet MS", value: '"Trebuchet MS", sans-serif' },
  { label: "Georgia (Serif)", value: "Georgia, serif" },
  { label: "Times New Roman", value: '"Times New Roman", Times, serif' },
  { label: "System Monospace", value: "ui-monospace, Menlo, monospace" },
  { label: "Courier New", value: '"Courier New", Courier, monospace' },
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

const COL_NAMES = [
  "Хона · Name",
  "Эни · Width",
  "Бўйи · Length",
  "Шаблон · Pattern",
  "Балка · Beam L.",
  "Ғ/қатор · Blk/Row",
  "Жами Ғ · Tot.Blocks",
  "Балка · Beams",
  "Майдон · Area",
  "м² нархи · Price",
  "Сумма · Total",
];

// ─────────────────────────────────────────────────────────────────
// Primitive controls
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
  const inputRef = useRef<HTMLInputElement>(null);

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
            ref={inputRef}
            type="number"
            value={raw}
            min={min}
            max={max}
            step={step}
            onChange={(e) => setRaw(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={(e) => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
            className="w-20 text-xs font-mono text-right border border-primary rounded px-2 py-0.5 bg-background outline-none"
            autoFocus
          />
        ) : (
          <button
            title="Click to type an exact value"
            onClick={() => { setRaw(String(value)); setEditing(true); }}
            className="text-xs font-mono tabular-nums text-muted-foreground hover:text-foreground hover:bg-muted rounded px-2 py-0.5 cursor-text transition-colors"
          >
            {value}{unit}
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
          onChange={(e) => { setHex(e.target.value); onChange(e.target.value); }}
          className="h-8 w-8 rounded border border-border cursor-pointer p-0 shrink-0"
          title={label}
        />
        <input
          type="text"
          value={hex.toUpperCase()}
          onChange={(e) => setHex(e.target.value)}
          onBlur={(e) => commitHex(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") commitHex((e.target as HTMLInputElement).value); }}
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

/** Text input row. */
function TextInput({
  label,
  hint,
  value,
  maxLength = 80,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  maxLength?: number;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-foreground">{label}</div>
        {hint && <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div>}
      </div>
      <input
        type="text"
        value={value}
        maxLength={maxLength}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        className="text-xs border border-border rounded px-2 py-1.5 bg-background w-48"
      />
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
      {open && (
        <div className="p-4 space-y-4 bg-card border-t border-border">
          {children}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Column width editor with live sum bar
// ─────────────────────────────────────────────────────────────────
function ColWidthsEditor({
  values,
  onChange,
}: {
  values: TableDesignConfig["colWidths"];
  onChange: (v: TableDesignConfig["colWidths"]) => void;
}) {
  const sum = values.reduce((a, b) => a + b, 0);
  const rounded = Math.round(sum * 10) / 10;
  const ok = Math.abs(sum - 100) <= 1;

  function set(idx: number, v: number) {
    const next = [...values] as TableDesignConfig["colWidths"];
    next[idx] = v;
    onChange(next);
  }

  function autoDistribute() {
    const each = parseFloat((100 / 11).toFixed(1));
    const adjusted = Array(11).fill(each) as TableDesignConfig["colWidths"];
    adjusted[10] = parseFloat((100 - each * 10).toFixed(1));
    onChange(adjusted);
  }

  return (
    <div className="space-y-3">
      {/* Sum status bar */}
      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-mono tabular-nums", ok ? "text-emerald-700" : "text-destructive")}>
          Жами: {rounded}% {ok ? "✓" : `(${rounded > 100 ? "+" : ""}${(rounded - 100).toFixed(1)})`}
        </span>
        <button
          type="button"
          onClick={autoDistribute}
          className="text-[10px] text-muted-foreground hover:text-foreground underline"
        >
          Тенг тақсимлаш · Equal distribute
        </button>
      </div>
      {/* Visual bar */}
      <div className="flex h-2 rounded-full overflow-hidden border border-border">
        {values.map((v, i) => (
          <div
            key={i}
            title={`${COL_NAMES[i]}: ${v}%`}
            style={{ width: `${Math.max(0, (v / 100) * 100)}%`, backgroundColor: `hsl(${i * 33}, 60%, 55%)` }}
          />
        ))}
      </div>
      {/* Sliders */}
      <div className="space-y-2.5">
        {values.map((v, i) => (
          <div key={i} className="flex items-center gap-2">
            <div
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: `hsl(${i * 33}, 60%, 55%)` }}
            />
            <span className="text-[11px] text-muted-foreground truncate w-40 shrink-0">
              {COL_NAMES[i]}
            </span>
            <input
              type="range"
              min={2}
              max={30}
              step={0.5}
              value={v}
              onChange={(e) => set(i, Number(e.target.value))}
              className="flex-1 accent-primary h-1.5 cursor-pointer"
            />
            <button
              title="Click to type"
              onClick={() => {
                const val = prompt(`${COL_NAMES[i]} — нови жадвал кенглиги (%):`, String(v));
                if (val !== null) {
                  const n = parseFloat(val);
                  if (Number.isFinite(n) && n >= 2 && n <= 30) set(i, n);
                }
              }}
              className="text-[11px] font-mono tabular-nums text-muted-foreground hover:text-foreground hover:bg-muted rounded px-1.5 py-0.5 cursor-text w-12 text-right"
            >
              {v}%
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────
export function TableDesignerClient() {
  const qc = useQueryClient();
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.55);
  const [savedOk, setSavedOk] = useState(false);

  // Dynamically compute preview scale from container width
  useEffect(() => {
    const obs = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = e.contentRect.width;
        if (w > 0) {
          setPreviewScale(Math.min(1, (w - 24) / 1100));
        }
      }
    });
    if (previewRef.current) obs.observe(previewRef.current);
    return () => obs.disconnect();
  }, []);

  // Fetch current saved config
  const { data: saved, isLoading } = useQuery<TableDesignConfig>({
    queryKey: ["table-design"],
    queryFn: () => api<TableDesignConfig>("/api/settings/table-design"),
    staleTime: 5 * 60 * 1000,
  });

  const [draft, setDraft] = useState<TableDesignConfig | null>(null);
  const bootstrapped = useRef(false);
  if (saved && !bootstrapped.current) {
    bootstrapped.current = true;
    if (!draft) setDraft({ ...DEFAULT_TABLE_DESIGN, ...saved });
  }

  const cfg = draft ?? saved ?? DEFAULT_TABLE_DESIGN;

  const set = useCallback(<K extends keyof TableDesignConfig>(key: K, value: TableDesignConfig[K]) => {
    setDraft((prev) => ({ ...(prev ?? DEFAULT_TABLE_DESIGN), [key]: value }));
  }, []);

  // Save mutation
  const { mutate: save, isPending: saving } = useMutation({
    mutationFn: (c: TableDesignConfig) =>
      api<TableDesignConfig>("/api/settings/table-design", { method: "PUT", json: c }),
    onSuccess: (updated) => {
      qc.setQueryData(["table-design"], updated);
      setDraft({ ...DEFAULT_TABLE_DESIGN, ...updated });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2000);
    },
  });

  // Reset to hard defaults (server returns them via PATCH)
  const { mutate: resetToDefaults, isPending: resetting } = useMutation({
    mutationFn: () => api<TableDesignConfig>("/api/settings/table-design", { method: "PATCH" }),
    onSuccess: (defaults) => setDraft({ ...defaults }),
  });

  // Import / export JSON config
  const fileInputRef = useRef<HTMLInputElement>(null);

  function exportConfig() {
    const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "table-design-config.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importConfig(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target?.result as string);
        setDraft({ ...DEFAULT_TABLE_DESIGN, ...parsed });
      } catch {
        alert("Ошибка: недействительный JSON файл · Invalid JSON file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const colSum = cfg.colWidths.reduce((a, b) => a + b, 0);
  const colSumOk = Math.abs(colSum - 100) <= 1;
  const scalePct = Math.round(previewScale * 100);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Юкланмоқда…</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Page header ────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight leading-tight">
            Жадвал дизайнери
            <span className="text-muted-foreground font-normal"> · Table Image Designer</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            PNG / JPEG экспорт учун визуал шаблонни созланг. Сақланган ўзгаришлар
            барча буюртма ва лойиҳа расмларига тааллуқли.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Import */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={importConfig}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            title="Import a previously exported JSON config"
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" />
            Импорт
          </Button>

          {/* Export */}
          <Button variant="outline" size="sm" onClick={exportConfig} title="Download config as JSON">
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Экспорт
          </Button>

          {/* Reset */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => resetToDefaults()}
            disabled={resetting}
            title="Reset all values to factory defaults"
          >
            {resetting ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Асliga
          </Button>

          {/* Save */}
          {!colSumOk && (
            <span className="text-xs text-destructive font-medium">
              Устунлар: {colSum.toFixed(1)}% / 100%
            </span>
          )}
          <Button
            size="sm"
            onClick={() => save(cfg)}
            disabled={saving || !colSumOk}
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : savedOk ? (
              <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
            ) : (
              <Save className="h-3.5 w-3.5 mr-1.5" />
            )}
            {savedOk ? "Сақланди!" : "Сақлаш · Save"}
          </Button>
        </div>
      </div>

      {/* ── Two-pane layout ─────────────────────────────────── */}
      {/* `items-stretch` (flex default) is critical: it makes the
          right column grow to match the tall left settings column,
          which is what gives `sticky top-4` (line ~739) the scroll
          range it needs. Without it the right column is only as
          tall as the preview itself and sticky has nowhere to pin. */}
      <div className="flex gap-6 items-stretch">

        {/* ── Left: Controls ────────────────────────────────── */}
        <div className="w-[420px] shrink-0 space-y-3 pb-24">

          {/* Brand */}
          <Section title="Бренд · Brand" sub="Logotip, tagline, telefon" icon={Store}>
            <TextInput label="Бренд номи" value={cfg.brandName} onChange={(v) => set("brandName", v)} />
            <TextInput label="Tagline" value={cfg.brandTagline} onChange={(v) => set("brandTagline", v)} />
            <TextInput label="Телефон" value={cfg.brandPhone} onChange={(v) => set("brandPhone", v)} maxLength={40} />
            <ColorPicker label="Бренд чизиғи ранги" hint="Brand header bottom border" value={cfg.brandDividerColor} onChange={(v) => set("brandDividerColor", v)} />
          </Section>

          {/* Card */}
          <Section title="Карта · Card" sub="Ўлчам, фон, маржа" icon={AlignJustify}>
            <Slider label="Карта кенглиги" hint="Recommended 900–1200px" value={cfg.cardWidth} min={600} max={1600} onChange={(v) => set("cardWidth", v)} />
            <Slider label="Горизонтал маржа" value={cfg.cardPaddingX} min={0} max={80} onChange={(v) => set("cardPaddingX", v)} />
            <Slider label="Вертикал маржа" value={cfg.cardPaddingY} min={0} max={80} onChange={(v) => set("cardPaddingY", v)} />
            <ColorPicker label="Карта фони" value={cfg.cardBg} onChange={(v) => set("cardBg", v)} />
          </Section>

          {/* Typography */}
          <Section title="Шрифт · Typography" sub="Оила, ўлчам, қалинлик" icon={Type}>
            <Select
              label="Шрифт оиласи"
              hint="System fonts — safe for image export"
              value={cfg.fontFamily}
              options={FONTS}
              onChange={(v) => set("fontFamily", v)}
            />
            <div className="h-px bg-border" />
            <Slider label="Сарлавҳа (th) ўлчами" value={cfg.headerFontSize} min={4} max={20} onChange={(v) => set("headerFontSize", v)} />
            <Slider label="Асосий (td) ўлчами" value={cfg.bodyFontSize} min={4} max={20} onChange={(v) => set("bodyFontSize", v)} />
            <Slider label="Жами сатр ўлчами" value={cfg.footerFontSize} min={4} max={24} onChange={(v) => set("footerFontSize", v)} />
            <Slider label="Жадвал бар ўлчами" hint='"Ҳисоб-китоб хулосаси" bar' value={cfg.tableBarFontSize} min={4} max={16} onChange={(v) => set("tableBarFontSize", v)} />
            <div className="h-px bg-border" />
            <Select label="Сарлавҳа қалинлиги" value={cfg.headerFontWeight} options={WEIGHTS} onChange={(v) => set("headerFontWeight", v)} />
            <Select label="Асосий матн қалинлиги" value={cfg.bodyFontWeight} options={WEIGHTS} onChange={(v) => set("bodyFontWeight", v)} />
            <Select label="Хона номи қалинлиги" value={cfg.nameCellWeight} options={WEIGHTS} onChange={(v) => set("nameCellWeight", v)} />
            <Select label="Жами сатр қалинлиги" value={cfg.footerFontWeight} options={WEIGHTS} onChange={(v) => set("footerFontWeight", v)} />
          </Section>

          {/* Spacing */}
          <Section title="Интервал · Spacing" sub="Қатор ва ячейка бўшлиқлари" icon={AlignJustify}>
            <Slider label="Сарлавҳа (th) вертикал" value={cfg.headerRowPaddingY} min={0} max={20} onChange={(v) => set("headerRowPaddingY", v)} />
            <Slider label="Асосий (td) вертикал" value={cfg.bodyRowPaddingY} min={0} max={20} onChange={(v) => set("bodyRowPaddingY", v)} />
            <Slider label="Ячейка горизонтал" hint="All cells left + right" value={cfg.cellPaddingX} min={2} max={36} onChange={(v) => set("cellPaddingX", v)} />
          </Section>

          {/* Colors */}
          <Section title="Рангlar · Colors" sub="Фон, матн, чегара" icon={Palette}>
            <p className="text-[10px] text-muted-foreground -mt-1">
              Нативни ранг танлагич + HEX майдони. Маҳкам боглиқ рангларни бирга ўзгартиринг.
            </p>
            <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider pt-1">Сарлавҳа · Header</div>
            <ColorPicker label="thead фони" value={cfg.headerBg} onChange={(v) => set("headerBg", v)} />
            <ColorPicker label="thead матни" value={cfg.headerText} onChange={(v) => set("headerText", v)} />
            <ColorPicker label="Жадвал бар фони" hint='"Ҳисоб-китоб хулосаси" row' value={cfg.tableBarBg} onChange={(v) => set("tableBarBg", v)} />
            <ColorPicker label="Жадвал бар матни" value={cfg.tableBarText} onChange={(v) => set("tableBarText", v)} />

            <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider pt-1">Маълумот қаторлари · Body rows</div>
            <ColorPicker label="Жуфт қатор фони" hint="Rows 1, 3, 5… (0-indexed)" value={cfg.evenRowBg} onChange={(v) => set("evenRowBg", v)} />
            <ColorPicker label="Тоқ қатор фони" hint="Rows 2, 4, 6… (stripe)" value={cfg.oddRowBg} onChange={(v) => set("oddRowBg", v)} />
            <ColorPicker label="Асосий матн" value={cfg.bodyText} onChange={(v) => set("bodyText", v)} />
            <ColorPicker label="Иккинчи даражали матн" hint="Units, auto-labels, dims" value={cfg.dimText} onChange={(v) => set("dimText", v)} />
            <ColorPicker label="Хона номи ранги" value={cfg.nameCellColor} onChange={(v) => set("nameCellColor", v)} />

            <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider pt-1">Акцентлар · Accents</div>
            <ColorPicker label="Балка узунлиги ранги" hint="Beam length column text" value={cfg.accentColor} onChange={(v) => set("accentColor", v)} />
            <ColorPicker label="Жами сумма ранги" hint="Subtotal column + footer total" value={cfg.subtotalColor} onChange={(v) => set("subtotalColor", v)} />

            <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider pt-1">Жами · Footer</div>
            <ColorPicker label="Жами сатр фони" value={cfg.footerBg} onChange={(v) => set("footerBg", v)} />
            <ColorPicker label="Жами сатр матни" value={cfg.footerText} onChange={(v) => set("footerText", v)} />
            <Slider label="Жами чегара қалинлиги" value={cfg.footerDividerWidth} min={0} max={6} onChange={(v) => set("footerDividerWidth", v)} />

            <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wider pt-1">Чегаралар · Borders</div>
            <ColorPicker label="Жадвал чегараси" hint="Card + table outer border" value={cfg.borderColor} onChange={(v) => set("borderColor", v)} />
            <ColorPicker label="Қатор чизиғи" hint="Row divider (usually lighter)" value={cfg.rowDividerColor} onChange={(v) => set("rowDividerColor", v)} />
            <Slider label="Жадвал чегара қалинлиги" value={cfg.tableBorderWidth} min={0} max={4} onChange={(v) => set("tableBorderWidth", v)} />
          </Section>

          {/* Column widths */}
          <Section title="Устун кенглиги · Columns" sub="11 устун % кенглиги — жами 100% бўлиши керак" icon={Columns} defaultOpen={false}>
            <ColWidthsEditor
              values={cfg.colWidths}
              onChange={(v) => set("colWidths", v)}
            />
          </Section>
        </div>

        {/* ── Right: Sticky live preview ───────────────────── */}
        <div className="flex-1 min-w-0">
          <div className="sticky top-4 space-y-2">
            {/* Preview toolbar */}
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Жонли кўриниш · Live Preview
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPreviewScale((s) => Math.max(0.2, +(s - 0.05).toFixed(2)))}
                  className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <span className="text-[11px] font-mono tabular-nums text-muted-foreground w-10 text-center">
                  {scalePct}%
                </span>
                <button
                  onClick={() => setPreviewScale((s) => Math.min(1, +(s + 0.05).toFixed(2)))}
                  className="h-6 w-6 rounded border border-border flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Preview frame */}
            <div
              ref={previewRef}
              className="rounded-xl border border-border bg-[#e8eaed] overflow-hidden"
              style={{ minHeight: 480 }}
            >
              <div className="overflow-auto p-3">
                {/* zoom property shrinks both visual and layout, eliminating overflow */}
                <div style={{ zoom: previewScale }}>
                  <CalculationShareCard data={MOCK} config={cfg} />
                </div>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground">
              Реал экспорт 3× пиксел зичликда ({cfg.cardWidth * 3} px кенглик {cfg.cardWidth} px карта учун).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
