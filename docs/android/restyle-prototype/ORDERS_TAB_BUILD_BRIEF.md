# Build brief — Orders tab (List + Capacity Calendar) for Etalon Android

Paste this to the Android build agent. It tells the agent where the web behaviour lives, what to reuse, and exactly how the mobile version must function. Visual tokens and components are in `ANDROID_DESIGN_SPEC.md`; interactive reference is `Etalon Mobile v2.dc.html` (option 2b = list, 4a = calendar).

---

## 0. Task

Implement the **Buyurtmalar (Orders)** tab of the Android app as one screen with a Рўйхат / Жадвал segmented control. Both views read the same order data and share search/filter state. Do not invent new business rules — read them from the web repo listed below and port them.

## 1. Read these first (repo `azizdadabaev/precast-crm`, branch `main`)

Orders list & statuses
- `src/app/(app)/orders/page.tsx` — list page: search (№ / client / phone / address), status tabs (БАРЧАСИ · ҚАБУЛ ҚИЛИНГАН · ИШЛАБ ЧИҚИЛМОҚДА · ЖЎНАТИЛГАН · ЕТКАЗИЛГАН · БЕКОР ҚИЛИНГАН), how a day selected in the calendar filters the list, Excel export button.
- `src/app/api/orders/route.ts` — GET list contract: `?q=&status=&day=YYYY-MM-DD&page=&pageSize=` → `{ items, total, page, pageSize, totalPages }`; `q` matches orderNumber, client name, address (Latin↔Cyrillic widened), phone forms; `day` is bucketed in server-local time (Asia/Tashkent); sort `scheduledAt asc, placedAt desc`. Status enum uses `CANCELED` (one L).
- `src/app/(app)/orders/[id]/page.tsx` — detail page; only needed to know which fields the list row must carry to open detail.
- `src/lib/month-orders.ts` (+ `.test.ts`) — month grouping helpers used by dashboard; reuse for month headers/subtotals.

Capacity calendar
- `src/components/orders/CapacityCalendar.tsx` — the web calendar: month grid, Monday-first week, leading/trailing days from adjacent months, per-day `count`, `total_m2`, `total_amount`, tier stripe, legend, today marker, day selection → list filter, month picker.
- `src/app/api/orders/capacity/route.ts` — GET `/api/orders/capacity?from=YYYY-MM-DD&to=YYYY-MM-DD` → `{ days: [{ date, totalArea, totalOrders, totalBlocks }], thresholds: { low: 300, moderate: 450, heavy: 600 } }`. Days with no orders are omitted (client fills zeros); CANCELED orders are excluded. Thresholds come from the server; never hardcode them client-side (defaults only as fallback). Request the visible grid range (incl. leading/trailing days), not just the month.
- `src/app/globals.css` — search `dash-week-bar[data-load=` and `capacity` for how the four load tiers are coloured on the web (success / warning / gold / destructive).

Export
- `src/app/api/orders/export/route.ts` + `src/workers/order-export-worker.js` — Excel export is server-side. On Android: call the endpoint, then share the file via the system share sheet (no client-side xlsx building).

Enums & labels
- Search the repo for `ЕТКАЗИЛГАН`, `ЖЎНАТИЛГАН`, `ҚАБУЛ ҚИЛИНГАН`, `БЕКОР` to get the canonical status enum → Uzbek Cyrillic label map. Use those exact strings. Auth: every endpoint is behind `withPermission("order.view")` — reuse the session/token the app already holds.

## 2. What the mobile version must do

### 2.1 Screen shell
- Title "Буюртмалар", subtitle `N буюртма · X м²` (list) or `Жойлаштириш жадвали · кун сиғими м²` (calendar).
- Right header action: `+ Янги` (opens Calculator) in list mode; Excel export icon button in calendar mode.
- Segmented control (navy pill): **Рўйхат** | **Жадвал**. Persist the last chosen view.

### 2.2 Рўйхат (list) — spec §3.2 of ANDROID_DESIGN_SPEC.md
- Search field (client / № / phone / address; ignore spaces in phone).
- Status filter chips with counts; chips scroll horizontally; the web tab **БЕКОР ҚИЛИНГАН** must also exist (add `CANCELED` to the StatusTag palette: bg `#EEEEF3`, fg `#A7A6AE`, strike-through amount).
- Navy sheet with sub-segments Барчаси / Қарз / Тўланган, rows grouped by month with month subtotal; row = avatar · client · StatusTag + `№ · м²` · amount · debt/paid.
- Tap row → order detail. Pull to refresh. Paginate as the API dictates (infinite scroll).
- When a calendar day is selected (see 2.3) and the user switches back to Рўйхат, show a dismissible chip `12 сен ×` above the list and filter to that scheduled day — same behaviour as the web.

### 2.3 Жадвал (capacity calendar) — prototype 4a
Layout
- White card radius 16: month header (‹ month title · `N буюртма · X м²` › ), weekday row `Ду Се Чо Па Жу Ша Як` (Monday first), 7-column grid of day cells, legend row.
- Day cell (h56, radius 10): top row = day number (12/600; today 800 indigo) + `totalOrders` (9/700 ink3); middle = `{totalArea} м²` (9.5/600 in tier colour); bottom = 3dp load bar `min(totalArea / heavy, 100%)`.
- Tier colours: Available ≤ low → `#22B07D` on `#E6F7F0`; Moderate ≤ moderate → `#F0A868` on `#FDF1E6`; Heavy ≤ heavy → `#C2622D` on `#F8E6DC`; Overbooked > heavy → `#E5484D` on `#FDECEC`. Empty day → white with hairline, no bar. Adjacent-month days at 35% opacity, not tappable.
- Today: indigo 1dp ring. Selected day: navy fill, white text, bar track `#262B40`.
- Legend: four 10×3 pills with `≤300 м²  ≤450  ≤600  >600 тўлиб кетган` using the server thresholds.

Behaviour
- Month navigation by arrows and horizontal swipe; fetch `/api/orders/capacity?from=&to=` for the visible 5–6 week grid range, cache per month for the session, show skeleton cells while loading.
- Tap a day → **Day sheet** (navy, radius 22) under the grid: `{d} {mon} {yyyy} · {weekday}`, big `{totalArea} м²` + tier tag (`мавжуд / ўртача / юқори / тўлиб кетган`), `{totalOrders} буюртма · {totalBlocks} ғишт`, 5dp capacity bar, then that day's orders from `/api/orders?day=YYYY-MM-DD` (sum `items[].totalAmount` client-side for the money line). Tap a row → detail.
- Empty day sheet text: `Бу кунга буюртма йўқ. Сиғим бўш — {heavy} м²`.
- Selecting a day also sets the shared day filter used by Рўйхат (2.2).
- Default selected day on open: today if in the shown month, else none.

### 2.4 Reuse in Calculator
- The delivery-date picker in the Calculator's client form must open this same calendar grid (read-only tiers, single tap selects a date) so the seller sees load while scheduling. Show the tier tag of the chosen date next to the field.

## 3. Data mapping
| Mobile field | Source |
| --- | --- |
| day.totalOrders / totalArea / totalBlocks | `/api/orders/capacity?from&to` `days[]` (missing date = 0) |
| thresholds.low / moderate / heavy | same response, fallback 300 / 450 / 600 |
| order scheduled date | `order.scheduledAt` (bucket in Asia/Tashkent local day, same as the server) |
| day filter for list | `/api/orders?day=YYYY-MM-DD` |
| status labels | repo enum (`PLACED, IN_PRODUCTION, DISPATCHED, DELIVERED, CANCELED`) → Cyrillic map |
| month grouping | `src/lib/month-orders.ts` |

## 4. Acceptance
- For September 2026 test data the grid reproduces the web: 12 Sep = 5 orders / 685 м² / Overbooked; 8 Sep = 7 / 525 / Heavy; 2 Sep = 5 / 204 / Available.
- Changing server thresholds recolours the grid without an app update.
- Switching Рўйхат ↔ Жадвал keeps search text, status filter and selected day.
- Calendar month switch < 300 ms from cache, skeleton on first load; no layout jump when the day sheet appears (grid stays put, sheet grows below).
- All colours/radii/type resolve to tokens in `ANDROID_DESIGN_SPEC.md` §1; strings from `strings.xml` (uz-Cyrl).
