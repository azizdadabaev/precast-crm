package uz.etalon.crm.core.calc

/**
 * Line-by-line Kotlin port of `ProjectTotal` / `projectTotal` in `calculation-engine.ts` (lines
 * 486-529). Same order, same rounding at the same points.
 */
data class ProjectTotal(
    val roomsSubtotal: Double,
    val discountPercent: Double,
    val discountAmount: Double,
    val total: Double,
)

/**
 * Compute the project's grand total from the room subtotals and a single discount input.
 * Discount can be expressed either as a percentage of the subtotal (the historical mode) OR as
 * an explicit UZS amount — they're mutually exclusive at the call site:
 *
 *   - `discountAmountOverride` (when > 0) wins. The percent in the return value is
 *     back-computed from it so downstream code that reads `discountPercent` stays consistent
 *     (rounded to 2 decimals).
 *   - Otherwise we apply `discountPercent` as before.
 *
 * The amount is capped at the subtotal so a typo can't produce a negative total.
 */
fun projectTotal(
    rooms: List<SlabResult>,
    discountPercent: Double = 0.0,
    discountAmountOverride: Double? = null,
): ProjectTotal {
    val roomsSubtotal = round2(rooms.fold(0.0) { s, r -> s + r.subtotal })

    val discountAmount: Double
    val pct: Double
    if (discountAmountOverride != null && discountAmountOverride > 0) {
        discountAmount = round2(minOf(discountAmountOverride, roomsSubtotal))
        pct = if (roomsSubtotal > 0) round2((discountAmount / roomsSubtotal) * 100) else 0.0
    } else {
        pct = maxOf(0.0, minOf(100.0, discountPercent))
        discountAmount = round2((roomsSubtotal * pct) / 100)
    }
    val total = round2(roomsSubtotal - discountAmount)
    return ProjectTotal(roomsSubtotal = roomsSubtotal, discountPercent = pct, discountAmount = discountAmount, total = total)
}
