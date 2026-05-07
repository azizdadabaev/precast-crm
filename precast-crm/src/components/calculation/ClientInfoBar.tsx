"use client";

import { useEffect, useRef, useState } from "react";
import { Phone, User, MapPin, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/fetcher";
import { formatPhone } from "@/lib/phone";

export interface ClientDraft {
  name: string;
  phone: string;
  address: string;
}

interface MatchedClient {
  id: string;
  name: string;
  phone: string;
  address: string | null;
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
  const [suggestions, setSuggestions] = useState<MatchedClient[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

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
    onChange({ name: c.name, phone: formatPhone(c.phone), address: c.address ?? "" });
    onMatch(c.id);
    setShowSuggestions(false);
  }

  function clearMatch() {
    onMatch(null);
  }

  return (
    <div className="rounded-lg border bg-background p-3 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(180px,1fr)_minmax(200px,260px)_minmax(180px,1fr)] gap-3">
        {/* Name (Исм) */}
        <Field
          icon={<User className="h-4 w-4 text-muted-foreground" />}
          primary="Исм"
          secondary="Name"
          required
        >
          <input
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder="Mижоз исми"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
          />
        </Field>

        {/* Phone (Тел рақам) — primary identifier, with autocomplete */}
        <Field
          icon={<Phone className="h-4 w-4 text-muted-foreground" />}
          primary="Тел рақам"
          secondary="Phone"
          required
        >
          <div className="relative">
            <input
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

        {/* Address (Манзил) */}
        <Field
          icon={<MapPin className="h-4 w-4 text-muted-foreground" />}
          primary="Манзил"
          secondary="Address"
        >
          <input
            className="w-full h-9 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            placeholder="Tashkent · Yunusobod 12-7"
            value={value.address}
            onChange={(e) => onChange({ ...value, address: e.target.value })}
          />
        </Field>
      </div>

      {matchedClientId && (
        <div className="text-[11px] text-emerald-700 mt-2 flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3" />
          Existing client linked — name + address auto-filled.
          <button
            type="button"
            onClick={clearMatch}
            className="underline ml-1 hover:no-underline"
          >
            unlink
          </button>
        </div>
      )}
    </div>
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
        <span className="text-[10px] text-muted-foreground">· {secondary}</span>
      </div>
      {children}
    </div>
  );
}
