import { describe, it, expect, vi } from "vitest";
import { extractDimensionsFromText } from "@/lib/agent/extract-dimensions-text";
import type { LlmProvider, GenerateResult, GenerateRequest } from "@/lib/agent/llm/provider";

// A fake provider that returns whatever JSON we hand it, ignoring the request.
function fakeProvider(json: string): LlmProvider {
  return {
    model: { provider: "google" } as LlmProvider["model"],
    generate: vi.fn(
      async (): Promise<GenerateResult> => ({
        text: json,
        toolCalls: [],
        usage: { inputTokens: 50, outputTokens: 80 },
      }),
    ),
  };
}

const SAMPLE =
  `Уз 8.10 × эни 4.90 зал\nУз 5.20× эни 3.10 спальник\nУз 4.30 × эни 1.70\nКаридор`;

describe("extractDimensionsFromText", () => {
  it("maps эни→widthM, Уз→lengthM and returns one room per entry", async () => {
    // What a correct model returns for SAMPLE: 3 rooms, room 3's label is on the next line.
    const modelJson = JSON.stringify({
      found: true,
      isConstructionImage: true,
      confidence: "high",
      rooms: [
        { widthM: 4.9, lengthM: 8.1, label: "зал" },
        { widthM: 3.1, lengthM: 5.2, label: "спальник" },
        { widthM: 1.7, lengthM: 4.3, label: "Каридор" },
      ],
    });
    const { dims, usage } = await extractDimensionsFromText(SAMPLE, fakeProvider(modelJson));
    expect(dims.found).toBe(true);
    expect(dims.confidence).toBe("high");
    expect(dims.rooms).toHaveLength(3);
    expect(dims.rooms[0]).toEqual({ widthM: 4.9, lengthM: 8.1, label: "зал" });
    expect(dims.rooms[2].label).toBe("Каридор");
    expect(usage?.outputTokens).toBe(80);
  });

  it("degrades malformed model output to not-found (no throw)", async () => {
    const { dims } = await extractDimensionsFromText("nonsense", fakeProvider("not json at all"));
    expect(dims.found).toBe(false);
    expect(dims.rooms).toHaveLength(0);
  });

  it("drops rooms missing a dimension", async () => {
    const modelJson = JSON.stringify({
      found: true,
      isConstructionImage: true,
      confidence: "high",
      rooms: [{ widthM: 4.9, lengthM: 8.1 }, { widthM: 3.1 }],
    });
    const { dims } = await extractDimensionsFromText("x", fakeProvider(modelJson));
    expect(dims.rooms).toHaveLength(1);
  });

  // Regression: gemini-3.1-pro is a thinking model — a 1024 cap let reasoning
  // exhaust the output budget before the JSON, truncating it to unparseable.
  it("asks for a generous token budget (thinking models burn output on reasoning)", async () => {
    const gen = vi.fn(
      async (_req: GenerateRequest): Promise<GenerateResult> => ({ text: "{}", toolCalls: [], usage: {} }),
    );
    const provider: LlmProvider = { model: { provider: "google" } as LlmProvider["model"], generate: gen };
    await extractDimensionsFromText("x", provider);
    const req = gen.mock.calls[0][0];
    expect(req.maxTokens ?? 0).toBeGreaterThanOrEqual(4096);
  });

  // Regression: the model sometimes wraps the JSON in prose / a code fence /
  // a thinking preamble; we must still recover the JSON object.
  it("recovers JSON wrapped in prose or a code fence", async () => {
    const body = {
      found: true,
      isConstructionImage: true,
      confidence: "high",
      rooms: [
        { widthM: 4.9, lengthM: 8.1, label: "зал" },
        { widthM: 3.1, lengthM: 5.2, label: "спальник" },
      ],
    };
    const wrapped = "Here are the rooms I read:\n```json\n" + JSON.stringify(body) + "\n```\nLet me know if anything is off.";
    const { dims } = await extractDimensionsFromText("x", fakeProvider(wrapped));
    expect(dims.found).toBe(true);
    expect(dims.rooms).toHaveLength(2);
    expect(dims.rooms[0].label).toBe("зал");
  });

  it("recovers JSON after a thinking-style preamble", async () => {
    const body = { found: true, isConstructionImage: true, confidence: "high", rooms: [{ widthM: 3, lengthM: 4 }] };
    const { dims } = await extractDimensionsFromText(
      "x",
      fakeProvider("Let me analyze the room list step by step.\n" + JSON.stringify(body)),
    );
    expect(dims.found).toBe(true);
    expect(dims.rooms).toHaveLength(1);
  });
});
