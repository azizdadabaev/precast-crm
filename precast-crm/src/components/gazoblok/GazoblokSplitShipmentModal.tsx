"use client";

import { useRef, useState, useMemo } from "react";
import { Camera, Upload, Loader2, ChevronDown, ChevronUp, Zap, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { prepareImageForUpload } from "@/lib/image/prepare-upload";
import {
  distributeGazoblokLoad,
  calculateGazoblokRemaining,
  loadWeightKg,
  orderWeightKg,
  type GazoblokLine,
  type GazoblokTruck,
} from "@/lib/gazoblok-weight";

interface Props {
  orderId: string;
  shipment: { id: string; number: number };
  lines: GazoblokLine[];
  prevShipments: Array<Record<string, number>>;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function GazoblokSplitShipmentModal({
  orderId, shipment, lines, prevShipments,
  open, onClose, onSuccess,
}: Props) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);

  // What's still loadable for THIS shipment = order total − what PRIOR shipments
  // already loaded. This is the hard cap for each input; anything more over-loads
  // the order across shipments.
  const available = useMemo(
    () => calculateGazoblokRemaining(lines, prevShipments),
    [lines, prevShipments],
  );

  const [inputs, setInputs] = useState<Record<string, number>>(() =>
    Object.fromEntries(lines.map((l) => [l.lineId, available[l.lineId] ?? 0])),
  );

  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [distOpen, setDistOpen] = useState(false);
  const [uniformCapacity, setUniformCapacity] = useState<number>(10000);
  const [truckCount, setTruckCount] = useState<number>(2);
  const [useVaried, setUseVaried] = useState(false);
  const [variedCapacities, setVariedCapacities] = useState<number[]>([10000, 10000]);

  // Signed remaining after this shipment's inputs (NEGATIVE = over-loaded). Unlike
  // `available` (clamped at 0) this is honest, so the UI can flag it red and block
  // submit.
  const signedRemaining = useMemo(() => {
    const rem: Record<string, number> = {};
    for (const l of lines) rem[l.lineId] = (available[l.lineId] ?? 0) - (inputs[l.lineId] ?? 0);
    return rem;
  }, [lines, available, inputs]);

  const isOverloaded = useMemo(
    () => Object.values(signedRemaining).some((v) => v < 0),
    [signedRemaining],
  );

  const orderWeight = useMemo(() => orderWeightKg(lines), [lines]);
  const thisShipmentWeight = useMemo(() => loadWeightKg(lines, inputs), [lines, inputs]);
  const remainingWeight = useMemo(() => {
    // Weight still not loaded after prevShipments + this shipment.
    const rem: Record<string, number> = {};
    for (const l of lines) rem[l.lineId] = Math.max(0, signedRemaining[l.lineId] ?? 0);
    return loadWeightKg(lines, rem);
  }, [lines, signedRemaining]);

  if (!open) return null;

  function pickFiles(picked: File[]) {
    if (picked.length === 0) return;
    setFiles((prev) => [...prev, ...picked]);
    setPreviews((prev) => [...prev, ...picked.map((f) => URL.createObjectURL(f))]);
    setError(null);
  }

  function removeFile(i: number) {
    setFiles((prev) => prev.filter((_, j) => j !== i));
    setPreviews((prev) => prev.filter((_, j) => j !== i));
  }

  function applyDistribution() {
    const trucks: GazoblokTruck[] = useVaried
      ? variedCapacities.map((c) => ({ capacityKg: c }))
      : Array.from({ length: truckCount }, () => ({ capacityKg: uniformCapacity }));

    const { shipments, warnings } = distributeGazoblokLoad(lines, trucks);
    if (warnings.length > 0) setError(warnings.join(" · "));
    else setError(null);

    const idx = Math.min(shipment.number - 1, shipments.length - 1);
    const load = shipments[idx];
    if (!load) return;
    setInputs(Object.fromEntries(lines.map((l) => [l.lineId, load.lines[l.lineId] ?? 0])));
  }

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      // Photo is OPTIONAL — prepare and append any that were picked.
      for (const f of files) {
        const prepared = await prepareImageForUpload(f).catch(() => null);
        if (prepared) fd.append("file", prepared);
      }
      const counts = Object.fromEntries(
        Object.entries(inputs).filter(([, v]) => v > 0),
      );
      fd.append("loadedLines", JSON.stringify(counts));

      const res = await fetch(`/api/gazoblok/orders/${orderId}/shipments/${shipment.id}/load`, {
        method: "POST",
        body: fd,
      });
      const json = await res.json() as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Failed");
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 overflow-auto">
      <div className="bg-background rounded-lg border shadow-xl w-full max-w-xl space-y-4 p-5 my-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
        <div className="flex items-baseline justify-between">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Жўнатма {shipment.number}<span className="lang-en"> · Shipment {shipment.number} — Load</span>
          </div>
        </div>

        {/* Weight distributor accordion */}
        <div className="border rounded-md overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2 text-sm bg-muted/40 hover:bg-muted/60 transition-colors"
            onClick={() => setDistOpen(!distOpen)}
          >
            <div className="flex items-center gap-2 font-medium">
              <Zap className="h-3.5 w-3.5 text-amber-500" />
              {t("Вазн бўйича тақсимлаш", "Distribute by weight")}
              <span className="text-xs text-muted-foreground font-normal">
                — {t("умумий", "total")} {Math.round(orderWeight).toLocaleString("ru-RU")} кг
              </span>
            </div>
            {distOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {distOpen && (
            <div className="p-3 space-y-3 border-t">
              <div className="flex items-center gap-3 text-sm">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={!useVaried} onChange={() => setUseVaried(false)} />
                  {t("Бир хил", "Uniform")}
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={useVaried} onChange={() => setUseVaried(true)} />
                  {t("Ҳар хил", "Varied")}
                </label>
              </div>

              {!useVaried ? (
                <div className="flex items-center gap-2 text-sm">
                  <input
                    type="number"
                    min={1}
                    value={truckCount}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setTruckCount(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-16 border rounded px-2 py-1 text-center font-mono"
                  />
                  <span className="text-muted-foreground">{t("та машина ×", "trucks ×")}</span>
                  <input
                    type="number"
                    min={1000}
                    step={500}
                    value={uniformCapacity}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setUniformCapacity(parseInt(e.target.value) || 10000)}
                    className="w-24 border rounded px-2 py-1 font-mono"
                  />
                  <span className="text-muted-foreground">кг</span>
                </div>
              ) : (
                <div className="space-y-1">
                  {variedCapacities.map((cap, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground w-20 text-xs">
                        {t("Жўнатма", "Shipment")} {i + 1}:
                      </span>
                      <input
                        type="number"
                        min={1000}
                        step={500}
                        value={cap}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const v = [...variedCapacities];
                          v[i] = parseInt(e.target.value) || 10000;
                          setVariedCapacities(v);
                        }}
                        className="w-24 border rounded px-2 py-1 font-mono"
                      />
                      <span className="text-muted-foreground">кг</span>
                    </div>
                  ))}
                  <div className="flex gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setVariedCapacities([...variedCapacities, 10000])}
                    >
                      + Машина
                    </Button>
                    {variedCapacities.length > 1 && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setVariedCapacities(variedCapacities.slice(0, -1))}
                      >
                        − Машина
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <Button size="sm" onClick={applyDistribution} className="w-full">
                <Zap className="h-3.5 w-3.5 mr-1.5" />
                {t("Тақсимлаш", "Calculate & apply")}
              </Button>
            </div>
          )}
        </div>

        {/* Counting table */}
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">{t("Маҳсулот", "Product")}</th>
                <th className="text-right px-3 py-2">{t("Буюртма жами", "Order total")}</th>
                <th className="text-right px-3 py-2 text-primary">{t("Юкланди", "Load")}</th>
                <th className="text-right px-3 py-2 text-muted-foreground">{t("Қолди", "Remaining")}</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const rem = signedRemaining[l.lineId] ?? 0;
                return (
                  <tr key={l.lineId} className="border-t">
                    <td className="px-3 py-2 font-mono font-semibold">{l.label}</td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                      {l.quantity}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={available[l.lineId] ?? 0}
                        value={inputs[l.lineId] ?? 0}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          setInputs((prev) => ({
                            ...prev,
                            [l.lineId]: Math.max(0, parseInt(e.target.value) || 0),
                          }))
                        }
                        className={`w-20 border rounded px-2 py-1 text-right font-mono focus:ring-1 ring-primary ${rem < 0 ? "border-destructive ring-destructive" : ""}`}
                      />
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${rem < 0 ? "text-destructive font-bold" : rem > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                      {rem}
                    </td>
                  </tr>
                );
              })}
              {/* Weight summary row */}
              <tr className="border-t bg-muted/40">
                <td className="px-3 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  {t("Вазн, кг", "Weight, kg")}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-muted-foreground">
                  {Math.round(orderWeight).toLocaleString("ru-RU")}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold text-foreground">
                  {Math.round(thisShipmentWeight).toLocaleString("ru-RU")}
                </td>
                <td className={`px-3 py-2 text-right font-mono font-semibold ${remainingWeight > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  {Math.round(remainingWeight).toLocaleString("ru-RU")}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Photo upload (optional) */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            {t("Юкланган машина расми (ихтиёрий)", "Loaded truck photo (optional)")}
          </div>
          <div
            className="border-2 border-dashed rounded-lg p-3 text-center cursor-pointer hover:border-primary/60 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); pickFiles(Array.from(e.dataTransfer.files)); }}
          >
            {previews.length > 0 ? (
              <div className="flex flex-wrap gap-2 justify-center">
                {previews.map((src, i) => (
                  <div key={i} className="relative">
                    <img src={src} alt="preview" className="max-h-28 rounded object-cover" />
                    <button
                      type="button"
                      className="absolute -top-1.5 -right-1.5 bg-background border rounded-full p-0.5 shadow hover:bg-destructive hover:text-white"
                      onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1 py-3 text-muted-foreground">
                <Camera className="h-6 w-6" />
                <span className="text-xs">{t("Расм танланг", "Click to select photos")}</span>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.heic,.heif"
            multiple
            className="hidden"
            onChange={(e) => { pickFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
          />
        </div>

        {isOverloaded && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
            {t(
              "Миқдор буюртма қолдиғидан ошиб кетди (олдинги жўнатмалар ҳисобга олинган). Қизил қаторларни камайтиринг.",
              "Quantity exceeds what's left on the order (prior shipments counted). Reduce the red rows.",
            )}
          </div>
        )}
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
            {error}
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            {t("Бекор", "Cancel")}
          </Button>
          <Button size="sm" onClick={submit} disabled={loading || isOverloaded}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {t("Жўнатмани юклаш", "Save shipment load")}
          </Button>
        </div>
      </div>
    </div>
  );
}
