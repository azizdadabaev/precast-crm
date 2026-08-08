import { describe, it, expect } from "vitest";
import {
  parseTableQuery,
  buildPageMeta,
  isPaginated,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from "./table-query";

const ALLOWED = ["name", "createdAt", "address"] as const;
const sp = (q: string) => new URLSearchParams(q);

describe("isPaginated", () => {
  it("is false when the caller never asked for a page (legacy array callers)", () => {
    expect(isPaginated(sp(""))).toBe(false);
    expect(isPaginated(sp("phone=998"))).toBe(false);
  });

  it("is true as soon as page is present, even page=1", () => {
    expect(isPaginated(sp("page=1"))).toBe(true);
  });
});

describe("parseTableQuery — paging", () => {
  it("defaults to page 1 at the default size", () => {
    const q = parseTableQuery(sp(""), { allowedSortFields: ALLOWED });
    expect(q.page).toBe(1);
    expect(q.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(q.skip).toBe(0);
  });

  it("computes skip from page and size", () => {
    const q = parseTableQuery(sp("page=3&pageSize=25"), { allowedSortFields: ALLOWED });
    expect(q.skip).toBe(50);
  });

  it("clamps junk and out-of-range paging instead of throwing", () => {
    for (const bad of ["page=0", "page=-4", "page=abc", "page="]) {
      expect(parseTableQuery(sp(bad), { allowedSortFields: ALLOWED }).page).toBe(1);
    }
    expect(
      parseTableQuery(sp(`pageSize=${MAX_PAGE_SIZE + 5000}`), { allowedSortFields: ALLOWED })
        .pageSize,
    ).toBe(MAX_PAGE_SIZE);
    expect(parseTableQuery(sp("pageSize=0"), { allowedSortFields: ALLOWED }).pageSize).toBe(
      DEFAULT_PAGE_SIZE,
    );
  });
});

describe("parseTableQuery — sorting (whitelist is the security boundary)", () => {
  it("accepts a whitelisted field", () => {
    const q = parseTableQuery(sp("sortBy=name&sortDir=asc"), { allowedSortFields: ALLOWED });
    expect(q.sortBy).toBe("name");
    expect(q.sortDir).toBe("asc");
  });

  it("rejects anything outside the whitelist, falling back to the default", () => {
    const q = parseTableQuery(sp("sortBy=passwordHash"), {
      allowedSortFields: ALLOWED,
      defaultSort: "createdAt",
    });
    expect(q.sortBy).toBe("createdAt");
  });

  it("never returns an unvalidated direction", () => {
    const q = parseTableQuery(sp("sortDir=; DROP TABLE"), { allowedSortFields: ALLOWED });
    expect(q.sortDir).toBe("desc");
  });

  it("honors an explicit default direction", () => {
    const q = parseTableQuery(sp(""), { allowedSortFields: ALLOWED, defaultDir: "asc" });
    expect(q.sortDir).toBe("asc");
  });
});

describe("buildPageMeta", () => {
  it("rounds partial pages up", () => {
    expect(buildPageMeta(214, 1, 50).pageCount).toBe(5);
    expect(buildPageMeta(200, 1, 50).pageCount).toBe(4);
  });

  it("reports one page when empty, so the UI reads 1 / 1", () => {
    expect(buildPageMeta(0, 1, 50).pageCount).toBe(1);
  });

  it("echoes the totals it was given", () => {
    expect(buildPageMeta(214, 2, 50)).toEqual({
      total: 214,
      page: 2,
      pageSize: 50,
      pageCount: 5,
    });
  });
});
