import { createMcpHandler } from 'mcp-handler';

/**
 * Stateless MCP Streamable-HTTP handler. Tools are registered by
 * registerXxxTools() calls in the initializeServer callback.
 * SSE is disabled — only POST (Streamable HTTP) is active.
 * sessionIdGenerator: undefined → no session state, no Redis needed.
 */
export const mcpHandler = createMcpHandler(
  (server) => {
    // The MCP SDK only registers the tools/list handler when the first tool is
    // added. Register and immediately remove a placeholder so that tools/list
    // returns [] before real tools are wired up in Tasks 4–6.
    server.tool('_init', async () => ({ content: [] })).remove();
    // Real tool registrations go here in Tasks 4–6.
  },
  {
    serverInfo: { name: 'etalon-crm', version: '1.0.0' },
  },
  {
    basePath: '/api',
    disableSse: true,
  }
);
