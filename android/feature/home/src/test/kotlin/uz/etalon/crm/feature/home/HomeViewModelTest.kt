package uz.etalon.crm.feature.home

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.data.RejectedOrder
import uz.etalon.crm.core.model.AllTimeMoney
import uz.etalon.crm.core.model.Aov
import uz.etalon.crm.core.model.HomeSummary
import uz.etalon.crm.core.model.LoadedVolume
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.MonthBooked
import uz.etalon.crm.core.model.MonthCollected
import uz.etalon.crm.core.model.MonthOrders
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.PeriodMoney
import uz.etalon.crm.core.model.RecentOrder
import uz.etalon.crm.core.model.TodayDelivery
import uz.etalon.crm.core.model.TopCustomer
import uz.etalon.crm.core.model.Trend
import uz.etalon.crm.core.model.TrendDirection
import uz.etalon.crm.core.model.TrendPolarity
import uz.etalon.crm.core.network.ApiException
import java.io.IOException
import java.math.BigDecimal

@OptIn(ExperimentalCoroutinesApi::class)
class HomeViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    // ── the list shape ────────────────────────────────────────────────────────────

    /** The defect this project has shipped three times: an empty Бугун column beside an error
     *  banner reads as "nothing scheduled" when the truth is "couldn't check". */
    @Test fun `no empty state while loading or while an error shows`() = runTest {
        val failing = viewModel(home = { Result.failure(IOException("no net")) })
        assertFalse(failing.state.value.showEmptyState, "still loading")
        advanceUntilIdle()
        assertNotNull(failing.state.value.error)
        assertFalse(failing.state.value.showEmptyState, "an error banner is showing")

        val empty = viewModel(home = { Result.success(summary(today = emptyList())) })
        advanceUntilIdle()
        assertTrue(empty.state.value.showEmptyState)
        assertNull(empty.state.value.error)
    }

    @Test fun `a failed refresh can be retried and recovers`() = runTest {
        var fail = true
        val vm = viewModel(home = { if (fail) Result.failure(IOException("no net")) else Result.success(summary()) })
        advanceUntilIdle()
        assertNotNull(vm.state.value.error)

        fail = false
        vm.refresh()
        advanceUntilIdle()
        assertNull(vm.state.value.error)
        assertEquals(1, vm.state.value.today.size)
    }

    // ── everyone gets the column; only the tiles are gated ──────────────────────────

    /** Task 7's own decision: `GET /api/dashboard` is itself gated server-side on
     *  `dashboard.viewBasic` OR `dashboard.view` (see the class KDoc on [HomeViewModel]), so an
     *  operator holding neither must not even be asked — asking would 403 the whole payload. */
    @Test fun `without either dashboard permission the home endpoint is never called`() = runTest {
        var calls = 0
        val vm = viewModel(
            home = { calls++; Result.success(summary()) },
            permissions = { false },
        )
        advanceUntilIdle()
        assertEquals(0, calls, "an operator without dashboard.viewBasic or dashboard.view must not be asked")
        assertFalse(vm.state.value.hasDashboardAccess)
    }

    /** The column itself still renders — empty, not erroring — and the tiles are absent rather
     *  than a [HomeDashboard] full of zeros, which the brief calls out as the easy mistake here. */
    @Test fun `without dashboard access the column is empty and the tiles are absent, not zero`() = runTest {
        val vm = viewModel(permissions = { false })
        advanceUntilIdle()
        assertTrue(vm.state.value.permissionsResolved)
        assertEquals(emptyList<TodayDelivery>(), vm.state.value.today)
        assertNull(vm.state.value.dash, "absent, not a HomeDashboard of zeros")
        assertNull(vm.state.value.error, "no dashboard access is a fact, not a failure")
        assertFalse(vm.state.value.loading)
    }

    /**
     * "Nothing scheduled today" and "cannot check today's orders" are different facts and must
     * render as different strings — a driver reading «Бугунга буюртма йўқ» when the truth is
     * "not allowed to see" believes there is nothing on their route when there may be several.
     * [HomeUiState.showEmptyState] and [HomeUiState.showNoAccessState] must therefore never both
     * be true, and the no-access flag — not the empty one — is what fires when the permission is
     * withheld.
     */
    @Test fun `the no-access state and the genuine empty state never share a rendering`() = runTest {
        val noAccess = viewModel(permissions = { false })
        advanceUntilIdle()
        assertTrue(noAccess.state.value.showNoAccessState, "the withheld-permission case must render its own text")
        assertFalse(noAccess.state.value.showEmptyState, "must not also claim there is nothing scheduled")

        val genuinelyEmpty = viewModel(home = { Result.success(summary(today = emptyList())) })
        advanceUntilIdle()
        assertTrue(genuinelyEmpty.state.value.showEmptyState)
        assertFalse(genuinelyEmpty.state.value.showNoAccessState)

        val hasDeliveries = viewModel(home = { Result.success(summary()) })
        advanceUntilIdle()
        assertFalse(hasDeliveries.state.value.showEmptyState)
        assertFalse(hasDeliveries.state.value.showNoAccessState)
    }

    @Test fun `dashboard viewBasic alone is enough to see the tiles`() = runTest {
        val vm = viewModel(permissions = { it == "dashboard.viewBasic" })
        advanceUntilIdle()
        assertTrue(vm.state.value.hasDashboardAccess)
        assertNotNull(vm.state.value.dash)
    }

    @Test fun `refresh is a no-op without dashboard access`() = runTest {
        var calls = 0
        val vm = viewModel(home = { calls++; Result.success(summary()) }, permissions = { false })
        advanceUntilIdle()
        vm.refresh()
        advanceUntilIdle()
        assertEquals(0, calls)
    }

    /** A permission withdrawn between screens (or a client-side check that briefly raced the
     *  server) must land the operator on the same silent empty state as never having had it —
     *  not a red banner they cannot do anything about. */
    @Test fun `a 403 from the endpoint is treated as a withdrawn permission, silently`() = runTest {
        val vm = viewModel(home = { Result.failure(ApiException(403, "Рухсат йўқ · Permission denied")) })
        advanceUntilIdle()
        assertNull(vm.state.value.error)
        assertFalse(vm.state.value.hasDashboardAccess)
        assertNull(vm.state.value.dash)
        assertEquals(emptyList<TodayDelivery>(), vm.state.value.today)
        assertTrue(vm.state.value.showNoAccessState, "renders the withheld-permission text, not the empty one")
        assertFalse(vm.state.value.showEmptyState)
    }

    // ── field-for-field, not a same-typed neighbour ──────────────────────────────────

    /**
     * `HomeSummary` carries a dozen `Int`s and as many `Money`s, and the dashboard's top half
     * renders nearly all of them. Every figure is given a value nothing else in the fixture
     * shares, so a field wired to a same-typed neighbour fails here rather than on the emulator —
     * independent of the mapper-level guarantee `DashboardMappersTest` gives the DTO decode.
     */
    @Test fun `the dashboard carries the summary's fields, not a same-typed neighbour`() = runTest {
        val bookedTrend = Trend(BigDecimal("8"), TrendDirection.UP, TrendPolarity.POSITIVE)
        val collectedTrend = Trend(BigDecimal("12"), TrendDirection.DOWN, TrendPolarity.POSITIVE)
        val aovTrend = Trend(BigDecimal("3"), TrendDirection.FLAT, TrendPolarity.POSITIVE)
        val loaded = LoadedVolume(
            monthKey = "2026-09", blocks = 1180, beamCount = 96,
            beamMeters = BigDecimal("512.4"), area = BigDecimal("318.60"), orderCount = 11,
        )
        val s = summary(
            today = listOf(delivery("o1"), delivery("o2")),
            todayArea = BigDecimal("12.5"),
            openDiscrepancies = 3,
            openDiscrepancyTotal = Money.parse("500000"),
            receivables = Money.parse("9000000"),
            receivableOrders = 7,
            paidOrders = 317, partialOrders = 13, awaitingOrders = 23,
            booked = PeriodMoney(Money.parse("120000000"), 12, bookedTrend),
            bookedAllTime = AllTimeMoney(Money.parse("980000000"), 512),
            collectedThisMonth = Money.parse("13500000"),
            collectedCount = 9,
            collectedTrend = collectedTrend,
            collectedAllTime = AllTimeMoney(Money.parse("870000000"), 431),
            aov = Aov(Money.parse("10000000"), Money.parse("1914062"), aovTrend),
            activeCustomers = 42,
            loadedThisMonth = loaded,
            currentMonthKey = "2026-09",
        )
        val vm = viewModel(home = { Result.success(s) })
        advanceUntilIdle()
        val d = vm.state.value.dash!!

        assertEquals(Money.parse("9000000"), d.receivables)
        assertEquals(7, d.receivableOrders)
        assertEquals(317, d.paidOrders)
        assertEquals(13, d.partialOrders)
        assertEquals(23, d.awaitingOrders)

        assertEquals(Money.parse("120000000"), d.booked.total)
        assertEquals(12, d.booked.count)
        assertEquals(bookedTrend, d.booked.trend)
        assertEquals(Money.parse("980000000"), d.bookedAllTime.total)
        assertEquals(512, d.bookedAllTime.count)
        assertEquals(Money.parse("13500000"), d.collected.total)
        assertEquals(9, d.collected.count)
        assertEquals(collectedTrend, d.collected.trend)
        assertEquals(Money.parse("870000000"), d.collectedAllTime.total)
        assertEquals(431, d.collectedAllTime.count)
        assertEquals(Money.parse("10000000"), d.aov.thisMonth)
        assertEquals(Money.parse("1914062"), d.aov.allTime)
        assertEquals(aovTrend, d.aov.trend)

        assertEquals(42, d.activeCustomers)
        assertEquals(2, vm.state.value.today.size)
        assertEquals(BigDecimal("12.5"), d.todayArea)
        assertEquals(3, d.openDiscrepancies)
        assertEquals(Money.parse("500000"), d.openDiscrepancyTotal)
        assertEquals(loaded, d.loadedThisMonth)
        assertEquals("2026-09", d.currentMonthKey)
    }

    /** The recent orders reach the state whole for §2.7's card, and the two money series arrive
     *  as the plain numbers a sparkline is drawn from — cut to the eight months it shows. */
    @Test fun `the recent orders and the rail series reach the state whole`() = runTest {
        val s = summary(
            recent = listOf(recentOrder("r1"), recentOrder("r2")),
            collectedByMonth = (1..12).map { MonthCollected("2026-%02d".format(it), Money.parse("${it}000000")) },
            bookedByMonth = (1..12).map { MonthBooked("2026-%02d".format(it), Money.parse("${it}500000")) },
        )
        val vm = viewModel(home = { Result.success(s) })
        advanceUntilIdle()
        val d = vm.state.value.dash!!
        assertEquals(2, vm.state.value.recent.size)
        assertEquals(listOf("r1", "r2"), vm.state.value.recent.map { it.orderId })
        // Eight bars, ending with the current month — the fifth month of twelve is off the left.
        assertEquals(8, d.collectedSeries.size)
        assertEquals(BigDecimal("5000000"), d.collectedSeries.first())
        assertEquals(BigDecimal("12000000"), d.collectedSeries.last())
        assertEquals(8, d.bookedSeries.size)
        assertEquals(BigDecimal("12500000"), d.bookedSeries.last())
    }

    /** §2.4's segment bar fills with what has actually left the yard. A truck that is loaded but
     *  still in the yard has not: only DISPATCHED and DELIVERED count. */
    @Test fun `the segment bar counts only the deliveries that have left the yard`() = runTest {
        val s = summary(
            today = listOf(
                delivery("o1", OrderStatus.PLACED),
                delivery("o2", OrderStatus.LOADED),
                delivery("o3", OrderStatus.DISPATCHED),
                delivery("o4", OrderStatus.DELIVERED),
                delivery("o5", OrderStatus.CANCELED),
            ),
        )
        val vm = viewModel(home = { Result.success(s) })
        advanceUntilIdle()
        assertEquals(5, vm.state.value.today.size)
        assertEquals(2, vm.state.value.todayDone)
    }

    /**
     * A refresh that fails leaves the figures that were on screen exactly where they were, under
     * the banner that says they are stale. Blanking them is the alternative, and it turns a lost
     * connection into a month that looks like it had no orders in it.
     *
     * This is also the ticker's safety net (§3, ruling R7): the auto-refresh fires every 60 s on a
     * phone that is regularly out of coverage on a building site, so the ordinary case of a failed
     * refresh is one nobody asked for — and it must cost the operator nothing. The whole payload is
     * asserted, the bottom half included, so a future "clear it and show the banner" cannot slip in
     * for one card.
     */
    @Test fun `a failed refresh keeps the last payload`() = runTest {
        var fail = false
        val vm = viewModel(
            home = {
                if (fail) Result.failure(IOException("no net"))
                else Result.success(
                    summary(
                        receivables = Money.parse("9000000"), receivableOrders = 7,
                        paidOrders = 317, partialOrders = 13, awaitingOrders = 23,
                        recent = listOf(recentOrder("r1")),
                        topCustomers = listOf(customer("c1", "5000000")),
                    ),
                )
            },
        )
        advanceUntilIdle()
        assertEquals(Money.parse("9000000"), vm.state.value.dash?.receivables)

        fail = true
        vm.refresh()
        advanceUntilIdle()
        assertNotNull(vm.state.value.error)
        assertEquals(Money.parse("9000000"), vm.state.value.dash?.receivables, "the last good payload stands")
        assertEquals(7, vm.state.value.dash?.receivableOrders)
        assertEquals(1, vm.state.value.today.size)
        // §2.5–§2.7 stand too: a stale donut is worth more than an empty one.
        assertEquals(317, vm.state.value.dash?.paidOrders)
        assertEquals(listOf("r1"), vm.state.value.recent.map { it.orderId })
        assertEquals(listOf("c1"), vm.state.value.dash?.topCustomers?.map { it.id })
    }

    // ── §2.5–§2.7, the bottom half's own inputs ───────────────────────────────────────

    /** §2.6: five rows, biggest payer first — whatever order the array arrived in. A sixth client
     *  is off the card, and the one who is cut is the smallest, not the last. */
    @Test fun `the top clients are the five biggest payers, ranked`() = runTest {
        val s = summary(
            topCustomers = listOf(
                customer("c1", "3000000"),
                customer("c2", "9000000"),
                customer("c3", "1000000"),
                customer("c4", "7000000"),
                customer("c5", "5000000"),
                customer("c6", "11000000"),
            ),
        )
        val vm = viewModel(home = { Result.success(s) })
        advanceUntilIdle()
        val top = vm.state.value.dash!!.topCustomers

        assertEquals(5, top.size)
        assertEquals(listOf("c6", "c2", "c4", "c5", "c1"), top.map { it.id })
        assertEquals(Money.parse("11000000"), top.first().totalCollected)
    }

    /** Ties keep the server's own order between them — a stable sort, so two clients who have paid
     *  exactly the same do not swap places between two identical payloads. */
    @Test fun `clients who have paid the same keep the server's order`() {
        val ranked = topCustomers(
            listOf(customer("a", "5000000"), customer("b", "5000000"), customer("c", "9000000")),
        )
        assertEquals(listOf("c", "a", "b"), ranked.map { it.id })
    }

    /** An account where nobody has paid yet has no rows at all — the card says «Ҳали тушум йўқ»
     *  rather than listing five zeros. */
    @Test fun `no top clients at all is an empty list, not a row of zeros`() = runTest {
        val vm = viewModel(home = { Result.success(summary(topCustomers = emptyList())) })
        advanceUntilIdle()
        assertEquals(emptyList<TopCustomer>(), vm.state.value.dash!!.topCustomers)
    }

    /** §2.7 draws four rows. The server sends more than that (the web's own card shows five on a
     *  desktop), so the cut is this client's and the four kept are the newest — the head of an
     *  array the server already sorted newest-first. */
    @Test fun `the recent card keeps the four latest orders`() = runTest {
        val s = summary(recent = (1..7).map { recentOrder("r$it") })
        val vm = viewModel(home = { Result.success(s) })
        advanceUntilIdle()
        assertEquals(listOf("r1", "r2", "r3", "r4"), vm.state.value.recent.map { it.orderId })
    }

    /** §2.5's ring is drawn from three counts and nothing else; they reach the state unchanged,
     *  and the header's «N та буюртма» is their sum. */
    @Test fun `the donut's three counts reach the state unchanged`() = runTest {
        val vm = viewModel(home = { Result.success(summary(paidOrders = 317, partialOrders = 13, awaitingOrders = 23)) })
        advanceUntilIdle()
        val d = vm.state.value.dash!!
        assertEquals(317, d.paidOrders)
        assertEquals(13, d.partialOrders)
        assertEquals(23, d.awaitingOrders)
        assertEquals(353, d.paidOrders + d.partialOrders + d.awaitingOrders)
    }

    // ── §2.3's one computed figure ────────────────────────────────────────────────────

    /** The brief's own formula, and the rounding the web does with `Math.round`: 5 ÷ 2 is 2,5,
     *  which HALF_UP carries up to 3. A `BigDecimal` throws on a non-terminating division rather
     *  than rounding silently, so the scale and mode are not decoration. */
    @Test fun `the aov series divides in whole UZS, half up`() {
        val series = aovSeries(
            booked = listOf(MonthBooked("2026-08", Money.parse("5")), MonthBooked("2026-09", Money.parse("10000000"))),
            orders = listOf(MonthOrders("2026-08", 2), MonthOrders("2026-09", 3)),
        )
        assertEquals(listOf(BigDecimal("3"), BigDecimal("3333333")), series)
    }

    /** A month with no orders has no average at all. Zero is what the brief asks for and what the
     *  sparkline draws as a stub — the alternatives are a crash and a carried-forward figure that
     *  reads as a month that traded. */
    @Test fun `a month with no orders contributes a zero to the aov series`() {
        val series = aovSeries(
            booked = listOf(MonthBooked("2026-09", Money.parse("4000000"))),
            orders = listOf(MonthOrders("2026-09", 0)),
        )
        assertEquals(listOf(BigDecimal.ZERO), series)

        // …and so does a month the orders array does not carry at all.
        assertEquals(
            listOf(BigDecimal.ZERO),
            aovSeries(booked = listOf(MonthBooked("2026-09", Money.parse("4000000"))), orders = emptyList()),
        )
    }

    /** A three-month-old account has three points, not eight: the window is the sparkline's own
     *  business (it left-pads), and padding here would put three zero months in front of a figure
     *  the account never had. */
    @Test fun `an account younger than the window yields one point per month it has`() {
        val series = aovSeries(
            booked = (1..3).map { MonthBooked("2026-0$it", Money.parse("${it}000000")) },
            orders = (1..3).map { MonthOrders("2026-0$it", it) },
        )
        assertEquals(3, series.size)
        assertEquals(listOf(BigDecimal("1000000"), BigDecimal("1000000"), BigDecimal("1000000")), series)
    }

    /** Twelve months in, eight out — the last eight, ending with this month. */
    @Test fun `the aov series keeps the last eight months`() {
        val series = aovSeries(
            booked = (1..12).map { MonthBooked("2026-%02d".format(it), Money.parse("${it}000000")) },
            orders = (1..12).map { MonthOrders("2026-%02d".format(it), 1) },
        )
        assertEquals(8, series.size)
        assertEquals(BigDecimal("5000000"), series.first())
        assertEquals(BigDecimal("12000000"), series.last())
    }

    /** The pairing is by month key, not by index: an orders array that arrives a month shorter
     *  than the bookings one must not divide September's bookings by August's count. */
    @Test fun `each month is divided by its own count, not by its neighbour's`() {
        val series = aovSeries(
            booked = listOf(MonthBooked("2026-08", Money.parse("8000000")), MonthBooked("2026-09", Money.parse("9000000"))),
            orders = listOf(MonthOrders("2026-09", 3)),
        )
        assertEquals(listOf(BigDecimal.ZERO, BigDecimal("3000000")), series)
    }

    /** «Ҳали буюртма йўқ» is a claim about the server, not about the screen: it may only be made
     *  once a permitted fetch has settled — never while loading and never over a failed refresh. */
    @Test fun `the recent empty state waits for a settled fetch`() = runTest {
        val failing = viewModel(home = { Result.failure(IOException("no net")) })
        assertFalse(failing.state.value.showRecentEmpty, "still loading")
        advanceUntilIdle()
        assertFalse(failing.state.value.showRecentEmpty, "an error banner is showing")

        val empty = viewModel(home = { Result.success(summary(recent = emptyList())) })
        advanceUntilIdle()
        assertTrue(empty.state.value.showRecentEmpty)

        val noAccess = viewModel(permissions = { false })
        advanceUntilIdle()
        assertFalse(noAccess.state.value.showRecentEmpty, "withheld, not empty")
    }

    /** A withdrawn permission clears the recent card along with the rest — a stale list of other
     *  people's orders left standing under a "cannot check" sheet is the worst of both states. */
    @Test fun `a 403 clears the recent orders too`() = runTest {
        var forbidden = false
        val vm = viewModel(
            home = {
                if (forbidden) Result.failure(ApiException(403, "Рухсат йўқ · Permission denied"))
                else Result.success(summary(recent = listOf(recentOrder("r1"))))
            },
        )
        advanceUntilIdle()
        assertEquals(1, vm.state.value.recent.size)

        forbidden = true
        vm.refresh()
        advanceUntilIdle()
        assertEquals(emptyList<RecentOrder>(), vm.state.value.recent)
    }

    // ── the operator's own outbox status ─────────────────────────────────────────────

    @Test fun `the pending upload count tracks the outbox flow`() = runTest {
        val pending = MutableStateFlow(0)
        val vm = viewModel(outboxPending = { pending })
        advanceUntilIdle()
        assertEquals(0, vm.state.value.pendingUploads)

        pending.value = 2
        advanceUntilIdle()
        assertEquals(2, vm.state.value.pendingUploads)
    }

    /**
     * D10 / R6: a rejected queued order is unfinished work like any unsent upload, and the bell is
     * the only place it can be found — a rejection that left the badge dark would sit unread
     * behind a bell that looked idle. So the dot counts BOTH, and «Тушунарли» discards by id.
     */
    @Test fun `the bell counts rejected orders beside the pending uploads`() = runTest {
        val discarded = mutableListOf<String>()
        val rejected = MutableStateFlow(
            listOf(RejectedOrder(id = "row-1", clientName = "Karimov LLC", message = "Мижоз топилмади")),
        )
        val vm = viewModel(
            outboxPending = { flowOf(2) },
            rejectedOrders = { rejected },
            discardRejected = { id -> discarded += id },
        )
        advanceUntilIdle()

        assertEquals(rejected.value, vm.state.value.rejectedOrders)
        assertEquals(3, vm.state.value.outboxBadge, "two uploads plus one rejection")

        vm.discardRejectedOrder("row-1")
        advanceUntilIdle()
        assertEquals(listOf("row-1"), discarded)

        // The list is the flow's, not the ViewModel's: the row leaves only once the outbox says so.
        rejected.value = emptyList()
        advanceUntilIdle()
        assertEquals(2, vm.state.value.outboxBadge)
    }

    /**
     * Ruling I3. A successful re-open raises the flag the route navigates on, and clears it once —
     * a flag that stayed set would send the operator back to the calculator on every recomposition
     * of Home.
     */
    @Test fun `a reopened rejection sends the route to the calculator, once`() = runTest {
        val reopened = mutableListOf<String>()
        val vm = viewModel(reopenRejected = { id -> reopened += id; Result.success(Unit) })
        advanceUntilIdle()

        vm.reopenRejectedOrder("row-1")
        advanceUntilIdle()
        assertEquals(listOf("row-1"), reopened)
        assertTrue(vm.state.value.reopenedInCalculator)
        assertNull(vm.state.value.reopenError)

        vm.consumeReopen()
        assertFalse(vm.state.value.reopenedInCalculator)
    }

    /** A re-open that failed navigates nowhere and says why — the row is still in the list, and
     *  the quote with it. */
    @Test fun `a failed reopen shows the reason and stays put`() = runTest {
        val vm = viewModel(reopenRejected = { Result.failure(IllegalStateException("Ҳисоб-китобни очиб бўлмади")) })
        advanceUntilIdle()

        vm.reopenRejectedOrder("row-1")
        advanceUntilIdle()
        assertFalse(vm.state.value.reopenedInCalculator)
        assertEquals("Ҳисоб-китобни очиб бўлмади", vm.state.value.reopenError)
    }

    // ── fixtures ──────────────────────────────────────────────────────────────────

    private fun viewModel(
        home: suspend () -> Result<HomeSummary> = { Result.success(summary()) },
        permissions: suspend (String) -> Boolean = { true },
        outboxPending: () -> kotlinx.coroutines.flow.Flow<Int> = { flowOf(0) },
        rejectedOrders: () -> kotlinx.coroutines.flow.Flow<List<RejectedOrder>> = { flowOf(emptyList()) },
        discardRejected: suspend (String) -> Unit = { },
        reopenRejected: suspend (String) -> Result<Unit> = { Result.success(Unit) },
    ) = HomeViewModel(
        home = HomeUseCase { home() },
        permissions = HomePermissionUseCase { permissions(it) },
        outboxPending = HomeOutboxUseCase { outboxPending() },
        rejectedOrders = HomeRejectedOrdersUseCase { rejectedOrders() },
        discardRejected = HomeDiscardRejectedOrderUseCase { id -> discardRejected(id) },
        reopenRejected = HomeReopenRejectedOrderUseCase { id -> reopenRejected(id) },
    )

    private fun delivery(id: String, status: OrderStatus = OrderStatus.PLACED) = TodayDelivery(
        orderId = id, orderNumber = "ORD-$id", clientName = "Навоий Build", clientAddress = "Навоий кўча 1",
        area = BigDecimal("10.000"), status = status, totalPrice = Money.parse("1000000"), remaining = Money.parse("1000000"),
    )

    private fun recentOrder(id: String) = RecentOrder(
        orderId = id, orderNumber = "ORD-$id", clientName = "Навоий Build",
        clientPhone = "998900000000", clientAddress = "Навоий кўча 1",
        status = OrderStatus.PLACED,
        scheduledAt = java.time.Instant.parse("2026-09-04T06:00:00Z"),
        totalPrice = Money.parse("1000000"), remaining = Money.parse("1000000"),
        totalArea = BigDecimal("10.000"), paymentState = PaymentState.AWAITING_PAYMENT,
    )

    private fun summary(
        today: List<TodayDelivery> = listOf(delivery("o1")),
        todayArea: BigDecimal = BigDecimal("10.000"),
        openDiscrepancies: Int = 0,
        openDiscrepancyTotal: Money = Money.ZERO,
        receivables: Money = Money.ZERO,
        receivableOrders: Int = 0,
        paidOrders: Int = 0,
        partialOrders: Int = 0,
        awaitingOrders: Int = 0,
        recent: List<RecentOrder> = emptyList(),
        booked: PeriodMoney = PeriodMoney(total = Money.ZERO, count = 0, trend = null),
        bookedAllTime: AllTimeMoney = AllTimeMoney(total = Money.ZERO, count = 0),
        collectedThisMonth: Money = Money.ZERO,
        collectedCount: Int = 0,
        collectedTrend: Trend? = null,
        collectedAllTime: AllTimeMoney = AllTimeMoney(total = Money.ZERO, count = 0),
        collectedByMonth: List<MonthCollected> = emptyList(),
        aov: Aov = Aov(thisMonth = Money.ZERO, allTime = Money.ZERO, trend = null),
        activeCustomers: Int = 0,
        bookedByMonth: List<MonthBooked> = emptyList(),
        ordersByMonth: List<MonthOrders> = emptyList(),
        currentMonthKey: String = "2026-09",
        loadedThisMonth: LoadedVolume? = null,
        topCustomers: List<TopCustomer> = emptyList(),
    ) = HomeSummary(
        today = today, todayArea = todayArea,
        openDiscrepancies = openDiscrepancies, openDiscrepancyTotal = openDiscrepancyTotal,
        receivables = receivables, receivableOrders = receivableOrders, receivablesTrend = null,
        paidOrders = paidOrders, partialOrders = partialOrders, awaitingOrders = awaitingOrders,
        recent = recent,
        booked = booked,
        bookedAllTime = bookedAllTime,
        collected = PeriodMoney(total = collectedThisMonth, count = collectedCount, trend = collectedTrend),
        collectedAllTime = collectedAllTime,
        collectedByMonth = collectedByMonth,
        aov = aov,
        activeCustomers = activeCustomers,
        bookedByMonth = bookedByMonth,
        ordersByMonth = ordersByMonth,
        currentMonthKey = currentMonthKey,
        loadedThisMonth = loadedThisMonth,
        topCustomers = topCustomers,
    )

    private fun customer(id: String, collected: String, orders: Int = 1) =
        TopCustomer(id = id, name = "Мижоз $id", totalCollected = Money.parse(collected), orderCount = orders)
}
