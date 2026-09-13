package uz.etalon.crm.feature.orders

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.data.OrdersFilter
import uz.etalon.crm.core.model.*
import uz.etalon.crm.core.ui.format.TASHKENT
import uz.etalon.crm.feature.orders.list.CapacitySource
import uz.etalon.crm.feature.orders.list.MemoryOrdersViewStore
import uz.etalon.crm.feature.orders.list.OrdersListViewModel
import uz.etalon.crm.feature.orders.list.OrdersSource
import java.io.File
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth

@OptIn(ExperimentalCoroutinesApi::class)
class OrdersListViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    /** What the ViewModel asks for when nothing is filtered: newest first, one page of 50. */
    private fun page1(
        q: String? = null, status: OrderStatus? = null, payment: PaymentFilter? = null, day: LocalDate? = null, page: Int = 1,
    ) = OrdersFilter(q = q, status = status, payment = payment, day = day, page = page, sort = "desc", pageSize = 50)

    private fun order(n: String, price: Money = Money.parse("1")) = OrderSummary("id-$n", n, OrderStatus.PLACED, PaymentState.AWAITING_PAYMENT, price, Money.ZERO, BigDecimal.ONE, 1, 1, Instant.EPOCH, Instant.EPOCH, ClientRef("c", "A", "998901112233", null))

    /** What the day sheet asks for: the shared filters plus the day, oldest first (R6, §4.5). */
    private fun dayPage(
        day: LocalDate, q: String? = null, status: OrderStatus? = null, payment: PaymentFilter? = null,
    ) = OrdersFilter(q = q, status = status, payment = payment, day = day, page = 1, sort = "asc", pageSize = 50)

    private fun capacityMonth(
        m: YearMonth, areas: Map<LocalDate, String> = emptyMap(), thresholds: CapacityThresholds = CapacityThresholds.DEFAULT,
    ) = CapacityMonth(m, gridRange(m), areas.mapValues { (d, a) -> CapacityDay(d, BigDecimal(a), 1, 0) }, thresholds)

    /**
     * Stands in for `CapacityRepository`, cache included: [fetches] counts what would be a network
     * call, so a month the ViewModel comes back to must not raise it.
     */
    private class FakeCapacity(private val payload: (YearMonth) -> CapacityMonth = { CapacityMonth(it, gridRange(it), emptyMap(), CapacityThresholds.DEFAULT) }) : CapacitySource {
        var fetches = 0
        private val cache = mutableMapOf<YearMonth, CapacityMonth>()
        override fun observe(month: YearMonth): Flow<Resource<CapacityMonth>> = flow {
            cache[month]?.let { emit(Resource.Success(it)); return@flow }
            emit(Resource.Loading(null))
            fetches++
            emit(Resource.Success(payload(month).also { cache[month] = it }))
        }
        override suspend fun refresh(month: YearMonth): Result<Unit> {
            fetches++
            cache[month] = payload(month)
            return Result.success(Unit)
        }
    }

    private fun rows(state: uz.etalon.crm.feature.orders.list.OrdersListUiState) = state.groups.flatMap { it.rows }

    private class FakeSource : OrdersSource {
        val flows = mutableMapOf<String, MutableStateFlow<Resource<List<OrderSummary>>>>()
        val facetFlows = mutableMapOf<String, MutableStateFlow<OrderFacets?>>()
        val totalFlows = mutableMapOf<String, MutableStateFlow<Int?>>()
        val refreshed = mutableListOf<OrdersFilter>()
        override fun list(filter: OrdersFilter): Flow<Resource<List<OrderSummary>>> = flows.getOrPut(filter.listKey) { MutableStateFlow(Resource.Loading(null)) }
        override suspend fun refreshList(filter: OrdersFilter) { refreshed += filter }
        override fun facets(filter: OrdersFilter): Flow<OrderFacets?> = facetFlows.getOrPut(filter.facetKey) { MutableStateFlow(null) }
        override fun total(filter: OrdersFilter): Flow<Int?> = totalFlows.getOrPut(filter.totalKey) { MutableStateFlow(null) }
        fun emit(filter: OrdersFilter, value: Resource<List<OrderSummary>>) { flows.getOrPut(filter.listKey) { MutableStateFlow(value) }.value = value }
        fun emitFacets(filter: OrdersFilter, value: OrderFacets) { facetFlows.getOrPut(filter.facetKey) { MutableStateFlow(value) }.value = value }
        /** The `total` of the page the server returned for this exact filter — what the repository
         *  stores from `OrdersPageDto.total`, keyed by the filter minus its page. */
        fun emitTotal(filter: OrdersFilter, value: Int) { totalFlows.getOrPut(filter.totalKey) { MutableStateFlow(value) }.value = value }
    }

    @Test fun `refreshes page 1 on start and exposes rows`() = runTest {
        val src = FakeSource()
        val vm = OrdersListViewModel(src)
        advanceUntilIdle()
        assertEquals(listOf(page1()), src.refreshed)
        src.emit(page1(), Resource.Success(listOf(order("2026-09-0001"))))
        advanceUntilIdle()
        assertEquals("2026-09-0001", rows(vm.state.value).single().orderNumber)
    }
    @Test fun `changing the status chip re-queries with page 1`() = runTest {
        val src = FakeSource(); val vm = OrdersListViewModel(src); advanceUntilIdle()
        vm.setStatus(OrderStatus.DELIVERED); advanceUntilIdle()
        assertEquals(page1(status = OrderStatus.DELIVERED), src.refreshed.last())
        assertEquals(OrderStatus.DELIVERED, vm.state.value.status)
    }
    /** Sign-out wipes Room and the repository's in-memory outcomes, so the list flow drops back to
     *  Loading(null) with no filter change to trigger a fetch (defect f4). */
    @Test fun `a cache emptied under the collector re-triggers exactly one refresh`() = runTest {
        val src = FakeSource(); val vm = OrdersListViewModel(src); advanceUntilIdle()
        val flow = src.flows[page1().listKey]!!
        flow.value = Resource.Success(listOf(order("2026-09-0001"))); advanceUntilIdle()
        assertEquals(1, src.refreshed.size)
        flow.value = Resource.Loading(null); advanceUntilIdle()
        assertEquals(2, src.refreshed.size)
        assertEquals(page1(), src.refreshed.last())
        advanceUntilIdle()
        assertEquals(2, src.refreshed.size) // and only one: no refresh loop
    }

    @Test fun `query is debounced`() = runTest {
        val src = FakeSource(); val vm = OrdersListViewModel(src); advanceUntilIdle()
        vm.setQuery("Аз"); vm.setQuery("Ази"); vm.setQuery("Азиз")
        advanceTimeBy(100); assertEquals(1, src.refreshed.size)
        advanceTimeBy(400); advanceUntilIdle()
        assertEquals(page1(q = "Азиз"), src.refreshed.last())
        assertEquals(2, src.refreshed.size)
    }

    /** 51 orders: a full page of 50 and one more. The figures have to be page-size-consistent —
     *  with a total under 50 there is no second page to append and the ViewModel rightly refuses
     *  to ask for one. */
    @Test fun `loadMore appends page 2 after page 1 and stops at the filtered total`() = runTest {
        val src = FakeSource(); val vm = OrdersListViewModel(src); advanceUntilIdle()
        src.emitTotal(page1(), 51)
        src.emit(page1(), Resource.Success((1..50).map { order("2026-09-%04d".format(it)) }))
        advanceUntilIdle()
        assertTrue(vm.state.value.hasMore)

        vm.loadMore(); advanceUntilIdle()
        assertEquals(page1(page = 2), src.refreshed.last())
        src.emit(page1(page = 2), Resource.Success(listOf(order("2026-08-0009"))))
        advanceUntilIdle()

        val loaded = rows(vm.state.value).map { it.orderNumber }
        assertEquals(51, loaded.size)
        assertEquals("2026-09-0001", loaded.first())
        assertEquals("2026-08-0009", loaded.last()) // page 2 appended after page 1, not merged into it
        assertFalse(vm.state.value.hasMore)
        assertFalse(vm.state.value.loadingMore)

        vm.loadMore(); advanceUntilIdle()
        assertEquals(page1(page = 2), src.refreshed.last()) // nothing more to ask for
    }

    /**
     * Defect C1. `facets.total` counts the `q`/`day` filter with `status` ignored, so with a chip
     * on it is bigger than the filtered list can ever grow; paging against it asked for page after
     * page (live: `page=49` on a «Қабул» filter holding two orders). The filtered total — the
     * page's own `total` — is the only figure paging may stop at.
     */
    @Test fun `a status filter stops paging at the filtered total`() = runTest {
        val src = FakeSource(); val vm = OrdersListViewModel(src); advanceUntilIdle()
        vm.setStatus(OrderStatus.PLACED); advanceUntilIdle()
        val f = page1(status = OrderStatus.PLACED)
        // 24 orders all told, 2 of them PLACED — the facets say 24 and must not be believed.
        src.emitFacets(f, OrderFacets(mapOf(OrderStatus.PLACED to 2), debt = 16, paid = 8, total = 24, totalArea = BigDecimal("1434.7")))
        src.emitTotal(f, 2)
        src.emit(f, Resource.Success(listOf(order("2026-09-0020"), order("2026-09-0019"))))
        advanceUntilIdle()

        assertFalse(vm.state.value.hasMore)
        assertEquals(24, vm.state.value.facets?.total) // the chips still count every status
        val asked = src.refreshed.count { it.status == OrderStatus.PLACED }
        vm.loadMore(); advanceUntilIdle()
        assertEquals(asked, src.refreshed.count { it.status == OrderStatus.PLACED }) // no page 2, ever
    }

    /** The payment-segment twin of the above: «Қарз» narrows the list the same way a chip does. */
    @Test fun `a payment segment stops paging at the filtered total`() = runTest {
        val src = FakeSource(); val vm = OrdersListViewModel(src); advanceUntilIdle()
        vm.setPayment(PaymentFilter.DEBT); advanceUntilIdle()
        val f = page1(payment = PaymentFilter.DEBT)
        src.emitFacets(f, OrderFacets(emptyMap(), debt = 2, paid = 22, total = 24, totalArea = BigDecimal.ZERO))
        src.emitTotal(f, 2)
        src.emit(f, Resource.Success(listOf(order("2026-09-0018"), order("2026-09-0012"))))
        advanceUntilIdle()

        assertFalse(vm.state.value.hasMore)
        val asked = src.refreshed.count { it.payment == PaymentFilter.DEBT }
        vm.loadMore(); advanceUntilIdle()
        assertEquals(asked, src.refreshed.count { it.payment == PaymentFilter.DEBT })
    }

    /**
     * The page-counter cap, the second guard. `hasMore` compares rows against the total, so rows
     * that never arrive — the server shrank under the collector between page 1 and page 2, and
     * page 2 came back empty — leave it true forever while the counter climbs. `ceil(total /
     * PAGE_SIZE)` is the last page there is, and nothing may ask past it.
     */
    @Test fun `loadMore will not ask for a page past the last one`() = runTest {
        val src = FakeSource(); val vm = OrdersListViewModel(src); advanceUntilIdle()
        src.emitTotal(page1(), 60) // 60 rows = two pages of 50
        src.emit(page1(), Resource.Success((1..50).map { order("2026-09-%04d".format(it)) }))
        advanceUntilIdle()
        assertTrue(vm.state.value.hasMore)

        vm.loadMore(); advanceUntilIdle()
        assertEquals(2, src.refreshed.last().page)
        src.emit(page1(page = 2), Resource.Success(emptyList())) // the last ten went away
        advanceUntilIdle()
        assertTrue(vm.state.value.hasMore) // 50 rows still short of the 60 the server claims

        vm.loadMore(); advanceUntilIdle()
        assertEquals(2, src.refreshed.last().page) // page 3 is past the end; not asked for
    }

    @Test fun `facets reach the state`() = runTest {
        val src = FakeSource(); val vm = OrdersListViewModel(src); advanceUntilIdle()
        val facets = OrderFacets(mapOf(OrderStatus.PLACED to 4), debt = 2, paid = 5, total = 7, totalArea = BigDecimal("120.5"))
        src.emitFacets(page1(), facets); advanceUntilIdle()
        assertEquals(facets, vm.state.value.facets)
    }

    @Test fun `setPayment resets to page 1 and carries the payment filter`() = runTest {
        val src = FakeSource(); val vm = OrdersListViewModel(src); advanceUntilIdle()
        src.emitTotal(page1(), 99)
        src.emit(page1(), Resource.Success(listOf(order("2026-09-0002"))))
        advanceUntilIdle()
        vm.loadMore(); advanceUntilIdle()
        assertEquals(2, src.refreshed.last().page)

        vm.setPayment(PaymentFilter.DEBT); advanceUntilIdle()
        assertEquals(page1(payment = PaymentFilter.DEBT), src.refreshed.last())
        assertEquals(PaymentFilter.DEBT, vm.state.value.payment)

        src.emit(page1(payment = PaymentFilter.DEBT), Resource.Success(listOf(order("2026-09-0002"))))
        advanceUntilIdle()
        assertEquals(1, rows(vm.state.value).size) // back to a single page, not two
    }

    @Test fun `setDay resets to page 1 and carries the day filter`() = runTest {
        val src = FakeSource(); val vm = OrdersListViewModel(src); advanceUntilIdle()
        val d = LocalDate.of(2026, 9, 11)
        vm.setDay(d); advanceUntilIdle()
        assertEquals(page1(day = d), src.refreshed.last())
        assertEquals(d, vm.state.value.day)
    }

    // ---- Жадвал: view, cursor month, capacity, day sheet, export (phase 6, task 3) ----

    @Test fun `the persisted calendar view is restored on open`() = runTest {
        val vm = OrdersListViewModel(FakeSource(), viewStore = MemoryOrdersViewStore(OrdersView.CALENDAR))
        advanceUntilIdle()
        assertEquals(OrdersView.CALENDAR, vm.state.value.view)
    }

    @Test fun `switching to the calendar selects today and persists the view`() = runTest {
        val store = MemoryOrdersViewStore()
        val vm = OrdersListViewModel(FakeSource(), viewStore = store); advanceUntilIdle()
        assertEquals(OrdersView.LIST, vm.state.value.view)
        assertNull(vm.state.value.day)

        vm.setView(OrdersView.CALENDAR); advanceUntilIdle()
        assertEquals(OrdersView.CALENDAR, vm.state.value.view)
        assertEquals(LocalDate.now(TASHKENT), vm.state.value.day)
        assertEquals(YearMonth.now(TASHKENT), vm.state.value.cursorMonth)
        assertEquals(OrdersView.CALENDAR, store.view.first())
    }

    /** §4.4: the default selection only fills an empty selection — a day the planner already
     *  filtered by in Рўйхат survives the switch, even outside the cursor month (R7). */
    @Test fun `entering the calendar leaves a day that is already chosen alone`() = runTest {
        val vm = OrdersListViewModel(FakeSource()); advanceUntilIdle()
        val chosen = LocalDate.of(2026, 3, 4)
        vm.setDay(chosen); advanceUntilIdle()
        vm.setView(OrdersView.CALENDAR); advanceUntilIdle()
        assertEquals(chosen, vm.state.value.day)
    }

    @Test fun `paging months moves the cursor and keeps the selected day`() = runTest {
        val vm = OrdersListViewModel(FakeSource(), capacitySource = FakeCapacity()); advanceUntilIdle()
        vm.setView(OrdersView.CALENDAR); advanceUntilIdle()
        val start = vm.state.value.cursorMonth
        val day = vm.state.value.day

        vm.nextMonth(); vm.nextMonth(); vm.prevMonth(); advanceUntilIdle()
        assertEquals(start.plusMonths(1), vm.state.value.cursorMonth)
        assertEquals(day, vm.state.value.day) // R7: kept even though it is no longer drawn
    }

    /** A list-only session must never pay for the grid, and a month already fetched is served from
     *  the repository's cache — paging back and forth is free. */
    @Test fun `the grid is fetched once per month and never for a list-only session`() = runTest {
        val cap = FakeCapacity()
        val vm = OrdersListViewModel(FakeSource(), capacitySource = cap); advanceUntilIdle()
        assertEquals(0, cap.fetches)
        assertNull(vm.state.value.capacity)

        vm.setView(OrdersView.CALENDAR); advanceUntilIdle()
        assertEquals(1, cap.fetches)
        assertTrue(vm.state.value.capacity is Resource.Success)

        vm.nextMonth(); advanceUntilIdle()
        assertEquals(2, cap.fetches)
        vm.prevMonth(); advanceUntilIdle()
        assertEquals(2, cap.fetches) // the second visit is a cache hit
    }

    @Test fun `refreshCalendar forces a fetch of the cursor month`() = runTest {
        val cap = FakeCapacity()
        val vm = OrdersListViewModel(FakeSource(), capacitySource = cap); advanceUntilIdle()
        vm.setView(OrdersView.CALENDAR); advanceUntilIdle()
        assertEquals(1, cap.fetches)
        vm.refreshCalendar(); advanceUntilIdle()
        assertEquals(2, cap.fetches)
        assertTrue(vm.state.value.capacity is Resource.Success)
    }

    /**
     * The Жадвал spinner answers for the MONTH, not for the orders list (Task 5 minor M5). Here
     * the list has never landed a page — `isRefreshing` is true, as Рўйхат's own spinner should
     * be — while the grid is loaded and perfectly still. Driving the calendar's indicator from
     * `isRefreshing` spun it on every entry into Жадвал for a page of rows nobody was looking at.
     */
    @Test fun `the calendar spinner ignores the orders list's own loading`() = runTest {
        val vm = OrdersListViewModel(FakeSource(), capacitySource = FakeCapacity()); advanceUntilIdle()
        vm.setView(OrdersView.CALENDAR); advanceUntilIdle()

        assertTrue(vm.state.value.isRefreshing)
        assertTrue(vm.state.value.capacity is Resource.Success)
        assertFalse(vm.state.value.isCalendarRefreshing)
    }

    /** And it does answer for a pull on the grid, for exactly as long as the fetch runs. */
    @Test fun `pull-to-refresh in Жадвал turns the calendar's own spinner`() = runTest {
        val gate = CompletableDeferred<Unit>()
        val cap = object : CapacitySource {
            override fun observe(month: YearMonth): Flow<Resource<CapacityMonth>> =
                flow { emit(Resource.Success(capacityMonth(month))) }
            override suspend fun refresh(month: YearMonth): Result<Unit> {
                gate.await()
                return Result.success(Unit)
            }
        }
        val vm = OrdersListViewModel(FakeSource(), capacitySource = cap); advanceUntilIdle()
        vm.setView(OrdersView.CALENDAR); advanceUntilIdle()
        assertFalse(vm.state.value.isCalendarRefreshing)

        vm.refreshCalendar(); advanceUntilIdle()
        assertTrue(vm.state.value.isCalendarRefreshing)

        gate.complete(Unit); advanceUntilIdle()
        assertFalse(vm.state.value.isCalendarRefreshing)
    }

    @Test fun `clearing the day clears the chip and the day sheet`() = runTest {
        val vm = OrdersListViewModel(FakeSource(), capacitySource = FakeCapacity()); advanceUntilIdle()
        vm.setView(OrdersView.CALENDAR); advanceUntilIdle()
        assertNotNull(vm.state.value.daySheet)

        vm.selectDay(null); advanceUntilIdle()
        assertNull(vm.state.value.day)
        assertNull(vm.state.value.daySheet)
    }

    /**
     * R14: paging the grid away from the selected day does not close its sheet. The planner picked
     * the day; the month they are *looking* at is a different question, and the sheet — with the
     * day's own orders in it — is the answer they asked for. The grid stops drawing the selection
     * (R7) and the chip in Рўйхат is what still names it.
     */
    @Test fun `the day sheet survives paging to another month`() = runTest {
        val vm = OrdersListViewModel(FakeSource(), capacitySource = FakeCapacity()); advanceUntilIdle()
        vm.setView(OrdersView.CALENDAR); advanceUntilIdle()
        val d = YearMonth.now(TASHKENT).atDay(12)
        vm.selectDay(d); advanceUntilIdle()
        assertEquals(d, vm.state.value.daySheet!!.day)

        vm.nextMonth(); advanceUntilIdle()
        val sheet = vm.state.value.daySheet
        assertNotNull(sheet)
        assertEquals(d, sheet!!.day)
        // The next month's grid has no bucket for a day of the month before, so the sheet's
        // capacity zero-fills — the orders are real, the load is honestly unknown-as-zero.
        assertEquals(d, sheet.capacity.date)
    }

    @Test fun `the day sheet sums the day's orders into one money total`() = runTest {
        val src = FakeSource()
        val vm = OrdersListViewModel(src, capacitySource = FakeCapacity()); advanceUntilIdle()
        vm.setView(OrdersView.CALENDAR); advanceUntilIdle()
        val d = LocalDate.of(2026, 9, 12)
        vm.selectDay(d); advanceUntilIdle()

        src.emit(dayPage(d), Resource.Success(listOf(
            order("2026-09-0001", Money.parse("12000000")),
            order("2026-09-0002", Money.parse("7110840")),
            order("2026-09-0003", Money.parse("20000000")),
        )))
        advanceUntilIdle()

        val sheet = vm.state.value.daySheet!!
        assertEquals(d, sheet.day)
        assertEquals(3, sheet.orders.dataOrNull!!.size)
        assertEquals(Money.parse("39110840"), sheet.moneyTotal)
    }

    /** R6: the sheet asks with the SAME `q`/`status`/`payment` Рўйхат has on, so the two views can
     *  never show a different set of orders for the same day. */
    @Test fun `the day sheet asks with the shared filters`() = runTest {
        val src = FakeSource()
        val vm = OrdersListViewModel(src, capacitySource = FakeCapacity()); advanceUntilIdle()
        vm.setView(OrdersView.CALENDAR); advanceUntilIdle()
        vm.setQuery("Азиз"); vm.setStatus(OrderStatus.PLACED); vm.setPayment(PaymentFilter.DEBT)
        val d = LocalDate.of(2026, 9, 12)
        vm.selectDay(d); advanceUntilIdle()

        assertEquals(
            dayPage(d, q = "Азиз", status = OrderStatus.PLACED, payment = PaymentFilter.DEBT),
            src.refreshed.last { it.sort == "asc" },
        )
    }

    /** R3: the tier is decided by the thresholds the SERVER sent with the month, not by the
     *  client's defaults — 350 m² is «ўртача» at 300/450/600 and «юқори» at 200/300/400. */
    @Test fun `the server's thresholds recolour the day`() = runTest {
        val month = YearMonth.now(TASHKENT)
        val d = month.atDay(12)

        val default = OrdersListViewModel(FakeSource(), capacitySource = FakeCapacity { capacityMonth(it, mapOf(d to "350")) })
        advanceUntilIdle()
        default.setView(OrdersView.CALENDAR); default.selectDay(d); advanceUntilIdle()
        assertEquals(CapacityTier.MODERATE, default.state.value.daySheet!!.tier)
        assertEquals(0, BigDecimal("600").compareTo(default.state.value.daySheet!!.heavy))

        val tight = CapacityThresholds(BigDecimal("200"), BigDecimal("300"), BigDecimal("400"))
        val custom = OrdersListViewModel(FakeSource(), capacitySource = FakeCapacity { capacityMonth(it, mapOf(d to "350"), tight) })
        advanceUntilIdle()
        custom.setView(OrdersView.CALENDAR); custom.selectDay(d); advanceUntilIdle()
        assertEquals(CapacityTier.HEAVY, custom.state.value.daySheet!!.tier)
        assertEquals(0, BigDecimal("400").compareTo(custom.state.value.daySheet!!.heavy))
        assertEquals(0, BigDecimal("350").compareTo(custom.state.value.daySheet!!.capacity.totalArea))
    }

    @Test fun `exporting the backup hands the screen a file to share, once`() = runTest {
        val gate = CompletableDeferred<Result<File>>()
        var calls = 0
        val vm = OrdersListViewModel(FakeSource(), exports = { calls++; gate.await() }); advanceUntilIdle()

        vm.exportBackup(); advanceUntilIdle()
        assertTrue(vm.state.value.exporting)
        vm.exportBackup(); advanceUntilIdle()
        assertEquals(1, calls) // single-flight: the route is not idempotent

        val file = File("orders-backup-20260912-1130.xlsx")
        gate.complete(Result.success(file)); advanceUntilIdle()
        assertFalse(vm.state.value.exporting)
        assertEquals(file, vm.state.value.exportFile)
        assertFalse(vm.state.value.exportFailed)

        vm.consumeExport(); advanceUntilIdle()
        assertNull(vm.state.value.exportFile)
    }

    @Test fun `a failed export raises a flag the screen can dismiss`() = runTest {
        val vm = OrdersListViewModel(FakeSource(), exports = { Result.failure(java.io.IOException("boom")) })
        advanceUntilIdle()
        vm.exportBackup(); advanceUntilIdle()

        assertFalse(vm.state.value.exporting)
        assertNull(vm.state.value.exportFile)
        assertTrue(vm.state.value.exportFailed)

        vm.dismissExportError(); advanceUntilIdle()
        assertFalse(vm.state.value.exportFailed)
    }

    @Test fun `canExport comes from the route`() = runTest {
        val vm = OrdersListViewModel(FakeSource(), canExport = true); advanceUntilIdle()
        assertTrue(vm.state.value.canExport)
        assertFalse(OrdersListViewModel(FakeSource()).state.value.canExport)
    }
}
