// Tool registry — aggregate the Plan 07 read tools and dispatch by name. The
// agent loop calls definitions() to advertise the toolset to the model and
// execute(name, input) to run a tool call. An unknown tool name escalates
// rather than throwing (spec §6.7).

import {
  type AgentTool,
  type AgentToolContext,
  type AgentToolDefinition,
  type ToolResult,
  toolEscalate,
} from './types';
import { getQuoteTool } from './get-quote';
import { getGazoblokQuoteTool } from './get-gazoblok-quote';
import { checkStockTool } from './check-stock';
import { lookupClientTool } from './lookup-client';

/** The read-only toolset the agent is given (spec §5). Write/terminal actions
 *  (draft_order, escalate, request_approval) are handled by the loop, not here. */
export const READ_TOOLS: readonly AgentTool[] = [
  getQuoteTool,
  getGazoblokQuoteTool,
  checkStockTool,
  lookupClientTool,
];

/** Tools whose successful result carries a fresh, signed quote_id — the loop
 *  uses this to gate price-bearing replies (outbound-validator). */
export const QUOTE_TOOL_NAMES: ReadonlySet<string> = new Set(['get_quote', 'get_gazoblok_quote']);

export interface ToolRegistry {
  definitions(): AgentToolDefinition[];
  has(name: string): boolean;
  execute(name: string, rawInput: unknown, ctx?: AgentToolContext): Promise<ToolResult<unknown>>;
}

export function createToolRegistry(tools: readonly AgentTool[] = READ_TOOLS): ToolRegistry {
  const byName = new Map(tools.map((t) => [t.definition.name, t]));
  return {
    definitions: () => tools.map((t) => t.definition),
    has: (name) => byName.has(name),
    async execute(name, rawInput, ctx) {
      const tool = byName.get(name);
      if (!tool) return toolEscalate(`unknown tool: ${name}`);
      return tool.execute(rawInput, ctx);
    },
  };
}
