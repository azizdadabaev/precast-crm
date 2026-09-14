package uz.etalon.crm.core.model

import java.math.BigDecimal
import java.math.RoundingMode

/**
 * The arithmetic `src/lib/dashboard-metrics.ts` does, ported line for line.
 *
 * The dashboard's month picker (design §2.3b) re-scopes the financial rail to any of the twelve
 * months in the payload, and the server can only precompute the current-vs-previous pair — so the
 * phone recomputes the selected month's figures off the series exactly as `FinancialKPIs.tsx`
 * does. "Exactly" is the acceptance criterion: for the CURRENT month these functions must return
 * the very numbers the server already sent in `bookedThisMonth` / `collectedThisMonth` /
 * `averageOrderValue`, and a unit test on the recorded payload asserts that equality.
 *
 * Everything here is `BigDecimal`/[Money]. Money never becomes a `Double` on this path, which is
 * the rule the rest of this module already follows.
 */

/** Scale the divisions are carried at before [jsRound] sees them. Well past the 9 significant
 *  digits a UZS figure has, so the rounding decision is made on the real quotient and not on a
 *  quotient that was already rounded once. */
private const val DIVISION_SCALE = 12

/** `(current − previous) ÷ previous × 100`. */
private val HUNDRED = BigDecimal(100)

/** Half, added before flooring — the whole of JavaScript's rounding rule. */
private val HALF = BigDecimal("0.5")

/**
 * JavaScript's `Math.round`: **floor(x + 0,5)**, which is NOT [RoundingMode.HALF_UP].
 *
 * The two agree on every positive number and disagree on every negative half: `Math.round(-2.5)`
 * is `-2` (towards +∞) while `HALF_UP` gives `-3` (away from zero). Only one figure on this
 * screen can be negative — a trend's `deltaPct` — and it is exactly the figure the server also
 * computes with `Math.round`, so a month that fell by precisely 2,5 % would otherwise read as
 * −3 % on the phone and −2 % on the web for the same data.
 */
fun jsRound(x: BigDecimal): BigDecimal = (x + HALF).setScale(0, RoundingMode.FLOOR)

/**
 * `dashboard-metrics.ts:215` — average order value: booked value per order, in whole UZS.
 *
 * The numerator is Σ `totalPrice` (BOOKED), never Σ collected: an order that has not been paid
 * yet still has a value, and dividing collections by order count answers a different question.
 * Zero rather than a division by zero on an empty (or nonsensical) order set.
 */
fun averageOrderValue(booked: Money, orders: Int): Money {
    if (orders <= 0) return Money.ZERO
    return Money(jsRound(booked.amount.divide(BigDecimal(orders), DIVISION_SCALE, RoundingMode.HALF_UP)))
}

/**
 * `dashboard-metrics.ts:272` — the delta pill for a current-vs-previous pair.
 *
 * `null` when there is no previous-period basis to compare against (the first month of operation,
 * or any case where dividing would be meaningless) — the card then draws no badge at all rather
 * than an invented 0 %. |delta| under one whole percent renders [TrendDirection.FLAT] so noise
 * does not flash a screen full of green and red.
 *
 * [polarity] does not affect the maths; it decides which way the colour runs in the badge (up is
 * good for booked/collected/AOV, bad for receivables).
 */
fun buildTrend(current: Money, previous: Money, polarity: TrendPolarity): Trend? {
    if (previous.amount.signum() <= 0) return null
    val deltaPct = jsRound(
        (current.amount - previous.amount)
            .multiply(HUNDRED)
            .divide(previous.amount, DIVISION_SCALE, RoundingMode.HALF_UP),
    )
    val direction = when {
        deltaPct.abs() < BigDecimal.ONE -> TrendDirection.FLAT
        deltaPct.signum() > 0 -> TrendDirection.UP
        else -> TrendDirection.DOWN
    }
    return Trend(deltaPct = deltaPct, direction = direction, polarity = polarity)
}

/**
 * Everything the financial rail and the «Юкланган ҳажм» tile show for ONE month of the payload's
 * twelve — the phone's half of `FinancialKPIs.tsx` and `dashboard/page.tsx:86-97`.
 *
 * @property idx the month this scope is about, already clamped into the series.
 * @property monthKey `YYYY-MM` — `monthKeys[idx]`, empty when the server sent no keys. It is the
 *   ONLY month identity this scope carries: the screen derives every month name it prints from it
 *   through the app's own formatter, so that casing and the Tashkent fallback are the same rules
 *   every other date follows. The server's own `bookedByMonth[idx].month` label is deliberately
 *   not carried — nothing rendered it, and a second month identity is a second thing to disagree.
 * @property isCurrent whether [idx] is the month containing today — what decides «ушбу ой» against
 *   «{ой} ойи», and the only thing the current month is special about.
 * @property bookedSeries the months ENDING at [idx] — at most [SPARKLINE_MONTHS], fewer when the
 *   account (or the selection) is younger than that. The sparkline left-pads what it is short of,
 *   so the three rail cards keep the same bar count and the same height either way.
 * @property loaded the `loadedVolumeByMonth` row for [monthKey], found by KEY and not by index
 *   (loading has its own date axis), or `null` when that month loaded nothing.
 */
data class MonthScope(
    val idx: Int,
    val monthKey: String,
    val isCurrent: Boolean,
    val booked: PeriodMoney,
    val collected: PeriodMoney,
    val aov: Aov,
    val bookedSeries: List<Money>,
    val collectedSeries: List<Money>,
    val aovSeries: List<Money>,
    val loaded: LoadedVolume?,
)

/** How many months a rail sparkline draws (design §2.3). The web draws six; the phone's rail was
 *  built on eight in Task 3 and the bar geometry is the design system's, so the window stays
 *  eight — the arithmetic inside it is the web's unchanged. */
const val SPARKLINE_MONTHS = 8

/**
 * `[from]..[toInclusive]` of a series, clipped to what the list actually holds.
 *
 * The three series arrive the same length today, and the one that did not would otherwise throw
 * `IndexOutOfBounds` inside a `subList` on a screen that is only drawing a sparkline. Clipping
 * short is the honest failure: fewer bars, never a crash and never a borrowed month.
 */
private inline fun <T, R> List<T>.window(from: Int, toInclusive: Int, pick: (T) -> R): List<R> {
    val lo = from.coerceIn(0, size)
    val hi = (toInclusive + 1).coerceIn(lo, size)
    return subList(lo, hi).map(pick)
}

/**
 * The selected month's figures, read off the twelve-month series the server sent.
 *
 * [idx] is clamped into the series the way `dashboard/page.tsx` clamps it, so a stale selection
 * surviving a refresh that shortened the window can never index past its end. Every delta compares
 * the selected month with the one BEFORE it — not always this month with last month — which is
 * what makes the badges mean something when a past month is picked.
 *
 * For the current month this returns the server's own `bookedThisMonth` / `collectedThisMonth` /
 * `averageOrderValue` figures, because the server derived them from the same rows with the same
 * two functions. That equality is the parity guard and is asserted against a recorded payload.
 *
 * **The trends are recomputed here, and the payload's own `trend` fields are deliberately never
 * rendered.** The server derives its trend from a database aggregate of the previous *calendar*
 * month (`dashboard-data.ts:487-499`), which can only ever answer "this month vs last month"; a
 * month picker needs "the selected month vs the one before it", which only the series can answer.
 * `FinancialKPIs.tsx:121-124` substitutes exactly the same way — it ignores the precomputed trends
 * and calls `buildTrend` on the series for every month including the current one — so recomputing
 * is what matches the web, which is the acceptance criterion. The two agree on the current month
 * whenever the previous calendar month is inside the window, which is every month the phone can
 * select; `PeriodMoney.trend` and [Aov.trend] stay on the model for exactly that comparison, and
 * the parity guard makes it.
 */
fun monthScope(s: HomeSummary, idx: Int): MonthScope {
    val lastIdx = maxOf(s.bookedByMonth.size - 1, 0)
    val i = idx.coerceIn(0, lastIdx)
    val currentIdx = s.currentMonthIdx.coerceIn(0, lastIdx)

    val booked = s.bookedByMonth.getOrNull(i)?.booked ?: Money.ZERO
    val orderCount = s.ordersByMonth.getOrNull(i)?.count ?: 0
    val collected = s.collectedByMonth.getOrNull(i)?.collected ?: Money.ZERO
    val paymentCount = s.collectedByMonth.getOrNull(i)?.paymentCount ?: 0

    // `i - 1`, never "last month": the pair is the selected month and its predecessor.
    val prevBooked = if (i > 0) s.bookedByMonth.getOrNull(i - 1)?.booked ?: Money.ZERO else Money.ZERO
    val prevOrderCount = if (i > 0) s.ordersByMonth.getOrNull(i - 1)?.count ?: 0 else 0
    val prevCollected = if (i > 0) s.collectedByMonth.getOrNull(i - 1)?.collected ?: Money.ZERO else Money.ZERO

    val aov = averageOrderValue(booked, orderCount)
    val prevAov = averageOrderValue(prevBooked, prevOrderCount)

    val from = maxOf(0, i - (SPARKLINE_MONTHS - 1))
    val bookedWindow = s.bookedByMonth.window(from, i) { it.booked }
    val collectedWindow = s.collectedByMonth.window(from, i) { it.collected }
    // The AOV sparkline is the headline's own formula month by month — booked ÷ orders — not
    // collections per order. A month with no orders has no average and contributes zero.
    val aovWindow = bookedWindow.mapIndexed { k, m ->
        averageOrderValue(m, s.ordersByMonth.getOrNull(from + k)?.count ?: 0)
    }

    val monthKey = s.monthKeys.getOrNull(i) ?: ""
    return MonthScope(
        idx = i,
        monthKey = monthKey,
        isCurrent = i == currentIdx,
        booked = PeriodMoney(booked, orderCount, buildTrend(booked, prevBooked, TrendPolarity.POSITIVE)),
        collected = PeriodMoney(collected, paymentCount, buildTrend(collected, prevCollected, TrendPolarity.POSITIVE)),
        // All-time is all-time: it is the one line on a rail card that does NOT follow the month.
        aov = Aov(thisMonth = aov, allTime = s.aov.allTime, trend = buildTrend(aov, prevAov, TrendPolarity.POSITIVE)),
        bookedSeries = bookedWindow,
        collectedSeries = collectedWindow,
        aovSeries = aovWindow,
        loaded = s.loadedVolumeByMonth.find { it.monthKey == monthKey },
    )
}
