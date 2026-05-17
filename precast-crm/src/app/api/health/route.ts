import { NextResponse } from "next/server";

/**
 * GET /api/health — lightweight liveness probe used by docker-compose
 * healthcheck and any external uptime monitors. Returns 200 with a
 * minimal JSON body so the check doesn't require JSON parsing.
 *
 * Intentionally no DB query — this is a process-level liveness check,
 * not a readiness check. A DB failure will surface in the app's normal
 * error responses; this just confirms the Node process is running.
 */
export function GET() {
  return NextResponse.json({ ok: true }, { status: 200 });
}
