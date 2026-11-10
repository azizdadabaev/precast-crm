# Gazoblok API contract fixtures

Real responses of the Stage-1 gazoblok routes, used by the Android client's DTO tests
(`android/core/network/src/test/resources/gazoblok/`, byte-identical copies).

Captured 2026-11-10 from the local dev server of the `gazoblok-reno` worktree
(branch `feat/gazoblok-renovation`, HEAD `cacc519d`) against the **local** dev DB
`precast_crm_gazoblok_reno`, with an Android Bearer token from `POST /api/auth/login`
(`"client":"android"`). Never captured from production.

| File | Request |
|---|---|
| `list.json` | `GET /api/gazoblok/orders` |
| `detail-open.json` | `GET /api/gazoblok/orders/{id}` — open order, truck 1 LOADED, truck 2 PENDING |
| `detail-overloaded.json` | `GET /api/gazoblok/orders/{id}` — two trucks loaded over the order (`overshipAmount > 0`) |
| `detail-closed-short.json` | `GET /api/gazoblok/orders/{id}` — closed short, DELIVERED, with a refund payment |
| `load-409-overload.json` | `POST …/shipments/{sid}/load` without `confirmOverload` → 409 `OVERLOAD_CONFIRM_REQUIRED` |

Every field is kept as the server sent it (envelope `{ ok, data }` / `{ ok, error, details }` included).
Only personal data was replaced: client names → «Тест Мижоз», user names → «Тест Оператор»,
phones → `998900000000`. Decimal money columns arrive as strings (`"3600000"`), computed
fields (`unpaidOverload`, `refundDue`, `extraAmount`) as numbers.
