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
 * non-finite money/quantity value deserves. Every caller in this module already validates its
 * inputs as finite before rounding, so this can never fire on a real vector; it exists to catch a
 * future caller that forgets to.
 */
internal fun roundN(n: Double, decimals: Int): Double {
    require(n.isFinite()) { "roundN: n must be finite, got $n" }
    val f = Math.pow(10.0, decimals.toDouble())
    val sign = if (n < 0) -1.0 else 1.0
    return (sign * Math.round(Math.abs(n) * f)) / f
}

internal fun round2(n: Double): Double = roundN(n, 2)
internal fun round3(n: Double): Double = roundN(n, 3)
