"use client";

import { CircleCheck, Loader2, Phone, RotateCcw, Search, TriangleAlert, UserCheck, UserPlus, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { ErrorText, FIELD, FieldLabel, Help, NUM, SectionCard } from "./ui";
import type { ClientLookup } from "./useClientLookup";

const ICON = { strokeWidth: 1.75 };

function dmy(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

export function ClientSection({
  phone,
  onPhone,
  name,
  onName,
  lookup,
  conflictSaved,
  decision,
  onDecision,
  onRepeatLast,
  showMissing,
  isReorder,
}: {
  phone: string;
  onPhone: (v: string) => void;
  name: string;
  onName: (v: string) => void;
  lookup: ClientLookup;
  /** The saved name when the phone's client is saved under another name — asked here, inline. */
  conflictSaved: string | null;
  decision: "keep" | "update" | null;
  onDecision: (d: "keep" | "update") => void;
  onRepeatLast: (orderId: string) => void;
  showMissing: boolean;
  isReorder: boolean;
}) {
  const t = useT();
  const phoneOk = lookup.status === "known" || lookup.status === "new";
  const done = phone.trim() !== "" && name.trim() !== "" && (!conflictSaved || decision !== null);

  return (
    <SectionCard id="sec-client" icon={<UserRound className="h-4 w-4" {...ICON} />} title={t("Мижоз", "Client")} done={done}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.2fr]">
        <div>
          <FieldLabel htmlFor="f-phone" icon={<Phone {...ICON} />} required>
            {t("Телефон", "Phone")}
          </FieldLabel>
          <div className="relative">
            <Input
              id="f-phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              className={cn(FIELD, NUM, "pr-10 text-[15px]", phoneOk && "border-success/60")}
              placeholder={t("Масалан 90 123 45 67", "e.g. 90 123 45 67")}
              value={phone}
              onChange={(e) => onPhone(e.target.value)}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
              {lookup.status === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" {...ICON} />
              ) : phoneOk ? (
                <CircleCheck className="h-4 w-4 text-success" {...ICON} />
              ) : null}
            </span>
          </div>
          {showMissing && !phone.trim() && <ErrorText>{t("Телефон рақамини киритинг", "Enter the phone number")}</ErrorText>}
        </div>
        <div>
          <FieldLabel htmlFor="f-name" icon={<UserRound {...ICON} />} required>
            {t("Исм", "Name")}
          </FieldLabel>
          <Input
            id="f-name"
            autoComplete="off"
            className={cn(FIELD, conflictSaved && !decision && "border-warning")}
            placeholder={t("Мижоз исми", "Client name")}
            value={name}
            onChange={(e) => onName(e.target.value)}
          />
          {showMissing && !name.trim() && <ErrorText>{t("Мижоз исмини киритинг", "Enter the client name")}</ErrorText>}
        </div>
      </div>

      {lookup.status === "idle" && !phone.trim() && (
        <Help className="flex items-center gap-2">
          <Search className="h-3.5 w-3.5" {...ICON} />
          {t("Рақамни киритинг — мижоз базадан ўзи топилади.", "Type the number — a saved client is found by it.")}
        </Help>
      )}
      {lookup.status === "new" && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2.5 text-[13px]">
          <UserPlus className="h-4 w-4 shrink-0 text-primary" {...ICON} />
          <span>
            <b>{t("Янги мижоз.", "New client.")}</b>{" "}
            <span className="text-muted-foreground">{t("Буюртма билан бирга базага сақланади.", "Saved to the base with the order.")}</span>
          </span>
        </div>
      )}
      {lookup.status === "known" && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md bg-muted/60 px-3 py-2.5 text-[13px]">
          <span className="flex items-center gap-2 font-semibold">
            <UserCheck className="h-4 w-4 text-success" {...ICON} />
            {lookup.client.name}
          </span>
          <span className="text-muted-foreground">
            <span className={cn(NUM, "text-foreground")}>{formatNumber(lookup.client.orderCount, 0)}</span>{" "}
            {t("та буюртма", "orders")}
            {lookup.client.last && (
              <>
                {" · "}
                {t("охиргиси", "last")} <span className={cn(NUM, "text-foreground")}>{dmy(lookup.client.last.placedAt)}</span>
              </>
            )}
          </span>
          <span className="text-muted-foreground">
            {t("Қарз", "Debt")}:{" "}
            <span className={cn(NUM, lookup.client.debt > 0 ? "font-semibold text-destructive" : "text-foreground")}>
              {formatNumber(lookup.client.debt, 0)}
            </span>{" "}
            UZS
          </span>
          {lookup.client.last && !isReorder && (
            <button
              type="button"
              onClick={() => onRepeatLast(lookup.client.last!.id)}
              className="ml-auto inline-flex min-h-[44px] items-center gap-1.5 font-semibold text-primary hover:underline md:min-h-0"
            >
              <RotateCcw className="h-3.5 w-3.5" {...ICON} />
              {t("Охирги буюртмани такрорлаш", "Repeat the last order")}
            </button>
          )}
        </div>
      )}

      {conflictSaved && (
        <div
          id="f-name-decision"
          role="radiogroup"
          aria-label={t("Мижоз номи", "Client name")}
          className={cn(
            "mt-3 scroll-mt-24 rounded-md border bg-warning/[.07] p-3.5",
            showMissing && !decision ? "border-destructive/60" : "border-warning/45",
          )}
        >
          <div className="flex items-start gap-2 text-[13px]">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" {...ICON} />
            <div>
              <b>{t(`Бу рақам «${conflictSaved}» номи билан сақланган.`, `This phone is saved as «${conflictSaved}».`)}</b>{" "}
              <span className="text-muted-foreground">
                {t(`Сиз «${name.trim()}» деб ёздингиз. Қайси ном қолсин?`, `You typed «${name.trim()}». Which name stays?`)}
              </span>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
            <NameChoice
              checked={decision === "keep"}
              onPick={() => onDecision("keep")}
              title={t("Сақланган номни қолдириш", "Keep the saved name")}
              sub={conflictSaved}
            />
            <NameChoice
              checked={decision === "update"}
              onPick={() => onDecision("update")}
              title={t("Номни янгилаш", "Update the name")}
              sub={t(`Аввалги буюртмаларида ҳам «${name.trim()}» бўлади`, `Earlier orders will also read «${name.trim()}»`)}
            />
          </div>
        </div>
      )}
    </SectionCard>
  );
}

function NameChoice({ checked, onPick, title, sub }: { checked: boolean; onPick: () => void; title: string; sub: string }) {
  return (
    <label
      className={cn(
        "flex min-h-[44px] cursor-pointer items-start gap-2.5 rounded-md border bg-card px-3 py-2.5",
        checked ? "border-primary bg-primary/5" : "border-border hover:bg-surface-hover",
      )}
    >
      <input type="radio" name="client-name-decision" className="mt-0.5 h-4 w-4 accent-[hsl(var(--primary))]" checked={checked} onChange={onPick} />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold">{title}</span>
        <span className="block break-words text-xs text-muted-foreground">{sub}</span>
      </span>
    </label>
  );
}
