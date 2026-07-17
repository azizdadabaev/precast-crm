import { checkBearer } from '@/lib/mcp/auth';
import { mcpHandler } from '@/lib/mcp/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request): Promise<Response> {
  if (!checkBearer(req)) {
    return new Response('Unauthorized', { status: 401 });
  }
  return mcpHandler(req);
}

export async function GET(req: Request): Promise<Response> {
  if (!checkBearer(req)) {
    return new Response('Unauthorized', { status: 401 });
  }
  // SSE is disabled. Return 405 — spec-compliant for Streamable HTTP only.
  return new Response('Method Not Allowed', { status: 405 });
}
