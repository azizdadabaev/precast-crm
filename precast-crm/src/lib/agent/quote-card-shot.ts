// Headless screenshot of the internal quote-card page → PNG (Plan 09 #5b).
//
// Primary path: launch a headless browser, navigate to the secret-gated internal
// render page, and screenshot the real CalculationShareCard — pixel-identical to
// the operator's "Send to chat". If the browser is unavailable (no Chromium, OOM
// on a small host, launch failure), fall back to the lightweight next/og card so
// the customer still gets a summary image.

import { existsSync } from 'fs';
import { prisma } from '@/lib/prisma';
import { QUOTE_CARD_TOKEN } from './quote-card';
import { buildQuoteSummary, renderQuoteSummaryImage } from './quote-image';

/** First Chromium/Chrome/Edge that actually exists. Honors
 *  PUPPETEER_EXECUTABLE_PATH (set in the Docker image) but verifies it, then
 *  falls back to common dev (Windows) and Linux locations. */
function resolveExecutable(): string | undefined {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : '',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ].filter(Boolean) as string[];
  return candidates.find((p) => existsSync(p));
}

/** Screenshot the real share card via a headless browser. Throws on any failure
 *  (no executable, launch/nav/timeout) so the caller can fall back. */
async function screenshotShareCard(projectId: string): Promise<Buffer> {
  const executablePath = resolveExecutable();
  if (!executablePath) throw new Error('no Chromium/Chrome executable found (set PUPPETEER_EXECUTABLE_PATH)');

  const port = process.env.PORT ?? '3000';
  const url = `http://127.0.0.1:${port}/internal/quote-card/${projectId}?k=${QUOTE_CARD_TOKEN}`;

  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage();
    // deviceScaleFactor 3 matches the operator card's html-to-image pixelRatio 3.
    await page.setViewport({ width: 1400, height: 1200, deviceScaleFactor: 3 });
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 20_000 });
    const el = await page.waitForSelector('#quote-card', { timeout: 10_000 });
    if (!el) throw new Error('#quote-card not found on render page');
    const shot = await el.screenshot({ type: 'png' });
    return Buffer.from(shot);
  } finally {
    await browser.close().catch(() => {});
  }
}

/** next/og fallback — the lightweight summary card, used only if the headless
 *  browser path fails. */
async function fallbackOgImage(projectId: string): Promise<Buffer> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      draftNumber: true,
      tentativeClientName: true,
      calculations: {
        orderBy: { seq: 'asc' },
        select: { name: true, innerWidth: true, innerLength: true, monolithArea: true, subtotal: true },
      },
    },
  });
  if (!project) throw new Error('project not found for fallback render');
  const summary = buildQuoteSummary(project.draftNumber, project.tentativeClientName, project.calculations);
  return renderQuoteSummaryImage(summary);
}

/**
 * Render the agent's quote summary as a PNG: the pixel-identical headless card
 * first, the next/og card as a resilience fallback. Throws only if BOTH fail (the
 * caller swallows that — the short price reply has already been sent).
 */
export async function renderAgentQuoteImage(projectId: string): Promise<Buffer> {
  try {
    return await screenshotShareCard(projectId);
  } catch (err) {
    console.warn(
      '[agent:quote-image] headless render failed — using next/og fallback:',
      err instanceof Error ? err.message : String(err),
    );
    return fallbackOgImage(projectId);
  }
}
