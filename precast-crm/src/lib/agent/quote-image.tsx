// Server-side render of the calculation summary as a PNG (Plan 09 #5).
//
// The "Send to chat" button renders the quote in the BROWSER (html-to-image on a
// DOM node), so the agent — which runs server-side with no DOM — can't reuse it.
// This produces the equivalent image with next/og (satori), entirely server-side,
// for the agent's Auto-mode flow to send right after the short price reply.
//
// Rendered in LATIN script (numbers + Latin labels): universally readable, needs
// no bundled Cyrillic font (so it survives the Docker build with @vercel/og's
// built-in font), and the localized text reply already precedes the image.

// next/og is imported LAZILY inside renderQuoteSummaryImage (see there): merely
// importing @vercel/og evaluates module-level code that crashes at import time on
// Windows dev (a vendor path bug — path.join on a file:// URL). A top-level import
// here would therefore break the whole agent locally (webhook-entry imports this
// module). Lazy import keeps the text flow working; only the render itself can
// fail, and its caller already swallows that.
import { readFile } from 'fs/promises';
import { join } from 'path';

export interface QuoteSummaryRoom {
  label: string;
  widthM: number;
  lengthM: number;
  areaM2: number;
  subtotal: number;
}

export interface QuoteSummaryData {
  draftNumber: number | null;
  clientName: string | null;
  rooms: QuoteSummaryRoom[];
  totalArea: number;
  totalSubtotal: number;
}

const WIDTH = 900;

/** Thousands-grouped integer, locale-free (no ICU dependency): 2347500 → "2 347 500". */
const grp = (n: number): string => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
/** Trim to ≤2 decimals without trailing zeros: 3.80 → "3.8", 4 → "4". */
const dec = (n: number): string => String(Math.round(n * 100) / 100);

/** Map persisted Calculation rows → the render's data shape. Pure. */
export function buildQuoteSummary(
  draftNumber: number | null,
  clientName: string | null,
  calcs: ReadonlyArray<{
    name: string | null;
    innerWidth: unknown;
    innerLength: unknown;
    monolithArea: unknown;
    subtotal: unknown;
  }>,
): QuoteSummaryData {
  const rooms: QuoteSummaryRoom[] = calcs.map((c, i) => ({
    label: c.name?.trim() || `Xona ${i + 1}`,
    widthM: Number(c.innerWidth),
    lengthM: Number(c.innerLength),
    areaM2: Number(c.monolithArea),
    subtotal: Number(c.subtotal),
  }));
  return {
    draftNumber,
    clientName,
    rooms,
    totalArea: rooms.reduce((s, r) => s + r.areaM2, 0),
    totalSubtotal: rooms.reduce((s, r) => s + r.subtotal, 0),
  };
}

const HEADER = '#0f172a';
const MUTED = '#94a3b8';
const BORDER = '#e2e8f0';
const ROW_H = 52;

// next/og's default-font auto-loader is broken on some setups (a Windows path bug
// in @vercel/og), so we ALWAYS pass an explicit font. Inter (latin + cyrillic)
// lives in public/fonts — present in dev and copied into the Docker image. Cached
// after first read (process-local).
type OgFont = { name: string; data: Buffer; weight: 400 | 700; style: 'normal' };
let fontCache: OgFont[] | null = null;
async function loadFonts(): Promise<OgFont[]> {
  if (fontCache) return fontCache;
  const dir = join(process.cwd(), 'public', 'fonts');
  const [regular, bold] = await Promise.all([
    readFile(join(dir, 'inter-400.woff')),
    readFile(join(dir, 'inter-700.woff')),
  ]);
  fontCache = [
    { name: 'Inter', data: regular, weight: 400, style: 'normal' },
    { name: 'Inter', data: bold, weight: 700, style: 'normal' },
  ];
  return fontCache;
}

/** Render the summary to PNG bytes. Throws if next/og fails — the caller wraps
 *  this in try/catch so a render failure never blocks the (already-sent) reply. */
export async function renderQuoteSummaryImage(data: QuoteSummaryData): Promise<Buffer> {
  const height = 96 + 50 + data.rooms.length * ROW_H + 88 + 56;

  const element = (
    <div style={{ width: WIDTH, height, display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff', fontFamily: 'Inter' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 32px',
          backgroundColor: HEADER,
          color: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: 30, fontWeight: 700 }}>Etalon</div>
          <div style={{ fontSize: 16, color: MUTED }}>Yig'ma monolit · Hisob-kitob</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          {data.draftNumber != null ? (
            <div style={{ fontSize: 18, fontWeight: 700 }}>{`№ ${data.draftNumber}D`}</div>
          ) : null}
          {data.clientName ? <div style={{ fontSize: 15, color: MUTED }}>{data.clientName}</div> : null}
        </div>
      </div>

      {/* Column heads */}
      <div
        style={{
          display: 'flex',
          padding: '14px 32px',
          backgroundColor: '#f1f5f9',
          color: '#64748b',
          fontSize: 15,
          fontWeight: 600,
        }}
      >
        <div style={{ display: 'flex', flex: 3 }}>Xona</div>
        <div style={{ display: 'flex', flex: 2 }}>O'lcham</div>
        <div style={{ display: 'flex', flex: 2, justifyContent: 'flex-end' }}>Maydon</div>
        <div style={{ display: 'flex', flex: 3, justifyContent: 'flex-end' }}>Narx, so'm</div>
      </div>

      {/* Room rows */}
      {data.rooms.map((r, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            padding: '0 32px',
            height: ROW_H,
            alignItems: 'center',
            fontSize: 20,
            color: HEADER,
            borderBottomWidth: 1,
            borderBottomStyle: 'solid',
            borderBottomColor: BORDER,
          }}
        >
          <div style={{ display: 'flex', flex: 3 }}>{r.label}</div>
          <div style={{ display: 'flex', flex: 2 }}>{`${dec(r.widthM)} × ${dec(r.lengthM)} m`}</div>
          <div style={{ display: 'flex', flex: 2, justifyContent: 'flex-end' }}>{`${dec(r.areaM2)} m²`}</div>
          <div style={{ display: 'flex', flex: 3, justifyContent: 'flex-end' }}>{grp(r.subtotal)}</div>
        </div>
      ))}

      {/* Total */}
      <div
        style={{
          display: 'flex',
          padding: '0 32px',
          height: 88,
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: HEADER,
          color: '#ffffff',
        }}
      >
        <div style={{ display: 'flex', fontSize: 24, fontWeight: 700 }}>Jami</div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ fontSize: 30, fontWeight: 700 }}>{`${grp(data.totalSubtotal)} so'm`}</div>
          <div style={{ fontSize: 14, color: MUTED }}>{`${dec(data.totalArea)} m² · ${data.rooms.length} xona`}</div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', padding: '16px 32px', fontSize: 13, color: MUTED }}>
        Narx mahsulot uchun (yetkazib berishsiz). Yakuniy o'lchamga qarab o'zgarishi mumkin.
      </div>
    </div>
  );

  // Lazy import (see top-of-file note): on Linux (prod) this resolves and renders;
  // on Windows dev it throws and the caller logs + skips the image.
  const { ImageResponse } = await import('next/og');
  const img = new ImageResponse(element, { width: WIDTH, height, fonts: await loadFonts() });
  return Buffer.from(await img.arrayBuffer());
}
