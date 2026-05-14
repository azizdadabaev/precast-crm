"use client";

// Address composer used wherever an operator types a customer address.
// Two linked Comboboxes (Province / City) on top, free-text street
// detail below. Calls `onChange` with the fully-composed string —
// `${city}, ${streetDetail}` — so the storage shape stays a plain
// string and no API or schema change is needed.
//
// Linking rules (see uzbekistan-cities.ts for the catalog):
//   - Selecting a province filters the city list to that province.
//     If the province has exactly one city → auto-select it.
//     If multiple → user picks (currently never the case; future-proof).
//   - Selecting a city auto-snaps the province dropdown.
//   - Clearing the province resets the city dropdown to "all cities".
//   - Clearing the city does NOT clear the province.
//
// Search is type-to-filter on both Latin and Cyrillic via cmdk's
// built-in matcher. Each item has a `value` that concatenates both
// names so a search for "Sam" or "Сам" both hit Самарқанд.

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
  getCitiesForProvince,
  getProvinceForCity,
  getProvinces,
  parseAddress,
  provinceHasMultipleCities,
} from "@/lib/uzbekistan-cities";

interface AddressInputProps {
  /** The composed address string (city + ", " + street detail). */
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
  // Parse the incoming value once, then own city/street locally so the
  // user can type into the street field without round-tripping every
  // keystroke through the parent's onChange (the parent still gets the
  // composed string on every change — just not via re-parsing).
  const initial = React.useMemo(() => parseAddress(value), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: only initial seed

  const [city, setCity] = React.useState<string>(initial.city);
  const [province, setProvince] = React.useState<string>(
    initial.city ? getProvinceForCity(initial.city) ?? "" : "",
  );
  const [streetDetail, setStreetDetail] = React.useState<string>(initial.streetDetail);

  // If the parent swaps the value out from under us (e.g. operator
  // selects a different matched client whose address loads), re-parse.
  // We compare against the composed shape to avoid stomping local
  // edits that haven't yet bubbled up.
  React.useEffect(() => {
    const composed = composeAddress(city, streetDetail);
    if (composed === value) return;
    const next = parseAddress(value);
    setCity(next.city);
    setProvince(next.city ? getProvinceForCity(next.city) ?? "" : "");
    setStreetDetail(next.streetDetail);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depends only on value
  }, [value]);

  const emit = (
    nextCity: string,
    nextStreet: string,
  ) => {
    onChange(composeAddress(nextCity, nextStreet));
  };

  const provinces = React.useMemo(() => getProvinces(), []);
  const cities = React.useMemo(
    () => getCitiesForProvince(province || null),
    [province],
  );

  function pickProvince(nextProvince: string) {
    setProvince(nextProvince);
    if (!nextProvince) {
      // Cleared the province → city dropdown reopens to "all cities".
      // We leave `city` as-is so the user doesn't lose their existing
      // pick if they're just exploring.
      return;
    }
    // Auto-select when there's exactly one city in this province.
    const list = getCitiesForProvince(nextProvince);
    if (!provinceHasMultipleCities(nextProvince) && list.length === 1) {
      const only = list[0].city;
      setCity(only);
      emit(only, streetDetail);
      return;
    }
    // Multiple cities in province → if the current city is no longer
    // in the filtered list, clear it so the user re-picks.
    if (city && !list.some((c) => c.city === city)) {
      setCity("");
      emit("", streetDetail);
    }
  }

  function pickCity(nextCity: string) {
    setCity(nextCity);
    if (nextCity) {
      const snapped = getProvinceForCity(nextCity);
      if (snapped) setProvince(snapped);
    }
    emit(nextCity, streetDetail);
  }

  function changeStreet(nextStreet: string) {
    setStreetDetail(nextStreet);
    emit(city, nextStreet);
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <ProvinceCombobox
          idPrefix={idPrefix}
          value={province}
          provinces={provinces}
          onChange={pickProvince}
        />
        <CityCombobox
          idPrefix={idPrefix}
          value={city}
          cities={cities}
          onChange={pickCity}
        />
      </div>
      <Input
        placeholder="Кўча, бино, хонадон · Street, building, apartment"
        value={streetDetail}
        onChange={(e) => changeStreet(e.target.value)}
        aria-label="Street, building, apartment"
      />
    </div>
  );
}

// ── Subcomponents ───────────────────────────────────────────────

interface ProvinceComboboxProps {
  idPrefix?: string;
  value: string;
  provinces: ReturnType<typeof getProvinces>;
  onChange: (next: string) => void;
}

function ProvinceCombobox({
  idPrefix,
  value,
  provinces,
  onChange,
}: ProvinceComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selected = provinces.find((p) => p.province === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={idPrefix ? `${idPrefix}-province` : undefined}
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
              {selected.provinceUz} · {selected.province}
            </span>
          ) : (
            <span className="text-muted-foreground">Вилоят · Province</span>
          )}
          <span className="flex items-center gap-1 shrink-0 text-muted-foreground">
            {selected && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Clear province"
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
            // cmdk lowercases both sides; we also need to treat
            // Cyrillic and Latin spellings as equal-class matches.
            // The Item's `value` already concatenates both names, so
            // a simple substring test does the right thing.
            if (!search) return 1;
            return itemValue.toLowerCase().includes(search.toLowerCase())
              ? 1
              : 0;
          }}
        >
          <CommandInput placeholder="Қидириш · Search" />
          <CommandList>
            <CommandEmpty>Топилмади · No match</CommandEmpty>
            <CommandGroup>
              {provinces.map((p) => (
                <CommandItem
                  key={p.province}
                  value={`${p.provinceUz} ${p.province}`}
                  onSelect={() => {
                    onChange(p.province);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === p.province ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span>
                    {p.provinceUz} · {p.province}
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

interface CityComboboxProps {
  idPrefix?: string;
  value: string;
  cities: ReturnType<typeof getCitiesForProvince>;
  onChange: (next: string) => void;
}

function CityCombobox({
  idPrefix,
  value,
  cities,
  onChange,
}: CityComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const selected = cities.find((c) => c.city === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          id={idPrefix ? `${idPrefix}-city` : undefined}
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
              {selected.cityUz} · {selected.city}
            </span>
          ) : (
            <span className="text-muted-foreground">Шаҳар · City</span>
          )}
          <span className="flex items-center gap-1 shrink-0 text-muted-foreground">
            {selected && (
              <span
                role="button"
                tabIndex={0}
                aria-label="Clear city"
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
            return itemValue.toLowerCase().includes(search.toLowerCase())
              ? 1
              : 0;
          }}
        >
          <CommandInput placeholder="Қидириш · Search" />
          <CommandList>
            <CommandEmpty>Топилмади · No match</CommandEmpty>
            <CommandGroup>
              {cities.map((c) => (
                <CommandItem
                  key={c.city}
                  value={`${c.cityUz} ${c.city}`}
                  onSelect={() => {
                    onChange(c.city);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === c.city ? "opacity-100" : "opacity-0",
                    )}
                  />
                  <span>
                    {c.cityUz} · {c.city}
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
