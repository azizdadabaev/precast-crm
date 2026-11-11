"use client";

import { useEffect, useRef, useState } from "react";
import {
  CircleCheck,
  Clock,
  Image as ImageIcon,
  Loader2,
  PackageCheck,
  Plus,
  Scissors,
  Trash2,
  Truck,
  Wrench,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { NUM, SectionCard } from "@/components/gazoblok/order-form/ui";
import { dotDateTime, type loadSummary } from "@/lib/gazoblok-detail";
import type { Shipment } from "./types";
import { BTN_GHOST, BTN_OUTLINE, ICON, Pill, SegBar } from "./ui";

type Summary = ReturnType<typeof loadSummary>;

const n0 = (v: number) => formatNumber(v, 0);

const TRUCK_PILL = {
  PENDING: { tone: "muted" as const, uz: "Бўш", en: "Empty", icon: Clock },
  LOADED: { tone: "primary" as const, uz: "Йўлда", en: "On the road", icon: Truck },
  DELIVERED: { tone: "success" as const, uz: "Етказилди", en: "Delivered", icon: CircleCheck },
};

export function LoadCard({
  summary,
  shipments,
  labelById,
  weightT,
  status,
  shortClosed,
  actorByShipment,
  can,
  busyTruck,
  onLoad,
  loadPending,
  onLoadTruck,
  onCorrect,
  onDeliver,
  onDelete,
  onCloseShort,
}: {
  summary: Summary;
  shipments: Shipment[];
  labelById: Map<string, string>;
  /** Loaded weight in tonnes. */
  weightT: number;
  status: string;
  shortClosed: boolean;
  actorByShipment: Map<string, string>;
  can: { load: boolean; correct: (s: Shipment) => boolean; deliver: boolean; closeShort: boolean };
  busyTruck: string | null;
  onLoad: () => void;
  loadPending: boolean;
  onLoadTruck: (s: Shipment) => void;
  onCorrect: (s: Shipment) => void;
  onDeliver: (s: Shipment) => void;
  onDelete: (s: Shipment) => void;
  onCloseShort: () => void;
}) {
  const t = useT();
  const tot = summary.total;
  const canceled = status === "CANCELED";
  const done = !canceled && (tot.left === 0 || shortClosed) && tot.loaded > 0 && tot.onRoad === 0;
  const trucks = [...shipments].sort((a, b) => b.number - a.number);
  const notTaken = shortClosed ? tot.left : 0;

  // Second big figure: what is left — or what will never be loaded, or the over-load.
  const second = canceled
    ? { label: t("Юкланмайди", "Won't load"), value: tot.left, cls: "text-muted-foreground", sign: "" }
    : shortClosed
      ? { label: t("Олинмади", "Not taken"), value: notTaken, cls: "text-foreground", sign: "" }
      : tot.over > 0
        ? { label: t("Буюртмадан ортиқ", "Over the order"), value: tot.over, cls: "text-destructive", sign: "+" }
        : { label: t("Қолди", "Left"), value: tot.left, cls: tot.left > 0 ? "text-foreground" : "text-muted-foreground", sign: "" };

  const loadButton = can.load ? (
    <button type="button" className={BTN_OUTLINE} onClick={onLoad} disabled={loadPending} data-action="load-truck">
      {loadPending ? <Loader2 className="animate-spin" {...ICON} /> : <Plus {...ICON} />}
      {t("Жўнатма юклаш", "Load a shipment")}
    </button>
  ) : null;

  return (
    <SectionCard
      id="sec-load"
      icon={<Truck className="h-4 w-4" {...ICON} />}
      title={t("Юклаш", "Loading")}
      done={done}
      action={<span className="hidden sm:inline-flex">{loadButton}</span>}
      className="overflow-hidden"
    >
      {/* Big numbers */}
      <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
        <div>
          <div className="text-xs font-semibold text-muted-foreground">{t("Юкланди", "Loaded")}</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className={cn(NUM, "text-[34px] font-bold leading-none tracking-tight", tot.over > 0 && "text-destructive")} data-testid="loaded-total">
              {n0(tot.loaded)}
            </span>
            <span className={cn(NUM, "text-base text-muted-foreground")}>/ {n0(tot.ordered)}</span>
            <span className="text-sm text-muted-foreground">{t("та", "pcs")}</span>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold text-muted-foreground">{second.label}</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className={cn(NUM, "text-[34px] font-bold leading-none tracking-tight", second.cls)} data-testid="left-total">
              {second.sign}
              {n0(second.value)}
            </span>
            <span className="text-sm text-muted-foreground">{t("та", "pcs")}</span>
          </div>
        </div>
        <div className="ml-auto pb-1 text-[13px] text-muted-foreground">
          {summary.trucks > 0 ? (
            <>
              <span className={cn(NUM, "font-semibold text-foreground")}>{n0(summary.trucks)}</span> {t("та жўнатма", "shipments")} · ~
              <span className={cn(NUM, "font-semibold text-foreground")}>{formatNumber(weightT, 1)}</span> т
            </>
          ) : (
            t("Ҳали жўнатма юкланмаган", "No shipment loaded yet")
          )}
        </div>
      </div>

      <SegBar bar={tot.bar} className="mt-4" />
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <Legend dot="bg-success" label={t("Етказилди", "Delivered")} value={tot.delivered} />
        <Legend dot="bg-primary" label={t("Йўлда", "On the road")} value={tot.onRoad} />
        <Legend dot="bg-muted border border-border" label={t("Қолди", "Left")} value={shortClosed ? 0 : tot.left} />
        {shortClosed && <Legend dot="bg-muted border border-border" label={t("Олинмади", "Not taken")} value={notTaken} />}
        {tot.over > 0 && <Legend dot="bg-destructive" label={t("Ортиқча", "Over")} value={tot.over} />}
      </div>

      {/* Per size — table from sm, stacked rows on phones */}
      <div className="-mx-4 mt-4 border-t border-border sm:-mx-5">
        <table className="hidden w-full text-sm sm:table">
          <thead>
            <tr className="text-xs font-semibold text-muted-foreground">
              <th className="px-3 py-2.5 text-left font-semibold">{t("Ўлчам", "Size")}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{t("Буюртма", "Ordered")}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{t("Юкланди", "Loaded")}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{t("Етказилди", "Delivered")}</th>
              <th className="px-3 py-2.5 text-right font-semibold">{shortClosed ? t("Олинмади", "Not taken") : t("Қолди", "Left")}</th>
              <th className="w-[28%] px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {summary.rows.map((r) => (
              <tr key={r.lineId} className="border-t border-border">
                <td className={cn(NUM, "px-3 py-3 font-semibold")}>{r.label}</td>
                <td className={cn(NUM, "px-3 py-3 text-right")}>{n0(r.ordered)}</td>
                <td className={cn(NUM, "px-3 py-3 text-right font-bold", r.over > 0 && "text-destructive")}>
                  {n0(r.loaded)}
                  {r.over > 0 && <span className="ml-1 text-xs font-semibold">(+{n0(r.over)})</span>}
                </td>
                <td className={cn(NUM, "px-3 py-3 text-right", r.delivered > 0 ? "text-success" : "text-muted-foreground")}>{n0(r.delivered)}</td>
                <td className={cn(NUM, "px-3 py-3 text-right font-bold", r.left === 0 && "font-normal text-muted-foreground")}>{n0(r.left)}</td>
                <td className="px-3 py-3">
                  <SegBar bar={r.bar} small />
                </td>
              </tr>
            ))}
            {summary.rows.length > 1 && (
              <tr className="border-t border-border bg-muted/50 font-semibold">
                <td className="px-3 py-3">{t("Жами", "Total")}</td>
                <td className={cn(NUM, "px-3 py-3 text-right font-bold")}>{n0(tot.ordered)}</td>
                <td className={cn(NUM, "px-3 py-3 text-right font-bold", tot.over > 0 && "text-destructive")}>{n0(tot.loaded)}</td>
                <td className={cn(NUM, "px-3 py-3 text-right font-bold")}>{n0(tot.delivered)}</td>
                <td className={cn(NUM, "px-3 py-3 text-right font-bold")}>{n0(tot.left)}</td>
                <td />
              </tr>
            )}
          </tbody>
        </table>

        <ul className="divide-y divide-border sm:hidden">
          {summary.rows.map((r) => (
            <li key={r.lineId} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className={cn(NUM, "font-semibold")}>{r.label}</span>
                <span className="text-[13px]">
                  <span className={cn(NUM, "font-bold", r.over > 0 && "text-destructive")}>{n0(r.loaded)}</span>
                  <span className={cn(NUM, "text-muted-foreground")}> / {n0(r.ordered)}</span>{" "}
                  <span className="text-muted-foreground">{t("та", "pcs")}</span>
                </span>
              </div>
              <SegBar bar={r.bar} small className="mt-2" />
              <div className="mt-1.5 flex justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {t("етказилди", "delivered")} <b className={cn(NUM, "text-success")}>{n0(r.delivered)}</b> · {t("йўлда", "on road")}{" "}
                  <b className={cn(NUM, "text-foreground")}>{n0(r.onRoad)}</b>
                  {r.over > 0 && (
                    <>
                      {" "}· <b className={cn(NUM, "text-destructive")}>+{n0(r.over)}</b>
                    </>
                  )}
                </span>
                <span>
                  {shortClosed ? t("олинмади", "not taken") : t("қолди", "left")} <b className={cn(NUM, "text-foreground")}>{n0(r.left)}</b>
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* Shipments — one ticket row per truck */}
      <div className="mt-2 border-t border-border pt-4">
        <div className="mb-2 flex items-center gap-2 text-[13px] font-bold">
          <Truck className="h-4 w-4 text-muted-foreground" {...ICON} />
          {t("Жўнатмалар", "Shipments")}
          <span className={cn(NUM, "font-medium text-muted-foreground")}>{shipments.length}</span>
        </div>
        {trucks.length === 0 ? (
          <div className="flex items-start gap-3 rounded-md border border-dashed border-border px-4 py-4 text-[13px] text-muted-foreground">
            <Truck className="mt-0.5 h-5 w-5 shrink-0" {...ICON} />
            {canceled ? (
              <span>{t("Буюртма бекор қилинган — жўнатма юкланмаган.", "The order was cancelled — no shipment loaded.")}</span>
            ) : status === "DELIVERED" ? (
              <span>
                {t(
                  "Машиналар қайд этилмаган — буюртма жўнатмалар ёзилишидан олдин етказилган, ҳаммаси юкланган деб ҳисобланади.",
                  "No trucks on file — delivered before shipments were recorded; counted as fully loaded.",
                )}
              </span>
            ) : (
              <span>
                <b className="text-foreground">{t("Ҳали жўнатма юкланмаган.", "No shipment loaded yet.")}</b>{" "}
                {t(
                  "Ҳар бир жўнатмани шу ерда юклайсиз — ҳар ўлчамдан қанчаси кетгани ва қанчаси қолгани юқорида ўзи ҳисобланади.",
                  "Load each shipment here — what left and what is left per size is counted above.",
                )}
              </span>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {trucks.map((s) => (
              <TruckRow
                key={s.id}
                s={s}
                labelById={labelById}
                actor={actorByShipment.get(s.id) ?? null}
                busy={busyTruck === s.id}
                canLoad={can.load}
                canCorrect={can.correct(s)}
                canDeliver={can.deliver && status !== "CANCELED"}
                onLoadTruck={onLoadTruck}
                onCorrect={onCorrect}
                onDeliver={onDeliver}
                onDelete={onDelete}
              />
            ))}
          </ul>
        )}
        {(can.load || can.closeShort) && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-4">
            {loadButton}
            {can.closeShort && (
              <button type="button" className={BTN_GHOST} onClick={onCloseShort}>
                <Scissors {...ICON} />
                {t("Юкланганича ёпиш", "Close as loaded")}
              </button>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  );
}

function Legend({ dot, label, value }: { dot: string; label: string; value: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("inline-block h-2 w-2 shrink-0 rounded-full", dot)} />
      {label} <b className={cn(NUM, "text-foreground")}>{n0(value)}</b>
    </span>
  );
}

function TruckRow({
  s,
  labelById,
  actor,
  busy,
  canLoad,
  canCorrect,
  canDeliver,
  onLoadTruck,
  onCorrect,
  onDeliver,
  onDelete,
}: {
  s: Shipment;
  labelById: Map<string, string>;
  actor: string | null;
  busy: boolean;
  canLoad: boolean;
  canCorrect: boolean;
  canDeliver: boolean;
  onLoadTruck: (s: Shipment) => void;
  onCorrect: (s: Shipment) => void;
  onDeliver: (s: Shipment) => void;
  onDelete: (s: Shipment) => void;
}) {
  const t = useT();
  const pill = TRUCK_PILL[s.status];
  const PillIcon = pill.icon;
  const sizes = Object.entries(s.loadedLines ?? {}).filter(([, v]) => Number(v) > 0);
  const total = sizes.reduce((a, [, v]) => a + Number(v), 0);

  // Two-tap delete for an empty truck.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const askDelete = () => {
    if (timer.current) clearTimeout(timer.current);
    if (confirmDelete) {
      setConfirmDelete(false);
      onDelete(s);
      return;
    }
    setConfirmDelete(true);
    timer.current = setTimeout(() => setConfirmDelete(false), 3000);
  };

  const dates: React.ReactNode[] = [];
  if (s.loadedAt) dates.push(<>{t("Юкланди", "Loaded")} <span className={NUM}>{dotDateTime(s.loadedAt)}</span></>);
  if (s.deliveredAt) dates.push(<>{t("етказилди", "delivered")} <span className={NUM}>{dotDateTime(s.deliveredAt)}</span></>);
  if (actor) dates.push(actor);

  return (
    <li className="grid grid-cols-1 gap-3 py-4 sm:grid-cols-[150px_minmax(0,1fr)_auto]" data-truck={s.number}>
      <div className="flex items-center justify-between gap-2 sm:block">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Truck className="h-4 w-4 text-muted-foreground" {...ICON} />
          {t("Жўнатма", "Shipment")} {s.number}
        </div>
        <Pill tone={pill.tone} icon={<PillIcon {...ICON} />} className="sm:mt-2">
          {t(pill.uz, pill.en)}
        </Pill>
      </div>

      <div className="min-w-0 text-[13px]">
        {sizes.length ? (
          <>
            {sizes.map(([id, v]) => (
              <div key={id} className="flex justify-between gap-3 py-0.5">
                <span className={NUM}>{labelById.get(id) ?? t("ўчирилган ўлчам", "removed size")}</span>
                <span>
                  <b className={NUM}>{n0(Number(v))}</b> <span className="text-muted-foreground">{t("та", "pcs")}</span>
                </span>
              </div>
            ))}
            <div className="mt-1 flex justify-between gap-3 border-t border-dashed border-border pt-1.5">
              <span className="text-muted-foreground">{t("Ҳаммаси", "All")}</span>
              <b>
                <span className={NUM}>{n0(total)}</span> {t("та", "pcs")}
              </b>
            </div>
          </>
        ) : (
          <div className="text-muted-foreground">{t("Бўш жўнатма — ҳали юкланмаган", "Empty — not loaded yet")}</div>
        )}
        {dates.length > 0 && (
          <div className="mt-1.5 text-xs text-muted-foreground">
            {dates.map((d, i) => (
              <span key={i}>
                {i > 0 && " · "}
                {d}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col items-start gap-2 sm:items-end">
        {s.loadedPhotoUrls.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {s.loadedPhotoUrls.map((url, i) => (
              <a
                key={url + i}
                href={url}
                target="_blank"
                rel="noreferrer"
                title={t("Жўнатма расми", "Shipment photo")}
                className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground hover:ring-1 hover:ring-primary"
              >
                <ImageIcon className="absolute h-4 w-4" {...ICON} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`${t("Жўнатма", "Shipment")} ${s.number} — ${t("расм", "photo")} ${i + 1}`}
                  className="relative h-full w-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
                />
              </a>
            ))}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {s.status === "PENDING" && canLoad && (
            <>
              <button type="button" className={BTN_OUTLINE} onClick={() => onLoadTruck(s)}>
                <PackageCheck {...ICON} />
                {t("Юклаш", "Load")}
              </button>
              <button
                type="button"
                className={cn(BTN_OUTLINE, "text-destructive")}
                aria-label={t("Ўчириш", "Delete")}
                disabled={busy}
                onClick={askDelete}
              >
                {busy ? <Loader2 className="animate-spin" {...ICON} /> : confirmDelete ? t("Тасдиқлайсизми?", "Confirm?") : <Trash2 {...ICON} />}
              </button>
            </>
          )}
          {s.status === "LOADED" && canDeliver && (
            <button
              type="button"
              className={cn(BTN_OUTLINE, "border-success/50 text-success hover:bg-success/10")}
              disabled={busy}
              onClick={() => onDeliver(s)}
              data-action="deliver-truck"
            >
              {busy ? <Loader2 className="animate-spin" {...ICON} /> : <PackageCheck {...ICON} />}
              {t("Етказилди", "Delivered")}
            </button>
          )}
          {canCorrect && s.status !== "PENDING" && (
            <button type="button" className={BTN_OUTLINE} onClick={() => onCorrect(s)} data-action="correct-truck">
              <Wrench {...ICON} />
              {t("Тузатиш", "Correct")}
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
