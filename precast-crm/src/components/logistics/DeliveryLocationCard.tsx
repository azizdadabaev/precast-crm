"use client";

import { useEffect, useRef, useState } from "react";
import {
  MapPin,
  Navigation,
  Copy,
  Check,
  Trash2,
  Loader2,
  Link as LinkIcon,
} from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n";
import { useGoogleMaps } from "@/lib/maps/useGoogleMaps";

interface Props {
  lat: number | null;
  lng: number | null;
  url: string | null;
  label: string | null;
  canEdit: boolean;
  onSave: (v: {
    lat: number;
    lng: number;
    url: string | null;
    label: string | null;
  }) => Promise<void>;
  onClear: () => Promise<void>;
}

// Tashkent — a sensible default center for the "pick on map" flow.
const DEFAULT_CENTER = { lat: 41.3111, lng: 69.2797 };

function navUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}

/**
 * Live interactive map (only mounted when the Maps JS API is ready). When
 * editable, click-on-map / marker-drag updates the pending pin via onPick.
 */
function LiveMap({
  maps,
  lat,
  lng,
  canEdit,
  onPick,
}: {
  maps: any;
  lat: number;
  lng: number;
  canEdit: boolean;
  onPick: (lat: number, lng: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Initialize the map + marker once.
  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const center = { lat, lng };
    const map = new maps.Map(ref.current, {
      center,
      zoom: 16,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: "cooperative",
    });
    const marker = new maps.Marker({
      position: center,
      map,
      draggable: canEdit,
    });
    mapRef.current = map;
    markerRef.current = marker;

    if (canEdit) {
      map.addListener("click", (e: any) => {
        if (!e.latLng) return;
        onPick(e.latLng.lat(), e.latLng.lng());
      });
      marker.addListener("dragend", (e: any) => {
        if (!e.latLng) return;
        onPick(e.latLng.lat(), e.latLng.lng());
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep marker + center in sync when the pending pin changes.
  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    const pos = { lat, lng };
    markerRef.current.setPosition(pos);
    mapRef.current.panTo(pos);
  }, [lat, lng]);

  return <div ref={ref} className="h-[220px] w-full" />;
}

/** Default-centered picker map for the no-pin capture flow. */
function PickerMap({
  maps,
  onPick,
}: {
  maps: any;
  onPick: (lat: number, lng: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);

  useEffect(() => {
    if (!ref.current || mapRef.current) return;
    const map = new maps.Map(ref.current, {
      center: DEFAULT_CENTER,
      zoom: 11,
      disableDefaultUI: true,
      zoomControl: true,
      gestureHandling: "cooperative",
    });
    mapRef.current = map;
    map.addListener("click", (e: any) => {
      if (!e.latLng) return;
      onPick(e.latLng.lat(), e.latLng.lng());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={ref} className="h-[220px] w-full" />;
}

export function DeliveryLocationCard({
  lat,
  lng,
  url,
  label,
  canEdit,
  onSave,
  onClear,
}: Props) {
  const t = useT();
  const { maps, status } = useGoogleMaps();

  const hasPin = lat !== null && lng !== null;

  // --- shared transient state ---
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [labelInput, setLabelInput] = useState(label ?? "");
  const [pasteInput, setPasteInput] = useState("");
  const [parseError, setParseError] = useState(false);

  // Pending pin (edit-on-map). null = no unsaved move.
  const [pending, setPending] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    setLabelInput(label ?? "");
  }, [label]);

  // Reset any pending move when the persisted pin changes.
  useEffect(() => {
    setPending(null);
  }, [lat, lng]);

  const mapReady = status === "ready" && maps;

  const Header = (
    <div className="px-4 py-3 border-b border-border flex items-center gap-2">
      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
      <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        Етказиб бериш манзили<span className="lang-en"> · Delivery location</span>
      </div>
    </div>
  );

  // --- No pin, no edit rights → muted line (or nothing meaningful) ---
  if (!hasPin && !canEdit) {
    return (
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {Header}
        <div className="px-4 py-3 text-sm text-muted-foreground">
          {t("Манзил киритилмаган", "No delivery location")}
        </div>
      </div>
    );
  }

  async function copyLink() {
    if (!hasPin) return;
    const link = url ?? navUrl(lat as number, lng as number);
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — silently ignore */
    }
  }

  async function saveLabel() {
    if (!hasPin) return;
    setBusy(true);
    try {
      await onSave({
        lat: lat as number,
        lng: lng as number,
        url,
        label: labelInput.trim() || null,
      });
    } finally {
      setBusy(false);
    }
  }

  async function savePending() {
    if (!pending) return;
    setBusy(true);
    try {
      await onSave({
        lat: pending.lat,
        lng: pending.lng,
        url,
        label: labelInput.trim() || null,
      });
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  async function clearPin() {
    setBusy(true);
    try {
      await onClear();
    } finally {
      setBusy(false);
    }
  }

  async function parsePaste() {
    const link = pasteInput.trim();
    if (!link) return;
    setParseError(false);
    setBusy(true);
    try {
      const { lat: pLat, lng: pLng } = await api<{ lat: number; lng: number }>(
        "/api/geo/resolve-link",
        { method: "POST", json: { url: link } },
      );
      await onSave({ lat: pLat, lng: pLng, url: link, label: null });
      setPasteInput("");
    } catch {
      setParseError(true);
    } finally {
      setBusy(false);
    }
  }

  async function pickFromMap(pLat: number, pLng: number) {
    setBusy(true);
    try {
      await onSave({ lat: pLat, lng: pLng, url: null, label: null });
    } finally {
      setBusy(false);
    }
  }

  // ============================ HAS PIN ============================
  if (hasPin) {
    const dispLat = pending?.lat ?? (lat as number);
    const dispLng = pending?.lng ?? (lng as number);

    return (
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {Header}

        {mapReady ? (
          <LiveMap
            maps={maps}
            lat={dispLat}
            lng={dispLng}
            canEdit={canEdit}
            onPick={(la, ln) => setPending({ lat: la, lng: ln })}
          />
        ) : (
          // Graceful fallback — no live tile, coordinates + label panel.
          <div className="px-4 py-4 bg-muted/20 border-b border-border">
            <div className="flex items-center gap-2 text-sm">
              <MapPin className="h-4 w-4 text-primary shrink-0" />
              <span className="font-mono tabular-nums">
                {dispLat.toFixed(6)}, {dispLng.toFixed(6)}
              </span>
            </div>
            {label && (
              <div className="mt-1 text-sm text-muted-foreground">{label}</div>
            )}
            {status === "loading" && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {t("Харита юкланмоқда…", "Loading map…")}
              </div>
            )}
          </div>
        )}

        <div className="px-4 py-3 space-y-3">
          {/* Pending-move Save bar */}
          {canEdit && pending && (
            <div className="flex items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
              <span className="text-xs text-muted-foreground">
                {t("Жой ўзгартирилди", "Pin moved")}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => setPending(null)}
                >
                  {t("Бекор", "Reset")}
                </Button>
                <Button size="sm" disabled={busy} onClick={savePending}>
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {t("Сақлаш", "Save")}
                </Button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={navUrl(lat as number, lng as number)} target="_blank" rel="noopener noreferrer">
                <Navigation className="h-3.5 w-3.5 mr-1.5" />
                {t("Йўналиш", "Navigate")}
              </a>
            </Button>
            <Button variant="outline" size="sm" onClick={copyLink}>
              {copied ? (
                <Check className="h-3.5 w-3.5 mr-1.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5 mr-1.5" />
              )}
              {copied ? t("Нусхаланди", "Copied") : t("Ҳаволани нусхалаш", "Copy link")}
            </Button>
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:bg-destructive hover:text-white"
                disabled={busy}
                onClick={clearPin}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                {t("Тозалаш", "Clear")}
              </Button>
            )}
          </div>

          {/* Editable label */}
          {canEdit && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                placeholder={t("Манзил изоҳи (ихтиёрий)", "Location label (optional)")}
                className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={busy || (labelInput.trim() || null) === (label ?? null)}
                onClick={saveLabel}
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  t("Сақлаш", "Save")
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ====================== NO PIN, canEdit ======================
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {Header}

      <div className="px-4 py-3 space-y-3">
        {/* Paste-a-link capture */}
        <div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <LinkIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={pasteInput}
                onChange={(e) => {
                  setPasteInput(e.target.value);
                  setParseError(false);
                }}
                placeholder={t("Google Maps ҳаволасини жойлаштиринг", "Paste a Google Maps link")}
                className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <Button
              size="sm"
              disabled={busy || !pasteInput.trim()}
              onClick={parsePaste}
            >
              {busy ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : null}
              {t("Ўқиш", "Parse")}
            </Button>
          </div>
          {parseError && (
            <div className="mt-1.5 text-xs text-destructive">
              {t("Ҳаволани ўқиб бўлмади", "Couldn't read that link")}
            </div>
          )}
        </div>

        {/* Optional pick-on-map when the API is live */}
        {mapReady && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
              {t("Ёки харитадан танланг", "Or pick on the map")}
            </div>
            <div className="rounded-md border border-border overflow-hidden">
              <PickerMap maps={maps} onPick={pickFromMap} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
