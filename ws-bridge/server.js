// Self-hosted WebSocket bridge for the Blender feature.
//
// Owner's PC runs Blender with the precast addon. The addon opens a single
// WebSocket connection here (authenticated via shared secret). Any CRM user
// can submit a DrawingRequest; this service queues them serially and
// dispatches one at a time to the connected Blender. The addon generates the
// PDF locally, base64-encodes it, and sends it back as DRAWING_RESULT. This
// service decodes + writes the file to DRAWINGS_DIR (shared volume with the
// app container) and marks the row DELIVERED.
//
// Why serial (concurrency = 1):
//   Blender is single-threaded. Sending multiple requests simultaneously
//   would force the addon to manage its own queue or risk a race. It is
//   simpler and safer to let the bridge own the queue — the addon sees
//   exactly one request at a time and the "busy" guard in the addon is
//   just a defensive backstop.
//
// Responsibilities:
//   1. Accept ONE Blender connection at a time (second bumps the first)
//   2. On connect: flush the next PENDING row (serial)
//   3. On DRAWING_RESULT: decode PDF, write to disk, mark DELIVERED,
//      then dispatch the next PENDING row
//   4. On ACK (legacy back-compat): mark DELIVERED, dispatch next
//   5. On ERROR: mark FAILED, dispatch next
//   6. Poll every 2 s as a fallback for rows missed by the HTTP /flush
//   7. Expose internal HTTP on :8766 — /flush + /status for Next.js

import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import fs from "fs";
import path from "path";
import pg from "pg";

const { Pool } = pg;

const WS_PORT       = Number(process.env.WS_BRIDGE_PORT      || 8765);
const HTTP_PORT     = Number(process.env.WS_BRIDGE_HTTP_PORT || 8766);
const DB_URL        = process.env.DATABASE_URL;
const BRIDGE_SECRET = process.env.BRIDGE_SECRET;
const DRAWINGS_DIR  = process.env.DRAWINGS_DIR || "/data/drawings";

if (!DB_URL)        { console.error("[bridge] DATABASE_URL is required");  process.exit(1); }
if (!BRIDGE_SECRET) { console.error("[bridge] BRIDGE_SECRET is required"); process.exit(1); }

const pool = new Pool({ connectionString: DB_URL });

// ── Connection state ──────────────────────────────────────────────────────
let blenderSocket      = null;
let blenderConnectedAt = null;

// Serial-queue flag. True while a DRAWING_REQUEST has been sent and we are
// waiting for DRAWING_RESULT / ACK / ERROR. No second request is dispatched
// until this clears.
let inFlight = false;

// ── WebSocket server ──────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", (ws, req) => {
  const url    = new URL(req.url, "http://localhost");
  const secret = url.searchParams.get("secret");

  if (secret !== BRIDGE_SECRET) {
    ws.close(4001, "Unauthorized");
    console.log("[bridge] Rejected connection — wrong secret");
    return;
  }

  // Replace any prior socket.
  if (blenderSocket && blenderSocket.readyState === WebSocket.OPEN) {
    try { blenderSocket.close(4002, "Replaced by new connection"); } catch { /* ignore */ }
  }

  blenderSocket      = ws;
  blenderConnectedAt = new Date();
  inFlight           = false; // new connection resets in-flight state
  console.log("[bridge] Blender connected");

  flushPendingRequests().catch((err) =>
    console.error("[bridge] flush after connect failed:", err),
  );

  ws.on("message", async (data) => {
    // Diagnostic: log every inbound frame's size + type so we can tell
    // whether DRAWING_RESULT messages are arriving but being misrouted,
    // or never reaching the bridge at all.
    const frameSize = data.length ?? data.byteLength ?? 0;
    let msg;
    try { msg = JSON.parse(data.toString()); }
    catch (err) {
      console.error(`[bridge] Failed to parse message (${frameSize} B):`, err);
      return;
    }
    console.log(`[bridge] RX ${msg.type ?? "<no-type>"} ${frameSize} B${msg.requestId ? ` requestId=${msg.requestId}` : ""}`);

    try {
      // ── DRAWING_RESULT ─────────────────────────────────────────────────
      if (msg.type === "DRAWING_RESULT" && msg.requestId) {
        const requestId = msg.requestId;
        const pageCount = typeof msg.pageCount === "number" ? msg.pageCount : null;
        const renderMs  = typeof msg.renderMs  === "number" ? msg.renderMs  : null;

        let pdfSizeBytes = 0;
        let storageKey   = null;

        try {
          await fs.promises.mkdir(DRAWINGS_DIR, { recursive: true });
          const buf    = Buffer.from(msg.pdfBase64 ?? "", "base64");
          pdfSizeBytes = buf.length;
          const fname  = `${requestId}.pdf`;
          storageKey   = `drawings/${fname}`;
          await fs.promises.writeFile(path.join(DRAWINGS_DIR, fname), buf);
          console.log(`[bridge] PDF saved for ${requestId} (${pdfSizeBytes} B, ${pageCount ?? "?"}pp, ${renderMs ?? "?"}ms)`);
        } catch (writeErr) {
          console.error(`[bridge] PDF write failed for ${requestId}:`, writeErr);
          await pool.query(
            `UPDATE "drawing_requests"
             SET status = 'FAILED', "errorMessage" = $2, "updatedAt" = NOW()
             WHERE id = $1 AND status = 'PENDING'`,
            [requestId, `Server: PDF write failed — ${writeErr.message}`],
          ).catch(console.error);
          inFlight = false;
          flushPendingRequests().catch(console.error);
          return;
        }

        await pool.query(
          `UPDATE "drawing_requests"
           SET status          = 'DELIVERED',
               "deliveredAt"   = NOW(),
               "pdfStorageKey" = $2,
               "pdfSizeBytes"  = $3,
               "pageCount"     = $4,
               "renderMs"      = $5,
               "updatedAt"     = NOW()
           WHERE id = $1 AND status = 'PENDING'`,
          [requestId, storageKey, pdfSizeBytes, pageCount, renderMs],
        );

        inFlight = false;
        flushPendingRequests().catch(console.error);

      // ── ACK (legacy back-compat) ────────────────────────────────────────
      } else if (msg.type === "ACK" && msg.requestId) {
        await pool.query(
          `UPDATE "drawing_requests"
           SET status = 'DELIVERED', "deliveredAt" = NOW(), "updatedAt" = NOW()
           WHERE id = $1 AND status = 'PENDING'`,
          [msg.requestId],
        );
        console.log(`[bridge] Request ${msg.requestId} delivered (ACK — no PDF)`);
        inFlight = false;
        flushPendingRequests().catch(console.error);

      // ── ERROR ──────────────────────────────────────────────────────────
      } else if (msg.type === "ERROR" && msg.requestId) {
        await pool.query(
          `UPDATE "drawing_requests"
           SET status = 'FAILED', "errorMessage" = $2, "updatedAt" = NOW()
           WHERE id = $1 AND status = 'PENDING'`,
          [msg.requestId, String(msg.error ?? "Unknown error")],
        );
        console.log(`[bridge] Request ${msg.requestId} failed:`, msg.error);
        inFlight = false;
        flushPendingRequests().catch(console.error);

      // ── PING ───────────────────────────────────────────────────────────
      } else if (msg.type === "PING") {
        ws.send(JSON.stringify({ type: "PONG" }));

      } else {
        console.log("[bridge] Unrecognized message type:", msg.type);
      }
    } catch (err) {
      console.error("[bridge] DB update failed:", err);
      inFlight = false;
      flushPendingRequests().catch(console.error);
    }
  });

  ws.on("close", () => {
    if (blenderSocket === ws) {
      blenderSocket = null; blenderConnectedAt = null; inFlight = false;
    }
    console.log("[bridge] Blender disconnected");
  });

  ws.on("error", (err) => {
    console.error("[bridge] WebSocket error:", err);
    if (blenderSocket === ws) {
      blenderSocket = null; blenderConnectedAt = null; inFlight = false;
    }
  });
});

// ── Serial flush ───────────────────────────────────────────────────────────
// Dispatches the oldest PENDING row to Blender, then returns.
// The next row is sent only after the terminal response arrives above.
async function flushPendingRequests() {
  if (!blenderSocket || blenderSocket.readyState !== WebSocket.OPEN) return;
  if (inFlight) return;

  let result;
  try {
    result = await pool.query(
      `SELECT id, "orderId", "projectId", "roomsJson", "createdAt"
       FROM "drawing_requests"
       WHERE status = 'PENDING'
       ORDER BY "createdAt" ASC
       LIMIT 1`,
    );
  } catch (err) {
    console.error("[bridge] flush query failed:", err);
    return;
  }

  if (result.rows.length === 0) return;

  const row = result.rows[0];
  let rooms;
  try {
    rooms = JSON.parse(row.roomsJson);
  } catch (err) {
    console.error(`[bridge] row ${row.id} has invalid roomsJson; marking FAILED`, err);
    await pool.query(
      `UPDATE "drawing_requests"
       SET status = 'FAILED', "errorMessage" = $2, "updatedAt" = NOW()
       WHERE id = $1`,
      [row.id, "Server: stored roomsJson failed to parse"],
    ).catch(() => {});
    return;
  }

  const msg = {
    type:       "DRAWING_REQUEST",
    requestId:  row.id,
    rooms,
    sourceType: row.orderId ? "order" : "project",
    sourceId:   row.orderId || row.projectId,
    createdAt:  row.createdAt,
  };

  try {
    inFlight = true;
    blenderSocket.send(JSON.stringify(msg));
    console.log(`[bridge] Dispatched request ${row.id} to Blender`);
  } catch (err) {
    console.error(`[bridge] send for ${row.id} failed:`, err);
    inFlight = false;
  }
}

// 2-second fallback poll.
setInterval(() => {
  flushPendingRequests().catch((err) =>
    console.error("[bridge] polling flush failed:", err),
  );
}, 2000);

// ── Internal HTTP server ───────────────────────────────────────────────────
const internalServer = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/flush") {
    flushPendingRequests()
      .then(() => { res.writeHead(200); res.end("OK"); })
      .catch((err) => {
        console.error("[bridge] manual flush failed:", err);
        res.writeHead(500); res.end(String(err));
      });
    return;
  }

  if (req.method === "GET" && req.url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      connected:      !!blenderSocket && blenderSocket.readyState === WebSocket.OPEN,
      connectedSince: blenderConnectedAt?.toISOString() ?? null,
      inFlight,
    }));
    return;
  }

  res.writeHead(404); res.end();
});

internalServer.listen(HTTP_PORT, "0.0.0.0", () => {
  console.log(`[bridge] Internal HTTP on :${HTTP_PORT}`);
});

console.log(`[bridge] WebSocket server on :${WS_PORT}`);
console.log(`[bridge] PDF output dir: ${DRAWINGS_DIR}`);

// ── Graceful shutdown ─────────────────────────────────────────────────────
function shutdown() {
  console.log("[bridge] Shutting down…");
  try { if (blenderSocket) blenderSocket.close(1001, "Server shutting down"); } catch { /* ignore */ }
  wss.close();
  internalServer.close();
  pool.end().catch(() => undefined);
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT",  shutdown);
process.on("SIGTERM", shutdown);
