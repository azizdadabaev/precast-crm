// Shared shapes for the agent's read-only tools (spec §5).
//
// A tool has a provider-agnostic DEFINITION (what the model sees) and an
// EXECUTE function (what the server runs). Plan 08 adapts the definition to
// each provider's tool format (Claude input_schema / Gemini / OpenAI) and
// dispatches execute() in the agent loop. Keeping the definition next to the
// logic means the description — which bounds the tool's scope so the model
// escalates instead of guessing — can't drift from what the code actually does.

/** Provider-agnostic tool definition. `inputSchema` is a JSON Schema object,
 *  written strict-friendly (no min/max numeric constraints — those run in
 *  server code per spec §4.2 layer 3). The description MUST state what the tool
 *  does NOT cover so the model escalates rather than inventing. */
export interface AgentToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * What every tool returns to the agent loop. `ok:false` with `escalate:true` is
 * the spec §6.7 signal: a tool failure / not-found / missing-config never yields
 * a guessed value — the agent escalates to a human instead.
 */
export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; escalate: boolean; reason: string };

export const toolOk = <T>(data: T): ToolResult<T> => ({ ok: true, data });

/** A failure the agent should escalate on (the default for read-tool failures). */
export const toolEscalate = (reason: string): ToolResult<never> => ({
  ok: false,
  escalate: true,
  reason,
});

export interface AgentToolContext {
  /** Customer phone from Conversation.sharedContactPhone (digits-only), if any. */
  sharedContactPhone?: string | null;
  /** Clock injection for quote expiry; the shell defaults it to Date.now(). */
  now?: number;
}

export interface AgentTool<T = unknown> {
  definition: AgentToolDefinition;
  execute(rawInput: unknown, ctx?: AgentToolContext): Promise<ToolResult<T>>;
}
