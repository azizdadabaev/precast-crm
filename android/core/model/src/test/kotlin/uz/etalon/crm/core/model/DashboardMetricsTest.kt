package uz.etalon.crm.core.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import java.math.BigDecimal

/**
 * The port of `src/lib/dashboard-metrics.ts` (design §2.3b), tested against the web's own numbers.
 *
 * Every figure here is a value the web already computes for the same input: `averageOrderValue`'s
 * cases are copied from `src/lib/dashboard-metrics.test.ts` verbatim, and the [monthScope] cases
 * mirror `FinancialKPIs.tsx`'s own derivation. `buildTrend` has no unit test on the web side —
 * the only fixtures for it are the payloads it appears in — so its cases below are written from
 * the function's four branches and are asserted against the recorded payload as well
 * (`DashboardMappersTest`, the parity guard).
 */
class DashboardMetricsTest {

    // ── jsRound ────────────────────────────────────────────────────────────────────────────

    @Test fun `positive halves round up, as both languages do`() {
        assertEquals(BigDecimal("3"), jsRound(BigDecimal("2.5")))
        assertEquals(BigDecimal("2"), jsRound(BigDecimal("2.4")))
        assertEquals(BigDecimal("3"), jsRound(BigDecimal("2.6")))
    }

    /**
     * The whole reason this function exists rather than a `setScale(0, HALF_UP)`: JavaScript's
     * `Math.round(-2.5)` is **−2** (towards +∞), while HALF_UP gives −3 (away from zero). A month
     * that fell by exactly 2,5 % would otherwise read −3 % on the phone and −2 % on the web.
     */
    @Test fun `negative halves round towards positive infinity, not away from zero`() {
        assertEquals(BigDecimal("-2"), jsRound(BigDecimal("-2.5")))
        assertEquals(BigDecimal("-3"), jsRound(BigDecimal("-2.6")))
        assertEquals(BigDecimal("-2"), jsRound(BigDecimal("-2.4")))
        assertEquals(
            BigDecimal("-3"),
            BigDecimal("-2.5").setScale(0, java.math.RoundingMode.HALF_UP),
            "the rounding this port must NOT use",
        )
    }

    @Test fun `a whole number is left alone`() {
        assertEquals(BigDecimal("7"), jsRound(BigDecimal("7")))
        assertEquals(BigDecimal("0"), jsRound(BigDecimal("0")))
    }

    // ── averageOrderValue — the web's own fixtures ─────────────────────────────────────────

    @Test fun `divides booked value by the order count`() {
        // dashboard-metrics.test.ts: 3 orders worth 5 000 000 booked → 1 666 667.
        assertEquals(money("1666667"), averageOrderValue(money("5000000"), 3))
        assertEquals(money("2000000"), averageOrderValue(money("4000000"), 2))
    }

    @Test fun `returns zero instead of a division by zero on an empty order set`() {
        assertEquals(Money.ZERO, averageOrderValue(Money.ZERO, 0))
        assertEquals(Money.ZERO, averageOrderValue(money("1000000"), 0))
        assertEquals(Money.ZERO, averageOrderValue(money("1000000"), -1))
    }

    @Test fun `rounds to whole UZS`() {
        assertEquals(money("3"), averageOrderValue(money("10"), 3))
        assertEquals(money("500001"), averageOrderValue(money("1000001"), 2))
    }

    // ── buildTrend ─────────────────────────────────────────────────────────────────────────

    @Test fun `no previous-period basis draws no badge at all`() {
        assertNull(buildTrend(money("100"), Money.ZERO, TrendPolarity.POSITIVE))
        assertNull(buildTrend(money("100"), money("-5"), TrendPolarity.POSITIVE))
        assertNull(buildTrend(Money.ZERO, Money.ZERO, TrendPolarity.POSITIVE), "0 → 0 is not a fall")
    }

    @Test fun `a rise is up and keeps its whole percent`() {
        val t = buildTrend(money("150000000"), money("100000000"), TrendPolarity.POSITIVE)!!
        assertEquals(BigDecimal("50"), t.deltaPct)
        assertEquals(TrendDirection.UP, t.direction)
        assertEquals(TrendPolarity.POSITIVE, t.polarity)
    }

    @Test fun `a fall is down and its percent keeps its sign`() {
        val t = buildTrend(money("150000000"), money("200000000"), TrendPolarity.POSITIVE)!!
        assertEquals(BigDecimal("-25"), t.deltaPct)
        assertEquals(TrendDirection.DOWN, t.direction)
    }

    /** Under one whole percent either way is FLAT — noise must not flash a screen green and red. */
    @Test fun `a move under one percent is flat in both directions`() {
        val up = buildTrend(money("1004"), money("1000"), TrendPolarity.POSITIVE)!!
        assertEquals(BigDecimal("0"), up.deltaPct)
        assertEquals(TrendDirection.FLAT, up.direction)

        val down = buildTrend(money("996"), money("1000"), TrendPolarity.POSITIVE)!!
        assertEquals(BigDecimal("0"), down.deltaPct)
        assertEquals(TrendDirection.FLAT, down.direction)
    }

    /** Exactly one percent is NOT flat: the rule is |delta| < 1, not ≤ 1. */
    @Test fun `exactly one percent is a direction, not flat`() {
        assertEquals(TrendDirection.UP, buildTrend(money("101"), money("100"), TrendPolarity.POSITIVE)!!.direction)
        assertEquals(TrendDirection.DOWN, buildTrend(money("99"), money("100"), TrendPolarity.POSITIVE)!!.direction)
    }

    @Test fun `polarity is carried through untouched — it colours, it does not compute`() {
        val receivables = buildTrend(money("350"), money("100"), TrendPolarity.NEGATIVE)!!
        assertEquals(BigDecimal("250"), receivables.deltaPct)
        assertEquals(TrendDirection.UP, receivables.direction)
        assertEquals(TrendPolarity.NEGATIVE, receivables.polarity)
    }

    // ── monthScope ─────────────────────────────────────────────────────────────────────────

    /**
     * The parity guard, in miniature: for the CURRENT month the series-derived figures are the
     * server's own `bookedThisMonth` / `collectedThisMonth` / `averageOrderValue`. The same
     * assertion is made against the RECORDED payload in `:core:data`'s `DashboardMappersTest`,
     * which is where that fixture lives; this one states the rule with numbers a reader can check
     * by hand.
     */
    @Test fun `the current month equals what the server sent for it`() {
        val s = summary()
        val scope = monthScope(s, s.currentMonthIdx)

        assertEquals(s.booked.total, scope.booked.total)
        assertEquals(s.booked.count, scope.booked.count)
        assertEquals(s.collected.total, scope.collected.total)
        assertEquals(s.collected.count, scope.collected.count)
        assertEquals(s.aov.thisMonth, scope.aov.thisMonth)
        assertEquals(s.aov.allTime, scope.aov.allTime, "all-time never follows the month")
        assertEquals(s.loadedThisMonth, scope.loaded)
        assertEquals("2026-12", scope.monthKey)
        assertEquals(true, scope.isCurrent)
    }

    @Test fun `an earlier month reads that month's own figures, not this month's`() {
        val s = summary()
        val august = monthScope(s, 7)

        assertEquals(money("80000000"), august.booked.total)
        assertEquals(8, august.booked.count)
        assertEquals(money("8000000"), august.collected.total)
        assertEquals(8, august.collected.count, "the wire's per-month paymentCount, not this month's")
        assertEquals(money("10000000"), august.aov.thisMonth)
        assertEquals("2026-08", august.monthKey)
        assertEquals(false, august.isCurrent)
        assertEquals("Авг", august.label, "the server's own label for that month")
    }

    /** Every delta compares the SELECTED month with the one before it — not this month with last. */
    @Test fun `an earlier month's trend compares it with its own predecessor`() {
        val s = summary()
        // July booked 70 000 000, August 80 000 000 → +14 %.
        assertEquals(BigDecimal("14"), monthScope(s, 7).booked.trend!!.deltaPct)
        // The first month of the window has no predecessor at all.
        assertNull(monthScope(s, 0).booked.trend)
    }

    @Test fun `the sparkline windows end at the selected month`() {
        val s = summary()
        val august = monthScope(s, 7)

        assertEquals(SPARKLINE_MONTHS, august.bookedSeries.size)
        assertEquals(money("80000000"), august.bookedSeries.last(), "the last bar is the big figure above it")
        assertEquals(money("10000000"), august.bookedSeries.first(), "eight months back — January")
        assertEquals(SPARKLINE_MONTHS, august.collectedSeries.size)
        assertEquals(SPARKLINE_MONTHS, august.aovSeries.size)
        assertEquals(money("10000000"), august.aovSeries.last(), "booked ÷ orders for August itself")
    }

    /** Fewer than eight months exist before March, so the window is short and the sparkline pads
     *  it on the LEFT — inventing months here would draw bookings that never happened. */
    @Test fun `a month younger than the window yields a short series, never a padded lie`() {
        val s = summary()
        val march = monthScope(s, 2)
        assertEquals(3, march.bookedSeries.size)
        assertEquals(money("10000000"), march.bookedSeries.first())
        assertEquals(money("30000000"), march.bookedSeries.last())
    }

    @Test fun `a month with no orders contributes a zero to the aov series, not a division by zero`() {
        val s = summary(orderCounts = List(12) { 0 })
        assertEquals(List(SPARKLINE_MONTHS) { Money.ZERO }, monthScope(s, 11).aovSeries)
        assertEquals(Money.ZERO, monthScope(s, 11).aov.thisMonth)
    }

    @Test fun `an index past either end of the series is clamped, never thrown`() {
        val s = summary()
        assertEquals(11, monthScope(s, 99).idx)
        assertEquals(0, monthScope(s, -4).idx)
    }

    /** The empty payload a server older than this client's contract sends: no series at all. */
    @Test fun `an empty series scopes to zero rather than crashing`() {
        val s = summary(months = 0)
        val scope = monthScope(s, 5)
        assertEquals(Money.ZERO, scope.booked.total)
        assertEquals("", scope.monthKey)
        assertNull(scope.loaded)
        assertEquals(emptyList<Money>(), scope.bookedSeries)
    }

    /** Loading has its own date axis, so the row is found by KEY. An index lookup would hand
     *  August's tile September's blocks the moment a month loaded nothing. */
    @Test fun `the loaded row is found by month key, not by the series index`() {
        val s = summary()
        assertEquals("2026-08", monthScope(s, 7).loaded?.monthKey)
        assertNull(monthScope(s, 6).loaded, "July loaded nothing and shows no figures")
    }

    // ── the fixture ────────────────────────────────────────────────────────────────────────

    private fun money(v: String) = Money(BigDecimal(v))

    /** Twelve months rising by 10 000 000 UZS and one order a month: every month's AOV is
     *  10 000 000, so a figure that came from the wrong month is visible at a glance. */
    private fun summary(
        months: Int = 12,
        orderCounts: List<Int> = (1..12).toList(),
    ): HomeSummary {
        val labels = listOf("Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек")
        val keys = (1..months).map { "2026-%02d".format(it) }
        val booked = (1..months).map { MonthBooked(labels[it - 1], money("${it}0000000")) }
        val orders = (1..months).map { MonthOrders(labels[it - 1], orderCounts[it - 1]) }
        val collected = (1..months).map {
            MonthCollected(labels[it - 1], money("${it}000000"), paymentCount = it)
        }
        val currentIdx = months - 1
        val loaded = listOf(
            LoadedVolume("2026-08", 800, 80, BigDecimal("80.0"), BigDecimal("8.0"), 8),
            LoadedVolume("2026-12", 1200, 120, BigDecimal("120.0"), BigDecimal("12.0"), 12),
        )
        return HomeSummary(
            today = emptyList(), todayArea = BigDecimal.ZERO,
            openDiscrepancies = 0, openDiscrepancyTotal = Money.ZERO,
            receivables = money("1"), receivableOrders = 1, receivablesTrend = null,
            paidOrders = 0, partialOrders = 0, awaitingOrders = 0,
            recent = emptyList(),
            // What the server computed for the current month — the figures the parity guard
            // compares the series-derived ones against.
            booked = PeriodMoney(money("120000000"), 12, null),
            bookedAllTime = AllTimeMoney(money("780000000"), 78),
            collected = PeriodMoney(money("12000000"), 12, null),
            collectedAllTime = AllTimeMoney(money("78000000"), 78),
            collectedByMonth = collected,
            aov = Aov(thisMonth = money("10000000"), allTime = money("10000000"), trend = null),
            activeCustomers = 0,
            bookedByMonth = booked, ordersByMonth = orders,
            monthKeys = keys,
            currentMonthIdx = currentIdx,
            currentMonthKey = keys.getOrNull(currentIdx) ?: "",
            loadedVolumeByMonth = loaded,
            loadedThisMonth = loaded.find { it.monthKey == keys.getOrNull(currentIdx) },
            topCustomers = emptyList(),
            ordersByRegion = emptyList(),
        )
    }
}
