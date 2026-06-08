// LlmProvider — the one interface the agent loop talks to (spec §3 / §4.3).
//
// Provider-agnostic so the Shadow-stage bake-off can swap Claude / Gemini /
// OpenAI behind it without touching the loop. Each concrete client (claude.ts,
// gemini.ts, openai.ts — next step) adapts these shapes to its vendor format
// using the pure helpers in adapters.ts and calls the vendor SDK. Tool
// definitions come from the Plan 07 toolset (AgentToolDefinition).

import type { AgentToolDefinition } from '@/lib/agent/tools/types';
import type { ModelSpec } from './models';

/** An assistant tool call, normalized across providers. */
export interface LlmToolCall {
  /** Provider tool-call id (echoed back on the matching tool_result). */
  id: string;
  name: string;
  input: Record<string, unknown>;
  /** Gemini-only: the opaque `thoughtSignature` returned on the functionCall part
   *  by thinking models. It MUST be echoed back verbatim on the same functionCall
   *  part in the next request, or Gemini 400s ("missing thought_signature").
   *  Ignored by Claude/OpenAI. */
  thoughtSignature?: string;
}

/** A tool result the loop feeds back on the next user turn. */
export interface LlmToolResult {
  type: 'tool_result';
  toolUseId: string;
  /** Serialized tool output (JSON string of a ToolResult, typically). */
  content: string;
  isError?: boolean;
  /** The tool's name. Optional for Claude/OpenAI (they key by id); REQUIRED by
   *  Gemini, whose functionResponse part carries the name. The loop populates it. */
  name?: string;
}

export interface LlmTextBlock {
  type: 'text';
  text: string;
}

/** A user turn is plain text or a set of tool results (after a tool_use turn). */
export interface LlmUserMessage {
  role: 'user';
  content: string | Array<LlmTextBlock | LlmToolResult>;
}

/** An assistant turn carries its text and any tool calls it made. */
export interface LlmAssistantMessage {
  role: 'assistant';
  content: string;
  toolCalls?: LlmToolCall[];
}

export type LlmMessage = LlmUserMessage | LlmAssistantMessage;

/**
 * How the model may use tools this turn:
 * - `auto`     — the model decides (default)
 * - `required` — the model MUST call some tool (Claude `any` / OpenAI `required`)
 * - `tool`     — force this specific tool (spec §4.2: force a quote tool on price turns)
 */
export type LlmToolChoice =
  | { type: 'auto' }
  | { type: 'required' }
  | { type: 'tool'; name: string };

export interface GenerateRequest {
  /** Stable identity + KB prefix (cached). */
  system: string;
  messages: LlmMessage[];
  tools: AgentToolDefinition[];
  toolChoice?: LlmToolChoice;
  maxTokens?: number;
}

export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
  /** Tokens served from the prompt cache (verify caching is actually hitting). */
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

export interface GenerateResult {
  /** Assistant text (may be empty when the turn is only tool calls). */
  text: string;
  toolCalls: LlmToolCall[];
  usage?: LlmUsage;
  /** Vendor stop reason, normalized to a string (e.g. 'tool_use', 'end_turn'). */
  stopReason?: string;
}

export interface TranscribeInput {
  /** Base64-encoded audio (a voice note), or a fetchable reference. */
  data: string;
  mimeType: string;
}

/** A floor-plan image to read room dimensions from (spec §4.5). */
export interface ImageInput {
  /** Base64-encoded image bytes (jpeg/png — allowlisted in the webhook). */
  data: string;
  mimeType: string;
}

/** Room dimensions read from a floor-plan image. NEVER used to quote directly —
 *  the caller echoes them back for the customer to confirm first (spec §4.5). */
export interface ExtractedDimensions {
  /** True only when a clear single room with both inner dimensions was read. */
  found: boolean;
  innerWidthM?: number;
  innerLengthM?: number;
  /** `low` (or !found) → don't echo a number; ask for typed dims / escalate. */
  confidence: 'high' | 'low';
  /** Short note on what was seen / why unsure (staff-facing, not the customer). */
  note?: string;
}

export interface LlmProvider {
  /** Which registry model this provider instance drives. */
  readonly model: ModelSpec;
  generate(req: GenerateRequest): Promise<GenerateResult>;
  /** Voice-note STT — implemented only by the Google provider (spec §3). */
  transcribe?(audio: TranscribeInput): Promise<string>;
  /** Floor-plan dimension reading — vision-capable providers only (spec §4.5).
   *  Returns parsed dimensions; the caller echoes them to the customer to confirm
   *  before any calculation, and never quotes off a misread sketch. */
  extractDimensions?(image: ImageInput): Promise<ExtractedDimensions>;
}
