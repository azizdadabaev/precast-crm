package uz.etalon.crm.feature.orders

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.data.OrdersFilter
import uz.etalon.crm.core.model.*
import uz.etalon.crm.feature.orders.list.OrdersListViewModel
import uz.etalon.crm.feature.orders.list.OrdersSource
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

@OptIn(ExperimentalCoroutinesApi::class)
class OrdersListViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    /** What the ViewModel asks for when nothing is filtered: newest first, one page of 50. */
    private fun page1(
        q: String? = null, status: OrderStatus? = null, payment: PaymentFilter? = null, day: LocalDate? = null, page: Int = 1,
    ) = OrdersFilter(q = q, status = status, payment = payment, day = day, page = page, sort = "desc", pageSize = 50)

    private fun order(n: String) = OrderSummary("id-$n", n, OrderStatus.PLACED, PaymentState.AWAITING_PAYMENT, Money.parse("1"), Money.ZERO, BigDecimal.ONE, 1, 1, Instant.EPOCH, Instant.EPOCH, ClientRef("c", "A", "998901112233", null))

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
}
