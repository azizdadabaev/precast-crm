"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Camera, ChevronLeft, ChevronRight, ChevronUp, Search, X } from "lucide-react";
import { useT } from "@/lib/i18n";
import { GalleryCard } from "@/components/gallery/GalleryCard";
import { GalleryLightbox } from "@/components/gallery/GalleryLightbox";

interface GalleryPhoto {
  id: string;
  orderId: string;
  orderNumber: string;
  clientId: string;
  clientName: string;
  clientPhone: string | null;
  clientAddress: string | null;
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
  // Search input (raw) + debounced value (drives the query). 250 ms
  // matches the orders/clients search elsewhere — fast enough for
  // typeahead, slow enough to avoid one request per keystroke.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [searchExpanded, setSearchExpanded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput]);
  const clientId = "";

  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const { data, isLoading } = useQuery<GalleryResponse>({
    queryKey: ["gallery", page, kind, clientId, fromDate, toDate, search],
    queryFn: () => {
      const p = new URLSearchParams();
      p.set("page", String(page));
      p.set("pageSize", String(PAGE_SIZE));
      if (kind) p.set("kind", kind);
      if (clientId) p.set("clientId", clientId);
      if (fromDate) p.set("from", fromDate);
      if (toDate) p.set("to", toDate);
      if (search) p.set("q", search);
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
    setSearchInput("");
    setSearch("");
    setPage(1);
    setSearchExpanded(false);
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
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
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

      {/* Filter bar — collapsed to a search pill by default */}
      <div className="rounded-lg border border-border bg-card">
        {!searchExpanded ? (
          /* Collapsed: just the search pill + photo count */
          <div className="flex items-center gap-3 p-2.5 sm:p-3">
            <button
              type="button"
              onClick={() => setSearchExpanded(true)}
              aria-label={t("Қидиришни очиш", "Open search")}
              className="h-10 inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 text-sm text-text-tertiary hover:text-foreground hover:border-ring transition-colors"
            >
              <Search className="h-4 w-4" />
              <span className="text-xs">{t("Қидириш…", "Search…")}</span>
            </button>
            <div className="text-xs text-muted-foreground shrink-0 whitespace-nowrap">
              {!isLoading && (
                <span>
                  <span className="font-mono font-semibold text-foreground">{total}</span>{" "}
                  {t("фото", "photos")}
                </span>
              )}
            </div>
          </div>
        ) : (
          /* Expanded: full filter bar */
          <div className="space-y-2.5 sm:space-y-3 p-2.5 sm:p-3">
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
                <input
                  type="text"
                  autoFocus
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { setSearchInput(""); setSearchExpanded(false); } }}
                  placeholder={t(
                    "Қидириш: буюртма №, исм, телефон…",
                    "Search: order #, name, phone…",
                  )}
                  className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-9 text-sm placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput("")}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-foreground hover:bg-muted transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <div className="hidden sm:block text-xs text-muted-foreground shrink-0 whitespace-nowrap">
                {!isLoading && (
                  <span>
                    <span className="font-mono font-semibold text-foreground">{total}</span>{" "}
                    {t("фото", "photos")}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSearchInput("");
                  setSearchExpanded(false);
                }}
                title={t("Йиғиш (Esc)", "Collapse (Esc)")}
                aria-label={t("Йиғиш", "Collapse")}
                className="shrink-0 h-10 w-10 inline-flex items-center justify-center rounded-md border border-input bg-background text-text-tertiary hover:text-foreground hover:bg-accent hover:border-ring transition-colors"
              >
                <ChevronUp className="h-4 w-4" />
              </button>
            </div>
        <div className="flex items-end gap-2 sm:gap-3 flex-wrap">
        <div className="flex flex-col gap-1 flex-1 sm:flex-initial min-w-[140px]">
          <label className="text-[11px] font-mono uppercase tracking-wider text-text-tertiary">
            {t("Дан", "From")}
          </label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => onParamChange(setFromDate)(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1 flex-1 sm:flex-initial min-w-[140px]">
          <label className="text-[11px] font-mono uppercase tracking-wider text-text-tertiary">
            {t("Гача", "To")}
          </label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => onParamChange(setToDate)(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
          />
        </div>
        <div className="flex flex-col gap-1 w-full sm:w-auto sm:min-w-[180px]">
          <label className="text-[11px] font-mono uppercase tracking-wider text-text-tertiary">
            {t("Тури", "Kind")}
          </label>
          <Select
            value={kind}
            onChange={(e) =>
              onParamChange(setKind)(e.target.value as typeof kind)
            }
            className="h-9"
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
        <div className="ml-auto text-xs text-muted-foreground sm:hidden">
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
          </div>
        )}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4">
          {/* Eight skeletons: 4 rows × 2 cols on mobile, 2 rows × 4 cols
              on desktop — enough to signal "loading" on either layout. */}
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-card overflow-hidden"
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
        <div className="rounded-lg border border-dashed border-border p-8 sm:p-12 text-center text-muted-foreground">
          <Camera className="h-8 w-8 mx-auto mb-3 opacity-50" />
          {t(
            "Ҳали фото йўқ · No delivery photos yet",
            "Ҳали фото йўқ · No delivery photos yet",
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4">
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
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center sm:justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
          <div className="text-center sm:text-left">
            {t("Саҳифа", "Page")}{" "}
            <span className="font-mono font-semibold text-foreground">
              {page}
            </span>{" "}
            {t("дан", "of")}{" "}
            <span className="font-mono font-semibold text-foreground">
              {pageCount}
            </span>
          </div>
          <div className="flex items-center justify-between sm:justify-end gap-2">
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
