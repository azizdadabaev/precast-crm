import { NextRequest, NextResponse } from "next/server";
import { withPermission } from "@/lib/api-auth";
import { renderSheetPdf } from "@/lib/cad/sheet/render-pdf";
import { SHEET_PRINT_TOKEN } from "@/lib/cad/sheet/print-token";

/**
 * POST /api/drawings/render
 *
 * Renders 1..12 rooms as an A4-landscape CAD "drawing sheet" PDF by driving the
 * token-gated /print/sheet page through headless Chromium (same Node process).
 * Owner-only via the `blender.bridge` permission — the same gate the Blender
 * drawing request route uses.
 *
 * Multiple rooms are shelf-packed onto one page at a single shared scale with a
 * grand BoM/total. A sane upper cap keeps the shared scale legible.
 *
 * Request body: { rooms: [{ name?, inner_width, inner_length, beamDir? }] }
 */

const MAX_ROOMS = 12;

interface RawRoom {
  name?: string;
  inner_width: number;
  inner_length: number;
  beamDir?: "H" | "V";
}

export const POST = withPermission("blender.bridge", async (req: NextRequest) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rooms = (body as { rooms?: unknown })?.rooms;
  if (!Array.isArray(rooms) || rooms.length === 0) {
    return NextResponse.json({ error: "rooms must be a non-empty array" }, { status: 400 });
  }
  if (rooms.length > MAX_ROOMS) {
    return NextResponse.json(
      { error: `too many rooms (max ${MAX_ROOMS})` },
      { status: 400 },
    );
  }
  for (const r of rooms as RawRoom[]) {
    const w = Number(r?.inner_width);
    const l = Number(r?.inner_length);
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(l) || l <= 0) {
      return NextResponse.json(
        { error: "each room needs finite inner_width>0 and inner_length>0" },
        { status: 400 },
      );
    }
  }

  const b64 = Buffer.from(JSON.stringify({ rooms })).toString("base64");
  const port = process.env.PORT ?? "3000";
  const printUrl = `http://127.0.0.1:${port}/print/sheet?payload=${encodeURIComponent(b64)}&k=${SHEET_PRINT_TOKEN}`;

  try {
    const buf = await renderSheetPdf(printUrl);
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="sheet.pdf"',
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "PDF render failed" },
      { status: 500 },
    );
  }
});
