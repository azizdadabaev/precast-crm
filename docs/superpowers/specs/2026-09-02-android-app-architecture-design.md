# EtalonSlabs CRM — Android App Architecture & Stack

**Status:** DRAFT for owner review · **Date:** 2026-09-02 · **Scope:** wholesale planning (stack, architecture, screen re-imagining, phased roadmap) for a native Android client of the existing Precast CRM. No code in this spec.

This document was produced from a six-agent survey of the live codebase (data model, 128 API routes, 30+ screens, the calculation and CAD engines, integrations/infrastructure, and the design-token system). Every constraint below is grounded in a file that exists today.

---

## 0. Decision summary (read this first)

| # | Decision | Choice | Why |
|---|---|---|---|
| D1 | Platform floor | **`minSdk = 36` (Android 16) as requested; `targetSdk = compileSdk = 36`** | Owner asked for Android 16+. Flag: this excludes most phones in the field today (Android 16 shipped mid-2025). The codebase never depends on API 36 features, so lowering to `minSdk 28` later is a one-line change. **Recommendation: ship Phase 1 at `minSdk 28`, `targetSdk 36`; revisit.** |
| D2 | Language / UI | **Kotlin 2.x · Jetpack Compose · Material 3 with a custom Etalon theme** | Compose is the only sane path for a CAD canvas + adaptive layouts; Material 3 gives free large-screen behaviour Android 16 now enforces. |
| D3 | Architecture | **Multi-module, UDF (unidirectional data flow): ViewModel + StateFlow → Repository → (Room cache ‖ Retrofit API)** | Matches how the web already thinks (React Query ≈ repository + cache). |
| D4 | Backend | **Same Next.js API, same Postgres. No BFF, no GraphQL.** A small "mobile enablement" change-set on the server (Phase 0) | 128 routes already cover everything. Rewriting a backend for one client is waste. |
| D5 | Auth | **Bearer JWT in `Authorization` header** (server must start honouring the dead `getUserFromRequest` path) · token in Android Keystore · PIN login · biometric re-unlock | Cookie jar works but is fragile for SSE, WorkManager uploads and FCM. Bearer is one server change. |
| D6 | Realtime | **FCM push for notifications; SSE only while a screen is foregrounded** (inbox thread, orders list) | Web has zero push. Field users need "order placed / payment confirmed" while the app is closed. |
| D7 | Offline | **Read-through cache in Room for everything; write outbox for append-only uploads only** (photos, receipts, comments). Status changes and payments are online-only. | Server has no optimistic locking or idempotency. Queueing state changes would create silent double-writes. |
| D8 | Calculation engine | **Port `calculation-engine.ts` (529 LOC, zero deps) to a pure Kotlin module, verified against exported golden vectors.** Server stays authoritative on Save/Place (already true). | Quoting during a phone call in a warehouse with no signal is the core sales moment. `/api/calculate` is dead code with stale pricing. |
| D9 | CAD canvas | **Port the 3 200-LOC pure geometry libs to Kotlin; rebuild the 4 020-LOC SVG `RoomCanvas` as a touch-first Compose `Canvas`** — Phase 3 | Owner's stated true priority is the drawing tool's *feel*. Touch CAD is a different interaction model, not a shrink. |
| D10 | Navigation model | **Role-derived bottom bar (max 5) + "Яна" sheet; list-detail panes on ≥600 dp** | 26 sidebar destinations do not fit a phone. Permissions already tell us what each user needs. |
| D11 | Language | **Uzbek Cyrillic only in v1** (`values/` is `uz-Cyrl`), string resources keyed so `values-en` can be added | CLAUDE.md §3 is non-negotiable. The web's bilingual "·" mode is a desktop affordance. |
| D12 | Distribution | **Google Play closed-testing track + Firebase App Distribution for betas** | ~10–15 staff users; Play handles updates and signing. |

---

## 1. What exists today (constraints the app inherits)

### 1.1 Backend contract
- **Envelope:** `{ok:true,data}` / `{ok:false,error,details?}` on all but a handful of routes (`drawings/*` return bare JSON, SSE and webhooks return text). Errors are bilingual `"Uzbek · English"` strings. Zod → 422 with `details` flatten; Prisma P2002 → 409.
- **Auth:** name + 4-digit PIN → HS256 JWT (7 d) in httpOnly cookie `precast_token`. Login response also returns the raw `token`. **All `withPermission`/`withAuth` wrappers read the cookie only**; `getUserFromRequest()` supports Bearer but has zero call sites. Middleware gates `/api/*` on the cookie before handlers run. No refresh token. Permissions are re-read from DB per request (not in the JWT).
- **Inbox second factor:** `inbox_unlock` cookie (12 h) from `POST /api/inbox/unlock` with a shared password. Locked → 403 `details.code = INBOX_LOCKED`.
- **Authorization:** 42 permission keys in `src/lib/permissions.ts`; roles are templates only. `order.viewAll`, `client.viewAll`, `report.*`, `comment.moderate` are declared but never enforced. Gazoblok is open to any authenticated user.
- **Money:** `Decimal(14,2)` **major UZS units serialized as strings** (`"1250000.00"`). Never parse to `Double`.
- **IDs:** all `cuid()` strings. Human keys: `orderNumber` `YYYY-MM-NNNN`, gazoblok `B-YYYY-MM-NNNN`, `draftNumber` rendered `NNNND`.
- **Pagination:** three dialects (offset `{items,total,page,pageSize,totalPages}` on orders/audit; opt-in `{rows,total,page,pageCount}` on clients/projects that return a bare array without `?page`; cursor `{comments|events,nextCursor}`); capped bare arrays elsewhere.
- **Uploads:** multipart, field `file` (exceptions: `photo`, `voice`, repeated `file` + `loadedLines`), JPEG/PNG/WebP only, byte-sniffed, 8 MB (voice 12 MB OGG/OPUS, documents 50 MB, Caddy hard cap 64 MB). **HEIC is rejected server-side** — conversion is a client duty.
- **Media:** relative `/uploads/...` paths in every response; served by Caddy **publicly, no auth**. Client must prepend origin.
- **Realtime:** two SSE streams (`/api/notifications/stream` with `Last-Event-ID` replay ≤10 min; `/api/inbox/stream` no replay). In-process buses — single app container. **No push, no service worker.**
- **Timezone:** server pins `TZ=Asia/Tashkent`; `?day=`, `?month=` bucket by server-local day.
- **Rate limits:** ai-extract 12/min, drawings 10/min, handoff 30/h. No global limiter, no CORS (irrelevant to native).
- **Concurrency:** no `version`/ETag anywhere. Last write wins. Hard deletes exist for orders/projects/clients — cached rows can vanish.

### 1.2 Business logic that lives on the client today
| Module | LOC | Deps | Tests | Port? |
|---|---|---|---|---|
| `src/services/calculation-engine.ts` | 529 | none | 616 + 128 + 212 + 63 LOC vitest | **Yes** (D8) |
| `src/lib/cad/geometry.ts` + `snap.ts` + `beam-scan.ts` + `offset.ts` + `constraints.ts` + `grid.ts` + `presets.ts` | 3 094 | none | ~3 300 LOC vitest | **Yes** (D9) |
| `src/lib/cad/boolean.ts` | 104 | `polygon-clipping` | 58 LOC | Yes, via a Kotlin clipping lib (see §6.4) |
| `src/components/cad/RoomCanvas.tsx` | 4 020 | SVG DOM | none | **Rebuild**, not port |
| `src/services/gazoblok-engine.ts` | 356 | none | 134 LOC | Yes (small) |
| `src/sandbox/tapered-beam-block/engine` | ~1 050 | none | 10 files | No (experimental; scanline engine covers tapered rooms) |
| `src/lib/phone.ts`, `order-number.ts`, `utils.ts` formatters | small | none | yes | Yes (formatting parity) |

Reference for engine parity: `BLENDER_CALC_SPEC.md` (454 LOC) restates every rule with numbered test cases. Rounding is **half-away-from-zero** (`round3` lengths, `round2` money), not banker's — port must match bit-for-bit on the test vectors.

### 1.3 Design tokens (source: `globals.css`, `layout.tsx`)
- **App shell:** ground `#f3f5fb` / `#1a1c21`, surface `#ffffff` / `#262830`, border `#dde1f0` / `#41444f`, text `#0c0f1a` / `#e0e1e6`, muted `#5a6488` / `#989ba4`, **primary `#4e80ff`** / `#5d85ed`, success `#059669` / `#45c2a0`, warning `#d97706` / `#e29a4d`, destructive `#dc2626` / `#d65d63`, gold `#b45309` / `#d4a258`. Radii 10 / 6 / 4 px.
- **Dashboard (editorial):** paper `#F4F3EE` / `#0E1311`, ink `#15181D` / `#ECEFEA`, **accent green `#0E7C5A`** / `#34D39A`, terracotta `#C0492F` / `#F08A6E`, radius 14 px.
- **Type:** Manrope (body, Cyrillic ✓), JetBrains Mono (numerics; web loads Latin subset only — a bug the app avoids by bundling the full family), Playfair Display + IBM Plex Mono + Golos Text (dashboard only).
- **Status encoding:** order status → chip variant + 3 px left border (`PLACED` blue, `IN_PRODUCTION`/`LOADED` amber, `DISPATCHED` gold, `DELIVERED` green, `CANCELED` red). Payment state: paid = green, partial = accent, pending = muted (dashboard) / amber (tables) — the app unifies on the dashboard triad.
- **Number format:** space thousands, comma decimal, `UZS` suffix, `м²`, `та`; phone `+998 90 111 22 33`; dates `5 сен 2026`.

### 1.4 Mobile web today
One breakpoint (`lg` 1024 px): sidebar becomes a drawer; everything else is the desktop page with horizontally scrolling 10-column tables and a dashboard that does not respond at all. Only `/orders/[id]` and `/gallery` have real mobile branches. This is the gap the native app closes.

---

## 2. Users and jobs-to-be-done (what the phone is *for*)

The desktop is for authoring and administration. The phone is for **the moment work happens away from a desk**. Roles map to permission sets that already exist:

| Persona (role template) | Where they are | Top phone jobs |
|---|---|---|
| **Owner** (OWNER) | everywhere | approve payments (`payment.confirm`), watch the day's KPIs, answer inbox escalations, see who loaded what |
| **Sales / operator** (SALES) | on the phone with a customer, at a site | quote in 60 s (calculator), save draft, share quote image to Telegram/WhatsApp, place order, look up client by phone, record a prepayment + receipt photo |
| **Factory / warehouse** (INVENTORY) | at the yard | log today's production, check stock, see what's scheduled to load, mark truck loaded with photo |
| **Dispatcher / driver-facing staff** (DRIVER template + `order.edit`) | at the truck / at the customer | split shipments, dispatch, **delivery proof photo + cash collected**, navigate to the pin |
| **Accountant** (ACCOUNTANT) | office / remote | payment queue, discrepancies, month ledger (read) |

Non-goals for the phone (stay on desktop): table designers, pricing-tier editing, agent knowledge-base authoring, sandbox/tapered, cad-test, pipeline, MCP, Excel backup, audit log deep filtering.

---

## 3. System architecture

### 3.1 Topology

```
┌──────────────────────── Android app (Kotlin / Compose) ────────────────────────┐
│  feature:*  →  ViewModels (StateFlow)  →  Repositories                          │
│                     ↓ read-through            ↓ online / outbox                 │
│               Room (SQLite cache)        Retrofit + OkHttp (Bearer)             │
│               DataStore (prefs)          OkHttp-SSE (foreground only)           │
│               Keystore (token)           WorkManager (upload outbox)            │
│               FirebaseMessaging (push)   CameraX / Photo Picker / MediaRecorder │
└──────────┬───────────────────────────────────────────────┬──────────────────────┘
           │ HTTPS  https://etalontbm.uz/api/*              │ FCM (Google)
           ▼                                                ▼
┌─────── Caddy ───────┐   /uploads/* static (public)   ┌── Firebase Cloud Messaging ──┐
│ reverse_proxy app   │◄──────────────────────────────►│  data messages, high priority │
└─────────┬───────────┘                                └──────────────▲───────────────┘
          ▼                                                           │ fan-out (Phase 0)
┌── Next.js 14 app (existing) ──┐   ┌── Postgres 16 ──┐   ┌── ws-bridge ─┐  (unchanged)
│ 128 routes · Prisma · buses   │──►│                 │   │ Blender PDFs │
│ + Phase 0 mobile enablement   │   └─────────────────┘   └──────────────┘
└───────────────────────────────┘
```

No new services. The only new external dependency is Firebase (FCM) — free tier, one project.

### 3.2 Phase 0 — server-side "mobile enablement" (small, backward-compatible)

These are the *only* backend changes the app needs. All additive; the web client is unaffected.

| # | Change | Files touched | Notes |
|---|---|---|---|
| S1 | **Honour `Authorization: Bearer`** in `getCurrentUser()` and in `src/middleware.ts` for `/api/*` | `src/lib/auth.ts`, `src/middleware.ts` | `getUserFromRequest` already exists; wire it. Cookie path stays. |
| S2 | **Mobile token lifetime + revocation**: `POST /api/auth/login` accepts `client: "android"` → JWT with `aud: "mobile"`, 30-day TTL, plus a `User.tokenVersion Int @default(0)` claim checked on every request; PIN reset / disable bumps it | `auth.ts`, `login/route.ts`, `prisma/schema.prisma` (additive column) | Gives the owner a kill switch for a lost phone (`user.disable` already exists). |
| S3 | **Push device registry**: `Device { id, userId, fcmToken @unique, platform, appVersion, lastSeenAt }` + `PUT /api/devices` / `DELETE /api/devices/:token`; `emitNotifications()` additionally sends an FCM **data** message per recipient device (title/body already pre-rendered in Uzbek) | new model, new route, `src/lib/notifications.ts` | Uses Firebase Admin SDK (server key in env `FIREBASE_SERVICE_ACCOUNT_JSON`). Fire-and-forget like the audit log. |
| S4 | **Idempotency on upload routes**: accept `Idempotency-Key` header on `delivery-proof`, `load`, `loaded-photos`, `shipments/:sid/load`, `payments/upload-receipt`, `payments/:id/receipts`, comments POST; store key→response for 24 h in a small table | `src/lib/api-auth.ts` helper + the listed routes | Needed so the WorkManager outbox can retry safely. Server already dedupes bot photos by `file_unique_id`; this generalises it. |
| S5 | **Inbox unlock via header**: `withInboxAccess` also accepts `X-Inbox-Unlock: <jwt>` (same 12 h JWT the cookie carries) | `src/lib/inbox-auth.ts` | Zero new secrets. |
| S6 | **Envelope normalisation for `drawings/*`** (wrap in `ok()`), and `Cache-Control: no-store` on all `/api/*` | 7 route files | Removes special-casing in the client. |
| S7 | **`GET /api/mobile/bootstrap`**: one call returning `me`, `pricing`, `capacity thresholds`, `regions version`, `minSupportedAppVersion` | new route | One round-trip on cold start; lets the server force-upgrade an old APK. |
| S8 | **OpenAPI generation** from the existing Zod schemas (`zod-to-openapi`) checked into `docs/api/openapi.json`; CI diff-fails on drift | `src/lib/validation.ts` annotations, script | Kotlin models generated from it (`openapi-generator`, kotlinx-serialization). This is the contract the app is built against. |
| S9 | Fix `/api/calculate` to use `loadPricingConfig()` and add `POST /api/calculate/batch` (rooms[] + discount → totals) | `calculate/route.ts`, `order-totals.ts` | Not on the hot path (engine is ported) but is the **parity oracle** in CI. |

Estimated size: ~600–900 LOC of TypeScript plus one additive migration (`Device`, `IdempotencyKey`, `User.tokenVersion`). All reversible.

### 3.3 Android module graph

```
:app                                   ← single Activity, nav host, FCM service, DI root
├── :feature:auth        (PIN login, forced PIN change, biometric unlock)
├── :feature:home        (role-based home: today, KPIs, queue cards)
├── :feature:orders      (list, detail, status advance, comments, print/share)
├── :feature:logistics   (load truck, split shipments, dispatch, delivery proof, drivers, map pin)
├── :feature:payments    (record, receipts, confirm queue, discrepancies, settle)
├── :feature:calculator  (rooms, live totals, drafts, place order, AI assist)
├── :feature:cad         (touch RoomCanvas, 3D optional)               ← Phase 3
├── :feature:clients     (search-by-phone first, detail, create/edit, export contacts)
├── :feature:production  (production log, inventory, low-stock)
├── :feature:gazoblok    (orders, new sale + wall calc, production, stock)
├── :feature:inbox       (conversations, thread, voice, AI proposals)   ← Phase 3
├── :feature:gallery     (photo feed, lightbox)
├── :feature:notifications (list, deep links)
├── :feature:settings    (profile, PIN, theme, users read-only, pricing read-only, drawings)
│
├── :core:calc           (pure Kotlin — engine port; no Android deps; KMP-ready)
├── :core:geometry       (pure Kotlin — CAD geometry/snap/scan port; no Android deps)
├── :core:model          (domain types: Money, Order, Client, Payment, … — enums mirror Prisma)
├── :core:network        (Retrofit, envelope adapter, auth interceptor, SSE client, upload client)
├── :core:database       (Room entities/DAOs, outbox tables)
├── :core:datastore      (prefs: theme, last route, inbox auto-lock)
├── :core:data           (repositories: combine network + database; one per aggregate)
├── :core:sync           (WorkManager outbox worker, FCM token refresh)
├── :core:designsystem   (EtalonTheme, tokens, type scale, components: StatusChip, MoneyText, …)
├── :core:ui             (formatters, error mapping, Uzbek strings shared, image prep)
└── :core:testing        (fakes, golden-vector loader, screenshot rules)
```

Rules: features depend on `core:*` only, never on each other (cross-feature navigation goes through typed routes in `:app`). `:core:calc` and `:core:geometry` are `kotlin("jvm")`/KMP modules with **no Android SDK**, so they run in plain JUnit in milliseconds and could later back an iOS build.

### 3.4 Stack (pinned by role, not by version — take latest stable at kickoff)

| Concern | Choice | Alternative considered |
|---|---|---|
| Language | Kotlin 2.x, coroutines + Flow | — |
| UI | Jetpack Compose + Material 3 (`material3`, `material3-adaptive`, `material3-adaptive-navigation-suite`) | XML Views — no; CAD canvas needs Compose `Canvas` |
| Navigation | Navigation 3 (typed `NavKey`s, back-stack as state) with `NavigationSuiteScaffold` (bottom bar ↔ rail) and `ListDetailPaneScaffold` | Navigation 2 — fine, but Nav3 fits adaptive panes better |
| DI | Hilt | Koin — acceptable if the team prefers |
| Network | Retrofit 3 + OkHttp 5 + kotlinx.serialization; `okhttp-sse` for streams | Ktor client — fine too; Retrofit has more Android muscle memory |
| Local DB | Room (KSP) with `Flow` queries | SQLDelight (if KMP later) |
| Prefs / token | DataStore (proto) · Android Keystore via `EncryptedFile`/`MasterKey` for JWT | — |
| Images | Coil 3 (OkHttp-backed, disk cache, HEIC decode native on Android) | Glide |
| Camera | CameraX (`ImageCapture`) + Android Photo Picker (no storage permission) | Intent to system camera — acceptable fallback |
| Audio (voice notes) | `MediaRecorder` with `OutputFormat.OGG` + `AudioEncoder.OPUS` (API 29+) → matches server's OGG/OPUS-only rule | — |
| Maps | `maps-compose` + Fused Location (new: "use my location" for the delivery pin — the web has no geolocation) | OSM via osmdroid if Google key is a problem |
| Charts | Vico 2 (Compose) for the home area/bar chart; custom `Canvas` for sparklines, donut, segment bars | — |
| Push | Firebase Cloud Messaging (data messages → local notification with deep link) | Foreground SSE service — battery-hostile, rejected |
| Background | WorkManager (outbox, constraints: network, backoff exponential) | — |
| Share image | Compose → `Bitmap` via `graphicsLayer.toImageBitmap()`/`Picture` → `FileProvider` → share sheet | — |
| PDF (Blender drawings) | `PdfRenderer` inline viewer + open-with | — |
| Testing | JUnit5 + Turbine (Flows) · Compose UI tests · Roborazzi screenshot tests (light/dark/fontScale 1.3) · Maestro E2E on a staging server | — |
| Build / CI | Gradle version catalog, convention plugins, GitHub Actions (build, unit, screenshot, lint, Play upload) · R8 full mode · Baseline Profiles | — |
| Crash / analytics | Firebase Crashlytics (no PII: never log phone numbers or amounts) | Sentry |

Android 16 specifics honoured: edge-to-edge (enforced), predictive back (`android:enableOnBackInvokedCallback`), adaptive layouts (orientation locks are ignored ≥600 dp — every screen must reflow), 16 KB page alignment for any native lib (none planned), `Notification.ProgressStyle` "Live Updates" for an in-progress upload/dispatch, Photo Picker, `POST_NOTIFICATIONS` runtime permission.

---

## 4. Cross-cutting design

### 4.1 Auth flow
1. Cold start → read token from Keystore. If present → `GET /api/mobile/bootstrap`. 401 → PIN screen. `mustChangePassword` → forced PIN-change screen (existing `POST /api/users/me/password` with empty `currentPin`).
2. PIN screen: login-name field (remembered per device) + 4-digit PIN pad (large targets, no keyboard). `POST /api/auth/login {loginName, pin, client:"android"}`. Store `token`; call `PUT /api/devices` with the FCM token.
3. **Re-unlock**: after 5 min in background (configurable) show a biometric prompt (BiometricPrompt, Class 3) that gates access to the still-valid token; fallback = PIN. This is a *local* gate; the server session is the JWT.
4. Every request: `Authorization: Bearer <jwt>`. Interceptor maps 401 → clear token → PIN screen; 403 → "Рухсат йўқ" snackbar and the action stays disabled (permissions from `me` drive UI gating exactly like `can()` on the web).
5. Inbox: on first entry per 12 h, password sheet → `POST /api/inbox/unlock` → keep the returned JWT in memory (not persisted), send as `X-Inbox-Unlock`. Auto-lock on the same idle timer the web uses.

### 4.2 Data layer contract
- **Domain types are hand-written in `:core:model`**; DTOs are generated from OpenAPI (S8) into `:core:network` and mapped explicitly. `Money` is a value class over `BigDecimal` constructed only from the server string; arithmetic on the client is display-only (remaining = total − paid) and mirrors `round2`.
- **Repositories expose `Flow<Resource<T>>`** (`Loading(cached?)`, `Success`, `Error(cached?, message)`). Every screen renders cached data immediately and shows a subtle "янгиланмоқда" state while refreshing — never a blank spinner if a cache exists.
- **Envelope adapter**: one OkHttp interceptor/Retrofit `CallAdapter` unwraps `{ok,data}` and turns `{ok:false}` (even on HTTP 200) into `ApiException(status, error, details)`. Machine codes surfaced as sealed types: `InboxLocked`, `PhoneBelongsToOther`, `SharedClientPhone`, `OrderAlreadyPlaced`, `BlenderOffline`, `RateLimited(retryAfter)`.
- **Pagination**: three small `Page<T>` mappers; the UI sees one `Pager`-compatible source (Paging 3 for orders/clients/gallery/audit; plain lists for capped arrays).
- **Media URLs**: `MediaUrl.absolute(relative)` prepends the configured origin; Coil requests carry no auth (server is public) — if the owner later closes `/uploads`, only this one function changes.
- **Dates**: all bucketing parameters (`day`, `month`, `from/to`) are formatted in `Asia/Tashkent`, never device zone.

### 4.3 Offline and sync (D7)
- **Cache**: Room tables for orders (list rows + full detail JSON), clients, payments queue, drivers, inventory, production (14 d), gazoblok orders/products/stock, notifications, gallery pages, pricing, regions, `me`. TTL-based refresh (30 s stale like React Query) + explicit pull-to-refresh + push-triggered invalidation (FCM `orders` nudge, same semantics as the SSE `orders` event).
- **Outbox** (WorkManager, unique work per item, `Idempotency-Key` = client UUID): delivery-proof, load-truck photo, extra loaded photos, shipment load, receipt uploads, comments. Each outbox row shows in the UI as "Юборилмоқда…" on the affected order with retry/cancel. Photos are compressed *before* enqueue (see 4.5) so the queue never holds 8 MB originals.
- **Never queued**: status changes, payments (amounts), cancellations, order edits, dispatch, confirm/reject. These require connectivity and show an explicit "Интернет йўқ" state with the action disabled. Rationale: no server-side conflict detection; a queued `DELIVERED` applied hours later would silently override a cancellation.
- **Eviction**: 404 on a cached id → delete locally (hard deletes exist).

### 4.4 Realtime
- **FCM data messages** `{type, notificationId, orderId?, paymentId?, projectId?, conversationId?, title, body}` → `NotificationCompat` with channel per type group (Buyurtmalar / Тўловлар / Хабарлар / Изоҳлар), deep link into the target screen, and a local invalidation of the affected cache. Sound: the app ships the same two-note chime as `new-order-chime.ts` as an OGG resource.
- **SSE, foreground only**: `/api/inbox/stream` while a thread/list is visible (thin pointers → refetch), `/api/notifications/stream` on the notifications screen with `Last-Event-ID` for replay. Torn down in `onStop`.
- Owner-only "Blender online" dot: poll `/api/drawings/status` only while the drawings section is visible (web polls at 3 s while pending).

### 4.5 Camera and media pipeline
`CameraX` or Photo Picker → decode (HEIC/JPEG) → EXIF-rotate → downscale longest edge 1280 px → JPEG q 0.65 (identical to `prepare-upload.ts`) → write to app cache → enqueue. Multipart field names per route are table-driven in `:core:network` (`file`, `photo`, `voice`, repeated `file` + `loadedLines`). Loaded-truck and delivery-proof flows open the camera *first* (viewfinder is the screen), because that is the job.

### 4.6 Errors and messaging
Every failed network call shows the server's Uzbek half of the bilingual string (split on ` · `), never a raw exception. 422 details are mapped to field errors. Retry affordances everywhere a list failed. Technical detail goes to Crashlytics breadcrumbs without PII.

### 4.7 Security
- Token only in Keystore-encrypted storage; cleared on 401/`user.disable`/`tokenVersion` mismatch.
- `android:allowBackup="false"`, `usesCleartextTraffic="false"`, `FLAG_SECURE` on payment/receipt screens optional (owner decision).
- No secrets in the APK except the public Maps key (already public in the web bundle) and the Firebase config (public by design).
- The existing `HANDOFF_DEVICE_TOKEN` path is **not** reused; if the call-handoff overlay is folded in (Phase 3 option), it authenticates as the user (S1) and the server accepts either.

---

## 5. Re-imagined screens (Android is not the website shrunk)

Principles: **one job per screen · thumb-reachable primary action · lists are cards, tables are gone · numbers in mono, tabular · camera-first for physical events · role decides the shell**.

### 5.1 Shell and navigation (D10)
Bottom bar destinations are computed from `me.permissions`, max 5, in this priority order; anything beyond goes to **Яна** (More):

| Destination | Label | Shown when |
|---|---|---|
| Home | Бош саҳифа | always |
| Orders | Буюртмалар | `order.view` |
| Calculator | Калькулятор | `calculator.use` |
| Inbox | Хабарлар | `inbox.access` |
| Payments | Тўловлар | `payment.view` (owner/accountant) |
| Production | Ишлаб чиқариш | `inventory.view` and not already 5 |
| Gazoblok | Газоблок | any-auth, if slot free |
| More | Яна | always (Clients, Gallery, Drivers, Discrepancies, Gazoblok, Notifications, Settings, Ledger…) |

On ≥600 dp (tablets, unfolded foldables — Android 16 ignores orientation locks here) the same destinations render as a navigation rail and lists open a detail pane beside them (`ListDetailPaneScaffold`). Predictive back everywhere.

### 5.2 Home (replaces `/dashboard` for everyone; the editorial dashboard survives for owners)
- **Everyone:** a "Бугун" (Today) column: scheduled loads today with capacity tier stripe, my outbox status, unread notifications count, quick actions (Янги ҳисоб, Мижоз қидириш, Расм юклаш).
- **`dashboard.viewBasic`:** operational tiles — today's deliveries, open discrepancies, loaded volume this month (from `/api/dashboard`).
- **`dashboard.view` (owner):** the editorial section in the dashboard palette: month headline (52→36 sp IBM Plex Mono), booked vs collected 12-month area chart (Vico, single tooltip, Uzbek labels with `UZS`), four money tiles in a 2×2 grid, payment donut, top clients. Month picker as a horizontal chip row instead of clicking bars.

### 5.3 Orders
- **List:** search field in the top bar (order №, client, phone, address — the same `q`), status as a horizontal chip row, day filter via a compact week strip backed by `/api/orders/capacity` (tier colour dot per day). Each row is a card: order № (mono, primary), client + phone (tap-to-call), scheduled weekday, total and paid (mono, right-aligned), status chip with the 3 px left stripe. Paging 3 infinite scroll. New-order chime when the FCM `orders` nudge arrives while the list is visible.
- **Detail (the cockpit, re-cut into a scrollable card stack + sticky bottom action bar):**
  1. Header card: №, client, phone (call / Telegram), address, delivery pin ("Навигация" opens Maps intent), scheduled date.
  2. **Status stepper** as a vertical timeline; the *next* step is the sticky bottom button: "Юкланди — расм олиш" (opens camera), "Етказилди — исбот" (camera + cash), disabled with the exact server reason when blocked (remaining balance, pending shipments).
  3. Rooms table → per-room cards with width × length, pattern, beams, blocks, m², subtotal; totals card (mono).
  4. Payments card: remaining big number, list of payments with status chips, actions "Тўлов қўшиш", "Чек бириктириш", "Қолдиқни ёпиш" (`payment.confirm`).
  5. Shipments card (when split): per-truck rows with load/dispatch/deliver buttons.
  6. Photos strip (loaded + delivery) → lightbox.
  7. Drawings (owner): Blender PDF list with inline preview.
  8. Comments with @mentions (chip picker from `/api/users/mentionable`).
  9. Overflow menu: Share quote image, Print (PDF via `PdfDocument` of the print layout), Edit order (opens calculator in edit mode), Cancel (reason + password sheet), Delete (owner).
- **Share quote:** the `CalculationShareCard` is re-implemented as a Compose layout honouring `/api/settings/table-design` colours/columns, rendered off-screen to a bitmap at 3× and handed to the share sheet (Telegram/WhatsApp) — same pixels, no HTML.

### 5.4 Calculator (Phase 2)
- Rooms as a vertical list of cards; each card = name, **two large numeric fields (Эни / Узунлиги, m, comma decimal)**, bearing/correction/extra beams behind "Қўшимча", pattern chip (auto/GB/BGB/GBG), per-room subtotal in mono. Adding a room = FAB. Reorder by drag handle.
- **Live totals in a persistent bottom sheet** (collapsed: total UZS + m²; expanded: subtotal, discount %/amount toggle, delivery, other, weight 180 kg/m², rounding grid).
- Client bar at the top: phone-first lookup (`/api/clients?phone=` autocomplete), name, address with the viloyat/tuman picker from `regions`.
- Actions: Сақлаш (draft → `POST /api/projects`), Улашиш (share image), **Буюртма бериш** (bottom sheet: capacity week strip, discount, delivery, prepayment + receipt camera).
- Draft persistence: Room table keyed by user (same semantics as `calculator-draft-<userId>`), survives process death.
- AI assist (if `calculator.aiAssist`): "Расмдан / матндан" button → Photo Picker or text → `POST /api/calculations/ai-extract` → proposed rooms shown as a review list before insertion (confidence badge).
- Tapered/irregular rooms come only through the CAD canvas (Phase 3); no sandbox port.

### 5.5 CAD canvas (Phase 3; owner's priority — designed for touch, judged by feel)
Rebuild, not port, of `RoomCanvas.tsx` on Compose `Canvas` with `pointerInput` gestures; all geometry from `:core:geometry`.
- **Gestures:** one-finger tap = place vertex (Draw) / select; long-press vertex = drag with a magnifier loupe offset above the finger; drag wall body = parallel slide with live offset readout; two-finger pinch/pan = zoom/pan (never conflicts with drawing); double-tap = fit.
- **Direct entry is primary on touch**: tapping any dimension opens a numeric keypad sheet (length, optional bearing angle) — the DDE workflow becomes the default way to draw precisely; polar snap (15/45/90) and grid snap (5/10/25/50) as toggles in a bottom tool rail.
- **Tool rail (bottom, thumb zone):** Чизиш · Танлаш · Тўртбурчак · Ўлчов · Тешик · Йўналтирувчи; secondary sheet: presets (L/T/U), rectify, mirror, rotate, boolean.
- **Snap feedback**: haptic tick on endpoint/midpoint/perpendicular snaps; dashed guide lines as on web; angle arcs on by default.
- Beam/block overlay, bay labels, dimension lines with the same offset-stacking logic; cell budget (600/1800) kept.
- Undo/redo global across rooms (100 snapshots) with on-canvas buttons.
- Output: bays → engine rows exactly as `DrawRoomDialog` does (rectilinear → `decomposeToBays`, otherwise scanline estimate rows labelled "(tapered)"); `drawingJson` persisted with the draft in the same `CalculatorDrawing` shape; PNG export via bitmap; "Blender-га юбориш" (owner) via `/api/drawings/request-cad`.
- 3D preview: optional, `Filament`/SceneView — deferred until the 2D tool feels right.

### 5.6 Payments and discrepancies
- **Record payment** sheet (from an order): amount keypad with quick chips (remaining, 50 %), method chips (Нақд / Банк / Click / Payme / Бошқа), source, collected-by-driver picker, `paidOn` date, receipt camera (multi). Auto-confirm note if the user has `payment.confirm`.
- **Confirm queue** (owner/accountant): tabs Кутилмоқда / Тасдиқланган / Рад этилган; each card shows expected vs received with shortfall in red, custody chain (collected → recorded → confirmed) as avatars; swipe-reveal Approve / Reject; approve sheet with amount adjustment + discrepancy choice (Track / Discount / Write-off).
- **Discrepancies**: list + resolve sheet (Recovered / Discount / Write-off / Disputed with note).

### 5.7 Logistics
- **Load truck**: camera-first full-screen; after capture, a review with beams-per-length steppers and block count (split shipments) or just confirm (single); then `Idempotency-Key`-safe upload via outbox.
- **Dispatch**: driver picker (active drivers), truck id, "ҳайдовчи нақд йиғади" toggle + amount.
- **Delivery proof**: camera-first; then cash amount keypad prefilled with `expectedCollection`, "нақд йиғилмади" toggle + note, "ҳайдовчи қайтди" toggle. Success → confetti-free, just the chime and the timeline advancing.
- **Delivery location**: map with "Менинг жойим" (fused location — a new capability), long-press to drop pin, paste-link resolver (`/api/geo/resolve-link`), "Навигация" intent.
- **Drivers**: roster with active-dispatch count, 30-day discrepancies; add/edit/deactivate (`driver.manage`).

### 5.8 Production, inventory, gazoblok
- **Production log**: a form built for gloves — beam length picker as big chips (the catalog lengths), quantity stepper, block quantity, date defaulting to today; last 14 days below as day sections.
- **Inventory**: per-length rows with low-stock tier colour; manual adjust sheet with signed keypad and mandatory note.
- **Gazoblok**: mirror of orders/detail/new with lines (size picker + qty), wall calculator as a sheet, shipments with multi-photo load, receipts; status advance with `stockWarnings` banner.

### 5.9 Clients
Phone-first search (paste or type; script-insensitive), region chips; card rows with orders count; detail with call/Telegram, orders, drafts; create/edit sheet with `AddressInput` equivalent (viloyat → tuman → street); "Контактларни экспорт" builds the same text via `/api/clients/export` and opens the share sheet.

### 5.10 Inbox (Phase 3)
Telegram-like chat with the `--tg-*` palette: conversation list with channel tabs and unread dots; thread with albums, voice player (waveform), image viewer; composer with text, attach (Photo Picker / file), **hold-to-record voice** (OGG/OPUS), send quote/drawing pickers; AI proposal card (Send / Edit / Dismiss / Place order); per-chat AI toggle; password unlock + idle auto-lock. Escalations arrive by push.

### 5.11 Settings / owner tools (thin)
Profile & PIN change, theme (system/light/dark), notification channels, inbox auto-lock, users list (read; toggle active with `user.disable`), pricing tiers (read-only view; edit stays on desktop), AI agent kill-switch + mode (`/api/agent/runtime`), app version + force-update banner, sign out (revokes device).

---

## 6. Design system on Android (`:core:designsystem`)

### 6.1 Colour
`EtalonColors` (light/dark) built from §1.3 tokens; exposed through `MaterialTheme.colorScheme` **plus** an `EtalonExtendedColors` composition-local for `success`, `warning`, `gold`, `border`, `borderStrong`, `textTertiary`, `surfaceHover`, and the dashboard set (`paper`, `ink`, `accentGreen`, `terracotta`). Dynamic colour (Material You) **off** — brand is fixed. Status chip = text colour + 14 % tint background (as `color-mix … 14%`), never solid fills. Payment triad: paid = success, partial = primary, pending = muted.

### 6.2 Typography
Bundled fonts (offline, Cyrillic-complete): **Manrope** 400/500/600/700/800 (body, titles), **JetBrains Mono** 400/500/700 (every number, `FontFeature "tnum"` + `"cv14"`), **Playfair Display** 600 + **IBM Plex Mono** 500/700 + **Golos Text** 400/500/600 (home/dashboard only). Material type scale mapped: display = Playfair 36 sp (home headline), headline = Manrope 24 sp semibold tight, title = 16–18 sp, body = 14–15 sp, label = 11–12 sp uppercase +0.08 em. `MoneyText`, `AreaText`, `CountText` composables enforce mono + tabular so digits never jiggle. Respect font scale up to 1.3 in screenshot tests.

### 6.3 Components (mirroring the web primitives, reshaped for touch)
`StatusChip(variant, glyph)`, `StatusStripeCard` (3 px left stripe), `MoneyText`, `KpiTile`, `SectionLabel` (mono uppercase tracked), `SearchTopBar`, `FilterChipRow`, `WeekCapacityStrip`, `NumericKeypadSheet`, `PhoneField` (+998 mask), `RegionPicker`, `PhotoStrip`, `Lightbox`, `TimelineStepper`, `StickyActionBar`, `OutboxBanner`, `EmptyState` (plain text, as on web: "Буюртма йўқ."), `ErrorBanner` (destructive 10 % tint + 30 % border). Hit targets ≥48 dp (Android norm; web asked 44).

### 6.4 Geometry and engine ports
- `:core:calc` — line-by-line port of `calculation-engine.ts` (`SlabInput`/`SlabResult` with the same field names in camelCase, `roundN` half-away-from-zero, `tierPrice`, `projectTotal`, `calculateExtrasOnly`) plus `gazoblok-engine.ts`. **Parity harness**: a script in the web repo dumps every vitest case + `BLENDER_CALC_SPEC.md` tests to `golden/calc-vectors.json`; the Kotlin test suite replays them and asserts exact equality of all 28 result fields.
- `:core:geometry` — `Pt`, `RoomShape`, `Bay`, `decomposeToBays`, `bayToSlabInput`, `scanBeams`, `beamSchedule`, `blockEstimate`, `beamLayout`, snap engine (8 types, priority order, guides), `orthoVertexMove`, `moveEdgeParallel`, `isValidOutline`, offset, constraints/`rectify`, presets, grid. Same golden approach from the 15 CAD test files. Boolean ops via a JVM polygon-clipping library (e.g. JTS `OverlayNG`) snapped to the 1 cm grid, verified against `cad-boolean.test.ts`.

### 6.5 Formatting (`:core:ui`)
`formatMoney` → `"542 200 000 UZS"` (space thousands, no decimals), `formatNumber(digits)` → comma decimal, `formatArea` → `"12,5 м²"`, `formatCount` → `"12 та"`, `formatPhone` → `+998 90 111 22 33`, `formatDate` → `5 сен 2026` with the hand-rolled `UZ_MONTHS_SHORT` (device ICU is not trusted, same as the server). Compact money for headlines: `млрд UZS` / `млн UZS`.

---

## 7. Delivery plan

| Phase | Weeks | Scope | Exit criteria |
|---|---|---|---|
| **0 · Server enablement + scaffold** | 2 | S1–S9; Android repo with module skeleton, design system, auth, bootstrap, CI, Play internal track | Staff can log in on a test build; OpenAPI committed; golden vectors exported |
| **1 · Field MVP** | 6–8 | Home (Today + basic KPIs), Orders list/detail, status advance with camera (load, delivery proof), split shipments & dispatch, payments record + receipts + confirm queue, clients, notifications via FCM, gallery, outbox | 10 staff on the closed track for 2 weeks; zero money-math divergence (server-recomputed totals always match displayed); crash-free ≥99.5 % |
| **2 · Sales** | 5–6 | Calculator (engine port + parity), drafts/projects, place order, share quote image, edit order, AI assist, production/inventory, Gazoblok full line, owner editorial home | Sales staff quote from the phone without the laptop for a full week; parity suite green in CI |
| **3 · CAD + Inbox** | 8–10 | Touch RoomCanvas (`:core:geometry` + Compose canvas), drawing versions, Blender send/view; Inbox (chat, voice, media, AI proposals, unlock); delivery map with device location; optional call-handoff module | Owner signs off on canvas *feel* against a checklist (snap, wall slide, DDE, undo across rooms); inbox parity with web |
| **4 · Polish** | 3–4 | Tablet/foldable panes, Baseline Profiles, accessibility (TalkBack labels in Uzbek, 1.3× font scale), ledger/audit read views, print PDF, force-update flow, Play production | Play production listing; minSdk decision revisited with real install data |

Total ≈ 24–30 engineering weeks for one senior Android engineer with the backend owner covering Phase 0; two engineers compress Phases 1–2 by ~40 %.

### 7.1 Testing strategy
- **Unit** (JVM): engine + geometry golden parity (blocking in CI), formatters, envelope/error mapping, repositories with fake API + in-memory Room.
- **Contract**: generated client vs `openapi.json`; nightly job hits a staging server with a seeded DB (`prisma/seed.ts`) and exercises every read route.
- **UI**: Compose tests for permission gating (a SALES user never sees Confirm), stepper blocking reasons, keypad input; Roborazzi screenshots of every screen × {light, dark} × {phone, 600 dp} × {1.0, 1.3 font}.
- **E2E** (Maestro): login → quote → place order → load photo → delivery proof → confirm payment, on an emulator against staging.
- **Manual**: real Uzbek phones on real 3G in the yard before each track promotion.

### 7.2 Risks
| Risk | Mitigation |
|---|---|
| `minSdk 36` leaves most staff phones unsupported | D1 recommendation; decide from a device census before Phase 1 ends |
| Engine drift between TS and Kotlin | Golden vectors in CI on both repos; server recompute on save is the last line |
| Server has no conflict detection | D7: no queued state changes; show "янгиланг" on 409/422 |
| Single-container SSE buses | Not used for push; FCM fan-out happens in the same process where notifications are created |
| Public `/uploads` (known open item) | One `MediaUrl` function; if the owner closes it, add a signed-URL header there |
| CAD "feel" is subjective | Phase 3 starts with a two-week interaction prototype on a real device before the full port; owner tests weekly |
| No Android SDK on the current dev machine | Phase 0 includes workstation setup (Android Studio, JDK 17+, SDK 36, emulator) |

---

## 8. Assumptions made in the owner's absence (please confirm or correct)
1. The app is for **staff only** (same users, PIN login), not for customers.
2. Backend changes in Phase 0 are acceptable (all additive, web unaffected).
3. Firebase (FCM + Crashlytics) is acceptable as a dependency.
4. Uzbek-Cyrillic-only UI in v1; the bilingual toggle is not needed on phones.
5. Google Play distribution is possible for the company (developer account) — otherwise Firebase App Distribution / signed APK link.
6. `minSdk` will be revisited (D1); the spec is written so the choice does not touch code.
7. Desktop-only tools (table designers, pricing edit, agent KB, sandbox, pipeline, MCP, Excel backup) stay on the web.

---

## 9. Next step
On approval of this spec: run `writing-plans` to produce (a) the Phase 0 server plan (TypeScript, testable with the existing vitest suite) and (b) the Phase 1 Android plan (module scaffold → auth → orders → camera flows → payments), each with TDD tasks.
