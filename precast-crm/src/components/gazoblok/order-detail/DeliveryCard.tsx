"use client";

import { useState, type ReactNode } from "react";
import { CalendarDays, Image as ImageIcon, Map as MapIcon, MapPin, StickyNote } from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { useT } from "@/lib/i18n";
import { NUM, SectionCard } from "@/components/gazoblok/order-form/ui";
import { DeliveryLocationCard } from "@/components/logistics/DeliveryLocationCard";
import { dotDate, dotDateTime, weekdayUz } from "@/lib/gazoblok-detail";
import { ICON } from "./ui";

type LocationValue = { lat: number | null; lng: number | null; url?: string | null; label?: string | null };

export function DeliveryCard({
  scheduledAt,
  address,
  notes,
  lat,
  lng,
  locationUrl,
  locationLabel,
  proofUrl,
  proofAt,
  canReschedule,
  canPin,
  onReschedule,
  onSaveLocation,
}: {
  scheduledAt: string | null;
  address: string | null;
  notes: string | null;
  lat: number | null;
  lng: number | null;
  locationUrl: string | null;
  locationLabel: string | null;
  proofUrl: string | null;
  proofAt: string | null;
  canReschedule: boolean;
  canPin: boolean;
  onReschedule: () => void;
  onSaveLocation: (v: LocationValue) => Promise<void>;
}) {
  const t = useT();
  const [mapOpen, setMapOpen] = useState(false);
  const [proofBroken, setProofBroken] = useState(false);
  const hasPin = lat !== null && lng !== null;
  const mapHref = locationUrl ?? (hasPin ? `https://www.google.com/maps?q=${lat},${lng}` : null);

  const change = (onClick: () => void, label = t("Ўзгартириш", "Change")) => (
    <button type="button" className="-my-3 min-h-[44px] px-1 text-xs font-medium text-primary hover:underline" onClick={onClick}>
      {label}
    </button>
  );

  return (
    <SectionCard id="sec-delivery" icon={<MapPin className="h-4 w-4" {...ICON} />} title={t("Етказиш", "Delivery")}>
      <div className="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
        <Field icon={<CalendarDays {...ICON} />} label={t("Сана", "Date")} action={canReschedule ? change(onReschedule) : null}>
          {scheduledAt ? (
            <>
              <b className={NUM}>{dotDate(scheduledAt)}</b>
              <span className="text-muted-foreground">, {weekdayUz(scheduledAt)}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{t("белгиланмаган", "not set")}</span>
          )}
        </Field>
        <Field icon={<MapPin {...ICON} />} label={t("Манзил", "Address")}>
          {address ? <span className="break-words">{address}</span> : <span className="text-muted-foreground">{t("кўрсатилмаган", "not given")}</span>}
        </Field>
        <Field
          icon={<MapIcon {...ICON} />}
          label={t("Харитада", "On the map")}
          action={canPin ? change(() => setMapOpen((v) => !v), mapOpen ? t("Ёпиш", "Close") : hasPin ? t("Ўзгартириш", "Change") : t("Белгилаш", "Set")) : null}
        >
          {hasPin ? (
            <>
              <span className={NUM}>
                {formatNumber(lat, 4)}, {formatNumber(lng, 4)}
              </span>
              {mapHref && (
                <>
                  {" · "}
                  <a href={mapHref} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                    {t("Харитада очиш", "Open the map")}
                  </a>
                </>
              )}
              {locationLabel && <div className="text-xs text-muted-foreground">{locationLabel}</div>}
            </>
          ) : (
            <span className="text-muted-foreground">{t("белгиланмаган", "not set")}</span>
          )}
        </Field>
        <Field icon={<StickyNote {...ICON} />} label={t("Изоҳ", "Note")}>
          {notes ? <span className="whitespace-pre-wrap break-words">{notes}</span> : <span className="text-muted-foreground">{t("йўқ", "none")}</span>}
        </Field>
        {proofUrl && (
          <Field icon={<ImageIcon {...ICON} />} label={t("Етказиш сурати", "Delivery photo")} className="md:col-span-2">
            <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 hover:underline">
              <span className="grid h-14 w-14 place-items-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground">
                {proofBroken ? (
                  <ImageIcon className="h-5 w-5" {...ICON} />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={proofUrl} alt={t("Етказиш сурати", "Delivery photo")} className="h-full w-full object-cover" onError={() => setProofBroken(true)} />
                )}
              </span>
              <span className="text-xs text-muted-foreground">
                {t("Ҳайдовчи юклади", "Uploaded by the driver")}
                {proofAt && (
                  <>
                    {" · "}
                    <span className={NUM}>{dotDateTime(proofAt)}</span>
                  </>
                )}
              </span>
            </a>
          </Field>
        )}
      </div>
      {canPin && mapOpen && (
        <div className="mt-4">
          <DeliveryLocationCard
            lat={lat}
            lng={lng}
            url={locationUrl}
            label={locationLabel}
            canEdit
            onSave={(v) => onSaveLocation(v)}
            onClear={() => onSaveLocation({ lat: null, lng: null })}
          />
        </div>
      )}
    </SectionCard>
  );
}

function Field({ icon, label, action, children, className }: { icon: ReactNode; label: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:text-muted-foreground">
          {icon}
          {label}
        </span>
        {action}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
