package uz.etalon.crm.core.calc

/**
 * Half-away-from-zero rounding, ported verbatim from the JS engine's `roundN` (avoids JS/Kotlin
 * banker's rounding). `Math.round(Double): Long` is the only Kotlin rounding that agrees with JS
 * `Math.round` on a non-negative operand — `roundToInt`/`roundToLong`/`Math.rint`/any
 * `RoundingMode` all disagree on some half-way value, which is why this operates on
 * `Math.abs(n)` and restores the sign afterwards rather than rounding `n` directly.
 */
fun roundN(n: Double, decimals: Int): Double {
    val f = Math.pow(10.0, decimals.toDouble())
    val sign = if (n < 0) -1.0 else 1.0
    return (sign * Math.round(Math.abs(n) * f)) / f
}

fun round2(n: Double): Double = roundN(n, 2)
fun round3(n: Double): Double = roundN(n, 3)
