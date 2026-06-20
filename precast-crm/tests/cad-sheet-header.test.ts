import { describe, it, expect } from "vitest";
import { buildHeaderBand, HEADER_H_MM } from "@/lib/cad/sheet/sheet-header";
import { DEFAULT_SHEET_OPTIONS } from "@/lib/cad/sheet/sheet-scale";

describe("buildHeaderBand (Phase 5)", () => {
  const opts = DEFAULT_SHEET_OPTIONS;
  const primitives = buildHeaderBand(opts);

  it("emits a text containing the company name", () => {
    const nameText = primitives.find(
      (p) => p.type === "text" && p.text.includes("EtalonSlabs"),
    );
    expect(nameText).toBeTruthy();
  });

  it("emits a text containing the phone number", () => {
    const phoneText = primitives.find(
      (p) => p.type === "text" && p.text.includes("+998934813330"),
    );
    expect(phoneText).toBeTruthy();
  });

  it("all primitives are within the page width", () => {
    const pageW = opts.page.wMm;
    for (const p of primitives) {
      if (p.type === "text") {
        expect(p.xMm).toBeGreaterThanOrEqual(0);
        expect(p.xMm).toBeLessThanOrEqual(pageW + 1e-6);
      } else if (p.type === "line") {
        expect(p.x1Mm).toBeGreaterThanOrEqual(0);
        expect(p.x2Mm).toBeLessThanOrEqual(pageW + 1e-6);
      }
    }
  });

  it("all primitives are within the top HEADER_H_MM band", () => {
    const bandTop = opts.marginMm;
    const bandBottom = opts.marginMm + HEADER_H_MM;
    for (const p of primitives) {
      if (p.type === "text") {
        expect(p.yMm).toBeGreaterThanOrEqual(bandTop - 1e-6);
        expect(p.yMm).toBeLessThanOrEqual(bandBottom + 1e-6);
      } else if (p.type === "line") {
        expect(p.y1Mm).toBeGreaterThanOrEqual(bandTop - 1e-6);
        expect(p.y1Mm).toBeLessThanOrEqual(bandBottom + 1e-6);
        expect(p.y2Mm).toBeGreaterThanOrEqual(bandTop - 1e-6);
        expect(p.y2Mm).toBeLessThanOrEqual(bandBottom + 1e-6);
      }
    }
  });

  it("emits the bottom-divider line", () => {
    const divider = primitives.find((p) => p.type === "line" && p.role === "header");
    expect(divider).toBeTruthy();
  });
});
