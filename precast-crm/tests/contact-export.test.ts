import { describe, it, expect } from "vitest";
import { formatContactsForExport } from "../src/lib/contact-export";

describe("formatContactsForExport — pure formatter", () => {
  it("returns empty string for 0 clients", () => {
    expect(formatContactsForExport([])).toBe("");
  });

  it("renders 1 client as a single block, no trailing blank line", () => {
    const out = formatContactsForExport([
      {
        name: "Aliyev Construction",
        phone: "998901112233",
        address: "Tashkent, Yashnobod district",
      },
    ]);
    expect(out).toBe(
      "Aliyev Construction\n+998 90 111 22 33\nTashkent, Yashnobod district",
    );
    expect(out.endsWith("\n")).toBe(false);
  });

  it("separates 3 clients with exactly one blank line between blocks", () => {
    const out = formatContactsForExport([
      { name: "A", phone: "998901112233", address: "Addr 1" },
      { name: "B", phone: "998935554466", address: "Addr 2" },
      { name: "C", phone: "998771234567", address: "Addr 3" },
    ]);
    // Exactly one blank line ("\n\n") between each block; no trailing blank line.
    expect(out.split(/\n\n/).length).toBe(3);
    // No occurrence of three or more consecutive newlines anywhere.
    expect(/\n{3,}/.test(out)).toBe(false);
    // No trailing whitespace.
    expect(/\s+$/.test(out)).toBe(false);
  });

  it("formats every phone with the +998 XX XXX XX XX pattern", () => {
    // DB-stored phones are always normalized (12 digits, starts with 998).
    // The export formatter just applies the display mask — normalization
    // already happened at write-time in the API layer.
    const out = formatContactsForExport([
      { name: "A", phone: "998901112233", address: "x" },
      { name: "B", phone: "998935554466", address: "x" },
      { name: "C", phone: "998771234567", address: "x" },
    ]);
    const phoneLines = out.split("\n").filter((l) => l.startsWith("+998"));
    expect(phoneLines).toHaveLength(3);
    for (const line of phoneLines) {
      expect(line).toMatch(/^\+998 \d{2} \d{3} \d{2} \d{2}$/);
    }
  });

  it("substitutes \"(address not on file)\" for missing addresses", () => {
    const out = formatContactsForExport([
      { name: "Has address", phone: "998901112233", address: "Tashkent" },
      { name: "No address",  phone: "998935554466", address: null },
      { name: "Empty addr",  phone: "998771234567", address: "" },
      { name: "Whitespace",  phone: "998909876543", address: "   " },
    ]);
    const lines = out.split("\n");
    // Block 1's third line is the real address; blocks 2/3/4 use the placeholder.
    expect(lines).toContain("Tashkent");
    expect(lines.filter((l) => l === "(address not on file)")).toHaveLength(3);
  });

  it("preserves whitespace WITHIN names and addresses, only trimming end-of-block", () => {
    const out = formatContactsForExport([
      {
        name: "Spacey   Name",
        phone: "998901112233",
        // Trailing spaces on this line should be stripped, but the
        // double-space between "12" and "blok" should survive.
        address: "Tashkent · Yunusobod 12  blok 7   ",
      },
    ]);
    const lines = out.split("\n");
    expect(lines[0]).toBe("Spacey   Name");
    expect(lines[2]).toBe("Tashkent · Yunusobod 12  blok 7"); // trailing spaces trimmed
  });

  it("snapshot of the format the spec promises (3 clients, mixed addresses)", () => {
    const out = formatContactsForExport([
      {
        name: "Aliyev Construction",
        phone: "998901112233",
        address: "Tashkent, Yashnobod district",
      },
      {
        name: "Karimov LLC",
        phone: "998935554466",
        address: "Samarkand, Registan st. 12",
      },
      {
        name: "BuildPro Group",
        phone: "998771234567",
        address: null,
      },
    ]);
    expect(out).toBe(
      [
        "Aliyev Construction",
        "+998 90 111 22 33",
        "Tashkent, Yashnobod district",
        "",
        "Karimov LLC",
        "+998 93 555 44 66",
        "Samarkand, Registan st. 12",
        "",
        "BuildPro Group",
        "+998 77 123 45 67",
        "(address not on file)",
      ].join("\n"),
    );
  });
});
