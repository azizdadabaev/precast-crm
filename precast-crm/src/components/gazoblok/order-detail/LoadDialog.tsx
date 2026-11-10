"use client";

/**
 * Load (or correct) one shipment — the ready-mix ticket model: per size the order,
 * what other shipments already took, what is left, THIS shipment, and what will be left
 * after it. A first load starts from what is left per size (owner 2026-11-10). Loading
 * beyond the order needs an explicit tick (the server still answers 409
 * OVERLOAD_CONFIRM_REQUIRED when it wasn't sent); the weight split, photos and the
 * stock check stay.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  Camera,
  ChevronDown,
  CircleCheck,
  Loader2,
  Scale,
  TriangleAlert,
  Truck,
  X,
  Zap,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/fetcher";
import { useLang, useT } from "@/lib/i18n";
import { uzPart } from "@/lib/gazoblok-text";
import { cn, formatNumber } from "@/lib/utils";
import { prepareImageForUpload } from "@/lib/image/prepare-upload";
import { loadedByLine } from "@/lib/gazoblok-quantities";
import { distributeGazoblokLoad, loadWeightKg, type GazoblokLine, type GazoblokTruck } from "@/lib/gazoblok-weight";
import { NUM } from "@/components/gazoblok/order-form/ui";
import { BTN_OUTLINE, BTN_PRIMARY, ICON } from "./ui";

export type LoadLine = GazoblokLine & { unitPrice: number; productId: string | null };

const n0 = (v: number) => formatNumber(v, 0);
const parseTruckCount = (s: string) => Math.max(1, parseInt(s, 10) || 1);
const parseCapacity = (s: string) => {
  const n = parseInt(s, 10);
  return n >= 1 ? n : 10000;
};

export function LoadDialog({
  orderId,
  orderNumber,
  clientName,
  sellerName,
  shipment,
  initialLoaded,
  lines,
  otherShipments,
  canSeeStock,
  onClose,
  onSuccess,
}: {
  orderId: string;
  orderNumber: string;
  clientName: string;
  sellerName: string | null;
  shipment: { id: string; number: number };
  /** Saved counts of a loaded / delivered shipment being corrected; null for a first load. */
  initialLoaded: Record<string, number> | null;
  lines: LoadLine[];
  /** loadedLines of every OTHER loaded shipment. */
  otherShipments: Array<Record<string, number>>;
  canSeeStock: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const t = useT();
  const lang = useLang();
  const genericError = t("Хатолик юз берди. Қайта уриниб кўринг.", "Something went wrong. Try again.");
  const correcting = initialLoaded !== null;
  const fileRef = useRef<HTMLInputElement>(null);

  const before = useMemo(() => loadedByLine(otherShipments.map((l) => ({ loadedLines: l }))), [otherShipments]);
  const leftBefore = (l: LoadLine) => Math.max(0, l.quantity - (before.get(l.lineId) ?? 0));
  const totalLeftBefore = lines.reduce((s, l) => s + leftBefore(l), 0);

  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.lineId, String(correcting ? (initialLoaded?.[l.lineId] ?? 0) : leftBefore(l))])),
  );
  const count = (id: string) => Math.max(0, parseInt(inputs[id] ?? "0", 10) || 0);
  const counts = Object.fromEntries(lines.map((l) => [l.lineId, count(l.lineId)]));
  const truckTotal = lines.reduce((s, l) => s + counts[l.lineId], 0);

  // Over-load THIS save adds (same rule as the server's planLoad): beyond the order,
  // minus what this truck already carried over before a correction.
  const over = lines.map((l) => {
    const base = before.get(l.lineId) ?? 0;
    const was = Math.max(0, base + (initialLoaded?.[l.lineId] ?? 0) - l.quantity);
    const now = Math.max(0, base + counts[l.lineId] - l.quantity);
    return { line: l, extra: Math.max(0, now - was), overAfter: now };
  });
  const overBlocks = over.reduce((s, o) => s + o.extra, 0);
  const overAmount = over.reduce((s, o) => s + o.extra * o.line.unitPrice, 0);
  const leftAfterTotal = lines.reduce((s, l) => s + Math.max(0, leftBefore(l) - counts[l.lineId]), 0);

  const [overloadOk, setOverloadOk] = useState(false);
  const [serverAsk, setServerAsk] = useState<{ extraBlocks: number; extraAmount: number } | null>(null);
  const showOverBox = overBlocks > 0 || serverAsk !== null;
  const needsTick = showOverBox && !overloadOk;

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const previewsRef = useRef<string[]>([]);
  previewsRef.current = previews;
  useEffect(() => () => { for (const u of previewsRef.current) URL.revokeObjectURL(u); }, []);

  const [distOpen, setDistOpen] = useState(false);
  const [uniformCapacity, setUniformCapacity] = useState("10000");
  const [truckCount, setTruckCount] = useState("2");
  const [useVaried, setUseVaried] = useState(false);
  const [variedCapacities, setVariedCapacities] = useState<string[]>(["10000", "10000"]);

  const weight = loadWeightKg(lines, counts);

  // Low stock: warn only when this shipment needs more of a size than the yard holds.
  const { data: stock } = useQuery<Array<{ id: string; stock: { quantity: number } | null }>>({
    queryKey: ["gazoblok", "stock"],
    queryFn: () => api("/api/gazoblok/stock"),
    enabled: canSeeStock,
    staleTime: 30_000,
  });
  const stockById = new Map((stock ?? []).map((p) => [p.id, p.stock?.quantity ?? 0]));
  const short = lines
    .map((l) => {
      if (!l.productId || !stockById.has(l.productId)) return null;
      const need = counts[l.lineId] - (initialLoaded?.[l.lineId] ?? 0);
      const have = stockById.get(l.productId) ?? 0;
      return need > 0 && need > have ? { label: l.label, need, have } : null;
    })
    .filter((x): x is { label: string; need: number; have: number } => x !== null);

  function setCount(id: string, v: string) {
    setInputs((p) => ({ ...p, [id]: v.replace(/[^\d]/g, "") }));
    setServerAsk(null);
  }

  function pickFiles(picked: File[]) {
    if (!picked.length) return;
    setFiles((p) => [...p, ...picked]);
    setPreviews((p) => [...p, ...picked.map((f) => URL.createObjectURL(f))]);
  }
  function removeFile(i: number) {
    setFiles((p) => p.filter((_, j) => j !== i));
    setPreviews((p) => {
      if (p[i]) URL.revokeObjectURL(p[i]);
      return p.filter((_, j) => j !== i);
    });
  }

  function applyDistribution() {
    const trucks: GazoblokTruck[] = useVaried
      ? variedCapacities.map((c) => ({ capacityKg: parseCapacity(c) }))
      : Array.from({ length: parseTruckCount(truckCount) }, () => ({ capacityKg: parseCapacity(uniformCapacity) }));
    const { shipments, warnings } = distributeGazoblokLoad(lines, trucks);
    setError(warnings.length ? warnings.join(" · ") : null);
    const load = shipments[Math.min(shipment.number - 1, shipments.length - 1)];
    if (!load) return;
    setInputs(Object.fromEntries(lines.map((l) => [l.lineId, String(load.lines[l.lineId] ?? 0)])));
  }

  async function submit() {
    if (needsTick) return;
    setPending(true);
    setError(null);
    try {
      const fd = new FormData();
      for (const f of files) {
        const prepared = await prepareImageForUpload(f).catch(() => null);
        if (prepared) fd.append("file", prepared);
      }
      fd.append("loadedLines", JSON.stringify(Object.fromEntries(Object.entries(counts).filter(([, v]) => v > 0))));
      if (showOverBox && overloadOk) fd.append("confirmOverload", "true");
      const res = await fetch(`/api/gazoblok/orders/${orderId}/shipments/${shipment.id}/load`, { method: "POST", body: fd });
      let json: { ok?: boolean; error?: string; details?: { code?: string; extraBlocks?: number; extraAmount?: number } } = {};
      try {
        json = await res.json();
      } catch {
        // non-JSON (HTML error page) — generic error below
      }
      if (res.status === 409 && json.details?.code === "OVERLOAD_CONFIRM_REQUIRED") {
        setServerAsk({ extraBlocks: json.details.extraBlocks ?? 0, extraAmount: json.details.extraAmount ?? 0 });
        setOverloadOk(false);
        return;
      }
      if (!res.ok || !json.ok) throw new Error(json.error ?? genericError);
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? uzPart(e.message, lang) : genericError);
    } finally {
      setPending(false);
    }
  }

  const askBlocks = serverAsk?.extraBlocks ?? overBlocks;
  const askAmount = serverAsk?.extraAmount ?? overAmount;
  const capCls = cn(NUM, "h-9 w-24 px-2 text-right");

  return (
    <Dialog open onOpenChange={(v) => { if (!v && !pending) onClose(); }}>
      <DialogContent
        className={cn(
          "flex max-h-[calc(100dvh-2rem)] max-w-[860px] flex-col gap-0 overflow-hidden p-0",
          // Phone: a bottom sheet.
          "max-sm:bottom-0 max-sm:top-auto max-sm:max-h-[92dvh] max-sm:translate-y-0 max-sm:rounded-b-none",
        )}
      >
        <DialogHeader className="border-b border-border px-5 pb-4 pt-5 text-left">
          <DialogTitle className="text-lg font-bold">
            {correcting ? t(`Жўнатма ${shipment.number} тузатиш`, `Correct shipment ${shipment.number}`) : t(`Жўнатма ${shipment.number} юклаш`, `Load shipment ${shipment.number}`)}
          </DialogTitle>
          <DialogDescription className="text-[13px]">
            <span className={NUM}>{orderNumber}</span> · {clientName} · {t("жами қолди", "left in total")}{" "}
            <b className={cn(NUM, "text-foreground")}>{n0(totalLeftBefore)}</b> {t("та", "pcs")}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {/* Desktop table */}
          <table className="hidden w-full text-sm sm:table">
            <thead>
              <tr className="text-xs font-semibold text-muted-foreground">
                <th className="px-5 py-3 text-left font-semibold">{t("Ўлчам", "Size")}</th>
                <th className="px-3 py-3 text-right font-semibold">{t("Буюртма", "Ordered")}</th>
                <th className="px-3 py-3 text-right font-semibold">{t("Олдин юкланган", "Loaded before")}</th>
                <th className="px-3 py-3 text-right font-semibold">{t("Қолди", "Left")}</th>
                <th className="px-3 py-3 text-right font-semibold">{t("Бу жўнатмага", "This shipment")}</th>
                <th className="px-5 py-3 text-right font-semibold">{t("Кейин қолади", "Left after")}</th>
              </tr>
            </thead>
            <tbody>
              {over.map(({ line: l, overAfter }) => {
                const left = leftBefore(l);
                const after = left - counts[l.lineId];
                return (
                  <tr key={l.lineId} className="border-t border-border">
                    <td className={cn(NUM, "px-5 py-3 font-semibold")}>{l.label}</td>
                    <td className={cn(NUM, "px-3 py-3 text-right")}>{n0(l.quantity)}</td>
                    <td className={cn(NUM, "px-3 py-3 text-right text-muted-foreground")}>{n0(before.get(l.lineId) ?? 0)}</td>
                    <td className="px-3 py-3 text-right">
                      <div className={cn(NUM, "font-semibold")}>{n0(left)}</div>
                      {left > 0 ? (
                        <button type="button" className="text-xs font-medium text-primary hover:underline" onClick={() => setCount(l.lineId, String(left))}>
                          {t("ҳаммасини юклаш", "load all")}
                        </button>
                      ) : (
                        <span className="text-xs text-success">{t("тўлиқ", "full")}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Input
                        inputMode="numeric"
                        aria-label={l.label}
                        value={inputs[l.lineId] ?? ""}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => setCount(l.lineId, e.target.value)}
                        className={cn(NUM, "ml-auto h-11 w-24 bg-background text-right text-[15px] font-bold md:h-10", overAfter > 0 && counts[l.lineId] > 0 && "border-destructive text-destructive focus-visible:ring-destructive/40")}
                      />
                    </td>
                    <td className={cn(NUM, "px-5 py-3 text-right font-semibold", after < 0 ? "text-destructive" : after === 0 ? "text-primary" : "text-foreground")}>
                      {after < 0 ? `+${n0(-after)} ${t("ортиқ", "over")}` : n0(after)}
                    </td>
                  </tr>
                );
              })}
              <tr className="border-t border-border bg-muted/50 font-semibold">
                <td className="px-5 py-3" colSpan={4}>
                  {correcting ? t("Жўнатмада", "On the shipment") : t("Бу жўнатма", "This shipment")}
                </td>
                <td className={cn(NUM, "px-3 py-3 text-right font-bold")}>
                  {n0(truckTotal)} <span className="font-sans font-medium">{t("та", "pcs")}</span>
                </td>
                <td className="px-5 py-3 text-right">
                  <b className={NUM}>{n0(leftAfterTotal)}</b> {t("қолади", "left")}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Phone rows */}
          <ul className="divide-y divide-border sm:hidden">
            {over.map(({ line: l, overAfter }) => {
              const left = leftBefore(l);
              const after = left - counts[l.lineId];
              return (
                <li key={l.lineId} className="px-5 py-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className={cn(NUM, "font-bold")}>{l.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {t("қолди", "left")} <b className={cn(NUM, "text-foreground")}>{n0(left)}</b> <span className={NUM}>/ {n0(l.quantity)}</span>
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    {left > 0 ? (
                      <button type="button" className={BTN_OUTLINE} onClick={() => setCount(l.lineId, String(left))}>
                        <ArrowDownToLine {...ICON} />
                        {t("Ҳаммаси", "All")} <span className={NUM}>{n0(left)}</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-success">
                        <CircleCheck className="h-4 w-4" {...ICON} />
                        {t("тўлиқ юкланган", "fully loaded")}
                      </span>
                    )}
                    <Input
                      inputMode="numeric"
                      aria-label={l.label}
                      value={inputs[l.lineId] ?? ""}
                      onFocus={(e) => e.target.select()}
                      onChange={(e) => setCount(l.lineId, e.target.value)}
                      className={cn(NUM, "h-11 w-24 bg-background text-right text-[15px] font-bold", overAfter > 0 && counts[l.lineId] > 0 && "border-destructive text-destructive")}
                    />
                  </div>
                  {after < 0 && (
                    <div className="mt-1.5 text-right text-xs font-semibold text-destructive">
                      {t("буюртмадан", "over the order by")} +<span className={NUM}>{n0(-after)}</span> {t("та ортиқ", "pcs")}
                    </div>
                  )}
                </li>
              );
            })}
            <li className="flex justify-between bg-muted/50 px-5 py-3 text-sm font-semibold">
              <span>
                {correcting ? t("Жўнатмада", "On the shipment") : t("Бу жўнатма", "This shipment")} <b className={NUM}>{n0(truckTotal)}</b> {t("та", "pcs")}
              </span>
              <span>
                <b className={NUM}>{n0(leftAfterTotal)}</b> {t("қолади", "left")}
              </span>
            </li>
          </ul>

          <div className="space-y-3 px-5 py-4">
            {showOverBox && (
              <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/[.06] px-4 py-3 text-[13px]">
                <div className="flex items-center gap-2 font-semibold text-destructive">
                  <TriangleAlert className="h-4 w-4 shrink-0" {...ICON} />
                  <span>
                    {t("Буюртмадан ортиқ", "Over the order")}: +<span className={NUM}>{n0(askBlocks)}</span> {t("та", "pcs")} · +
                    <span className={NUM}>{n0(askAmount)}</span> UZS
                  </span>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {t("Мижоз қарзига қўшилади ва сотувчи", "It is added to the client's debt and written to the seller")}{" "}
                  <b className="text-foreground">{sellerName ?? "—"}</b> {t("номига ёзилади.", "")}
                </p>
                <label className="mt-2 flex min-h-[44px] cursor-pointer items-center gap-2.5 font-semibold">
                  <input
                    type="checkbox"
                    checked={overloadOk}
                    onChange={(e) => setOverloadOk(e.target.checked)}
                    className="h-5 w-5 accent-[hsl(var(--destructive))]"
                    data-action="confirm-overload"
                  />
                  {t("Тасдиқлайман, ортиқча юкланади", "I confirm — load beyond the order")}
                </label>
              </div>
            )}
            {short.length > 0 && (
              <div className="rounded-md border border-warning/40 bg-warning/10 px-4 py-2.5 text-[13px] text-warning">
                {short.map((s) => (
                  <div key={s.label} className="flex items-start gap-2">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" {...ICON} />
                    <span>
                      <span className={NUM}>{s.label}</span>: {t("омборда", "in stock")} <b className={NUM}>{n0(s.have)}</b> {t("та, бу жўнатмага", "pcs, this shipment needs")}{" "}
                      <b className={NUM}>{n0(s.need)}</b> {t("та керак", "")}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-md border border-border">
                <button
                  type="button"
                  className="flex min-h-[44px] w-full items-center justify-between gap-2 px-3 text-[13px]"
                  onClick={() => setDistOpen((v) => !v)}
                  aria-expanded={distOpen}
                >
                  <span className="flex items-center gap-2">
                    <Scale className="h-4 w-4 text-muted-foreground" {...ICON} />
                    {t("Вазн", "Weight")}: <b className={NUM}>{n0(Math.round(weight))}</b> {t("кг", "kg")}
                  </span>
                  <span className="flex items-center gap-1 font-semibold text-primary">
                    <Zap className="h-3.5 w-3.5" {...ICON} />
                    {t("Вазн бўйича тақсимлаш", "Split by weight")}
                    <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", distOpen && "rotate-180")} {...ICON} />
                  </span>
                </button>
                {distOpen && (
                  <div className="space-y-3 border-t border-border p-3 text-sm">
                    <div className="flex items-center gap-4">
                      <label className="flex min-h-[44px] cursor-pointer items-center gap-1.5">
                        <input type="radio" checked={!useVaried} onChange={() => setUseVaried(false)} />
                        {t("Бир хил", "Uniform")}
                      </label>
                      <label className="flex min-h-[44px] cursor-pointer items-center gap-1.5">
                        <input type="radio" checked={useVaried} onChange={() => setUseVaried(true)} />
                        {t("Ҳар хил", "Varied")}
                      </label>
                    </div>
                    {!useVaried ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          inputMode="numeric"
                          value={truckCount}
                          aria-label={t("Жўнатмалар сони", "Shipment count")}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setTruckCount(e.target.value)}
                          onBlur={() => setTruckCount(String(parseTruckCount(truckCount)))}
                          className={cn(NUM, "h-9 w-16 px-2 text-center")}
                        />
                        <span className="text-muted-foreground">{t("та жўнатма ×", "shipments ×")}</span>
                        <Input
                          inputMode="numeric"
                          value={uniformCapacity}
                          aria-label={t("Машина сиғими, кг", "Truck capacity, kg")}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => setUniformCapacity(e.target.value)}
                          onBlur={() => setUniformCapacity(String(parseCapacity(uniformCapacity)))}
                          className={capCls}
                        />
                        <span className="text-muted-foreground">{t("кг", "kg")}</span>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {variedCapacities.map((cap, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <span className="w-24 text-xs text-muted-foreground">
                              {t("Жўнатма", "Shipment")} {i + 1}:
                            </span>
                            <Input
                              inputMode="numeric"
                              value={cap}
                              aria-label={`${t("Машина сиғими, кг", "Truck capacity, kg")} ${i + 1}`}
                              onFocus={(e) => e.target.select()}
                              onChange={(e) => setVariedCapacities((v) => v.map((x, j) => (j === i ? e.target.value : x)))}
                              onBlur={() => setVariedCapacities((v) => v.map((x, j) => (j === i ? String(parseCapacity(x)) : x)))}
                              className={capCls}
                            />
                            <span className="text-muted-foreground">{t("кг", "kg")}</span>
                          </div>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <button type="button" className={BTN_OUTLINE} onClick={() => setVariedCapacities((v) => [...v, "10000"])}>
                            {t("Жўнатма қўшиш", "Add shipment")}
                          </button>
                          {variedCapacities.length > 1 && (
                            <button type="button" className={BTN_OUTLINE} onClick={() => setVariedCapacities((v) => v.slice(0, -1))}>
                              {t("Охиргисини олиб ташлаш", "Remove last")}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    <button type="button" className={cn(BTN_PRIMARY, "w-full")} onClick={applyDistribution}>
                      <Zap {...ICON} />
                      {t("Тақсимлаш", "Calculate & apply")}
                    </button>
                  </div>
                )}
              </div>

              <div
                className="flex min-h-[44px] cursor-pointer flex-wrap items-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-[13px] text-muted-foreground hover:border-primary/60"
                onClick={() => fileRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  pickFiles(Array.from(e.dataTransfer.files));
                }}
              >
                <Camera className="h-4 w-4" {...ICON} />
                {t("Жўнатма расми", "Shipment photo")} <span className="text-xs">{t("ихтиёрий", "optional")}</span>
                {previews.map((src, i) => (
                  <span key={src} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={t("Расм", "Photo")} className="h-10 w-10 rounded object-cover" />
                    <button
                      type="button"
                      aria-label={t("Олиб ташлаш", "Remove")}
                      className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-card p-0.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeFile(i);
                      }}
                    >
                      <X className="h-3 w-3" {...ICON} />
                    </button>
                  </span>
                ))}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,.heic,.heif"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    pickFiles(Array.from(e.target.files ?? []));
                    e.target.value = "";
                  }}
                />
              </div>
            </div>

            {error && (
              <div role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 border-t border-border px-5 py-4 sm:justify-end">
          <button type="button" className={cn(BTN_OUTLINE, "flex-1 sm:flex-none")} onClick={onClose} disabled={pending}>
            {t("Орқага", "Back")}
          </button>
          <button
            type="button"
            className={cn(BTN_PRIMARY, "flex-[2] sm:flex-none", showOverBox && "bg-destructive hover:bg-destructive/90")}
            onClick={() => void submit()}
            disabled={pending || needsTick || (truckTotal === 0 && !correcting)}
            data-action="save-load"
            title={needsTick ? t("Аввал ортиқча юклашни тасдиқланг", "Tick the over-load confirmation first") : undefined}
          >
            {pending ? <Loader2 className="animate-spin" {...ICON} /> : <Truck {...ICON} />}
            {correcting ? t("Тузатишни сақлаш", "Save correction") : t("Юклаш", "Load")} · <span className={NUM}>{n0(truckTotal)}</span> {t("та", "pcs")}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
