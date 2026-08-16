"use client";

import { AlertTriangle, Loader2, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/fetcher";
import { formatPhone } from "@/lib/phone";
import { Bi, useT } from "@/lib/i18n";

/**
 * The two situations in which PATCH /api/orders/<id>/edit refuses a
 * client-phone change until the operator confirms it explicitly.
 *
 *  PHONE_BELONGS_TO_OTHER — the typed number is already another
 *    client's identity. Confirming moves THIS order to that client.
 *  SHARED_CLIENT_PHONE — this client has other orders; the phone
 *    lives on the shared Client row, so the change lands on all of
 *    them.
 *
 * Every field except `code` is optional: the dialog degrades to a
 * generic (still correct) sentence if the server omits one.
 */
export type PhoneChangeConfirm =
  | {
      code: "PHONE_BELONGS_TO_OTHER";
      targetClientId: string | null;
      targetClientName: string | null;
      targetClientOrderCount: number | null;
    }
  | {
      code: "SHARED_CLIENT_PHONE";
      clientName: string | null;
      orderCount: number | null;
    };

function str(source: Record<string, unknown>, key: string): string | null {
  const v = source[key];
  return typeof v === "string" && v.trim() ? v : null;
}

function num(source: Record<string, unknown>, key: string): number | null {
  const v = source[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Pull the confirmation request out of a rejected `api()` call.
 * Returns null for every other failure so the caller can fall back to
 * the plain error banner.
 *
 * The code is looked for both at the top level of the JSON body and
 * under `details` (what `fail(msg, 409, details)` produces) so the UI
 * survives either server-side shape.
 */
export function parsePhoneChangeConfirm(err: unknown): PhoneChangeConfirm | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = err.payload;
  if (!isRecord(body)) return null;

  const candidates: Record<string, unknown>[] = [body];
  for (const key of ["details", "data", "error"]) {
    const nested = body[key];
    if (isRecord(nested)) candidates.push(nested);
  }

  for (const c of candidates) {
    const code = str(c, "code");
    if (code === "PHONE_BELONGS_TO_OTHER") {
      return {
        code,
        targetClientId: str(c, "targetClientId"),
        targetClientName: str(c, "targetClientName"),
        targetClientOrderCount: num(c, "targetClientOrderCount"),
      };
    }
    if (code === "SHARED_CLIENT_PHONE") {
      return {
        code,
        clientName: str(c, "clientName"),
        orderCount: num(c, "orderCount"),
      };
    }
  }
  return null;
}

interface Props {
  request: PhoneChangeConfirm;
  /** The number the operator typed, shown so they can double-check it. */
  phone: string;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmation step for a client-phone correction made inside the
 * order-edit screen. Cancelling closes the dialog and leaves the
 * operator on the calculator with everything they typed intact — the
 * edit is never silently dropped.
 */
export function PhoneChangeConfirmDialog({
  request,
  phone,
  pending,
  onConfirm,
  onCancel,
}: Props) {
  const t = useT();
  const moving = request.code === "PHONE_BELONGS_TO_OTHER";

  const title = moving ? (
    <Bi uz="Рақам бошқа мижозга тегишли" en="Number belongs to another client" />
  ) : (
    <Bi uz="Рақам барча буюртмаларда ўзгаради" en="Phone changes on every order" />
  );

  const body = moving
    ? request.targetClientName
      ? t(
          `Бу рақам бошқа мижозга тегишли: ${request.targetClientName}. Буюртма ўша мижозга ўтказилсинми?`,
          `This number already belongs to another client: ${request.targetClientName}. Move this order to that client?`,
        )
      : t(
          "Бу рақам бошқа мижозга тегишли. Буюртма ўша мижозга ўтказилсинми?",
          "This number already belongs to another client. Move this order to that client?",
        )
    : request.orderCount !== null
      ? t(
          `Бу мижознинг ${request.orderCount} та буюртмаси бор — рақам ҳаммасида ўзгаради. Давом этилсинми?`,
          `This client has ${request.orderCount} orders — the phone will change on all of them. Continue?`,
        )
      : t(
          "Бу мижознинг бошқа буюртмалари ҳам бор — рақам ҳаммасида ўзгаради. Давом этилсинми?",
          "This client has other orders too — the phone will change on all of them. Continue?",
        );

  return (
    <Dialog open onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
            {title}
          </DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Янги рақам<span className="lang-en"> · New number</span>
            </span>
            <span className="font-mono tabular-nums font-semibold">
              {formatPhone(phone) || phone}
            </span>
          </div>
          {moving && request.targetClientOrderCount !== null && (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Ўша мижозда<span className="lang-en"> · That client has</span>
              </span>
              <span className="font-mono tabular-nums">
                {request.targetClientOrderCount}{" "}
                <span className="font-sans text-xs text-muted-foreground">
                  {t("та буюртма", "orders")}
                </span>
              </span>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {moving
            ? t(
                "Бекор қилсангиз, ҳеч нарса ўзгармайди — ёзганларингиз жойида қолади.",
                "Cancel and nothing changes — everything you typed stays where it is.",
              )
            : t(
                "Бекор қилсангиз, рақам эскисича қолади — ёзганларингиз жойида қолади.",
                "Cancel and the phone stays as it was — everything you typed stays where it is.",
              )}
        </p>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={pending}>
            {t("Бекор қилиш", "Cancel")}
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={onConfirm}
            className="bg-success hover:bg-success/90 text-success-foreground"
          >
            {pending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <PackageCheck className="h-4 w-4 mr-2" />
            )}
            {moving ? (
              <Bi uz="Ҳа, ўтказилсин" en="Yes, move it" enClassName="font-normal opacity-90" />
            ) : (
              <Bi uz="Ҳа, давом этилсин" en="Yes, continue" enClassName="font-normal opacity-90" />
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
