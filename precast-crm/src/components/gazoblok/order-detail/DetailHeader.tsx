"use client";

import type { RefObject } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  CalendarDays,
  CircleCheck,
  CircleDot,
  Factory,
  ImageDown,
  Inbox,
  Pencil,
  Phone,
  RotateCcw,
  Scissors,
  Truck,
  UserRound,
  BadgeCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { NUM } from "@/components/gazoblok/order-form/ui";
import { PhoneLink } from "@/components/PhoneLink";
import { ShareCalculationButton } from "@/components/ShareCalculationButton";
import { SendQuoteToChatButton } from "@/components/inbox/SendQuoteToChatButton";
import { dotDate, type Pill as PillT } from "@/lib/gazoblok-detail";
import { BTN_OUTLINE, ICON, Pill } from "./ui";

const STATUS: Record<string, { uz: string; en: string; icon: typeof Inbox }> = {
  PLACED: { uz: "Қабул қилинган", en: "Placed", icon: Inbox },
  IN_PRODUCTION: { uz: "Ишлаб чиқилмоқда", en: "In production", icon: Factory },
  DELIVERED: { uz: "Етказилган", en: "Delivered", icon: CircleCheck },
  CANCELED: { uz: "Бекор қилинган", en: "Cancelled", icon: Ban },
};

export function DetailHeader({
  orderNumber,
  status,
  loadPill,
  payPill,
  client,
  sellerName,
  placedAt,
  deliveredAt,
  sourceOrder,
  reorders,
  tools,
  banner,
  shareRef,
  shareFileBase,
  shareCaption,
  onEdit,
  reorderHref,
}: {
  orderNumber: string;
  status: string;
  loadPill: PillT | null;
  payPill: PillT | null;
  client: { id: string; name: string; phone: string };
  sellerName: string | null;
  placedAt: string | null;
  deliveredAt: string | null;
  sourceOrder: { id: string; orderNumber: string } | null;
  reorders: { id: string; orderNumber: string }[];
  tools: { edit: boolean; reorder: boolean; chat: boolean };
  banner: { tone: "warning" | "destructive"; title: string; text: string } | null;
  shareRef: RefObject<HTMLDivElement>;
  shareFileBase: string;
  shareCaption: string;
  onEdit: () => void;
  reorderHref: string;
}) {
  const t = useT();
  const st = STATUS[status] ?? STATUS.PLACED;
  const StIcon = st.icon;

  const toolButtons = (
    <>
      {tools.edit && (
        <button type="button" className={BTN_OUTLINE} onClick={onEdit} data-action="edit-order">
          <Pencil {...ICON} />
          {t("Таҳрирлаш", "Edit")}
        </button>
      )}
      {tools.reorder && (
        <Link href={reorderHref} className={BTN_OUTLINE}>
          <RotateCcw {...ICON} />
          {t("Қайта буюртма", "Reorder")}
        </Link>
      )}
      <ShareCalculationButton
        targetRef={shareRef}
        fileBase={shareFileBase}
        label={t("Расм", "Image")}
        icon={<ImageDown className="mr-2 h-4 w-4" {...ICON} />}
      />
      {tools.chat && <SendQuoteToChatButton targetRef={shareRef} conversationId={null} fileBase={shareFileBase} caption={shareCaption} />}
    </>
  );

  return (
    <header className="mb-5">
      <Link href="/gazoblok/orders" className="inline-flex min-h-[44px] items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground md:min-h-0">
        <ArrowLeft className="h-4 w-4" {...ICON} />
        {t("Буюртмалар", "Orders")}
      </Link>
      <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className={cn(NUM, "text-[24px] font-bold leading-tight tracking-tight [word-spacing:normal] md:text-[26px]")}>{orderNumber}</h1>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Pill tone="outline" icon={<StIcon {...ICON} />}>
              {t(st.uz, st.en)}
            </Pill>
            {loadPill && (
              <Pill tone={loadPill.tone} icon={loadPill.tone === "warning" ? <Scissors {...ICON} /> : <Truck {...ICON} />}>
                {loadPill.text}
              </Pill>
            )}
            {payPill && (
              <Pill tone={payPill.tone} icon={payPill.tone === "success" ? <BadgeCheck {...ICON} /> : <CircleDot {...ICON} />}>
                {payPill.text}
              </Pill>
            )}
          </div>
        </div>
        {/* Desktop toolbar; every 44 px on touch */}
        <div className="hidden flex-wrap gap-2 md:flex [&_button]:min-h-[40px] [&_button]:px-3.5 [&_button]:text-sm [&_button]:font-semibold">
          {toolButtons}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-muted-foreground">
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <UserRound className="h-4 w-4 shrink-0" {...ICON} />
          <Link href={`/clients/${client.id}`} className="break-words font-semibold text-foreground hover:underline">
            {client.name}
          </Link>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Phone className="h-4 w-4" {...ICON} />
          <PhoneLink phone={client.phone} />
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CircleCheck className="h-4 w-4" {...ICON} />
          {t("Сотувчи", "Seller")} <b className="font-semibold text-foreground">{sellerName ?? "—"}</b>
        </span>
        {placedAt && (
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" {...ICON} />
            {t("Қабул", "Placed")} <span className={cn(NUM, "text-foreground")}>{dotDate(placedAt)}</span>
          </span>
        )}
        {deliveredAt && (
          <span className="inline-flex items-center gap-1.5">
            <CircleCheck className="h-4 w-4 text-success" {...ICON} />
            {t("Етказилган", "Delivered")} <span className={cn(NUM, "text-foreground")}>{dotDate(deliveredAt)}</span>
          </span>
        )}
        {sourceOrder && (
          <span className="inline-flex items-center gap-1.5">
            <RotateCcw className="h-4 w-4" {...ICON} />
            {t("Қайта буюртма:", "Reorder of:")}{" "}
            <Link href={`/gazoblok/orders/${sourceOrder.id}`} className={cn(NUM, "text-primary hover:underline")}>
              {sourceOrder.orderNumber}
            </Link>{" "}
            {t("асосида", "")}
          </span>
        )}
        {reorders.length > 0 && (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <RotateCcw className="h-4 w-4" {...ICON} />
            {t("Қайта буюртмалар:", "Reorders:")}
            {reorders.map((r, i) => (
              <span key={r.id}>
                {i > 0 && ", "}
                <Link href={`/gazoblok/orders/${r.id}`} className={cn(NUM, "text-primary hover:underline")}>
                  {r.orderNumber}
                </Link>
              </span>
            ))}
          </span>
        )}
      </div>

      {/* Phone toolbar: tiles, icon over label, nothing hidden in a menu */}
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(0,1fr))] gap-2 md:hidden [&>*]:min-w-0 [&_button]:h-auto [&_button]:min-h-[56px] [&_button]:w-full [&_button]:flex-col [&_button]:gap-1 [&_button]:px-1 [&_button]:py-2 [&_button]:text-xs [&_button]:font-semibold [&_button]:whitespace-normal [&_button]:leading-tight [&_a]:whitespace-normal [&_a]:leading-tight [&_a]:text-center [&_a]:h-auto [&_a]:min-h-[56px] [&_a]:w-full [&_a]:flex-col [&_a]:gap-1 [&_a]:px-1 [&_a]:py-2 [&_a]:text-xs [&_svg]:mr-0">
        {toolButtons}
      </div>

      {banner && (
        <div
          className={cn(
            "mt-4 flex items-start gap-2 rounded-md border px-4 py-2.5 text-[13px]",
            banner.tone === "warning" ? "border-warning/40 bg-warning/10" : "border-destructive/35 bg-destructive/[.07]",
          )}
        >
          {banner.tone === "warning" ? <Scissors className="mt-0.5 h-4 w-4 shrink-0 text-warning" {...ICON} /> : <Ban className="mt-0.5 h-4 w-4 shrink-0 text-destructive" {...ICON} />}
          <span>
            <b>{banner.title}</b> {banner.text}
          </span>
        </div>
      )}
    </header>
  );
}
