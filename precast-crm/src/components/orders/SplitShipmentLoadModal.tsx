"use client";

import { useRef, useState, useMemo } from "react";
import { Camera, Upload, Loader2, ChevronDown, ChevronUp, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { prepareImageForUpload } from "@/lib/image/prepare-upload";
import {
  distributeLoad,
  calculateRemaining,
  calculateOrderWeight,
  beamWeightKg,
  type BeamGroup,
  type TruckCapacity,
} from "@/lib/weight-distributor";

interface PrevShipment {
  loadedBeams: Record<string, number>;
  loadedBlocks: number;
}

interface Props {
  orderId: string;
  shipmentId: string;
  shipmentNumber: number;
  beamGroups: BeamGroup[];
  totalBlocks: number;
  prevShipments: PrevShipment[];
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function SplitShipmentLoadModal({
  orderId, shipmentId, shipmentNumber,
  beamGroups, totalBlocks, prevShipments,
  open, onClose, onSuccess,
}: Props) {
  const t = useT();
  const fileRef = useRef<HTMLInputElement>(null);

  const [beamInputs, setBeamInputs] = useState<Record<string, number>>(() => {
    const { remainingBeams } = calculateRemaining(beamGroups, totalBlocks, prevShipments);
    return Object.fromEntries(Object.entries(remainingBeams).map(([k, v]) => [k, v]));
  });
  const [blockInput, setBlockInput] = useState<number>(() => {
    const { remainingBlocks } = calculateRemaining(beamGroups, totalBlocks, prevShipments);
    return remainingBlocks;
  });

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [distOpen, setDistOpen] = useState(false);
  const [uniformCapacity, setUniformCapacity] = useState<number>(10000);
  const [truckCount, setTruckCount] = useState<number>(2);
  const [useVaried, setUseVaried] = useState(false);
  const [variedCapacities, setVariedCapacities] = useState<number[]>([10000, 10000]);

  const remaining = useMemo(() =>
    calculateRemaining(beamGroups, totalBlocks, [
      ...prevShipments,
      { loadedBeams: beamInputs, loadedBlocks: blockInput },
    ]),
    [beamGroups, totalBlocks, prevShipments, beamInputs, blockInput]
  );

  // What's still loadable for THIS shipment = order total − what PRIOR shipments
  // already loaded. This is the hard cap for each input; anything more over-loads
  // the order across shipments.
  const available = useMemo(
    () => calculateRemaining(beamGroups, totalBlocks, prevShipments),
    [beamGroups, totalBlocks, prevShipments],
  );

  // Signed remaining after this shipment's inputs (NEGATIVE = over-loaded). Unlike
  // `remaining` (which clamps at 0 and hides over-loads) this is honest, so the UI
  // can flag it red and block submit.
  const signedRemaining = useMemo(() => {
    const beams: Record<string, number> = {};
    for (const g of beamGroups) {
      beams[g.beamLength] = (available.remainingBeams[g.beamLength] ?? 0) - (beamInputs[g.beamLength] ?? 0);
    }
    return { beams, blocks: available.remainingBlocks - blockInput };
  }, [beamGroups, available, beamInputs, blockInput]);

  const isOverloaded = useMemo(
    () => Object.values(signedRemaining.beams).some((v) => v < 0) || signedRemaining.blocks < 0,
    [signedRemaining],
  );

  const orderWeight = useMemo(
    () => calculateOrderWeight(beamGroups, totalBlocks),
    [beamGroups, totalBlocks]
  );

  // Weight of what's entered in this shipment's inputs
  const thisShipmentWeight = useMemo(() => {
    const beamKg = Object.entries(beamInputs).reduce(
      (s, [len, cnt]) => s + beamWeightKg(len) * cnt,
      0,
    );
    return beamKg + blockInput * 16;
  }, [beamInputs, blockInput]);

  // Weight of everything still not loaded (after prevShipments + this shipment)
  const remainingWeight = useMemo(() => {
    return calculateOrderWeight(
      Object.entries(remaining.remainingBeams).map(([beamLength, totalCount]) => ({ beamLength, totalCount })),
      remaining.remainingBlocks,
    );
  }, [remaining]);

  if (!open) return null;

  function pickFile(f: File) {
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setError(null);
  }

  function applyDistribution() {
    const capacities: TruckCapacity[] = useVaried
      ? variedCapacities.map((c) => ({ capacityKg: c }))
      : Array.from({ length: truckCount }, () => ({ capacityKg: uniformCapacity }));

    const { shipments, warnings } = distributeLoad(beamGroups, totalBlocks, capacities);
    if (warnings.length > 0) setError(warnings.join(" · "));
    else setError(null);

    const idx = Math.min(shipmentNumber - 1, shipments.length - 1);
    const load = shipments[idx];
    if (!load) return;
    setBeamInputs(load.beams);
    setBlockInput(load.blocks);
  }

  async function submit() {
    if (!file) { setError(t("Расм юклаш керак", "Photo is required")); return; }
    setLoading(true);
    setError(null);
    try {
      const prepared = await prepareImageForUpload(file).catch(() => null);
      if (!prepared) { setError(t("Расмни ўқиб бўлмади, бошқа расм танланг", "Couldn't read this photo — pick another")); setLoading(false); return; }
      const fd = new FormData();
      fd.append("file", prepared);
      fd.append("loadedBeams", JSON.stringify(beamInputs));
      fd.append("loadedBlocks", String(blockInput));

      const res = await fetch(`/api/orders/${orderId}/shipments/${shipmentId}/load`, {
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
            Жўнатма {shipmentNumber}<span className="lang-en"> · Shipment {shipmentNumber} — Load</span>
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
                <th className="text-left px-3 py-2">{t("Балка узунлиги", "Beam length")}</th>
                <th className="text-right px-3 py-2">{t("Буюртма жами", "Order total")}</th>
                <th className="text-right px-3 py-2 text-primary">{t("Юкланди", "Load")}</th>
                <th className="text-right px-3 py-2 text-muted-foreground">{t("Қолди", "Remaining")}</th>
              </tr>
            </thead>
            <tbody>
              {beamGroups.map((g) => {
                const rem = signedRemaining.beams[g.beamLength] ?? 0;
                return (
                  <tr key={g.beamLength} className="border-t">
                    <td className="px-3 py-2 font-mono font-semibold">
                      {g.beamLength} <span className="text-muted-foreground text-xs">м</span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                      {g.totalCount}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        max={available.remainingBeams[g.beamLength] ?? 0}
                        value={beamInputs[g.beamLength] ?? 0}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) =>
                          setBeamInputs((prev) => ({
                            ...prev,
                            [g.beamLength]: Math.max(0, parseInt(e.target.value) || 0),
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
              <tr className="border-t bg-muted/20">
                <td className="px-3 py-2 font-semibold text-muted-foreground text-xs uppercase tracking-wider">
                  {t("Гишт", "Blocks")}
                </td>
                <td className="px-3 py-2 text-right font-mono text-muted-foreground">{totalBlocks}</td>
                <td className="px-3 py-2 text-right">
                  <input
                    type="number"
                    min={0}
                    max={available.remainingBlocks}
                    value={blockInput}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => setBlockInput(Math.max(0, parseInt(e.target.value) || 0))}
                    className={`w-20 border rounded px-2 py-1 text-right font-mono focus:ring-1 ring-primary ${signedRemaining.blocks < 0 ? "border-destructive ring-destructive" : ""}`}
                  />
                </td>
                <td className={`px-3 py-2 text-right font-mono ${signedRemaining.blocks < 0 ? "text-destructive font-bold" : signedRemaining.blocks > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                  {signedRemaining.blocks}
                </td>
              </tr>
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

        {/* Photo upload */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
            {t("Юкланган машина расми", "Loaded truck photo")}
          </div>
          <div
            className="border-2 border-dashed rounded-lg p-3 text-center cursor-pointer hover:border-primary/60 transition-colors"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) pickFile(f); }}
          >
            {preview ? (
              <img src={preview} alt="preview" className="max-h-36 mx-auto rounded object-cover" />
            ) : (
              <div className="flex flex-col items-center gap-1 py-3 text-muted-foreground">
                <Camera className="h-6 w-6" />
                <span className="text-xs">{t("Расм танланг", "Click to select photo")}</span>
              </div>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
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
          <Button size="sm" onClick={submit} disabled={!file || loading || isOverloaded}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            {t("Жўнатмани юклаш", "Save shipment load")}
          </Button>
        </div>
      </div>
    </div>
  );
}
