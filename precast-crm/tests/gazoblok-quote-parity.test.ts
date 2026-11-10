import { describe, it, expect } from "vitest";
import { estimateProject, estimateSingleWall } from "@/services/gazoblok-engine";
import { buildGazoblokQuote as agentQuote } from "@/lib/agent/gazoblok-quote";
import { buildGazoblokQuote as mcpQuote } from "@/lib/mcp/quote/gazoblok";
import { GazoblokUploadUrl } from "@/lib/gazoblok-validation";

const block = { id: "p1", label: "600×300×200", lengthM: 0.6, heightM: 0.3, thicknessM: 0.2, pricePerBlock: 18000, active: true };

/** What the CRM wall calculator gives for one wall of `area` m² (default joint, standard orientation). */
function crmBlocks(area: number, wastePct = 5) {
  return estimateProject(
    [{ id: "w", lengthM: area, heightM: 1, productId: "p1", openings: [], orientation: "STANDARD" }],
    new Map([["p1", block]]),
    { wastePct },
  ).totalBlocks;
}

describe("one quote rule — CRM calculator, AI agent and MCP agree", () => {
  it.each([30, 100.2])("estimateSingleWall equals the CRM calculator for %s m²", (area) => {
    expect(estimateSingleWall(block, { lengthM: area, heightM: 1, wastePct: 5 }).blocksNeeded).toBe(crmBlocks(area));
  });

  it("openings are subtracted the same way", () => {
    const withOpening = estimateSingleWall(block, { lengthM: 10, heightM: 3, openingsM2: 4, wastePct: 5 }).blocksNeeded;
    expect(withOpening).toBe(crmBlocks(26));
  });

  it.each([30, 100.2])("the AI agent quotes the CRM count for %s m²", (area) => {
    const q = agentQuote(block, { wall: { lengthM: area, heightM: 1, wastePct: 5 } }, { secret: "s", issuedAt: 0 });
    expect(q.payload.quantity).toBe(crmBlocks(area));
  });

  it.each([30, 100.2])("the MCP quote uses the CRM count for %s m²", (area) => {
    const q = mcpQuote({ size: "600×300×200", wall_area_m2: area }, [{ ...block, stockQuantity: null }]);
    expect(q.blocks).toBe(crmBlocks(area));
  });

  it("quotes no longer promise free delivery — operators agree it", () => {
    const q = mcpQuote({ size: "600×300×200", quantity_blocks: 10, district: "Yangiqo'rg'on" }, [{ ...block, stockQuantity: null }]);
    expect(q.delivery_included).toBeNull();
    expect(q.delivery_note.toLowerCase()).not.toMatch(/bepul|free|бесплат/);
  });

  it("receipt URLs cannot climb out of the gazoblok folder", () => {
    expect(GazoblokUploadUrl.safeParse("/uploads/receipts/gazoblok/../../inbox/x.jpg").success).toBe(false);
  });
});
