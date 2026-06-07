import { describe, it, expect } from 'vitest';
import { createToolRegistry, READ_TOOLS, QUOTE_TOOL_NAMES } from './registry';
import { type AgentTool, type ToolResult, toolOk, toolEscalate } from './types';

function fakeTool(name: string, result: ToolResult<unknown> = toolOk({ name })): AgentTool {
  return {
    definition: { name, description: `${name} desc`, inputSchema: { type: 'object', additionalProperties: false, properties: {} } },
    execute: async () => result,
  };
}

describe('createToolRegistry', () => {
  it('advertises the definitions of its tools', () => {
    const reg = createToolRegistry([fakeTool('a'), fakeTool('b')]);
    expect(reg.definitions().map((d) => d.name)).toEqual(['a', 'b']);
    expect(reg.has('a')).toBe(true);
    expect(reg.has('c')).toBe(false);
  });

  it('dispatches execute to the named tool', async () => {
    const reg = createToolRegistry([fakeTool('a', toolOk({ hit: 'a' })), fakeTool('b', toolOk({ hit: 'b' }))]);
    expect(await reg.execute('b', {})).toEqual({ ok: true, data: { hit: 'b' } });
  });

  it('escalates (does not throw) on an unknown tool name', async () => {
    const reg = createToolRegistry([fakeTool('a')]);
    expect(await reg.execute('nope', {})).toMatchObject({ ok: false, escalate: true });
  });

  it('passes a tool failure through unchanged', async () => {
    const reg = createToolRegistry([fakeTool('a', toolEscalate('bad'))]);
    expect(await reg.execute('a', {})).toEqual({ ok: false, escalate: true, reason: 'bad' });
  });
});

describe('READ_TOOLS registry', () => {
  it('contains exactly the four Plan 07 read tools', () => {
    expect(createToolRegistry().definitions().map((d) => d.name).sort()).toEqual(
      ['check_stock', 'get_gazoblok_quote', 'get_quote', 'lookup_client'].sort(),
    );
    expect(READ_TOOLS).toHaveLength(4);
  });

  it('marks both quote tools as quote sources', () => {
    expect(QUOTE_TOOL_NAMES.has('get_quote')).toBe(true);
    expect(QUOTE_TOOL_NAMES.has('get_gazoblok_quote')).toBe(true);
    expect(QUOTE_TOOL_NAMES.has('check_stock')).toBe(false);
  });
});
