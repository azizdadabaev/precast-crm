"use client";

import { useMemo, useState } from "react";
import {
  Ban,
  CalendarDays,
  Camera,
  Check,
  CircleCheck,
  CircleDot,
  ClipboardList,
  History,
  Image as ImageIcon,
  MapPin,
  MessageSquare,
  PackageCheck,
  Pencil,
  Scissors,
  TriangleAlert,
  Truck,
  Undo2,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { NUM, SectionCard } from "@/components/gazoblok/order-form/ui";
import { CommentComposer, CommentItem, useComments, type CommentDTO } from "@/components/comments/CommentThread";
import { historyCounts, historyText, type HistoryIcon, type HistoryItem } from "@/lib/gazoblok-history";
import { dotDateTime } from "@/lib/gazoblok-detail";
import { ICON, TEXT_TONE, TILE_TONE } from "./ui";

type Filter = "all" | "load" | "payment" | "change" | "comment";

const ICONS: Record<HistoryIcon, typeof Truck> = {
  load: Truck,
  deliver: PackageCheck,
  correct: Wrench,
  closeShort: Scissors,
  placed: ClipboardList,
  edit: Pencil,
  date: CalendarDays,
  status: CircleDot,
  cancel: Ban,
  delivered: CircleCheck,
  payRecorded: Wallet,
  payConfirmed: Check,
  payRejected: X,
  refund: Undo2,
  location: MapPin,
  proof: ImageIcon,
  other: History,
};

type Entry = { kind: "event"; at: string; item: HistoryItem } | { kind: "comment"; at: string; c: CommentDTO };

export function HistoryCard({ orderId, items }: { orderId: string; items: HistoryItem[] }) {
  const t = useT();
  const comments = useComments({ gazoblokOrderId: orderId });
  const [filter, setFilter] = useState<Filter>("all");
  const counts = historyCounts(items, comments.visible.length);

  const entries = useMemo(() => {
    const all: Entry[] = [
      ...items.map((item) => ({ kind: "event" as const, at: item.at, item })),
      ...comments.visible.map((c) => ({ kind: "comment" as const, at: c.createdAt, c })),
    ];
    return all
      .filter((e) => filter === "all" || (filter === "comment" ? e.kind === "comment" : e.kind === "event" && e.item.group === filter))
      .sort((a, b) => b.at.localeCompare(a.at));
  }, [items, comments.visible, filter]);

  const chips: { key: Filter; uz: string; en: string }[] = [
    { key: "all", uz: "Ҳаммаси", en: "All" },
    { key: "load", uz: "Юклаш", en: "Loading" },
    { key: "payment", uz: "Тўлов", en: "Payments" },
    { key: "change", uz: "Ўзгаришлар", en: "Changes" },
    { key: "comment", uz: "Шарҳлар", en: "Comments" },
  ];

  return (
    <SectionCard
      id="sec-history"
      icon={<History className="h-4 w-4" {...ICON} />}
      title={t("Тарих", "History")}
      action={
        <div role="tablist" aria-label={t("Тарих филтри", "History filter")} className="flex flex-wrap gap-1.5">
          {chips
            .filter((c) => c.key === "all" || counts[c.key] > 0)
            .map((c) => {
              const on = filter === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setFilter(c.key)}
                  className={cn(
                    "inline-flex min-h-[44px] items-center gap-1.5 rounded-md border px-3 text-[13px] font-semibold md:min-h-[36px]",
                    on ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-surface-hover",
                  )}
                >
                  {t(c.uz, c.en)}
                  <span className={cn(NUM, "font-medium", on ? "text-primary" : "text-muted-foreground")}>{counts[c.key]}</span>
                </button>
              );
            })}
        </div>
      }
    >
      <CommentComposer state={comments} inline />

      {entries.length === 0 ? (
        <div className="mt-4 text-[13px] text-muted-foreground">{t("Ёзув йўқ.", "Nothing yet.")}</div>
      ) : (
        <ol className="relative mt-5 space-y-5 before:absolute before:bottom-3 before:left-[14.5px] before:top-3 before:w-px before:bg-border">
          {entries.map((e) =>
            e.kind === "comment" ? (
              <li key={`c-${e.c.id}`} className="relative flex gap-3" data-history="comment">
                <span className={cn("relative grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full border", TILE_TONE.muted)}>
                  <MessageSquare className="h-4 w-4" {...ICON} />
                </span>
                <div className="min-w-0 flex-1">
                  <Head title={<span className="font-medium text-muted-foreground">{t("Шарҳ", "Comment")}</span>} actor={e.c.author.name} at={e.c.createdAt} />
                  <div className="mt-1 max-w-[460px]">
                    <CommentItem c={e.c} state={comments} bare />
                  </div>
                </div>
              </li>
            ) : (
              <EventRow key={e.item.id} item={e.item} />
            ),
          )}
        </ol>
      )}
    </SectionCard>
  );
}

function Head({ title, actor, at }: { title: React.ReactNode; actor: string | null; at: string }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <div className="min-w-0 text-sm font-semibold">{title}</div>
      <div className="text-xs text-muted-foreground">
        {actor ?? t("Тизим", "System")} · <span className={cn(NUM, "[word-spacing:normal]")}>{dotDateTime(at)}</span>
      </div>
    </div>
  );
}

function EventRow({ item }: { item: HistoryItem }) {
  const t = useT();
  const Icon = ICONS[item.icon];
  return (
    <li className="relative flex gap-3" data-history={item.group} aria-label={historyText(item)}>
      <span className={cn("relative grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full border", TILE_TONE[item.tone])}>
        <Icon className="h-4 w-4" {...ICON} />
      </span>
      <div className="min-w-0 flex-1">
        <Head title={<Numbers text={item.title} />} actor={item.actor} at={item.at} />
        {item.sub.length > 0 && (
          <div className="mt-0.5 text-[13px] text-muted-foreground">
            {item.sub.map((s, i) => (
              <span key={i}>
                {i > 0 && " · "}
                <span className={s.tone ? TEXT_TONE[s.tone] : undefined}>
                  <Numbers text={s.text} />
                </span>
              </span>
            ))}
          </div>
        )}
        {(item.rows.length > 0 || item.foot) && (
          <div className="mt-2 max-w-[460px] rounded-md bg-muted/60 px-3 py-2 text-[13px]">
            {item.rows.map((r, i) => (
              <div key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 py-0.5">
                <span className={/^\d/.test(r.label) ? NUM : undefined}>{r.label}</span>
                <span className="text-right">
                  {r.before !== undefined && (
                    <>
                      <span className={cn(NUM, "text-muted-foreground line-through")}>{r.before}</span>
                      <span className="text-muted-foreground"> → </span>
                    </>
                  )}
                  <b>
                    <Numbers text={r.value} />
                  </b>
                  {r.delta && <span className={cn(NUM, "ml-1", r.deltaTone ? TEXT_TONE[r.deltaTone] : "")}>({r.delta})</span>}
                  {r.note && (
                    <span className="text-muted-foreground">
                      {" · "}
                      <Numbers text={r.note} />
                    </span>
                  )}
                </span>
              </div>
            ))}
            {item.foot && (
              <div className={cn("flex flex-wrap items-baseline justify-between gap-x-3 pt-1", item.rows.length > 0 && "mt-1 border-t border-dashed border-border")}>
                <span className="text-muted-foreground">
                  {item.foot.label}{" "}
                  {item.foot.value && (
                    <b className="text-foreground">
                      <Numbers text={item.foot.value} />
                    </b>
                  )}
                </span>
                {item.foot.right && (
                  <span className="text-muted-foreground">
                    <Numbers text={item.foot.right} bold />
                  </span>
                )}
              </div>
            )}
          </div>
        )}
        {item.alert && (
          <div className={cn("mt-1.5 flex items-start gap-1.5 text-[13px] font-medium", TEXT_TONE[item.alert.tone])}>
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" {...ICON} />
            <Numbers text={item.alert.text} />
          </div>
        )}
        {item.photos > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Camera className="h-3.5 w-3.5" {...ICON} />
            <span className={NUM}>{item.photos}</span> {t("та расм", "photos")}
          </div>
        )}
      </div>
    </li>
  );
}

/** Set every number run in the mono tabular face; optionally bold. */
function Numbers({ text, bold }: { text: string; bold?: boolean }) {
  const parts = text.split(/([+−-]?\d[\d   ]*(?:[.,]\d+)?)/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <span key={i} className={cn(NUM, bold && "font-semibold text-foreground")}>
            {p.trimEnd()}
            {p.endsWith(" ") ? " " : ""}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
