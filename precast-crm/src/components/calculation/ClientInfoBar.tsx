"use client";

import { useEffect, useRef, useState } from "react";
import {
  Phone,
  User,
  MapPin,
  CheckCircle2,
  ShieldCheck,
  Pencil,
} from "lucide-react";
import { api } from "@/lib/fetcher";
import { formatPhone } from "@/lib/phone";
import { useT } from "@/lib/i18n";
import { AddressInput } from "@/components/address/AddressInput";

export interface ClientDraft {
  name: string;
  phone: string;
  address: string;
  /**
   * `true` — operator confirmed during the call that the client is OK to
   * be shared with prospects via the contact-export feature. Sent to the
   * server as referenceConsent = GRANTED + a fresh consentUpdatedAt.
   * `false` — leave the client's existing consent untouched. Operators
   * use the client detail page to revoke or set DENIED.
   */
  consentGranted: boolean;
}

interface MatchedClient {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  referenceConsent: "NOT_ASKED" | "GRANTED" | "DENIED";
}

interface Props {
  value: ClientDraft;
  onChange: (next: ClientDraft) => void;
  /**
   * Set when the operator has linked an existing client (by clicking a
   * phone-autocomplete suggestion). Cleared on phone-edit.
   */
  matchedClientId: string | null;
  onMatch: (clientId: string | null) => void;
}

/**
 * The strip at the top of the Calculations page that captures the customer's
 * Name / Phone / Address during the call. Phone has live autocomplete so the
 * operator can pick an existing client instead of creating a duplicate.
 */
export function ClientInfoBar({ value, onChange, matchedClientId, onMatch }: Props) {
  const t = useT();
  const [suggestions, setSuggestions] = useState<MatchedClient[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // ── Mobile-only collapse state machine ──
  // The whole card collapses to a one-line summary on phone/tablet
  // once Name + Phone are filled and the operator taps anywhere
  // outside the card. Tap the collapsed strip (or its Edit button)
  // to expand again. Clearing Name or Phone force-expands.
  // Has no effect on desktop — `lg:!block` reveals the form
  // unconditionally at ≥1024 px.
  const [isExpanded, setIsExpanded] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);
  const canCollapse =
    value.name.trim().length > 0 && value.phone.trim().length > 0;

  useEffect(() => {
    function onPointerDown(e: MouseEvent | TouchEvent) {
      if (!isExpanded || !canCollapse) return;
      const node = cardRef.current;
      if (!node) return;
      if (!node.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [isExpanded, canCollapse]);

  // Force-expand the moment Name or Phone clears.
  useEffect(() => {
    if (!canCollapse && !isExpanded) {
      setIsExpanded(true);
    }
  }, [canCollapse, isExpanded]);

  // Debounced phone autocomplete
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (matchedClientId) return; // already matched — don't suggest
    const phone = value.phone.replace(/\D+/g, "");
    if (phone.length < 3) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api<MatchedClient[]>(
          `/api/clients?phone=${encodeURIComponent(value.phone)}`,
        );
        setSuggestions(res.slice(0, 5));
      } catch {
        setSuggestions([]);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value.phone, matchedClientId]);

  function pick(c: MatchedClient) {
    onChange({
      name: c.name,
      phone: formatPhone(c.phone),
      address: c.address ?? "",
      // Pre-populate the consent toggle from the matched client so the
      // operator sees the current state. Unchecking is a no-op on the
      // server (it never downgrades), so this is purely informational.
      consentGranted: c.referenceConsent === "GRANTED",
    });
    onMatch(c.id);
    setShowSuggestions(false);
  }

  function clearMatch() {
    onMatch(null);
  }

  // Mobile collapsed state: render only the summary strip.
  // Desktop: the surrounding `lg:!block` on the form wrapper forces
  // it visible regardless of `isExpanded`, so we never hit this path
  // at ≥lg.
  const showCollapsed = !isExpanded && canCollapse;

  return (
    <div
      ref={cardRef}
      className="rounded-lg border border-border bg-card shadow-sm"
    >
      {showCollapsed && (
        <CollapsedSummary
          client={value}
          onEdit={() => setIsExpanded(true)}
        />
      )}

      <div
        className={`p-3 ${showCollapsed ? "hidden lg:!block" : "block"}`}
      >
      {/* Three-column grid on lg+. Name and Phone shrunk ~35% from the
          prior layout so Address gets the freed width — operators
          spend more time picking viloyat/tuman than typing client
          names, and the dropdowns were running out of horizontal room.
          Below lg the row breaks into a vertical stack. */}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(120px,0.65fr)_minmax(130px,170px)_minmax(700px,2.5fr)] gap-3">
        {/* Name (Исм) */}
        <Field
          icon={<User className="h-4 w-4 text-muted-foreground" />}
          primary="Исм"
          secondary="Name"
          required
        >
          <input
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder={t("Мижоз исми", "Client name")}
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
        </Field>

        {/* Phone + Address share a row on mobile (2-col grid). The
            outer `lg:contents` flattens this wrapper at ≥lg so Phone
            and Address slot directly into the 3-col desktop layout
            (cols 2 and 3) — no visual change on desktop. */}
        <div className="grid grid-cols-2 gap-3 lg:contents">
        {/* Phone (Тел рақам) — primary identifier, with autocomplete */}
        <Field
          icon={<Phone className="h-4 w-4 text-muted-foreground" />}
          primary="Тел рақам"
          secondary="Phone"
          required
        >
          <div className="relative">
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              className="w-full h-9 rounded-md border border-input bg-background px-2 pr-7 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 tabular-nums"
              placeholder="+998 90 ___ __ __"
              value={value.phone}
              onChange={(e) => {
                onChange({ ...value, phone: e.target.value });
                if (matchedClientId) clearMatch();
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            />
            {matchedClientId && (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 absolute right-2 top-1/2 -translate-y-1/2" />
            )}
            {showSuggestions && suggestions.length > 0 && !matchedClientId && (
              <div className="absolute top-full left-0 right-0 mt-1 z-20 rounded-md border bg-background shadow-lg max-h-64 overflow-y-auto">
                {suggestions.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="block w-full text-left px-3 py-2 text-sm hover:bg-muted/50 border-b last:border-b-0"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => pick(s)}
                  >
                    <div className="font-medium">{s.name}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {formatPhone(s.phone)}
                      {s.address && <span className="ml-1.5">· {s.address}</span>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Field>

        {/* Address (Манзил) — required for Place Order. Two linked
            Comboboxes (Province → City) compose the prefix; the street
            input below holds the rest. Bubbles up the same flat string
            ("City, street") this row used to write directly. */}
        <Field
          icon={<MapPin className="h-4 w-4 text-muted-foreground" />}
          primary="Манзил"
          secondary="Address"
          required
        >
          <AddressInput
            value={value.address}
            onChange={(addr) => onChange({ ...value, address: addr })}
          />
        </Field>
        </div>{/* close mobile Phone+Address wrapper (lg:contents on desktop) */}
      </div>

      {/* Reference-consent checkbox — checked = "operator confirmed the
          client is OK to share with future prospects". Unchecked never
          downgrades an existing client's consent; that's a detail-page
          action. */}
      <label className="mt-3 flex items-center gap-2 cursor-pointer select-none w-fit">
        <input
          type="checkbox"
          className="h-4 w-4 accent-primary cursor-pointer"
          checked={value.consentGranted}
          onChange={(e) => onChange({ ...value, consentGranted: e.target.checked })}
        />
        <ShieldCheck
          className={`h-4 w-4 ${value.consentGranted ? "text-emerald-600" : "text-muted-foreground"}`}
        />
        <span className="text-[12px]">
          <span className="font-semibold">Розилик берди</span>
          <span className="lang-en text-muted-foreground"> · Client agrees to share contact with future prospects</span>
        </span>
      </label>

      {matchedClientId && (
        <div className="text-[11px] text-success mt-2 flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3" />
          {t(
            "Мавжуд мижоз боғланди — исм + манзил автоматик тўлдирилди.",
            "Existing client linked — name + address auto-filled.",
          )}
          <button
            type="button"
            onClick={clearMatch}
            className="underline ml-1 hover:no-underline"
          >
            {t("узиш", "unlink")}
          </button>
        </div>
      )}
      </div>{/* close form wrapper (hidden when mobile-collapsed) */}
    </div>
  );
}

/**
 * One-line summary rendered in place of the full form when the
 * operator has Name + Phone filled and tapped outside on mobile.
 * Visible only at <lg — desktop never sees it because the form
 * wrapper has `lg:!block` overriding `hidden`.
 */
function CollapsedSummary({
  client,
  onEdit,
}: {
  client: ClientDraft;
  onEdit: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEdit}
      aria-label="Edit client info"
      className="lg:hidden w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-accent/50 transition-colors"
    >
      <div className="truncate text-sm flex-1 min-w-0">
        <User className="h-3.5 w-3.5 inline-block text-muted-foreground mr-1 align-text-bottom" />
        <span className="font-medium">{client.name}</span>
        <span className="text-muted-foreground"> · </span>
        <Phone className="h-3.5 w-3.5 inline-block text-muted-foreground mr-1 align-text-bottom" />
        <span className="tabular-nums">{client.phone}</span>
        {client.address && (
          <>
            <span className="text-muted-foreground"> · </span>
            <MapPin className="h-3.5 w-3.5 inline-block text-muted-foreground mr-1 align-text-bottom" />
            <span>{client.address}</span>
          </>
        )}
      </div>
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0 min-h-11 min-w-11 justify-center">
        <Pencil className="h-3.5 w-3.5" />
        <span>Таҳрирлаш<span className="lang-en"> · Edit</span></span>
      </span>
    </button>
  );
}

function Field({
  icon,
  primary,
  secondary,
  required,
  children,
}: {
  icon: React.ReactNode;
  primary: string;
  secondary: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-wider">
          {primary}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </span>
        <span className="lang-en text-[10px] text-muted-foreground">· {secondary}</span>
      </div>
      {children}
    </div>
  );
}
