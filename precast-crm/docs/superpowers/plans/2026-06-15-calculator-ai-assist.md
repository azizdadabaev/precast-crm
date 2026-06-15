# Calculator AI Assist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let permission-granted internal users fill the calculator's room table from pasted text or a room/floor-plan image, reusing the existing AI vision reader and conversation model — the AI only produces `{ width, length, name }` rooms; the calculator prices them.

**Architecture:** A new thin endpoint `POST /api/calculations/ai-extract` runs text through the owner-selected conversation model (structured JSON) and images through the existing `extractDimensions()` vision provider, returning the same `ExtractedDimensions` shape for both. The browser maps those rooms to `SlabRow`s and appends them to the table; the existing engine prices them. A new opt-in `calculator.aiAssist` permission gates both the route and the UI.

**Tech Stack:** Next.js 14 App Router · TypeScript · Zod · Prisma · React Query · existing agent LLM providers (`@/lib/agent/llm/*`) · vitest.

---

## File Structure

| File | New/Modify | Responsibility |
|------|-----------|----------------|
| `src/lib/permissions.ts` | Modify | Register `calculator.aiAssist` (ACTIONS, group, label) |
| `src/lib/agent/extract-dimensions-text.ts` | Create | Pure text→`ExtractedDimensions` via an injected `LlmProvider` |
| `src/components/calculation/ai-rooms.ts` | Create | Pure `ExtractedRoom[]` → `SlabRow[]` mapping |
| `src/app/api/calculations/ai-extract/route.ts` | Create | The gated endpoint (text + image), rate-limited |
| `src/components/calculation/AiAssistBox.tsx` | Create | The on-page UI (textarea + image pick), permission-gated |
| `src/app/(app)/calculations/page.tsx` | Modify | Mount `AiAssistBox`, append parsed rooms to the store |
| `tests/permissions-ai-assist.test.ts` | Create | Permission is registered |
| `tests/extract-dimensions-text.test.ts` | Create | Text extractor parses the example input |
| `tests/ai-rooms.test.ts` | Create | Room→SlabRow mapping |
| `tests/ai-extract-route.test.ts` | Create | Request body schema validation |

**Working directory for all commands:** `c:/Users/aziz/Downloads/precast-crm/precast-crm/precast-crm`

---

## Task 1: Register the `calculator.aiAssist` permission

**Files:**
- Modify: `src/lib/permissions.ts`
- Test: `tests/permissions-ai-assist.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/permissions-ai-assist.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ACTIONS, ACTION_LABELS, PERMISSION_GROUPS } from "@/lib/permissions";

describe("calculator.aiAssist permission", () => {
  it("is registered in ACTIONS", () => {
    expect(ACTIONS).toContain("calculator.aiAssist");
  });

  it("has a bilingual label", () => {
    expect(ACTION_LABELS["calculator.aiAssist"]).toMatch(/·/);
  });

  it("sits in the calculator permission group", () => {
    const group = PERMISSION_GROUPS.find((g) => g.key === "calculator");
    expect(group?.actions).toContain("calculator.aiAssist");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/permissions-ai-assist.test.ts`
Expected: FAIL — `ACTIONS` does not contain `"calculator.aiAssist"` (and a TS error on the `ACTION_LABELS` index, since `Action` doesn't include it yet).

- [ ] **Step 3: Add the permission in three places**

In `src/lib/permissions.ts`, add to the `ACTIONS` array, right after `"calculator.use",` (line ~24):

```ts
  "calculator.use",
  "calculator.aiAssist", // AI assist in calculator: text/image → rooms (opt-in, owner-granted)
```

In `PERMISSION_GROUPS`, the `calculator` group `actions` array (after `"calculator.use",`, line ~104):

```ts
    actions: [
      "calculator.use",
      "calculator.aiAssist",
      "order.view",
```

In `ACTION_LABELS`, after the `"calculator.use"` entry (line ~183):

```ts
  "calculator.use": "Калькулятордан фойдаланиш · Use calculator",
  "calculator.aiAssist": "Калькуляторда AI ёрдамчи · AI assist in calculator",
```

Do **not** add it to any `ROLE_TEMPLATES` — it is opt-in; the owner grants it manually (spec §11).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/permissions-ai-assist.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/permissions.ts tests/permissions-ai-assist.test.ts
git commit -m "Feat(perms) · add opt-in calculator.aiAssist permission"
```

---

## Task 2: Text dimension extractor (`extractDimensionsFromText`)

Reuses the existing `parseDimensions()` validator from the vision path, so text and image share one output shape. Pricing is NOT done here.

**Files:**
- Create: `src/lib/agent/extract-dimensions-text.ts`
- Test: `tests/extract-dimensions-text.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/extract-dimensions-text.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { extractDimensionsFromText } from "@/lib/agent/extract-dimensions-text";
import type { LlmProvider, GenerateResult } from "@/lib/agent/llm/provider";

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/extract-dimensions-text.test.ts`
Expected: FAIL — `extractDimensionsFromText` does not exist.

- [ ] **Step 3: Write the extractor**

Create `src/lib/agent/extract-dimensions-text.ts`:

```ts
// Text → room dimensions. The operator pastes a freeform room list (often
// multilingual, messy spacing, labels on a separate line) into the calculator.
// We send it to the owner-selected conversation model and reuse the SAME JSON
// validator the vision path uses (parseDimensions), so text and image return one
// shape. This NEVER prices anything — the calculator does that downstream.

import type { LlmProvider, LlmUsage, ExtractedDimensions } from "./llm/provider";
import { parseDimensions } from "./llm/gemini";

// Same JSON shape the vision prompt asks for, so parseDimensions() consumes both.
const STRICT_JSON_SHAPE =
  '{"found": boolean, "isConstructionImage": boolean, "rooms": [{"widthM": number, "lengthM": number, "label": string}], "confidence": "high"|"low", "note": string}';

const TEXT_DIMENSIONS_PROMPT = [
  "You read a list of room sizes an operator pasted to get a precast beam-and-block FLOOR quote.",
  "The text is freeform: mixed Uzbek/Russian, Latin or Cyrillic, messy spacing, and a room's LABEL may be on the NEXT line below its numbers.",
  "",
  "Extract EVERY room's two INNER wall-to-wall dimensions, in METERS.",
  "Mapping rules (map by LABEL, not by position):",
  '- "эни" / "eni" = widthM. "Уз" / "узунлик" / "uz" / "bo\'yi" = lengthM. Assign each number to the dimension its label names, regardless of which is written first.',
  "- If a pair has no эни/Уз labels (just two bare numbers with ×, x, *, /, або \"на\"), treat the FIRST as widthM and the SECOND as lengthM.",
  "- A decimal may be written with a COMMA or a DOT (3,40 = 3.40). A lone whole number means whole meters (5 = 5.00).",
  "- A word with no numbers on its own line (e.g. \"Каридор\", \"зал\", \"спальник\") is the LABEL of the nearest room above/beside it → put it in \"label\".",
  "- Values are real room sizes (~1.5–12 m). If a value is clearly centimeters (e.g. 340) divide by 100; millimeters (e.g. 3400) divide by 1000.",
  "- Never invent a number you cannot read — drop that room instead.",
  "",
  "Always set isConstructionImage=true (this is a text dimension list, not a photo).",
  "Return ONLY strict JSON, no prose, no code fence:",
  STRICT_JSON_SHAPE,
  'Set found=true and confidence="high" only when you clearly read at least one room\'s BOTH dimensions. Otherwise found=false, confidence="low", rooms=[], and a short English staff note.',
].join("\n");

export interface TextExtractResult {
  dims: ExtractedDimensions;
  usage?: LlmUsage;
}

/** Run the operator's pasted text through the conversation model and validate
 *  with the shared parseDimensions(). Pure w.r.t. the injected provider, so it
 *  unit-tests with a fake provider. */
export async function extractDimensionsFromText(
  text: string,
  provider: LlmProvider,
): Promise<TextExtractResult> {
  const result = await provider.generate({
    system: TEXT_DIMENSIONS_PROMPT,
    messages: [{ role: "user", content: text }],
    tools: [],
    maxTokens: 1024,
  });
  return { dims: parseDimensions(result.text), usage: result.usage };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/extract-dimensions-text.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/agent/extract-dimensions-text.ts tests/extract-dimensions-text.test.ts
git commit -m "Feat(agent) · text→room-dimensions extractor (reuses parseDimensions)"
```

---

## Task 3: Map extracted rooms to calculator rows

**Files:**
- Create: `src/components/calculation/ai-rooms.ts`
- Test: `tests/ai-rooms.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/ai-rooms.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { aiRoomsToSlabRows } from "@/components/calculation/ai-rooms";

describe("aiRoomsToSlabRows", () => {
  it("maps widthM→innerWidth, lengthM→innerLength, label→name and prices each row", () => {
    const rows = aiRoomsToSlabRows(
      [
        { widthM: 4.9, lengthM: 8.1, label: "зал" },
        { widthM: 3.1, lengthM: 5.2 },
      ],
      0,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0].innerWidth).toBe(4.9);
    expect(rows[0].innerLength).toBe(8.1);
    expect(rows[0].name).toBe("зал");
    expect(rows[0].result).not.toBeNull(); // priced by recomputeRow
    // Unlabeled room falls back to the default "Хона N" label.
    expect(rows[1].name).toMatch(/Хона/);
  });

  it("continues row numbering from startSeq", () => {
    const rows = aiRoomsToSlabRows([{ widthM: 3, lengthM: 4 }], 2);
    expect(rows[0].name).toBe("Хона 3"); // startSeq 2 → seq 3
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ai-rooms.test.ts`
Expected: FAIL — `aiRoomsToSlabRows` does not exist.

- [ ] **Step 3: Write the mapper**

Create `src/components/calculation/ai-rooms.ts`:

```ts
// Map AI-extracted rooms into calculator rows. Reuses makeRow() for engine
// defaults (bearing 0.15, AUTO pattern, originalWidth 0 → no undersize warning)
// and recomputeRow() so each row arrives already priced. The live-pricing effect
// in MultiRoomCalculator re-bills on the next /api/pricing payload, matching how
// loadProject() seeds reopened drafts.

import type { ExtractedRoom } from "@/lib/agent/llm/provider";
import { makeRow, recomputeRow, type SlabRow } from "./MultiRoomCalculator";

/**
 * @param rooms     rooms read by the AI (widthM = эни, lengthM = Уз)
 * @param startSeq  number of existing rows (so labels continue: startSeq+1…)
 */
export function aiRoomsToSlabRows(rooms: ExtractedRoom[], startSeq: number): SlabRow[] {
  return rooms.map((r, i) => {
    const base = makeRow(startSeq + i + 1);
    return recomputeRow({
      ...base,
      name: r.label?.trim() ? r.label.trim() : base.name,
      innerWidth: r.widthM,
      innerLength: r.lengthM,
    });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ai-rooms.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/calculation/ai-rooms.ts tests/ai-rooms.test.ts
git commit -m "Feat(calculator) · map AI-extracted rooms to priced SlabRows"
```

---

## Task 4: The `/api/calculations/ai-extract` endpoint

**Files:**
- Create: `src/app/api/calculations/ai-extract/route.ts`
- Test: `tests/ai-extract-route.test.ts` (body-schema only — the handler's auth/provider deps are integration-tested manually)

- [ ] **Step 1: Write the failing test**

Create `tests/ai-extract-route.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { AiExtractBody } from "@/app/api/calculations/ai-extract/route";

describe("AiExtractBody", () => {
  it("accepts text-only", () => {
    expect(AiExtractBody.safeParse({ text: "Уз 4 × эни 3 зал" }).success).toBe(true);
  });

  it("accepts image-only", () => {
    expect(AiExtractBody.safeParse({ imageBase64: "abc", imageMime: "image/jpeg" }).success).toBe(true);
  });

  it("rejects an empty body", () => {
    expect(AiExtractBody.safeParse({}).success).toBe(false);
  });

  it("rejects over-long text", () => {
    expect(AiExtractBody.safeParse({ text: "x".repeat(5000) }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ai-extract-route.test.ts`
Expected: FAIL — cannot import `AiExtractBody` (route file doesn't exist).

- [ ] **Step 3: Write the route**

Create `src/app/api/calculations/ai-extract/route.ts`:

```ts
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";
import { withPermission } from "@/lib/api-auth";
import { extractDimensionsFromText } from "@/lib/agent/extract-dimensions-text";
import { createProviderForModelKey, createVisionProvider } from "@/lib/agent/llm/factory";
import { loadAgentRuntimeConfig } from "@/lib/agent/runtime-config";
import { resolveApiKey } from "@/lib/agent/provider-keys";
import { looksLikeImage, MAX_IMAGE_SIZE_BYTES } from "@/lib/uploads";
import { RateLimiter } from "@/lib/agent/rate-limiter";
import type { ExtractedDimensions } from "@/lib/agent/llm/provider";

/** text OR image (raw base64, no data-URL prefix), like /api/agent/simulate-inbound. */
export const AiExtractBody = z
  .object({
    text: z.string().min(1).max(4000).optional(),
    imageBase64: z.string().max(12_000_000).optional(),
    imageMime: z.string().max(60).optional(),
  })
  .refine((b) => !!b.text || !!b.imageBase64, { message: "text or image is required" });

// Module-level limiter (per server instance). Conservative caps just to stop a
// stuck loop running up model cost; a later plan swaps in a shared store.
const limiter = new RateLimiter({
  perMinute: 12,
  perHour: 120,
  userDailyTokens: 300_000,
  globalDailyTokens: 3_000_000,
});
const EST_TOKENS = 2000; // rough per-call estimate for the budget gate

/**
 * POST /api/calculations/ai-extract — calculator.aiAssist. Turn pasted text or a
 * room image into { rooms, confidence, note } for the calculator to price. Does
 * NOT price, persist, or send anything. Text → conversation model; image → the
 * existing Gemini vision reader.
 */
export const POST = withPermission("calculator.aiAssist", async (req: NextRequest, { user }) => {
  const parsed = AiExtractBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("text or image is required", 422);
  const { text, imageBase64, imageMime } = parsed.data;

  const gate = limiter.check(user.id, EST_TOKENS);
  if (!gate.allowed) {
    return fail(`Бир оздан кейин қайта уриниб кўринг · Try again shortly (${gate.reason})`, 429);
  }

  let dims: ExtractedDimensions;

  if (imageBase64) {
    const buf = Buffer.from(imageBase64, "base64");
    if (!looksLikeImage(buf)) return fail("not a valid JPG/PNG/WEBP image", 422);
    if (buf.length > MAX_IMAGE_SIZE_BYTES) return fail("image too large (max 8 MB)", 413);
    const apiKey = await resolveApiKey("google");
    const vision = createVisionProvider({ apiKey });
    dims = await vision.extractDimensions!({ data: imageBase64, mimeType: imageMime || "image/jpeg" });
  } else {
    const config = await loadAgentRuntimeConfig();
    const provider = await createProviderForModelKey(config.modelKey);
    const out = await extractDimensionsFromText(text!, provider);
    dims = out.dims;
    limiter.record(user.id, (out.usage?.inputTokens ?? 0) + (out.usage?.outputTokens ?? 0));
  }

  return ok({
    rooms: dims.rooms,
    confidence: dims.confidence,
    note: dims.note,
    isPlanLike: dims.isPlanLike,
  });
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ai-extract-route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck the route**

Run: `npx tsc --noEmit`
Expected: no errors. (Confirms `resolveApiKey`, `createVisionProvider`, `extractDimensions!` and the `user` context all line up.)

- [ ] **Step 6: Commit**

```bash
git add src/app/api/calculations/ai-extract/route.ts tests/ai-extract-route.test.ts
git commit -m "Feat(api) · /api/calculations/ai-extract (text+image → rooms, gated + rate-limited)"
```

---

## Task 5: The `AiAssistBox` UI component

Permission-gated, self-contained: fetches the user's permissions, renders nothing without `calculator.aiAssist`. Emits parsed rooms to the parent via `onRooms`. No unit test (the repo has no component-test harness); verified by typecheck + manual.

**Files:**
- Create: `src/components/calculation/AiAssistBox.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/calculation/AiAssistBox.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { useT } from "@/lib/i18n";
import { Sparkles, Loader2, ImagePlus } from "lucide-react";
import type { ExtractedRoom } from "@/lib/agent/llm/provider";

interface ExtractResponse {
  rooms: ExtractedRoom[];
  confidence: "high" | "low";
  note?: string;
  isPlanLike?: boolean;
}

export function AiAssistBox({
  onRooms,
}: {
  onRooms: (rooms: ExtractedRoom[], meta: { confidence: "high" | "low"; note?: string }) => void;
}) {
  const t = useT();
  const { data: me } = useQuery<{ permissions: string[] }>({
    queryKey: ["me"],
    queryFn: () => api("/api/auth/me"),
  });
  const allowed = me?.permissions?.includes("calculator.aiAssist") ?? false;

  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!allowed) return null;

  async function run(body: { text: string } | { imageBase64: string; imageMime: string }) {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const res = await api<ExtractResponse>("/api/calculations/ai-extract", { method: "POST", json: body });
      if (!res.rooms.length) {
        setInfo(
          res.note ??
            t("Ўлчамларни ўқий олмадим — қўлда киритинг", "Couldn't read dimensions — please enter them manually"),
        );
        return;
      }
      onRooms(res.rooms, { confidence: res.confidence, note: res.note });
      setText("");
      setInfo(
        t(`AI ${res.rooms.length} та хона қўшди — текширинг`, `AI added ${res.rooms.length} rooms — please check`) +
          (res.confidence === "low" && res.note ? ` · ${res.note}` : ""),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onPickImage(file: File) {
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const imageBase64 = btoa(binary);
    await run({ imageBase64, imageMime: file.type || "image/jpeg" });
  }

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
        <Sparkles className="h-3.5 w-3.5" />
        {t("AI ёрдамчи", "AI assist")}
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        disabled={busy}
        placeholder={t(
          "Хона ўлчамларини шу ерга ёзинг ёки расм юкланг…",
          "Paste room dimensions here, or upload an image…",
        )}
        className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm font-mono"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => run({ text: text.trim() })}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {t("Ўқиш", "Parse")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          {t("Расм", "Image")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onPickImage(f);
            e.target.value = "";
          }}
        />
      </div>
      {info && <p className="text-xs text-muted-foreground">{info}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npx next lint --file src/components/calculation/AiAssistBox.tsx`
Expected: no errors (warnings about `void` are acceptable).

- [ ] **Step 4: Commit**

```bash
git add src/components/calculation/AiAssistBox.tsx
git commit -m "Feat(calculator) · AiAssistBox UI (permission-gated text/image input)"
```

---

## Task 6: Mount `AiAssistBox` in the calculations page

**Files:**
- Modify: `src/app/(app)/calculations/page.tsx`

- [ ] **Step 1: Add imports**

Near the other imports at the top of `src/app/(app)/calculations/page.tsx`, add:

```ts
import { AiAssistBox } from "@/components/calculation/AiAssistBox";
import { aiRoomsToSlabRows } from "@/components/calculation/ai-rooms";
import type { ExtractedRoom } from "@/lib/agent/llm/provider";
```

- [ ] **Step 2: Add the rooms handler**

Inside the page component (alongside the other handlers, e.g. just before the `summary` useMemo near line ~567), add:

```ts
  // AI assist → append parsed rooms to the table. The calculator prices them
  // (recomputeRow already ran in aiRoomsToSlabRows; the live-pricing effect
  // re-bills on the next /api/pricing payload). Operator reviews before saving.
  function handleAiRooms(aiRooms: ExtractedRoom[]) {
    const next = aiRoomsToSlabRows(aiRooms, rows.length);
    setRows([...rows, ...next]);
    setError(null);
  }
```

(`rows`, `setRows`, and `setError` already exist on the page.)

- [ ] **Step 3: Render the box above the client bar**

Immediately BEFORE the `{/* Client info — Name | Phone | Address */}` block (around line 963), add:

```tsx
      {/* AI assist — text/image → rooms. Renders only for calculator.aiAssist holders. */}
      <AiAssistBox onRooms={handleAiRooms} />

```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/calculations/page.tsx
git commit -m "Feat(calculator) · wire AI assist box into the calculations page"
```

---

## Task 7: Full verification + grant note

**Files:** none (verification only)

- [ ] **Step 1: Run the whole test suite**

Run: `npx vitest run`
Expected: all tests pass (the existing 913 + the new permission/extractor/mapper/route tests). 0 failures.

- [ ] **Step 2: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Production build (catches App Router issues)**

Run: `npx next build`
Expected: build succeeds; the route `/api/calculations/ai-extract` appears in the route list.

- [ ] **Step 4: Manual smoke test (dev)**

Run: `npm run dev`, log in as a user **with** `calculator.aiAssist` (grant it via the user-permissions UI first), open `/calculations`:
- Paste the sample text → click Parse → 3 rooms appear, priced, with the "AI added 3 rooms" notice.
- Upload a room photo → rooms appear (or the "couldn't read" message for a non-plan image).
- Log in as a user **without** the permission → the AI box is absent.
Expected: all three behave as described. No console errors.

- [ ] **Step 5: Grant the permission on prod (no migration)**

`calculator.aiAssist` is a string in `User.permissions` — no DB schema change. After deploy, the owner grants it to owner2 / chosen sales staff via the existing user-permissions screen (spec §11). Note this in the PR description.

---

## Self-Review (completed during authoring)

**Spec coverage:**
- §3 extract-into-rows → Tasks 2,3,6 ✓ · reuse agent model (text) → Task 2 ✓ · reuse vision extractor (image) → Task 4 ✓ · `calculator.aiAssist` permission → Task 1 ✓
- §4 thin endpoint, unified `ExtractedDimensions` shape → Task 4 ✓ · browser mapping `widthM→innerWidth` → Task 3 ✓
- §5 UI placement above ClientInfoBar, permission-gated, low-confidence note, "couldn't read" message → Tasks 5,6 ✓
- §7 permission gate + rate limiter + input cap + no auto-save → Tasks 1,4 ✓
- §8 error handling (model error, no rooms, not-plan, low-confidence, 403, 429) → Tasks 4,5 ✓
- §9 tests: rooms→SlabRow, append semantics, endpoint body, validator reuse, permission wiring → Tasks 1–4 ✓
  - *Note:* "append semantics" is exercised in Task 6's handler and the manual smoke test rather than a unit test, because appending lives in the page component (no component-test harness). The pure mapper (Task 3) and extractor (Task 2) carry the automated coverage.

**Placeholder scan:** none — every code step contains full content.

**Type consistency:** `ExtractedDimensions`/`ExtractedRoom`/`LlmProvider`/`LlmUsage` from `@/lib/agent/llm/provider`; `parseDimensions` from `@/lib/agent/llm/gemini`; `makeRow`/`recomputeRow`/`SlabRow` from `@/components/calculation/MultiRoomCalculator`; `aiRoomsToSlabRows(rooms, startSeq)` and `extractDimensionsFromText(text, provider)` signatures match across tasks. Endpoint exports `AiExtractBody` and `POST`.
