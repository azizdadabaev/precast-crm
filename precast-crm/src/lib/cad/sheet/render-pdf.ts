// Headless print of the /print/sheet page → A4-landscape PDF.
//
// Mirrors the agent's quote-card screenshot path (src/lib/agent/quote-card-shot.ts):
// launch puppeteer-core against a resolved Chrome/Chromium/Edge executable,
// navigate to the token-gated render page (same Node process), and print to PDF.

import { existsSync } from "fs";

/** First Chromium/Chrome/Edge that actually exists. Honors
 *  PUPPETEER_EXECUTABLE_PATH (set in the Docker image) but verifies it, then
 *  falls back to common dev (Windows) and Linux locations.
 *  (Copied from src/lib/agent/quote-card-shot.ts to keep this module
 *  independent of the agent bundle.) */
function resolveExecutable(): string | undefined {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe` : "",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
  ].filter(Boolean) as string[];
  return candidates.find((p) => existsSync(p));
}

export async function renderSheetPdf(printUrl: string): Promise<Buffer> {
  const { default: puppeteer } = await import("puppeteer-core");
  const executablePath = resolveExecutable();
  if (!executablePath) throw new Error("no Chromium/Chrome executable found (set PUPPETEER_EXECUTABLE_PATH)");
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", "--disable-gpu"] });
  try {
    const page = await browser.newPage();
    await page.goto(printUrl, { waitUntil: "networkidle0", timeout: 20000 });
    const buf = await page.pdf({ format: "A4", landscape: true, printBackground: true, preferCSSPageSize: true });
    return Buffer.from(buf);
  } finally {
    await browser.close();
  }
}
