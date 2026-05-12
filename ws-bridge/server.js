// Self-hosted WebSocket bridge for the Blender feature.
//
// Owner-only personal feature: the CRM owner runs Blender on their
// laptop with the precast addon installed. The addon opens a single
// WebSocket connection to this service (authenticated via shared
// secret in the URL). When the owner clicks "Send to Blender" in the
// web app, a DrawingRequest row is created with status PENDING; this
// service polls / pushes those rows to the connected Blender, and
// the addon ACKs back so we mark them DELIVERED.
//
// Why a separate service instead of bolting WebSocket onto Next.js:
//  - Next.js (App Router, Vercel-style) doesn't have a long-running
//    server we can attach raw WebSockets to without going around it
//  - Keeps the WS protocol isolated from the request/response API
//  - Single Docker service, easy to restart independently
//
// Responsibilities:
//   1. Accept ONE Blender connection at a time (the second connection
//      bumps the first — owner runs Blender on one laptop)
//   2. On connect, immediately flush any PENDING rows
//   3. Poll the DB every 2s as a fallback for missed pushes (when the
//      web app's HTTP-trigger to /flush fails)
//   4. Expose an internal HTTP endpoint on :8766 that the Next.js
//      app can hit to trigger an immediate flush without waiting for
//      the polling tick

import { WebSocketServer, WebSocket } from "ws";
import http from "http";
import pg from "pg";

const { Pool } = pg;

const WS_PORT = Number(process.env.WS_BRIDGE_PORT || 8765);
const HTTP_PORT = Number(process.env.WS_BRIDGE_HTTP_PORT || 8766);
const DB_URL = process.env.DATABASE_URL;
const BRIDGE_SECRET = process.env.BRIDGE_SECRET;

if (!DB_URL) {
  console.error("[bridge] DATABASE_URL is required");
  process.exit(1);
}
if (!BRIDGE_SECRET) {
  console.error("[bridge] BRIDGE_SECRET is required");
  process.exit(1);
}

const pool = new Pool({ connectionString: DB_URL });

// Single-Blender connection model. If a second client arrives with the
// right secret it replaces the first — the owner probably restarted
// Blender or moved laptops.
let blenderSocket = null;
let blenderConnectedAt = null;

const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", (ws, req) => {
  const url = new URL(req.url, "http://localhost");
  const secret = url.searchParams.get("secret");

  if (secret !== BRIDGE_SECRET) {
    ws.close(4001, "Unauthorized");
    console.log("[bridge] Rejected connection — wrong secret");
    return;
  }

  // Replace any prior socket so we always have exactly one client.
  if (blenderSocket && blenderSocket.readyState === WebSocket.OPEN) {
    try {
      blenderSocket.close(4002, "Replaced by new connection");
    } catch {
      // ignore
    }
  }

  blenderSocket = ws;
  blenderConnectedAt = new Date();
  console.log("[bridge] Blender connected");

  // Push everything PENDING right away.
  flushPendingRequests().catch((err) => {
    console.error("[bridge] flush after connect failed:", err);
  });

  ws.on("message", async (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (err) {
      console.error("[bridge] Failed to parse message:", err);
      return;
    }

    try {
      if (msg.type === "ACK" && msg.requestId) {
        await pool.query(
          `UPDATE "drawing_requests"
           SET status = 'DELIVERED', "deliveredAt" = NOW(), "updatedAt" = NOW()
           WHERE id = $1 AND status = 'PENDING'`,
          [msg.requestId],
        );
        console.log(`[bridge] Request ${msg.requestId} delivered`);
      } else if (msg.type === "ERROR" && msg.requestId) {
        await pool.query(
          `UPDATE "drawing_requests"
           SET status = 'FAILED', "errorMessage" = $2, "updatedAt" = NOW()
           WHERE id = $1 AND status = 'PENDING'`,
          [msg.requestId, String(msg.error ?? "Unknown error")],
        );
        console.log(`[bridge] Request ${msg.requestId} failed:`, msg.error);
      } else if (msg.type === "PING") {
        ws.send(JSON.stringify({ type: "PONG" }));
      } else {
        console.log("[bridge] Unrecognized message type:", msg.type);
      }
    } catch (err) {
      console.error("[bridge] DB update failed:", err);
    }
  });

  ws.on("close", () => {
    if (blenderSocket === ws) {
      blenderSocket = null;
      blenderConnectedAt = null;
    }
    console.log("[bridge] Blender disconnected");
  });

  ws.on("error", (err) => {
    console.error("[bridge] WebSocket error:", err);
    if (blenderSocket === ws) {
      blenderSocket = null;
      blenderConnectedAt = null;
    }
  });
});

async function flushPendingRequests() {
  if (!blenderSocket || blenderSocket.readyState !== WebSocket.OPEN) {
    return;
  }

  let result;
  try {
    result = await pool.query(
      `SELECT id, "orderId", "projectId", "roomsJson", "createdAt"
       FROM "drawing_requests"
       WHERE status = 'PENDING'
       ORDER BY "createdAt" ASC
       LIMIT 50`,
    );
  } catch (err) {
    console.error("[bridge] flush query failed:", err);
    return;
  }

  for (const row of result.rows) {
    let rooms;
    try {
      rooms = JSON.parse(row.roomsJson);
    } catch (err) {
      console.error(
        `[bridge] row ${row.id} has invalid roomsJson; marking FAILED`,
        err,
      );
      await pool
        .query(
          `UPDATE "drawing_requests"
           SET status = 'FAILED', "errorMessage" = $2, "updatedAt" = NOW()
           WHERE id = $1`,
          [row.id, "Server: stored roomsJson failed to parse"],
        )
        .catch(() => {});
      continue;
    }

    const msg = {
      type: "DRAWING_REQUEST",
      requestId: row.id,
      rooms,
      sourceType: row.orderId ? "order" : "project",
      sourceId: row.orderId || row.projectId,
      createdAt: row.createdAt,
    };

    try {
      blenderSocket.send(JSON.stringify(msg));
      console.log(`[bridge] Pushed request ${row.id} to Blender`);
    } catch (err) {
      console.error(`[bridge] send for ${row.id} failed:`, err);
      // The socket is probably broken — bail and let the next tick
      // discover it via readyState.
      return;
    }
  }
}

// 2-second polling fallback. The Next.js API also POSTs /flush, but if
// that hop ever fails (network, race, container restart) this catches
// the request within 2 seconds.
setInterval(() => {
  flushPendingRequests().catch((err) =>
    console.error("[bridge] polling flush failed:", err),
  );
}, 2000);

// ── Internal HTTP endpoint ─────────────────────────────────────────
// NOT exposed to the internet. The Next.js container reaches it via
// the docker network at http://ws-bridge:8766. Two endpoints:
//   POST /flush  — trigger an immediate push of PENDING rows
//   GET  /status — { connected: boolean, connectedSince: ISO|null }
const internalServer = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/flush") {
    flushPendingRequests()
      .then(() => {
        res.writeHead(200);
        res.end("OK");
      })
      .catch((err) => {
        console.error("[bridge] manual flush failed:", err);
        res.writeHead(500);
        res.end(String(err));
      });
    return;
  }

  if (req.method === "GET" && req.url === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        connected:
          !!blenderSocket && blenderSocket.readyState === WebSocket.OPEN,
        connectedSince: blenderConnectedAt
          ? blenderConnectedAt.toISOString()
          : null,
      }),
    );
    return;
  }

  res.writeHead(404);
  res.end();
});

internalServer.listen(HTTP_PORT, "0.0.0.0", () => {
  console.log(`[bridge] Internal HTTP on :${HTTP_PORT}`);
});

console.log(`[bridge] WebSocket server on :${WS_PORT}`);

// Graceful shutdown so docker compose down doesn't leave half-open
// sockets and a hung pg pool.
function shutdown() {
  console.log("[bridge] Shutting down…");
  try {
    if (blenderSocket) blenderSocket.close(1001, "Server shutting down");
  } catch {
    // ignore
  }
  wss.close();
  internalServer.close();
  pool.end().catch(() => undefined);
  setTimeout(() => process.exit(0), 500);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
