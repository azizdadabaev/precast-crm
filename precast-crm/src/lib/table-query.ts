// Shared server-side table paging + sorting contract.
//
// Used by the list routes that back sortable, paginated tables (/api/clients,
// /api/projects). Pure — no Prisma, no Next, no env — so the validation rules
// are exhaustively testable.
//
// BACKWARD COMPATIBILITY: a route should only switch to the paginated envelope
// when `isPaginated(searchParams)` is true. Callers that don't ask for a page
// (the phone autocomplete in ClientInfoBar, the full-list fetch in
// projects/[id]) keep receiving a bare array.
//
// SECURITY: `sortBy` is interpolated into a Prisma orderBy key, so it is
// validated against a per-route whitelist here and NEVER passed through raw.

export type SortDir = "asc" | "desc";

export interface TableQuery {
  page: number; // 1-based
  pageSize: number;
  sortBy: string | null; // guaranteed to be a member of allowedSortFields
  sortDir: SortDir;
  skip: number; // (page − 1) × pageSize — ready for Prisma
}

export interface PageMeta {
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}

export interface ParseTableQueryOptions {
  /** Whitelist. Anything outside it falls back to `defaultSort`. */
  allowedSortFields: readonly string[];
  defaultSort?: string | null;
  defaultDir?: SortDir;
  defaultPageSize?: number;
  maxPageSize?: number;
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;

/** True when the caller opted into the paginated envelope by sending `page`. */
export function isPaginated(sp: URLSearchParams): boolean {
  return sp.get("page") !== null;
}

/**
 * Parse + validate paging/sorting params.
 *
 * Every value is clamped rather than rejected: a table URL is user-editable, and
 * a nonsensical `?page=-4&sortBy=DROP` should render page 1 in the default order,
 * not a 500.
 */
export function parseTableQuery(
  sp: URLSearchParams,
  opts: ParseTableQueryOptions,
): TableQuery {
  const {
    allowedSortFields,
    defaultSort = null,
    defaultDir = "desc",
    defaultPageSize = DEFAULT_PAGE_SIZE,
    maxPageSize = MAX_PAGE_SIZE,
  } = opts;

  const rawPage = Number(sp.get("page"));
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const rawSize = Number(sp.get("pageSize"));
  const pageSize =
    Number.isFinite(rawSize) && rawSize >= 1
      ? Math.min(Math.floor(rawSize), maxPageSize)
      : defaultPageSize;

  const requestedSort = sp.get("sortBy");
  const sortBy =
    requestedSort && allowedSortFields.includes(requestedSort)
      ? requestedSort
      : defaultSort;

  const requestedDir = sp.get("sortDir");
  const sortDir: SortDir = requestedDir === "asc" || requestedDir === "desc"
    ? requestedDir
    : defaultDir;

  return { page, pageSize, sortBy, sortDir, skip: (page - 1) * pageSize };
}

/** Page count is at least 1 so an empty table still reads "1 / 1". */
export function buildPageMeta(
  total: number,
  page: number,
  pageSize: number,
): PageMeta {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  return { total, page, pageSize, pageCount };
}
