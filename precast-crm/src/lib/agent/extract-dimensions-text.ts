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
