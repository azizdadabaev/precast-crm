"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useT } from "@/lib/i18n";
import { GalleryCard } from "@/components/gallery/GalleryCard";
import { GalleryLightbox } from "@/components/gallery/GalleryLightbox";

interface GalleryPhoto {
  id: string;
  orderId: string;
  orderNumber: string;
  clientId: string;
  clientName: string;
  kind: "LOADED" | "DELIVERY_PROOF" | "SHIPMENT_LOADED";
  url: string;
  uploadedAt: string;
  uploadedBy: { id: string; name: string } | null;
  orderStatus: string;
}

interface GalleryResponse {
  photos: GalleryPhoto[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

const PAGE_SIZE = 24;

export default function GalleryClient() {
  const t = useT();
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState<"" | GalleryPhoto["kind"]>("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  // We don't expose a clientId filter in the UI yet; reserve the slot
  // for a future client-picker (the key is in the queryKey already).
  const clientId = "";

  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const { data, isLoading } = useQuery<GalleryResponse>({
    queryKey: ["gallery", page, kind, clientId, fromDate, toDate],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("pageSize", String(PAGE_SIZE));
      if (kind) p.set("kind", kind);
      if (clientId) p.set("clientId", clientId);
      if (fromDate) p.set("from", fromDate);
      if (toDate) p.set("to", toDate);
      return api(`/api/gallery?${p.toString()}`);
    },
  });

  const photos = data?.photos ?? [];
  const total = data?.total ?? 0;
  const pageCount = data?.pageCount ?? 1;

  function resetFilters() {
    setKind("");
    setFromDate("");
    setToDate("");
    setPage(1);
  }

  function onParamChange<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setPage(1);
    };
  }

  const lightboxPhoto = useMemo(
    () => (lightboxIdx === null ? null : photos[lightboxIdx] ?? null),
    [lightboxIdx, photos],
  );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Галерея
          <span className="lang-en text-muted-foreground font-normal text-base">
            {" "}· Gallery
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Барча юкланган ва етказилган фотолар",
            "All loaded and delivery photos across orders",
          )}
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex items-end gap-3 flex-wrap rounded-lg border border-border bg-card p-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-mono uppercase tracking-wider text-text-tertiary">
            {t("Дан", "From")}
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => onParamChange(setFromDate)(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] font-mono uppercase tracking-wider text-text-tertiary">
            {t("Гача", "To")}
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => onParamChange(setToDate)(e.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[180px]">
          <label className="text-[11px] font-mono uppercase tracking-wider text-text-tertiary">
            {t("Тури", "Kind")}
          </label>
          <Select
            value={kind}
            onChange={(e) =>
              onParamChange(setKind)(e.target.value as typeof kind)
            }
          >
            <option value="">{t("Барчаси", "All")}</option>
            <option value="LOADED">{t("Юкланди", "Loaded")}</option>
            <option value="DELIVERY_PROOF">
              {t("Етказилди", "Delivery Proof")}
            </option>
            <option value="SHIPMENT_LOADED">
              {t("Жўнатма", "Shipment Loaded")}
            </option>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={resetFilters}>
          {t("Тозалаш", "Reset")}
        </Button>
        <div className="ml-auto text-xs text-muted-foreground">
          {!isLoading && (
            <span>
              <span className="font-mono font-semibold text-foreground">
                {total}
              </span>{" "}
              {t("фото", "photos")}
            </span>
          )}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="rounded-lg border border-border bg-card overflow-hidden"
            >
              <div className="aspect-[4/3] w-full bg-muted animate-pulse" />
              <div className="p-3 space-y-2">
                <div className="h-3 w-2/3 bg-muted animate-pulse rounded" />
                <div className="h-3 w-1/2 bg-muted animate-pulse rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : photos.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-12 text-center text-muted-foreground">
          {t(
            "Ҳали фото йўқ · No delivery photos yet",
            "Ҳали фото йўқ · No delivery photos yet",
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
          {photos.map((p, idx) => (
            <GalleryCard
              key={p.id}
              photo={p}
              onClick={() => setLightboxIdx(idx)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
          <div>
            {t("Саҳифа", "Page")}{" "}
            <span className="font-mono font-semibold text-foreground">
              {page}
            </span>{" "}
            {t("дан", "of")}{" "}
            <span className="font-mono font-semibold text-foreground">
              {pageCount}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
              <span>{t("Олдинги", "Prev")}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            >
              <span>{t("Кейинги", "Next")}</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxPhoto && lightboxIdx !== null && (
        <GalleryLightbox
          photo={lightboxPhoto}
          hasPrev={lightboxIdx > 0}
          hasNext={lightboxIdx < photos.length - 1}
          onPrev={() => setLightboxIdx((i) => (i === null ? null : Math.max(0, i - 1)))}
          onNext={() =>
            setLightboxIdx((i) =>
              i === null ? null : Math.min(photos.length - 1, i + 1),
            )
          }
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </div>
  );
}
