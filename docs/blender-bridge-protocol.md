# Blender Bridge — Addon-Side Protocol Brief

**Audience**: the other Claude/agent building the Blender addon's
WebSocket client.

**Repo this brief lives in**: precast-crm
**Branch implementing the server side**: `drawingModule`
**Service code**: `ws-bridge/server.js` (Node, `ws` + `pg`)

This brief tells you everything you need to write the addon's
WebSocket client + drawing logic. The server side is done — do
NOT change anything in this repo.

---

## 1. What the server gives you

A single self-hosted WebSocket service per CRM instance:

```
Production : wss://<crm-host>/ws?secret=<BRIDGE_SECRET>
Local dev  : ws://localhost:8765/?secret=<BRIDGE_SECRET>
```

- Path `/ws` is proxied by Caddy to `ws-bridge:8765` (TLS upgrade
  automatic in prod). Locally the bridge listens on `:8765`
  directly.
- Authentication is the `secret` query param. Wrong secret → close
  code **4001 "Unauthorized"** immediately.
- Exactly **one** authenticated client at a time. If you reconnect
  with the same secret, your previous socket is closed with code
  **4002 "Replaced by new connection"** before yours becomes
  active. Plan for one persistent connection per Blender session.

## 2. Connection lifecycle from your side

1. User pastes the bridge URL + secret into the addon prefs panel.
2. Addon opens the WebSocket. If close-code is `4001`, surface
   "Wrong secret" to the user; if `4002`, the user has another
   Blender already connected (rare in personal use).
3. **As soon as you connect**, the server pushes any `PENDING`
   `DRAWING_REQUEST` messages it has queued. Handle these on
   connect — don't wait for the user to do anything.
4. The server then pushes new messages as they arrive (within
   ~2s of the CRM creating them). Keep the socket open.
5. On disconnect, the server marks you offline — the CRM's
   sidebar indicator flips red within 5s.

## 3. Message types (server → you)

Only one outbound message type from the server right now:

```json
{
  "type": "DRAWING_REQUEST",
  "requestId": "clz4abcd1234",
  "rooms": [ /* see §5 */ ],
  "sourceType": "order",          // or "project"
  "sourceId": "clz4ord567",       // the Order.id or Project.id
  "createdAt": "2026-05-12T08:30:00.000Z"
}
```

Keep `requestId` — you'll send it back. Everything else is for
context (you can show it in the addon UI: "Received order X with
N rooms").

## 4. Message types (you → server)

Three messages the server accepts:

### 4.1 `ACK` — happy path

After you successfully add the rooms to the Blender scene:

```json
{ "type": "ACK", "requestId": "clz4abcd1234" }
```

The server flips that request's status to `DELIVERED`. The
operator's web UI button transitions from "Waiting for Blender…"
to "Sent ✓" within their next 1-second poll.

### 4.2 `ERROR` — sad path

If anything goes wrong on your side (room dimensions impossible,
addon dependency missing, user clicked cancel mid-build, etc.):

```json
{
  "type": "ERROR",
  "requestId": "clz4abcd1234",
  "error": "Inner width 0 is invalid for room \"Bedroom\""
}
```

The server flips status to `FAILED` and stores the `error` string.
The operator sees that string verbatim in the web UI. Make
messages actionable — they'll appear in the CRM to a non-technical
operator.

### 4.3 `PING` — optional keepalive

```json
{ "type": "PING" }
```

The server replies with `{ "type": "PONG" }`. You don't need to
ping — the WebSocket protocol has its own keepalive — but if you
do, the server will respond. Useful only if you want a
"connection healthy" cue in the addon UI.

## 5. Room data shape (protocol v2 — Nov 2026)

The rooms array contains zero or more rooms in the
**snake_case Blender shape** (already normalized server-side by
`src/lib/blender-bridge/normalize-rooms.ts`):

```ts
type BlenderRoom = {
  name: string;            // operator-set label, max 64 chars
  inner_width: number;     // metres, always > 0
  inner_length: number;    // metres, always > 0
  bearing: number;         // metres, ≥ 0, default 0.15
  pattern: "GB" | "BGB" | "GBG";
                           // RESOLVED — CRM has already auto-picked
                           // and applied force_start_beam. Trust it.
  correction: number;      // metres, default 0 (informational only)
  extra_beams: number;     // non-negative integer
  force_start_beam: boolean; // informational only (already applied)
  pitches: number;         // RESOLVED — post-bump pitch count.
                           // Trust verbatim; do NOT recompute from
                           // effective_length / PITCH.
};
```

Guarantees you can rely on:
- `inner_width > 0` and `inner_length > 0`
- `name` is non-empty
- `pattern` is exactly "GB" | "BGB" | "GBG" — never null in v2
- `pitches` is a positive integer
- `rooms.length ≥ 1` and `rooms.length ≤ 50`

### Migration note from v1

Older versions of this protocol sent `pattern: "GB" | "BGB" | "GBG" | null`
where `null` meant "addon picks." That contract led to drift between the
CRM's billing calculator and the addon's geometry calculator when
`correction > 0` (different remainder-bump behavior). v2 removes the
ambiguity: the CRM commits to a `pattern` and a `pitches` count, and the
addon renders exactly what the invoice charges. There is no auto-pick on
the addon side anymore.

If you previously wrote auto-pick code in the addon, you can delete it —
the CRM owns that decision now. `correction` and `force_start_beam` are
still in the payload for context (e.g. you might want to show them in
the addon UI), but they don't affect the count.

Map `pattern + pitches` directly onto your scene-builder. Each pattern
implies the count and arrangement:

| pattern | beams placed                | block rows placed                |
|---------|-----------------------------|----------------------------------|
| `GB`    | `pitches`                   | `pitches`                         |
| `BGB`   | `pitches + 1` (closing beam) | `pitches`                         |
| `GBG`   | `pitches`                   | `pitches + 1` (closing block row) |

`extra_beams` adds that many additional beams along the length axis (per
existing v1 behavior — unchanged).

Example payload (2 rooms):

```json
{
  "type": "DRAWING_REQUEST",
  "requestId": "clz4abcd1234",
  "rooms": [
    {
      "name": "Bedroom",
      "inner_width": 4.2,
      "inner_length": 5.6,
      "bearing": 0.15,
      "pattern": "GB",
      "correction": 0,
      "extra_beams": 0,
      "force_start_beam": false
    },
    {
      "name": "Kitchen",
      "inner_width": 3.8,
      "inner_length": 4.0,
      "bearing": 0.15,
      "pattern": null,
      "correction": 0.02,
      "extra_beams": 1,
      "force_start_beam": false
    }
  ],
  "sourceType": "project",
  "sourceId": "clz4proj789",
  "createdAt": "2026-05-12T08:30:00.000Z"
}
```

## 6. Scene-side behavior (your call, but suggested)

The CRM is **non-destructive** by design — the spec says "adds
to existing scene". Suggested addon behavior:

1. On `DRAWING_REQUEST`, group all rooms into a new top-level
   Blender Collection named e.g.
   `CRM · Order 2026-05-0008` (use `sourceType` + `sourceId` or
   fetch a friendlier label from the addon UI).
2. Position rooms in a tidy row, not overlapping any prior import.
3. Send `ACK` once the collection is built and visible.
4. If user has the scene open in Blender already, don't clear it.

Phase 1 is one-direction. Don't try to return PDFs / images back
through the bridge — that's deferred.

## 7. Reconnect / resume

The server's `flushPending` runs on every new connection AND
every 2 seconds. So if Blender crashes and reopens, anything
that was sent during the downtime arrives again. Two implications:

- **Idempotency**: keep a small set of recently-ACK'd `requestId`s
  in the addon's memory; ignore duplicate `DRAWING_REQUEST`s
  with a `requestId` you already processed. The server should
  not push DELIVERED rows, but a race on a slow ACK is possible.
- **No retries needed from your side**: if you fail to ACK, the
  server keeps the row `PENDING` and the next poll re-pushes it.
  But also see idempotency above — be conservative about acting
  on the same `requestId` twice.

## 8. Local testing without writing addon code yet

A minimal `wscat` session that proves the server side end-to-end:

```bash
# Connect (replace SECRET with the value the operator gives you)
wscat -c "ws://localhost:8765/?secret=SECRET"

# Server immediately pushes any PENDING rows, e.g.:
# < {"type":"DRAWING_REQUEST","requestId":"clz4abc","rooms":[…],…}

# ACK it:
> {"type":"ACK","requestId":"clz4abc"}

# The CRM operator's web UI flips from "Waiting…" to "Sent ✓"
# within 1 second.
```

To simulate an error:
```bash
> {"type":"ERROR","requestId":"clz4abc","error":"Bedroom dims invalid"}
```

## 9. Configuration the addon should expose to the operator

Two text fields in the addon preferences:

| Field | Default | Example |
|---|---|---|
| Bridge URL | `wss://your-crm-host/ws` | `wss://crm.example.com/ws` |
| Shared secret | (empty) | 64-character hex |

The addon constructs the connect URL as `<Bridge URL>?secret=<secret>`.

Optional toggles:
- "Auto-reconnect on disconnect" (default ON — exponential backoff up to 30s)
- "Status" read-only field showing `Connected · uptime` / `Disconnected · reason`

## 10. Test against the running local bridge right now

The bridge is running locally on Aziz's dev machine as of this
brief:

```
Address : ws://localhost:8765/
Secret  : (ask Aziz — generated fresh with openssl rand -hex 32)
```

The bridge prints `[bridge] Blender connected` to stdout when
your client authenticates correctly. If you don't see that line,
your secret is wrong, the close-code will be 4001, and the
`[bridge] Rejected connection — wrong secret` log line will
show up.

## 11. What NOT to do

- Don't open multiple connections from one Blender process. The
  server only keeps one; a second connection from the same
  client bumps the first and you'll see ping-ponging.
- Don't expect server-pushed messages on intervals tied to wall
  time — the server only pushes when a `DRAWING_REQUEST` actually
  exists or a flush is triggered.
- Don't ACK without actually building the scene. The operator
  trusts the green "Sent ✓" to mean the rooms are there.
- Don't try to reach `/flush` or `/status` — those are
  cross-container internal endpoints, not part of your contract.
- Don't write to the database directly. ACK/ERROR via WebSocket
  is the only protocol.

## 12. Open questions / things to coordinate later

- **PDF return direction** (Phase 2): a future message type
  `DRAWING_RESULT` from addon → server with a base64 PDF blob,
  stored against the originating `DrawingRequest`. Not in this
  scope but plan for the field-shape.
- **Multiple-Blender support**: if you ever want two laptops
  connected at once, the server will need to drop the
  "single-socket" constraint. Currently the second connection
  bumps the first.
- **Long-running renders**: 30s UI timeout is the operator-side
  patience. If your scene build takes longer, talk to the CRM
  team about extending the polling window.
