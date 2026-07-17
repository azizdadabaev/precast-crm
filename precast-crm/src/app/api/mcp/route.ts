import { checkBearer } from '@/lib/mcp/auth';
import { mcpHandler } from '@/lib/mcp/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  if (!checkBearer(req)) {
    return new Response('Unauthorized', { status: 401 });
  }
  return mcpHandler(req);
}

export async function GET(): Promise<Response> {
  // Always 404 for GET — SSE is disabled and we never want Claude.ai to
  // interpret a 401 here as "OAuth required" and trigger its sign-in flow.
  return new Response('Not Found', { status: 404 });
}
