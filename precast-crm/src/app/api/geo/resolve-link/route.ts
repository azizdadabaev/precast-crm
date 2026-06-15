export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { ok, fail } from "@/lib/api";
import { withAuth } from "@/lib/api-auth";
import { parseMapLink, isGoogleShortLinkHost } from "@/lib/geo/parse-map-link";
import { ResolveLinkBody } from "./schema";

/**
 * POST /api/geo/resolve-link — turn a pasted Google Maps link into { lat, lng }.
 *
 * Full links carry coordinates we read directly. Short links (maps.app.goo.gl,
 * goo.gl/maps, …) don't, so we follow the redirect server-side and parse the
 * final URL. SSRF guard: we ONLY fetch a user-supplied URL after it passes the
 * isGoogleShortLinkHost allowlist — an arbitrary host is never fetched.
 */
export const POST = withAuth(async (req: NextRequest) => {
  const parsed = ResolveLinkBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("a url is required", 422);
  const { url } = parsed.data;

  const direct = parseMapLink(url);
  if (direct) return ok(direct);

  if (isGoogleShortLinkHost(url)) {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    }).catch(() => null);
    const resolved = res ? parseMapLink(res.url) : null;
    if (resolved) return ok(resolved);
    return fail("couldn't read a location from that link", 422);
  }

  return fail("couldn't read a location from that link", 422);
});
