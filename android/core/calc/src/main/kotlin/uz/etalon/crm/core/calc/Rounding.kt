package uz.etalon.crm.core.calc

/**
 * Half-away-from-zero rounding, ported verbatim from the JS engine's `roundN` (avoids JS/Kotlin
 * banker's rounding). `Math.round(Double): Long` is the only Kotlin rounding that agrees with JS
 * `Math.round` on a non-negative operand — `Math.rint`/any `RoundingMode` disagree on some
 * half-way value; `roundToInt`/`roundToLong` are actually ties-toward-positive-infinity on the
 * JVM and would agree with `Math.round` on an abs'd operand too, so the reason to prefer
 * `Math.round` here is its return type and large-magnitude behaviour, not the tie rule — which is
 * why this operates on `Math.abs(n)` and restores the sign afterwards rather than rounding `n`
 * directly.
 *
 * Requires [n] to be finite. `Math.round(Double): Long` clamps rather than propagating like JS
 * does — `NaN` rounds to `0`, `±Infinity` rounds to `Long.MIN/MAX_VALUE` — so a NaN/Infinity that
 * reached this function would silently become a *number* (often 0) instead of the loud failure a
 * non-finite money/quantity value deserves. No golden vector can reach it — all of them feed
 * finite values — but two inputs are unvalidated in the TypeScript and so unvalidated here too:
 * `calculateSlab`'s `correction` and the `pricePerBlock` that `estimateWall`/`estimateProject`
 * read off a catalogue product. For those, a non-finite value makes JS propagate `NaN` into the
 * result while this port throws. That is a deliberate departure from bit-parity, and the only one
 * in this module: a `NaN` price silently rounds to a *free* quote, which is the one failure nobody
 * notices in a live order.
 */
internal fun roundN(n: Double, decimals: Int): Double {
    require(n.isFinite()) { "roundN: n must be finite, got $n" }
    val f = Math.pow(10.0, decimals.toDouble())
    val sign = if (n < 0) -1.0 else 1.0
    return (sign * Math.round(Math.abs(n) * f)) / f
}

internal fun round2(n: Double): Double = roundN(n, 2)
internal fun round3(n: Double): Double = roundN(n, 3)
