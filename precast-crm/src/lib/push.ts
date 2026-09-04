// FCM push sender for the Android app (spec D6 / S3).
//
// Fire-and-forget like recordAudit() and emitNotifications(): never
// throws, logs on failure. When FIREBASE_SERVICE_ACCOUNT_JSON is unset
// every call is a no-op so the web-only deployment keeps working.
//
// Data-only messages: the app renders the notification itself (title/
// body are already Uzbek strings from emitNotifications), routes the
// deep link, and invalidates its cache. High priority so a closed app
// wakes for "payment confirmed" / "order placed".

import { initializeApp, cert, getApps, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";
import { prisma } from "@/lib/prisma";

const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);
const FCM_MULTICAST_LIMIT = 500;

let app: App | null | undefined; // undefined = not yet attempted

function loadApp(): App | null {
  if (app !== undefined) return app;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    app = null;
    return app;
  }
  try {
    // Accept raw JSON or base64(JSON) — base64 avoids quoting pain in .env.
    const json = raw.trim().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    const creds = JSON.parse(json) as { project_id: string; client_email: string; private_key: string };
    app = getApps()[0] ?? initializeApp({ credential: cert({
      projectId: creds.project_id,
      clientEmail: creds.client_email,
      privateKey: creds.private_key.replace(/\\n/g, "\n"),
    }) });
  } catch (err) {
    console.error("[push] FIREBASE_SERVICE_ACCOUNT_JSON is invalid; push disabled:", err);
    app = null;
  }
  return app;
}

export function isPushConfigured(): boolean {
  return loadApp() !== null;
}

async function pruneDeadTokens(tokens: string[]): Promise<void> {
  if (!tokens.length) return;
  try {
    await prisma.device.deleteMany({ where: { fcmToken: { in: tokens } } });
  } catch (err) {
    console.error("[push] failed to prune dead tokens:", err);
  }
}

/**
 * Send one data message to every registered device of the given users.
 * `data` values must be strings (FCM constraint) — callers stringify.
 */
export async function sendPushToUsers(
  userIds: string[],
  data: Record<string, string>,
): Promise<void> {
  if (!userIds.length) return;
  const fb = loadApp();
  if (!fb) return;
  try {
    const devices = await prisma.device.findMany({
      where: { userId: { in: userIds } },
      select: { fcmToken: true },
    });
    const tokens = devices.map((d) => d.fcmToken);
    if (!tokens.length) return;

    const messaging = getMessaging(fb);
    const dead: string[] = [];
    for (let i = 0; i < tokens.length; i += FCM_MULTICAST_LIMIT) {
      const chunk = tokens.slice(i, i + FCM_MULTICAST_LIMIT);
      const res = await messaging.sendEachForMulticast({
        tokens: chunk,
        data,
        android: { priority: "high" },
      });
      res.responses.forEach((r, idx) => {
        const code = r.error?.code;
        if (!r.success && code && DEAD_TOKEN_CODES.has(code)) dead.push(chunk[idx]);
      });
    }
    await pruneDeadTokens(dead);
  } catch (err) {
    console.error("[push] sendPushToUsers failed:", err);
  }
}
