package uz.etalon.crm.core.calc

/**
 * Which discount input the operator chose — persisted so an edit restores the same type.
 * Verbatim port of `DiscountMode` in `order-totals.ts`.
 */
enum class DiscountMode { AMOUNT, PERCENT }

/**
 * The order-PLACEMENT roll-up — ported from `computeOrderTotals` in `order-totals.ts`, NOT from
 * [projectTotal] above. `Order.totalPrice` (what `POST /api/orders` persists, and what
 * `POST /api/calculate/batch` — this port's parity oracle — echoes back) is
 * `roomsSubtotal − discountAmount + deliveryCost + otherCost`; [projectTotal] only ever computes
 * `roomsSubtotal − discountAmount` and rounds at three internal points for the calculator's own
 * in-app running total. The totals sheet's headline number is [totalPrice], not [ProjectTotal.total].
 *
 * `computeOrderTotals` performs NO rounding of [roomsSubtotal], [discountAmount] (the percent
 * branch), or [totalPrice] — each is a raw sum/product of already-`round2`'d per-room values. In
 * production this matches the server only because `Order.totalPrice` is a `Decimal(14,2)` column
 * that rounds on write. Callers MUST `round2` [totalPrice] themselves before it becomes `Money`
 * (`Boundary.kt`'s `moneyOf` — its `RoundingMode.UNNECESSARY` throws on anything else) — this
 * mirrors what the database column does on write, it is not new rounding.
 */
data class OrderTotals(
    val roomsSubtotal: Double,
    val discountAmount: Double,
    val resolvedDiscountPercent: Double,
    val discountMode: DiscountMode,
    val totalPrice: Double,
)

/**
 * Roll up the order total from already-priced [rows] (each row's `SlabResult.subtotal`, which
 * already reflects any per-row rate override — see [recomputeRow]/`RateOverrideTest`, and
 * `calcResultToCreatePayload` on the TS side) and the discount/delivery/other inputs.
 *
 * Verbatim port of `computeOrderTotals` in `order-totals.ts`. Discount precedence is the same
 * rule [projectTotal] uses: an explicit UZS [discountAmount] > 0 wins (capped at `roomsSubtotal`;
 * the percent is back-computed with the exact op sequence the TS uses —
 * `Math.round(x * 10000) / 100`, NOT [round2] — see the note on that line below for why the two
 * are not interchangeable here). Otherwise [discountPercent] applies AS-IS: unlike [projectTotal],
 * `computeOrderTotals` does NOT clamp it to 0..100 — the route/schema layer
 * (`CalculateBatchSchema`/`PlaceOrderSchema`, both `.min(0).max(100)`) clamps before this function
 * ever sees it, same as this port's `CalculatorViewModel.setDiscountPercent`. A zero
 * `roomsSubtotal` never divides by zero.
 */
fun computeOrderTotals(
    rows: List<SlabRow>,
    discountPercent: Double,
    discountAmount: Double,
    deliveryCost: Double,
    otherCost: Double,
): OrderTotals {
    // No round2 here — each addend is already round2'd by the engine, but their SUM is not
    // re-rounded, exactly as order-totals.ts leaves it (see the class doc above).
    val roomsSubtotal = rows.mapNotNull { it.result }.sumOf { it.subtotal }
    val mode = if (discountAmount > 0) DiscountMode.AMOUNT else DiscountMode.PERCENT

    val amt: Double
    val pct: Double
    if (discountAmount > 0) {
        amt = minOf(discountAmount, roomsSubtotal)
        // Written as one division + one multiply-by-10000, matching the TS literal
        // `Math.round((discountAmount / roomsSubtotal) * 10000) / 100` op-for-op — NOT
        // round2(pct), which would instead do (pct * 100) as a SECOND multiplication and can
        // disagree with this in the last bit (floating-point multiplication is not associative).
        pct = if (roomsSubtotal > 0) Math.round((amt / roomsSubtotal) * 10000) / 100.0 else 0.0
    } else {
        pct = discountPercent
        amt = roomsSubtotal * (pct / 100)
    }

    val totalPrice = roomsSubtotal - amt + deliveryCost + otherCost

    return OrderTotals(roomsSubtotal, amt, pct, mode, totalPrice)
}
