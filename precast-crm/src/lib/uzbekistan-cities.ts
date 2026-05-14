// Uzbekistan city + province catalog used by the address input.
//
// Fourteen entries — one capital city per administrative subdivision —
// covering every region the CRM currently delivers to. The list is
// intentionally static (no DB table, no API call). When a new city
// needs to be added, edit this file and ship a build.
//
// Canonical Latin province names match kenjebaev/regions on GitHub
// (the reference dataset for Uzbek administrative divisions): the
// "viloyati" suffix is present on the 12 provinces, "Respublikasi"
// on Qoraqalpog'iston, "shahri" on Toshkent. We keep our own
// transliteration for one entry: Surxondaryo (vs. kenjebaev's
// Surxandaryo) — both are accepted spellings in Uzbek-Latin.
//
// Toshkent special case: the city ("Toshkent shahri") and the
// surrounding region ("Toshkent viloyati") are separate administrative
// units. Operators serving the capital pick Toshkent shahri / Toshkent;
// operators serving towns around it pick Toshkent viloyati / Nurafshon
// (the viloyat's modern administrative center).

export interface CityEntry {
  city: string;
  cityUz: string;
  province: string;
  provinceUz: string;
}

export const UZBEKISTAN_CITIES: readonly CityEntry[] = [
  { city: "Toshkent",  cityUz: "Тошкент",   province: "Toshkent shahri",            provinceUz: "Тошкент шаҳри"            },
  { city: "Nurafshon", cityUz: "Нурафшон",  province: "Toshkent viloyati",          provinceUz: "Тошкент вилояти"          },
  { city: "Samarqand", cityUz: "Самарқанд", province: "Samarqand viloyati",         provinceUz: "Самарқанд вилояти"        },
  { city: "Namangan",  cityUz: "Наманган",  province: "Namangan viloyati",          provinceUz: "Наманган вилояти"         },
  { city: "Andijon",   cityUz: "Андижон",   province: "Andijon viloyati",           provinceUz: "Андижон вилояти"          },
  { city: "Farg'ona",  cityUz: "Фарғона",   province: "Farg'ona viloyati",          provinceUz: "Фарғона вилояти"          },
  { city: "Qarshi",    cityUz: "Қарши",     province: "Qashqadaryo viloyati",       provinceUz: "Қашқадарё вилояти"        },
  { city: "Buxoro",    cityUz: "Бухоро",    province: "Buxoro viloyati",            provinceUz: "Бухоро вилояти"           },
  { city: "Nukus",     cityUz: "Нукус",     province: "Qoraqalpog'iston Respublikasi", provinceUz: "Қорақалпоғистон Республикаси" },
  { city: "Urganch",   cityUz: "Урганч",    province: "Xorazm viloyati",            provinceUz: "Хоразм вилояти"           },
  { city: "Jizzax",    cityUz: "Жиззах",    province: "Jizzax viloyati",            provinceUz: "Жиззах вилояти"           },
  { city: "Guliston",  cityUz: "Гулистон",  province: "Sirdaryo viloyati",          provinceUz: "Сирдарё вилояти"          },
  { city: "Navoiy",    cityUz: "Навоий",    province: "Navoiy viloyati",            provinceUz: "Навоий вилояти"           },
  { city: "Termiz",    cityUz: "Термиз",    province: "Surxondaryo viloyati",       provinceUz: "Сурхондарё вилояти"       },
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
