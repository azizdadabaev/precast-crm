"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AddressInput } from "@/components/address/AddressInput";
import { ApiError, api } from "@/lib/fetcher";
import { useT } from "@/lib/i18n";

export interface EditableClient {
  id: string;
  name: string;
  phone: string;
  address: string | null;
}

interface Props {
  client: EditableClient;
  onClose: () => void;
}

/**
 * Corrects a client's contact details — the only place in the UI that
 * writes PATCH /api/clients/[id].
 *
 * Names are allowed to repeat (several real "Умиджон"s), so only the
 * phone can be rejected as a duplicate: it is the client's identity.
 * The dialog mounts fresh per client, so local state needs no reset
 * effect.
 */
export function EditClientDialog({ client, onClose }: Props) {
  const t = useT();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: client.name,
    phone: client.phone,
    address: client.address ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api(`/api/clients/${client.id}`, {
        method: "PATCH",
        json: {
          name: form.name.trim(),
          phone: form.phone.trim(),
          address: form.address.trim() || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["client", client.id] });
      onClose();
    },
    onError: (e: Error) => setError(duplicatePhoneMessage(e, t) ?? e.message),
  });

  const dirty =
    form.name.trim() !== client.name ||
    form.phone.trim() !== client.phone ||
    (form.address.trim() || null) !== (client.address ?? null);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Мижозни таҳрирлаш<span className="lang-en font-normal"> · Edit client</span>
          </DialogTitle>
          <DialogDescription>
            {t(
              "Ўзгаришлар мижоз картасида ва унинг барча буюртмаларида кўринади.",
              "Changes show on the client card and on all of their orders.",
            )}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            mutation.mutate();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label>{t("Исм *", "Name *")}</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("Телефон *", "Phone *")}</Label>
            <Input
              required
              inputMode="tel"
              className="tabular-nums"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <p className="text-[11px] text-muted-foreground">
              {t(
                "Телефон — мижознинг ягона белгиси. Бошқа мижозда бор рақамни ёзиб бўлмайди.",
                "The phone is the client's unique identity. A number another client already has cannot be reused.",
              )}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Манзил<span className="lang-en"> · Address</span></Label>
            <AddressInput
              value={form.address}
              onChange={(addr) => setForm({ ...form, address: addr })}
            />
          </div>
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 px-3 py-2 rounded-md">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              {t("Бекор қилиш", "Cancel")}
            </Button>
            <Button type="submit" disabled={mutation.isPending || !dirty}>
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {mutation.isPending ? t("Сақланмоқда…", "Saving…") : t("Сақлаш", "Save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A duplicate phone comes back as a 409 (Prisma's unique-constraint
 * violation on Client.phone, mapped in src/lib/api.ts). Translate it —
 * the raw text is an English database message no operator should read.
 * Returns null for anything else so the caller keeps the original.
 */
function duplicatePhoneMessage(
  err: Error,
  t: (uz: string, en: string) => string,
): string | null {
  const isConflict = err instanceof ApiError && err.status === 409;
  const looksLikePhoneUnique =
    /unique/i.test(err.message) && /phone/i.test(err.message);
  if (!isConflict && !looksLikePhoneUnique) return null;
  return t(
    "Бу телефон рақами бошқа мижозга тегишли. Рақамни текширинг ёки ўша мижоз картасини очинг.",
    "This phone number already belongs to another client. Check the number, or open that client's card.",
  );
}
