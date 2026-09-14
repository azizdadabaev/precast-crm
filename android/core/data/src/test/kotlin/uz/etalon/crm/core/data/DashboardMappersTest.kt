package uz.etalon.crm.core.data

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.TrendDirection
import uz.etalon.crm.core.model.TrendPolarity
import uz.etalon.crm.core.model.monthScope
import uz.etalon.crm.core.network.EtalonJson
import uz.etalon.crm.core.network.dto.CollectedThisMonthDto
import uz.etalon.crm.core.network.dto.DashboardDto
import uz.etalon.crm.core.network.dto.LoadedVolumeDto
import uz.etalon.crm.core.network.dto.OpenDiscrepanciesDto
import uz.etalon.crm.core.network.dto.OrdersByPaymentStateDto
import uz.etalon.crm.core.network.dto.OutstandingReceivablesDto
import uz.etalon.crm.core.network.dto.RecentOrderDto
import uz.etalon.crm.core.network.dto.TodayDeliveriesDto
import uz.etalon.crm.core.network.dto.TodayDeliveryOrderDto
import uz.etalon.crm.core.network.dto.TrendDto
import java.math.BigDecimal

/**
 * `HomeSummary` has five same-typed `Int` fields and two `Money` fields, all mutually swappable
 * in a way `toDomain()` would compile fine either way — Task 4's reviewer asked for exactly this
 * test before a screen renders receivables off it. Every fixture value below is distinct, so a
 * mapper that swaps any two of them (e.g. `paidOrders` for `partialOrders`, or
 * `openDiscrepancyTotal` for `receivables`) fails here rather than in front of an operator
 * reading a wrong balance on Home.
 */
class DashboardMappersTest {
    private val dto = DashboardDto(
        todayDeliveries = TodayDeliveriesDto(
            totalArea = BigDecimal("45.7"),
            orders = listOf(TodayDeliveryOrderDto("o1", "A-1", "Client", BigDecimal("20.3"))),
        ),
        openDiscrepancies = OpenDiscrepanciesDto(count = 11, totalAmount = BigDecimal("111000")),
        outstandingReceivables = OutstandingReceivablesDto(total = BigDecimal("222000"), orderCount = 22),
        ordersByPaymentState = OrdersByPaymentStateDto(paid = 33, partial = 44, awaiting = 55),
    )

    @Test fun `each field lands in the summary field it belongs to, not a same-typed neighbour`() {
        val s = dto.toDomain()
        assertEquals(1, s.today.size)
        assertEquals("o1", s.today.single().orderId)
        // orderNumber and clientName are adjacent Strings on TodayDelivery — exactly the shape
        // that swaps silently and would print the client's name in the order-number slot of
        // every row on Home. Distinct fixture values make either swap fail here.
        assertEquals("A-1", s.today.single().orderNumber)
        assertEquals("Client", s.today.single().clientName)
        assertEquals(BigDecimal("20.3"), s.today.single().area)
        assertEquals(BigDecimal("45.7"), s.todayArea)
        assertEquals(11, s.openDiscrepancies)
        assertEquals(Money.parse("111000"), s.openDiscrepancyTotal)
        assertEquals(Money.parse("222000"), s.receivables)
        assertEquals(22, s.receivableOrders)
        assertEquals(33, s.paidOrders)
        assertEquals(44, s.partialOrders)
        assertEquals(55, s.awaitingOrders)
    }

    /** A recent order always has a schedule; one with no `scheduledAt` is dropped rather than
     *  defaulted to a made-up date. */
    @Test fun `a recent order with no scheduledAt is dropped, not defaulted`() {
        val withMissingSchedule = dto.copy(recentOrders = listOf(
            RecentOrderDto(id = "r1", orderNumber = "B-1", clientName = "C", status = "PLACED", scheduledAt = null, totalPrice = BigDecimal("500000")),
        ))
        assertEquals(emptyList<Any>(), withMissingSchedule.toDomain().recent)
    }

    /**
     * Defect M2. The server's `direction` has three values (`src/lib/dashboard-metrics.ts`), and
     * folding FLAT into "up" drew an unchanged month as a green «↑ 0,0 %» — a rise that did not
     * happen. Each of the three maps to its own [TrendDirection], and `deltaPct` is carried through
     * untouched in every case.
     */
    @Test fun `each of the server's three trend directions maps to its own`() {
        fun trend(delta: String, direction: String) =
            dto.copy(collectedThisMonth = CollectedThisMonthDto(total = BigDecimal("100"), trend = TrendDto(BigDecimal(delta), direction)))
                .toDomain().collected.trend!!

        val up = trend("8.2", "up")
        assertEquals(TrendDirection.UP, up.direction)
        assertEquals(BigDecimal("8.2"), up.deltaPct)

        val down = trend("5.0", "down")
        assertEquals(TrendDirection.DOWN, down.direction)
        assertEquals(BigDecimal("5.0"), down.deltaPct)

        val flat = trend("0", "flat")
        assertEquals(TrendDirection.FLAT, flat.direction)
        assertEquals(BigDecimal("0"), flat.deltaPct)
    }

    /** A direction added on the server that this build has never heard of makes no claim at all —
     *  it reads as FLAT does rather than being guessed into a rise or a fall. */
    @Test fun `an unrecognised direction is UNKNOWN, not up`() {
        val odd = dto.copy(collectedThisMonth = CollectedThisMonthDto(total = BigDecimal("100"), trend = TrendDto(BigDecimal("3.0"), "sideways")))
        assertEquals(TrendDirection.UNKNOWN, odd.toDomain().collected.trend!!.direction)
    }

    /**
     * Unlike [TrendDirection], an unrecognised `polarity` does NOT read as a neutral "no claim" —
     * every trend badge needs a colour. It defaults to [TrendPolarity.POSITIVE], the web's own
     * default for every trend it does not special-case as receivables (`buildTrend`'s callers all
     * pass `'positive'` except `outstandingReceivables`). Defaulting POSITIVE is the safer wrong
     * answer: it never tints an ordinary booked/collected rise red for no reason.
     */
    @Test fun `an unrecognised polarity defaults to POSITIVE, the web's own default`() {
        val odd = dto.copy(
            outstandingReceivables = OutstandingReceivablesDto(
                total = BigDecimal("222000"), orderCount = 22,
                trend = TrendDto(BigDecimal("3.0"), "up", "sideways"),
            ),
        )
        assertEquals(TrendPolarity.POSITIVE, odd.toDomain().receivablesTrend!!.polarity)
    }

    // ── loadedThisMonth: keyed by monthKeys[currentMonthIdx], not by array position ──────────

    @Test fun `loadedVolumeByMonth missing the current month leaves loadedThisMonth null`() {
        val withoutCurrent = dto.copy(
            monthKeys = listOf("2026-08", "2026-09"),
            currentMonthIdx = 1,
            loadedVolumeByMonth = listOf(
                LoadedVolumeDto(monthKey = "2026-08", blocks = 10, beamCount = 2, beamMeters = BigDecimal("5.0"), area = BigDecimal("3.0"), orderCount = 1),
            ),
        )
        assertEquals("2026-09", withoutCurrent.toDomain().currentMonthKey)
        assertNull(withoutCurrent.toDomain().loadedThisMonth)
    }

    @Test fun `loadedVolumeByMonth carrying the current month is found by its key`() {
        val withCurrent = dto.copy(
            monthKeys = listOf("2026-08", "2026-09"),
            currentMonthIdx = 1,
            loadedVolumeByMonth = listOf(
                LoadedVolumeDto(monthKey = "2026-08", blocks = 10, beamCount = 2, beamMeters = BigDecimal("5.0"), area = BigDecimal("3.0"), orderCount = 1),
                LoadedVolumeDto(monthKey = "2026-09", blocks = 99, beamCount = 7, beamMeters = BigDecimal("12.4"), area = BigDecimal("8.7"), orderCount = 4),
            ),
        )
        val loaded = withCurrent.toDomain().loadedThisMonth
        assertEquals(99, loaded?.blocks)
        assertEquals(4, loaded?.orderCount)
    }

    // ── recentOrders: a null address survives the mapper as null, not a placeholder ──────────

    @Test fun `a recent order with a null address decodes with a null address, not a placeholder`() {
        val withNullAddress = dto.copy(recentOrders = listOf(
            RecentOrderDto(
                id = "r1", orderNumber = "B-1", clientName = "C", status = "PLACED",
                scheduledAt = "2026-09-08T00:00:00Z", totalPrice = BigDecimal("500000"),
                clientPhone = "998900000000", clientAddress = null,
                totalArea = BigDecimal("12.5"), paymentState = "AWAITING_PAYMENT",
            ),
        ))
        val recent = withNullAddress.toDomain().recent.single()
        assertNull(recent.clientAddress)
        assertEquals("998900000000", recent.clientPhone)
        assertEquals(BigDecimal("12.5"), recent.totalArea)
        assertEquals(PaymentState.AWAITING_PAYMENT, recent.paymentState)
    }

    // ── the recorded fixture: every field the design 6a screen renders decodes off a real payload ──

    /**
     * Recorded from the LOCAL dev server's `GET /api/dashboard` (seeded owner, 2026-09-14) —
     * `android/core/data/src/test/resources/dashboard-response.json`. All client names, phones and
     * addresses in it come from `precast-crm/prisma/seed.ts`'s hard-coded demo rows, already
     * public in this repository; nothing was scrubbed because nothing in it is real.
     */
    private fun fixtureDto(): DashboardDto {
        val text = requireNotNull(
            object {}.javaClass.getResourceAsStream("/dashboard-response.json"),
        ) { "missing test resource dashboard-response.json" }.readBytes().toString(Charsets.UTF_8)
        return EtalonJson.create().decodeFromString(DashboardDto.serializer(), text)
    }

    @Test fun `the recorded payload decodes every field the design 6a screen renders`() {
        val s = fixtureDto().toDomain()

        // Money never Double: every money-shaped figure lands as Money, backed by BigDecimal.
        assertEquals(Money.parse("205709989"), s.booked.total)
        assertEquals(19, s.booked.count)
        assertNull(s.booked.trend, "the fixture's bookedThisMonth.trend is null")
        assertEquals(Money.parse("245288843"), s.bookedAllTime.total)
        assertEquals(23, s.bookedAllTime.count)

        assertEquals(Money.parse("23492500"), s.collected.total)
        assertEquals(8, s.collected.count)
        assertEquals(Money.parse("33192500"), s.collectedAllTime.total)
        assertEquals(10, s.collectedAllTime.count)

        assertEquals(Money.parse("10826842"), s.aov.thisMonth)
        assertEquals(Money.parse("10664732"), s.aov.allTime)

        assertEquals(Money.parse("101502872"), s.receivables)
        assertEquals(14, s.receivableOrders)
        // The fixture's one populated trend: receivables, polarity NEGATIVE — a rise is bad.
        assertEquals(BigDecimal("250"), s.receivablesTrend?.deltaPct)
        assertEquals(TrendDirection.UP, s.receivablesTrend?.direction)
        assertEquals(TrendPolarity.NEGATIVE, s.receivablesTrend?.polarity)

        assertEquals(7, s.activeCustomers)
        assertEquals(12, s.bookedByMonth.size)
        assertEquals(12, s.ordersByMonth.size)
        assertEquals("2026-09", s.currentMonthKey)

        // The fixture's current month (2026-09) is present in loadedVolumeByMonth.
        assertEquals(6338, s.loadedThisMonth?.blocks)
        assertEquals(306, s.loadedThisMonth?.beamCount)
        assertEquals(BigDecimal("1392.4"), s.loadedThisMonth?.beamMeters)
        assertEquals(BigDecimal("822.7"), s.loadedThisMonth?.area)
        assertEquals(12, s.loadedThisMonth?.orderCount)

        assertEquals(5, s.topCustomers.size)
        assertEquals("Karimov LLC", s.topCustomers.first().name)
        assertEquals(Money.parse("32385940"), s.topCustomers.first().totalCollected)

        assertEquals(6, s.recent.size)
        val first = s.recent.first()
        assertEquals("998935554466", first.clientPhone)
        assertEquals("Samarkand · Registan", first.clientAddress)
        assertEquals(BigDecimal("82"), first.totalArea)
        assertEquals(PaymentState.PARTIALLY_PAID, first.paymentState)

        // Never Double: a value that round-tripped through Double.toString() would carry
        // exponent notation ("E8") or a trailing float artefact rather than the exact plain
        // digits the server sent. `toPlainString()` on every money figure above stays exact.
        assertEquals("205709989", s.booked.total.amount.toPlainString())
        assertEquals("245288843", s.bookedAllTime.total.amount.toPlainString())
        assertEquals("101502872", s.receivables.amount.toPlainString())
    }

    /** Task 5 / design §2.6b: the province league table, all-time and already ranked by the
     *  server — the card draws it in the order it arrives, so the order is asserted too. */
    @Test fun `the recorded payload's region ranking decodes in the server's own order`() {
        val s = fixtureDto().toDomain()

        assertEquals(2, s.ordersByRegion.size)
        val first = s.ordersByRegion.first()
        assertEquals("Andijon viloyati", first.region)
        assertEquals("Андижон вилояти", first.regionUz)
        assertEquals(3, first.orderCount)
        assertEquals(1, first.clientCount)
        assertEquals(Money.parse("43274240"), first.booked)
        assertEquals("43274240", first.booked.amount.toPlainString(), "money, never a Double")

        val other = s.ordersByRegion.last()
        assertEquals("Other", other.region)
        assertEquals("Бошқа", other.regionUz)
        assertEquals(20, other.orderCount)
        assertEquals(6, other.clientCount)
        assertEquals(Money.parse("202014603"), other.booked)
    }

    /** Task 5: `collectedByMonth[].paymentCount` — dropped silently until now, and the figure the
     *  Collected card prints as «N та тўлов» for any month but the current one. */
    @Test fun `each month of collectedByMonth carries its own payment count`() {
        val s = fixtureDto().toDomain()

        assertEquals(12, s.collectedByMonth.size)
        assertEquals(8, s.collectedByMonth.last().paymentCount, "September, the fixture's current month")
        assertEquals(Money.parse("23492500"), s.collectedByMonth.last().collected)
        // June: the only other month in the fixture with any cash in it.
        assertEquals(2, s.collectedByMonth[8].paymentCount)
        assertEquals(Money.parse("9700000"), s.collectedByMonth[8].collected)
        assertEquals(0, s.collectedByMonth[9].paymentCount, "July collected nothing")
    }

    @Test fun `the month keys and the current index decode, so a month means a month`() {
        val s = fixtureDto().toDomain()

        assertEquals(12, s.monthKeys.size)
        assertEquals("2025-10", s.monthKeys.first())
        assertEquals("2026-09", s.monthKeys.last())
        assertEquals(11, s.currentMonthIdx)
        assertEquals("2026-09", s.currentMonthKey)
        // The loaded series is its own axis and is NOT the same length as the month window — it
        // reaches three months past the last order month. Found by key, never by index.
        assertEquals(15, s.loadedVolumeByMonth.size)
        assertEquals("2025-10", s.loadedVolumeByMonth.first().monthKey)
        assertEquals("2026-12", s.loadedVolumeByMonth.last().monthKey)
        assertEquals(
            s.loadedThisMonth,
            s.loadedVolumeByMonth.find { it.monthKey == "2026-09" },
            "loadedThisMonth is the row for the current key, not the last row",
        )
    }

    /**
     * **The parity guard.** For the CURRENT month, the figures the phone derives from the twelve-
     * month series with the ported `dashboard-metrics.ts` arithmetic must be the very numbers the
     * server already computed and sent in `bookedThisMonth` / `collectedThisMonth` /
     * `averageOrderValue` — on the recorded payload, not on a hand-written one.
     *
     * If this fails, the month picker is showing one set of numbers for September and the rail
     * another for the same September, which is the one defect §2.3b cannot ship with.
     */
    @Test fun `the current month scoped off the series equals what the server sent for it`() {
        val s = fixtureDto().toDomain()
        val scope = monthScope(s, s.currentMonthIdx)

        assertEquals(s.booked.total, scope.booked.total, "bookedThisMonth.total vs bookedByMonth[current]")
        assertEquals(s.booked.count, scope.booked.count, "orderCount vs ordersByMonth[current]")
        assertEquals(s.collected.total, scope.collected.total)
        assertEquals(s.collected.count, scope.collected.count, "paymentCount vs collectedByMonth[current]")
        assertEquals(s.aov.thisMonth, scope.aov.thisMonth, "averageOrderValue.thisMonth vs booked ÷ orders")
        assertEquals(s.loadedThisMonth, scope.loaded, "the same loaded row, found by the same key")
        assertEquals("2026-09", scope.monthKey)

        // And the figures themselves, spelled out, so the guard says what it is guarding.
        assertEquals(Money.parse("205709989"), scope.booked.total)
        assertEquals(19, scope.booked.count)
        assertEquals(Money.parse("23492500"), scope.collected.total)
        assertEquals(8, scope.collected.count)
        assertEquals(Money.parse("10826842"), scope.aov.thisMonth)
    }

    /** August 2026 in the fixture booked nothing at all, so a September picked off the series has
     *  no previous-month basis — exactly the `previous <= 0 → null` branch, and exactly what the
     *  server itself sent (`bookedThisMonth.trend` is null in the payload). */
    @Test fun `a month whose predecessor booked nothing gets no badge, as the server sent none`() {
        val s = fixtureDto().toDomain()
        val scope = monthScope(s, s.currentMonthIdx)

        assertNull(s.booked.trend, "the server sent no trend")
        assertNull(scope.booked.trend, "and neither does the port")
        // July (idx 9) against June (idx 8): 29 000 000 against 10 578 854 → +174 %.
        assertEquals(BigDecimal("174"), monthScope(s, 9).booked.trend?.deltaPct)
    }
}
