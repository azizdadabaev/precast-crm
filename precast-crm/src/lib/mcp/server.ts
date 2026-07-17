import { createMcpHandler } from 'mcp-handler';
import { registerDashboardTools } from './tools/dashboard';

/**
 * Stateless MCP Streamable-HTTP handler. Tools are registered by
 * registerXxxTools() calls in the initializeServer callback.
 * SSE is disabled — only POST (Streamable HTTP) is active.
 * sessionIdGenerator: undefined → no session state, no Redis needed.
 */
export const mcpHandler = createMcpHandler(
  (server) => {
    registerDashboardTools(server);
  },
  {
    serverInfo: { name: 'etalon-crm', version: '1.0.0' },
  },
  {
    basePath: '/api',
    disableSse: true,
  }
);
