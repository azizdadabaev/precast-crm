"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, HelpCircle, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n";

export type ConsentValue = "NOT_ASKED" | "GRANTED" | "DENIED";

interface Props {
  open: boolean;
  onClose: () => void;
  initialValue: ConsentValue;
  initialNote: string | null;
  onSubmit: (next: { referenceConsent: ConsentValue; consentNote: string | null }) => Promise<void>;
}

export function ConsentDialog({ open, onClose, initialValue, initialNote, onSubmit }: Props) {
  const t = useT();
  const [value, setValue] = useState<ConsentValue>(initialValue);
  const [note, setNote] = useState<string>(initialNote ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options: Array<{
    value: ConsentValue;
    label: React.ReactNode;
    hint: string;
    icon: React.ComponentType<{ className?: string }>;
    ringCls: string;
  }> = [
    {
      value: "GRANTED",
      label: <>Розилик берилган<span className="lang-en"> · GRANTED</span></>,
      hint: t("Мижоз потенциал мижозлар билан боғланишга розилик берди.", "Client agreed to be contacted by prospects."),
      icon: CheckCircle2,
      ringCls: "border-success/30 bg-success/10 text-success ring-success/30",
    },
    {
      value: "DENIED",
      label: <>Розилик берилмаган<span className="lang-en"> · DENIED</span></>,
      hint: t("Мижоз рад этди. Экспортларга киритманг.", "Client declined. Don't include in exports."),
      icon: XCircle,
      ringCls: "border-destructive/30 bg-destructive/10 text-destructive ring-destructive/30",
    },
    {
      value: "NOT_ASKED",
      label: <>Сўралмаган<span className="lang-en"> · NOT_ASKED</span></>,
      hint: t("Стандарт — оператор ҳали сўрамаган.", "Default — operator hasn't asked yet."),
      icon: HelpCircle,
      ringCls: "border-muted-foreground/30 bg-muted/30 text-foreground ring-muted-foreground/40",
    },
  ];

  useEffect(() => {
    if (open) {
      setValue(initialValue);
      setNote(initialNote ?? "");
      setSubmitting(false);
      setError(null);
    }
  }, [open, initialValue, initialNote]);

  async function save() {
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        referenceConsent: value,
        consentNote: note.trim() ? note.trim() : null,
      });
      onClose();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Тавсиявий розилик", "Reference consent")}</DialogTitle>
          <DialogDescription>
            {t(
              "Бу мижоз контактлар экспорти натижаларида кўринишини бошқаради.",
              "Controls whether this client appears in contact-export results.",
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {options.map((opt) => {
            const Icon = opt.icon;
            const checked = value === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setValue(opt.value)}
                className={[
                  "w-full text-left rounded-md border p-3 transition-colors flex items-start gap-3",
                  checked ? `${opt.ringCls} ring-2` : "border-border hover:bg-muted/30",
                ].join(" ")}
              >
                <Icon
                  className={`h-5 w-5 mt-0.5 shrink-0 ${
                    checked ? "" : "text-muted-foreground"
                  }`}
                />
                <div>
                  <div className="font-semibold text-sm">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.hint}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs uppercase tracking-wider font-bold">
            Изоҳ<span className="lang-en"> · Note</span> ({t("ихтиёрий", "optional")})
          </Label>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t(
              "масалан: Душанба телефонда тасдиқланди · Тошкент ташрифи рухсат этилган",
              "e.g. Confirmed by phone on Mon · Tashkent visit allowed",
            )}
          />
        </div>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={submitting}>
            {t("Бекор қилиш", "Cancel")}
          </Button>
          <Button size="sm" onClick={save} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t("Сақлаш", "Save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
