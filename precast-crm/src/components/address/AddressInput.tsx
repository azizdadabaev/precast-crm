"use client";

// Address composer used wherever an operator types a customer address.
// Two linked Comboboxes on top — Viloyat (14) → Tuman (203) — followed
// by a free-text street/building/apartment row. Calls `onChange` with
// the fully-composed string `${viloyat}, ${tuman}, ${street}` (or
// fewer parts if the operator skipped a dropdown).
//
// Mahallas / MFY / QFY are NOT in a dropdown — they're typed directly
// into the street field. The kenjebaev dataset has ~10K of them which
// would tank both the bundle and the operator's workflow.
//
// Linking rules (driven by helpers in @/lib/regions):
//   - Selecting a viloyat filters the tuman list to that viloyat;
//     if the current tuman no longer matches, it clears.
//   - Selecting a tuman auto-snaps the viloyat dropdown.
//   - Clearing the viloyat resets the tuman.
//   - Clearing the tuman keeps the viloyat.
//
// Search is type-to-filter on both Latin and Cyrillic via cmdk. Each
// item's `value` concatenates both spellings so a search for "Yun"
// or "Юн" both hit Yunusobod / Юнусобод.

import * as React from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  composeAddress,
  findTumanByName,
  findViloyatByName,
  getTumans,
  getViloyatForTuman,
  getViloyats,
  parseAddress,
  type Tuman,
  type Viloyat,
} from "@/lib/regions";

interface AddressInputProps {
  /** The composed address string. */
  value: string;
  /** Called whenever the composed address changes. */
  onChange: (next: string) => void;
  className?: string;
  /** Optional shared id prefix for accessible labelling by parent forms. */
  idPrefix?: string;
}

export function AddressInput({
  value,
  onChange,
  className,
  idPrefix,
}: AddressInputProps) {
  // Parse the incoming value once, then own each field locally so the
  // user can type into the street field without round-tripping every
  // keystroke through the parent's onChange.
  const initial = React.useMemo(() => parseAddress(value), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only initial seed

  const [viloyat, setViloyat] = React.useState<string>(initial.viloyat);
  const [tuman, setTuman] = React.useState<string>(initial.tuman);
  const [streetDetail, setStreetDetail] = React.useState<string>(initial.streetDetail);

  // If the parent swaps the value out from under us (e.g. operator
  // selects a different matched client), re-parse. We compare against
  // the composed shape to avoid clobbering local edits.
  React.useEffect(() => {
    const composed = composeAddress(viloyat, tuman, streetDetail);
    if (composed === value) return;
    const next = parseAddress(value);
    setViloyat(next.viloyat);
    setTuman(next.tuman);
    setStreetDetail(next.streetDetail);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depends only on value
  }, [value]);

  const emit = (nextViloyat: string, nextTuman: string, nextStreet: string) => {
    onChange(composeAddress(nextViloyat, nextTuman, nextStreet));
  };

  const viloyats = React.useMemo(() => getViloyats(), []);
  const selectedViloyat = React.useMemo(
    () => (viloyat ? findViloyatByName(viloyat) : null),
    [viloyat],
  );
  const tumans = React.useMemo(
    () => getTumans(selectedViloyat?.id ?? null),
    [selectedViloyat],
  );

  function pickViloyat(nextViloyat: string) {
    setViloyat(nextViloyat);
    if (!nextViloyat) {
      // Cleared → drop the tuman too (it's filtered against viloyat).
      setTuman("");
      emit("", "", streetDetail);
      return;
    }
    // If the current tuman doesn't belong to the new viloyat, clear it.
    const nextViloyatRow = findViloyatByName(nextViloyat);
    const currentTuman = tuman ? findTumanByName(tuman) : null;
    if (
      currentTuman &&
      nextViloyatRow &&
      currentTuman.viloyatId !== nextViloyatRow.id
    ) {
      setTuman("");
      emit(nextViloyat, "", streetDetail);
      return;
    }
    emit(nextViloyat, tuman, streetDetail);
  }

  function pickTuman(nextTuman: string) {
    setTuman(nextTuman);
    if (nextTuman) {
      const row = findTumanByName(nextTuman);
      if (row) {
        const parent = getViloyatForTuman(row.id);
        if (parent) {
          setViloyat(parent.name);
          emit(parent.name, nextTuman, streetDetail);
          return;
        }
      }
    }
    emit(viloyat, nextTuman, streetDetail);
  }

  function changeStreet(nextStreet: string) {
    setStreetDetail(nextStreet);
    emit(viloyat, tuman, nextStreet);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <ViloyatCombobox
          idPrefix={idPrefix}
          value={viloyat}
          viloyats={viloyats}
          onChange={pickViloyat}
        />
        <TumanCombobox
          idPrefix={idPrefix}
          value={tuman}
          tumans={tumans}
          disabled={false}
          onChange={pickTuman}
        />
      </div>
      <Input
        placeholder="Кўча, маҳалла, бино, хонадон · Street, mahalla, building, apartment"
        value={streetDetail}
        onChange={(e) => changeStreet(e.target.value)}
        aria-label="Street, mahalla, building, apartment"
      />
    </div>
  );
}

// ── Subcomponents ──────────────────────────────────────────────

interface ViloyatComboboxProps {
  idPrefix?: string;
  value: string;
  viloyats: Viloyat[];
  onChange: (next: string) => void;
}

function ViloyatCombobox({
  idPrefix,
  value,
  viloyats,
  onChange,
}: ViloyatComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selected = viloyats.find((v) => v.name === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={idPrefix ? `${idPrefix}-viloyat` : undefined}
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm",
            "focus:outline-none focus:ring-2 focus:ring-primary/40",
          )}
        >
          {selected ? (
            <span className="truncate">
              {selected.nameUz} · {selected.name}
            </span>
          ) : (
            <span className="text-muted-foreground">Вилоят · Region</span>
          )}
          <span className="flex items-center gap-1 shrink-0 text-muted-foreground">
            {selected && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Clear viloyat"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange("");
                  }
                }}
                className="hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command
          filter={(itemValue, search) => {
            if (!search) return 1;
            return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Қидириш · Search" />
          <CommandList>
            <CommandEmpty>Топилмади · No match</CommandEmpty>
            <CommandGroup>
              {viloyats.map((v) => (
                <CommandItem
                  key={v.id}
                  value={`${v.nameUz} ${v.name}`}
                  onSelect={() => {
                    onChange(v.name);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === v.name ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span>
                    {v.nameUz} · {v.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

interface TumanComboboxProps {
  idPrefix?: string;
  value: string;
  tumans: Tuman[];
  disabled: boolean;
  onChange: (next: string) => void;
}

function TumanCombobox({
  idPrefix,
  value,
  tumans,
  disabled,
  onChange,
}: TumanComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selected = tumans.find((t) => t.name === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={idPrefix ? `${idPrefix}-tuman` : undefined}
          type="button"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm",
            "focus:outline-none focus:ring-2 focus:ring-primary/40",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {selected ? (
            <span className="truncate">
              {selected.nameUz} · {selected.name}
            </span>
          ) : (
            <span className="text-muted-foreground">Туман · District</span>
          )}
          <span className="flex items-center gap-1 shrink-0 text-muted-foreground">
            {selected && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Clear tuman"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    onChange("");
                  }
                }}
                className="hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </span>
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command
          filter={(itemValue, search) => {
            if (!search) return 1;
            return itemValue.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
          }}
        >
          <CommandInput placeholder="Қидириш · Search" />
          <CommandList>
            <CommandEmpty>Топилмади · No match</CommandEmpty>
            <CommandGroup>
              {tumans.map((t) => (
                <CommandItem
                  key={t.id}
                  value={`${t.nameUz} ${t.name}`}
                  onSelect={() => {
                    onChange(t.name);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === t.name ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span>
                    {t.nameUz} · {t.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
