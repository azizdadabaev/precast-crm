// Uzbekistan city + province catalog used by the address input.
//
// Twelve entries — one per province — covering every city the CRM
// currently delivers to. The list is intentionally static (no DB
// table, no API call). When a new city needs to be added, edit this
// file and ship a build.
//
// Toshkent note: the city is its own administrative unit
// ("Toshkent shahri") separate from Toshkent viloyati (which contains
// surrounding districts). We do NOT carry a separate viloyati entry
// — operators serving a suburb pick the closest city manually.

export interface CityEntry {
  city: string;
  cityUz: string;
  province: string;
  provinceUz: string;
}

export const UZBEKISTAN_CITIES: readonly CityEntry[] = [
  { city: "Toshkent",  cityUz: "Тошкент",   province: "Toshkent shahri",  provinceUz: "Тошкент шаҳри"   },
  { city: "Samarqand", cityUz: "Самарқанд", province: "Samarqand",        provinceUz: "Самарқанд"       },
  { city: "Namangan",  cityUz: "Наманган",  province: "Namangan",         provinceUz: "Наманган"        },
  { city: "Andijon",   cityUz: "Андижон",   province: "Andijon",          provinceUz: "Андижон"         },
  { city: "Farg'ona",  cityUz: "Фарғона",   province: "Farg'ona",         provinceUz: "Фарғона"         },
  { city: "Qarshi",    cityUz: "Қарши",     province: "Qashqadaryo",      provinceUz: "Қашқадарё"       },
  { city: "Buxoro",    cityUz: "Бухоро",    province: "Buxoro",           provinceUz: "Бухоро"          },
  { city: "Nukus",     cityUz: "Нукус",     province: "Qoraqalpog'iston", provinceUz: "Қорақалпоғистон" },
  { city: "Urganch",   cityUz: "Урганч",    province: "Xorazm",           provinceUz: "Хоразм"          },
  { city: "Jizzax",    cityUz: "Жиззах",    province: "Jizzax",           provinceUz: "Жиззах"          },
  { city: "Navoiy",    cityUz: "Навоий",    province: "Navoiy",           provinceUz: "Навоий"          },
  { city: "Termiz",    cityUz: "Термиз",    province: "Surxondaryo",      provinceUz: "Сурхондарё"      },
] as const;

export interface ProvinceEntry {
  province: string;
  provinceUz: string;
}

/** Unique provinces, sorted alphabetically by Latin name. */
export function getProvinces(): ProvinceEntry[] {
  const map = new Map<string, ProvinceEntry>();
  for (const c of UZBEKISTAN_CITIES) {
    if (!map.has(c.province)) {
      map.set(c.province, { province: c.province, provinceUz: c.provinceUz });
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    a.province.localeCompare(b.province, "en"),
  );
}

/**
 * Cities for a given province (or every city when `province` is null
 * / empty). Sorted alphabetically by Latin name.
 */
export function getCitiesForProvince(
  province: string | null | undefined,
): CityEntry[] {
  const filtered = province
    ? UZBEKISTAN_CITIES.filter((c) => c.province === province)
    : [...UZBEKISTAN_CITIES];
  return filtered.slice().sort((a, b) => a.city.localeCompare(b.city, "en"));
}

/** Given a city name (Latin), return its province (Latin), or null. */
export function getProvinceForCity(city: string): string | null {
  const match = UZBEKISTAN_CITIES.find((c) => c.city === city);
  return match ? match.province : null;
}

/**
 * Future-proofing: when a province eventually carries more than one
 * city entry, the AddressInput will show the filtered list without
 * auto-selecting. Currently every province has exactly one city, so
 * this returns false for all entries — but the call site relies on
 * it instead of hardcoding the assumption.
 */
export function provinceHasMultipleCities(province: string): boolean {
  let count = 0;
  for (const c of UZBEKISTAN_CITIES) {
    if (c.province === province) {
      count++;
      if (count > 1) return true;
    }
  }
  return false;
}

/**
 * Parse a stored address string into { city, streetDetail }. The
 * convention used when writing is `${city}, ${streetDetail}`, so we
 * peel off everything up to the first ", " and check it against the
 * city catalog. If the prefix matches an entry's Latin OR Cyrillic
 * name, we treat it as the city; otherwise the entire string is the
 * street detail and city stays empty.
 *
 * We match on both spellings because old rows may have been typed
 * in either script. The returned `city` is always the Latin form
 * (which is what the AddressInput uses internally).
 */
export function parseAddress(address: string): {
  city: string;
  streetDetail: string;
} {
  if (!address) return { city: "", streetDetail: "" };

  const commaIdx = address.indexOf(",");
  if (commaIdx === -1) {
    // No comma — try matching the whole string as a city name (e.g. a
    // bare "Buxoro" with no street). Falls through to street-only on miss.
    const exact = UZBEKISTAN_CITIES.find(
      (c) => c.city === address.trim() || c.cityUz === address.trim(),
    );
    if (exact) return { city: exact.city, streetDetail: "" };
    return { city: "", streetDetail: address };
  }

  const prefix = address.slice(0, commaIdx).trim();
  const rest = address.slice(commaIdx + 1).trim();
  const match = UZBEKISTAN_CITIES.find(
    (c) => c.city === prefix || c.cityUz === prefix,
  );
  if (!match) {
    return { city: "", streetDetail: address };
  }
  return { city: match.city, streetDetail: rest };
}

/**
 * Compose the address string written to the DB. Mirrors parseAddress.
 * Empty street still produces a clean "Buxoro" (no trailing comma).
 */
export function composeAddress(city: string, streetDetail: string): string {
  const c = city.trim();
  const s = streetDetail.trim();
  if (!c) return s;
  if (!s) return c;
  return `${c}, ${s}`;
}

/** Lookup the bilingual label for a city (Latin name → "Cyrillic · Latin"). */
export function cityLabel(city: string): string {
  const match = UZBEKISTAN_CITIES.find((c) => c.city === city);
  return match ? `${match.cityUz} · ${match.city}` : city;
}

/** Lookup the bilingual label for a province (Latin name → "Cyrillic · Latin"). */
export function provinceLabel(province: string): string {
  const match = UZBEKISTAN_CITIES.find((c) => c.province === province);
  return match ? `${match.provinceUz} · ${match.province}` : province;
}
