"use client";

import { useState } from "react";
import { CalendarDays, MapPin, RotateCcw, StickyNote, Truck, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { dateQuickPicks, formatYmd, parseDmy, weekdayUz } from "@/lib/gazoblok-order-form";
import { BadNumber, ErrorText, FIELD, FIELD_ERR, FieldLabel, Help, NUM, SectionCard } from "./ui";

const ICON = { strokeWidth: 1.75 };
const CHIP = "inline-flex h-11 md:h-10 items-center gap-1.5 rounded-md border px-3 text-[13px] font-semibold whitespace-nowrap transition-colors";

export function DeliverySection({
  dateRaw,
  onDate,
  deliveryCost,
  onDeliveryCost,
  deliveryBad,
  address,
  onAddress,
  notes,
  onNotes,
  previousDelivery,
  showErrors,
}: {
  /** The scheduled day as typed «кк.оо.йййй»; blank = no date. */
  dateRaw: string;
  onDate: (v: string) => void;
  deliveryCost: string;
  onDeliveryCost: (v: string) => void;
  deliveryBad: boolean;
  address: string;
  onAddress: (v: string) => void;
  notes: string;
  onNotes: (v: string) => void;
  /** Reorder: last order's delivery cost — a hint only; delivery is agreed each time. */
  previousDelivery: number | null;
  showErrors: boolean;
}) {
  const t = useT();
  const picks = dateQuickPicks(new Date());
  const ymd = dateRaw.trim() === "" ? null : parseDmy(dateRaw);
  const dateBad = dateRaw.trim() !== "" && ymd === null;
  const isPick = ymd !== null && picks.some((p) => p.ymd === ymd);
  const [custom, setCustom] = useState(false);
  const showField = custom || dateBad || (ymd !== null && !isPick);
  const names = { today: t("Бугун", "Today"), tomorrow: t("Эртага", "Tomorrow"), after: t("Индин", "Day after") };

  return (
    <SectionCard
      id="sec-delivery"
      icon={<Truck className="h-4 w-4" {...ICON} />}
      title={t("Етказиш", "Delivery")}
      done={ymd !== null && address.trim() !== "" && !deliveryBad}
    >
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <FieldLabel icon={<CalendarDays {...ICON} />} note={t("ихтиёрий", "optional")}>
            {t("Сана", "Date")}
          </FieldLabel>
          <div className="flex flex-wrap gap-2">
            {picks.map((p) => {
              const on = ymd === p.ymd;
              return (
                <button
                  key={p.key}
                  id={`f-date-${p.key}`}
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setCustom(false);
                    onDate(on ? "" : formatYmd(p.ymd));
                  }}
                  className={cn(CHIP, on ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-surface-hover")}
                >
                  {names[p.key]} <span className={cn(NUM, "font-normal opacity-70")}>{p.short}</span>
                </button>
              );
            })}
            <button
              type="button"
              aria-pressed={showField}
              onClick={() => {
                setCustom(true);
                setTimeout(() => document.getElementById("f-date")?.focus(), 0);
              }}
              className={cn(CHIP, showField ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-surface-hover")}
            >
              <CalendarDays className="h-3.5 w-3.5" {...ICON} />
              {t("Сана…", "Date…")}
            </button>
            {ymd !== null && (
              <button
                type="button"
                onClick={() => {
                  setCustom(false);
                  onDate("");
                }}
                className={cn(CHIP, "border-transparent font-medium text-muted-foreground hover:text-foreground")}
              >
                <X className="h-3.5 w-3.5" {...ICON} />
                {t("Санасиз", "No date")}
              </button>
            )}
          </div>
          {showField && (
            <Input
              id="f-date"
              inputMode="numeric"
              autoComplete="off"
              placeholder={t("кк.оо.йййй", "dd.mm.yyyy")}
              value={dateRaw}
              onChange={(e) => onDate(e.target.value)}
              className={cn(FIELD, NUM, "mt-2 max-w-[200px]", dateBad && showErrors && FIELD_ERR)}
            />
          )}
          {dateBad && showErrors ? (
            <ErrorText>{t("Санани кк.оо.йййй кўринишида ёзинг, масалан 11.11.2026", "Type the date as dd.mm.yyyy, e.g. 11.11.2026")}</ErrorText>
          ) : ymd ? (
            <Help>
              {t("Режа", "Planned")}: <b className={cn(NUM, "text-foreground")}>{formatYmd(ymd)}</b>, {weekdayUz(ymd)}
            </Help>
          ) : null}
        </div>

        <div>
          <FieldLabel htmlFor="f-delivery" icon={<Truck {...ICON} />} note={t("ихтиёрий", "optional")}>
            {t("Етказиш нархи, UZS", "Delivery cost, UZS")}
          </FieldLabel>
          <Input
            id="f-delivery"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={deliveryCost}
            onChange={(e) => onDeliveryCost(e.target.value)}
            className={cn(FIELD, NUM, deliveryBad && FIELD_ERR)}
          />
          <BadNumber show={deliveryBad} />
          {!deliveryBad &&
            (previousDelivery !== null && previousDelivery > 0 ? (
              <Help className="flex items-center gap-1.5 text-warning">
                <RotateCcw className="h-3.5 w-3.5 shrink-0" {...ICON} />
                <span>
                  {t("олдин", "last time")}: <span className={NUM}>{formatNumber(previousDelivery, 0)}</span> UZS ·{" "}
                  {t("мижоз билан қайта келишинг", "agree it with the client again")}
                </span>
              </Help>
            ) : (
              <Help>{t("Мижоз билан келишилган нарх. Бепул бўлса 0 қолдиринг.", "The price agreed with the client. Leave 0 when free.")}</Help>
            ))}
        </div>

        <div>
          <FieldLabel htmlFor="f-address" icon={<MapPin {...ICON} />} note={t("мижоз картасига сақланади", "saved to the client card")}>
            {t("Манзил", "Address")}
          </FieldLabel>
          <Input
            id="f-address"
            autoComplete="off"
            placeholder={t("Шаҳар, кўча, уй", "City, street, house")}
            value={address}
            onChange={(e) => onAddress(e.target.value)}
            className={FIELD}
          />
        </div>

        <div className="md:col-span-2">
          <FieldLabel htmlFor="f-notes" icon={<StickyNote {...ICON} />} note={t("ихтиёрий", "optional")}>
            {t("Изоҳ", "Note")}
          </FieldLabel>
          <Input
            id="f-notes"
            autoComplete="off"
            maxLength={1000}
            placeholder={t("Масалан: кран керак, дарвоза эни", "e.g. crane needed, gate width")}
            value={notes}
            onChange={(e) => onNotes(e.target.value)}
            className={FIELD}
          />
        </div>
      </div>
    </SectionCard>
  );
}
