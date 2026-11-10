import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Guards the gazoblok screens against text that already leaked once:
// English event messages, Latin units, stripe borders and the old pending label.
const ROOTS = ["src/app/(app)/gazoblok", "src/components/gazoblok", "src/app/api/gazoblok"];

const BANNED = [
  "} m³",
  " mm<",
  "(dims in mm)",
  "Order placed for",
  "Payment of ",
  "auto-confirmed (recorder",
  "border-l-[3px]",
  "Тасдиқ кутилмоқда",
];

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? filesUnder(p) : /\.(tsx?|css)$/.test(name) ? [p] : [];
  });
}

describe("gazoblok UI text guard", () => {
  const files = ROOTS.flatMap((r) => filesUnder(path.resolve(process.cwd(), r)));

  it("finds the gazoblok source files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("no file contains a banned substring", () => {
    const hits = files.flatMap((f) => {
      const text = readFileSync(f, "utf8");
      return BANNED.filter((b) => text.includes(b)).map((b) => `${path.relative(process.cwd(), f)}: ${JSON.stringify(b)}`);
    });
    expect(hits).toEqual([]);
  });

  // JSX text written straight into markup must be Cyrillic; only units/brands stay Latin.
  it("no Latin-only JSX text in gazoblok screens", () => {
    const ALLOWED = new Set(["UZS", "Click", "Payme"]);
    const hits = files
      .filter((f) => f.endsWith(".tsx"))
      .flatMap((f) =>
        [...readFileSync(f, "utf8").matchAll(/(?<![=-])>\s*([A-Za-z][A-Za-z ,.'!?:-]{2,}?)\s*</g)]
          .map((m) => m[1].trim())
          .filter((s) => !ALLOWED.has(s))
          .map((s) => `${path.relative(process.cwd(), f)}: ${s}`),
      );
    expect(hits).toEqual([]);
  });

  // API errors reach the operator; they keep the "Ўзбекча · English" form.
  it("every literal API error carries an Uzbek part", () => {
    const hits = files
      .filter((f) => f.includes(`${path.sep}api${path.sep}`))
      .flatMap((f) =>
        [...readFileSync(f, "utf8").matchAll(/\b(?:fail|new Refused)\(\s*(?:\d+\s*,\s*)?(["`])([^"`]*)\1/g)]
          .filter((m) => !/[Ѐ-ӿ]/.test(m[2]))
          .map((m) => `${path.relative(process.cwd(), f)}: ${m[2]}`),
      );
    expect(hits).toEqual([]);
  });
});
