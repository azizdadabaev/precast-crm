export const dynamic = "force-dynamic";

import { promises as fs } from "fs";
import path from "path";
import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, fail } from "@/lib/api";

/**
 * Where a published build is described. Written beside the APK it points at, under the same
 * `public/uploads` tree every other file lives in, so publishing a build is two file copies and
 * needs neither a redeploy nor a container restart — which is the whole point: a release the server
 * has to be rebuilt for is a release nobody makes on a Saturday.
 */
const MANIFEST = path.join(process.cwd(), "public", "uploads", "app", "latest.json");

/**
 * The manifest as it is written on disk.
 *
 * `versionCode` is the Android app's own — the git commit count (see `android/app/build.gradle.kts`)
 * — so it is monotonic and comparable with `BuildConfig.VERSION_CODE` on the phone.
 *
 * `sha256` is not paranoia about the transport: it is how the phone tells a truncated download from
 * a complete one before handing the file to the installer, because the system installer's own
 * failure for a half-written APK is «Хатолик юз берди» and nothing else.
 */
const Manifest = z.object({
  versionCode: z.number().int().positive(),
  versionName: z.string().min(1),
  /** Absolute or `/uploads/...`-relative; the route returns it absolute. */
  url: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  /** What changed, in Uzbek, for the update sheet. Optional — a build can be routine. */
  notes: z.string().max(1000).optional(),
});

/**
 * GET /api/mobile/app-version — **public**, deliberately.
 *
 * An app too old to talk to this server is also an app that may be too old to sign in, so gating
 * the answer behind a session would hide the update from exactly the client that needs it most.
 * What it discloses is a version number and the URL of a build that is already served publicly
 * from `/uploads`.
 *
 * Answers 404 while nothing is published. That is not an error on the phone — it is the normal
 * state of a server whose operator has not shipped a build yet — and the app treats it as
 * "nothing new".
 */
export async function GET(req: NextRequest) {
  let raw: string;
  try {
    raw = await fs.readFile(MANIFEST, "utf8");
  } catch {
    return fail("Янгиланиш эълон қилинмаган · No build published", 404);
  }

  const parsed = Manifest.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    // A malformed manifest is an operator mistake on this machine, not a client problem, so it
    // says so in the log and tells the phone there is simply nothing to install rather than
    // pushing it at a download that will not verify.
    console.error("[app-version] manifest is not valid", parsed.error.flatten());
    return fail("Янгиланиш маълумоти нотўғри · Manifest is invalid", 500);
  }

  const m = parsed.data;
  const url = m.url.startsWith("http") ? m.url : new URL(m.url, req.nextUrl.origin).toString();
  return ok({ ...m, url });
}
