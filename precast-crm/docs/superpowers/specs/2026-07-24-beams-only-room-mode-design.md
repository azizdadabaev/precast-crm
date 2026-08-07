# Beams-only room mode («Фақат балка») — design

**Date:** 2026-07-24
**Status:** Approved (brainstorming) — pending spec review → writing-plans

## 1. Problem

A customer wants to buy **beams only** for a room and supply their own infill
instead of the factory's filler blocks. For such a room the CRM must:

1. Count the beams correctly — the same beam count a normal room calc produces.
2. Not count filler blocks (blocks = 0 in the row, the footer, and stock).
3. Not charge for blocks — the row СУММА is beams only, **not** the m² rate
   (which bundles block value).
4. Show an honest delivery weight — beams only, not the 180 kg/m² finished-floor
   figure.

### Current failure

The engine already has an *extras-only mode* (`is_extras_only`, triggered by
`inner_length === 0 && extra_beams >= 1`) that zeroes blocks and prices on the
per-meter beam tier. Operators discovered it by blanking the length and typing a
beam count into **+Б**. It computes on screen (the calculator runs
`calculateSlab` client-side) but **cannot be saved**: both `SaveProjectDraftSchema`
and `PlaceOrderSchema` validate rooms with `RoomCalcInputSchema`, whose
`innerLength` is `z.coerce.number().positive()` — it rejects `length = 0`, so the
whole save fails.

The workaround is also weak beyond the save bug: the operator hand-calculates the
beam count in a separate full room calc and re-keys it, and the saved room loses
its true length (area becomes a beam-footprint, not the room).

## 2. Chosen approach

A proper **per-room `beamsOnly` toggle**. The operator enters width **and length
as normal**; the engine computes the beam count itself, zeroes blocks, and prices
beams only at the **per-meter extra-beam tier** (the existing "loose beam" price).
Because length stays `> 0`, the existing validation is untouched — no schema
relaxation, and the extras-only mode is left exactly as-is (still valid for its
own use case).

## 3. Data model

Add a per-room flag threaded through the whole calc pipeline:

- **Prisma** `Calculation`: `beamsOnly Boolean @default(false)`. Migration via
  `prisma db push`; prod gets a manual `db push` at deploy (existing convention).
- **Engine** `SlabInput.beams_only?: boolean` (default false) and
  `SlabResult.is_beams_only: boolean` (echo, mirrors `is_extras_only`).
- **Validation** `RoomCalcInputBaseSchema.beamsOnly: z.coerce.boolean().default(false)`.
- **Persistence** `RoomInput.beamsOnly?: boolean`; `calcResultToCreatePayload`
  writes `beamsOnly: r.is_beams_only`.

## 4. Engine behavior (`calculateSlab`, `beams_only = true`)

Branch near the top of `calculateSlab`, after validation, before the normal
pipeline (analogous to the extras-only short-circuit but requiring a real length):

- Requires `inner_width > 0` and `inner_length > 0` (normal validation applies).
- Pattern auto-pick / override / start-beam logic runs **unchanged** → produces
  the identical `beam_count` a normal room would (includes the pattern's beam and
  any manual +Б extras).
- **Blocks zeroed:** `total_blocks = 0`, `block_rows = 0`. `blocks_per_row` may be
  computed for reference but does not feed any total.
- **Pricing:** `m2_price = 0`, `m2_cost = 0`, `pattern_extra_cost = 0`.
  The whole beam charge lands in `manual_extra_beams_cost` so the invariant
  `subtotal === m2_cost + pattern_extra_cost + manual_extra_beams_cost` still
  holds (this is what `calcResultToCreatePayload` relies on):
  `manual_extra_beams_cost = subtotal = beam_count × beam_length × extra_beam_price_per_m`
  (every beam at the per-meter extra-beam tier).
- **Areas:** `billed_area = 0` (no m² billing); `monolith_area` kept as the real
  physical footprint (used for reference and, if needed, nothing billable).
- `is_beams_only = true`.

Decision locked: in beams-only mode **all** beams (including the pattern's closing
beam) bill at the per-meter extra-beam tier — there is no separate
`pattern_extra_cost` line, since there is no m² base for it to sit beside.

## 5. Calculator UI (`MultiRoomCalculator.tsx`)

- New compact checkbox column **«Фақат балка · Beams only»**, placed next to the
  existing **БОШ Б** (StartB) toggle column.
- When ON for a row:
  - м² нархи (Rate) → «—»; ЖАМИ Ғ (Blocks) → 0/«—» (`is_beams_only`, same dash
    treatment the UI already applies for `is_extras_only`).
  - СУММА shows the beam-only total; a subtle row badge marks the row as beams-only.
  - The per-row m²-rate override control is disabled (no m² billing to override).
- The footer's block total already sums `total_blocks`, so beams-only rows
  contribute 0 automatically. Beam and area totals continue to sum normally.

## 6. Downstream surfaces (mostly free)

All persisted-field consumers stay correct with no money/blocks math change:

- **Order detail / share PNG / print sheet** read stored `total_blocks` (0),
  `subtotal`, `m2Price` — blocks render 0 and the sum is already right.
- **Block stock**: production/delivery decrement uses `total_blocks = 0`, so
  beams-only rooms never touch block inventory. Beam stock decrements normally.
- **Shipment/truck weight** (`calculateOrderWeight` = beams×32/m + blocks×16):
  with `total_blocks = 0` it is already beams-only-correct. No change.

## 7. Display weight (beams-only correctness)

The header/card/print **Оғирлик** display uses `totalArea × 180 kg/m²`, which
overstates a beams-only room (no blocks/topping). Fix with a **shared per-room
helper** rather than a global switch (normal rooms must keep the owner's
180 kg/m² convention):

```
displayWeightKg(rooms) = Σ  room.beamsOnly
                            ? room.beamCount × room.beamLength × 32   // beam steel only
                            : room.monolithArea × 180                 // finished floor
```

Call sites to update (each already has the room list):
- Order detail page — header/recap weight (desktop + mobile).
- `CalculationShareCard` — footer «кг» (currently `monolithArea × 180`).
- Print sheet — weight figure.

Put the helper in a pure module (e.g. `src/lib/order-weight.ts` or extend
`weight-distributor.ts`) with unit tests. Normal-room output must be byte-for-byte
identical to today's `area × 180`.

## 8. Testing

- **Engine unit tests** (`calculation-engine.test.ts`):
  - beams-only `subtotal === beam_count × beam_length × extra_beam_price_per_m`.
  - beams-only `total_blocks === 0`, `block_rows === 0`, `m2_cost === 0`,
    `billed_area === 0`, `is_beams_only === true`.
  - `beam_count` parity: same room with `beams_only` on/off yields the same
    `beam_count` (only blocks/pricing differ).
- **Weight helper tests**: normal room == `area × 180`; beams-only ==
  `beams × length × 32`; mixed project sums correctly.
- **Round-trip**: save draft → place order → edit order with a beams-only room
  persists `beamsOnly` and reloads identically (no validation rejection).

## 9. Out of scope

- Changing the normal-room weight convention (stays 180 kg/m²).
- Touching the existing extras-only (`length = 0`) mode.
- A dedicated beams-only price separate from the extra-beam tier (explicitly
  chosen against — the per-meter tier is the price basis).

## 10. Rollout

- Additive, backward-compatible: `beamsOnly` defaults false, so every existing
  room/order/quote behaves exactly as before.
- Deploy needs the `Calculation.beamsOnly` column (`prisma db push`) before the
  app image that reads/writes it goes live.
