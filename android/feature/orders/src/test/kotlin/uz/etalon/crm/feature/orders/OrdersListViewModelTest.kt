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
        val refreshed = mutableListOf<OrdersFilter>()
        override fun list(filter: OrdersFilter): Flow<Resource<List<OrderSummary>>> = flows.getOrPut(filter.listKey) { MutableStateFlow(Resource.Loading(null)) }
        override suspend fun refreshList(filter: OrdersFilter) { refreshed += filter }
        override fun facets(filter: OrdersFilter): Flow<OrderFacets?> = facetFlows.getOrPut(filter.facetKey) { MutableStateFlow(null) }
        fun emit(filter: OrdersFilter, value: Resource<List<OrderSummary>>) { flows.getOrPut(filter.listKey) { MutableStateFlow(value) }.value = value }
        fun emitFacets(filter: OrdersFilter, value: OrderFacets) { facetFlows.getOrPut(filter.facetKey) { MutableStateFlow(value) }.value = value }
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

    @Test fun `loadMore appends page 2 after page 1 and stops at the facet total`() = runTest {
        val src = FakeSource(); val vm = OrdersListViewModel(src); advanceUntilIdle()
        src.emitFacets(page1(), OrderFacets(emptyMap(), debt = 0, paid = 0, total = 3, totalArea = BigDecimal.ZERO))
        src.emit(page1(), Resource.Success(listOf(order("2026-09-0002"), order("2026-09-0001"))))
        advanceUntilIdle()
        assertTrue(vm.state.value.hasMore)

        vm.loadMore(); advanceUntilIdle()
        assertEquals(page1(page = 2), src.refreshed.last())
        src.emit(page1(page = 2), Resource.Success(listOf(order("2026-08-0009"))))
        advanceUntilIdle()

        assertEquals(listOf("2026-09-0002", "2026-09-0001", "2026-08-0009"), rows(vm.state.value).map { it.orderNumber })
        assertFalse(vm.state.value.hasMore)
        assertFalse(vm.state.value.loadingMore)

        vm.loadMore(); advanceUntilIdle()
        assertEquals(page1(page = 2), src.refreshed.last()) // nothing more to ask for
    }

    @Test fun `facets reach the state`() = runTest {
        val src = FakeSource(); val vm = OrdersListViewModel(src); advanceUntilIdle()
        val facets = OrderFacets(mapOf(OrderStatus.PLACED to 4), debt = 2, paid = 5, total = 7, totalArea = BigDecimal("120.5"))
        src.emitFacets(page1(), facets); advanceUntilIdle()
        assertEquals(facets, vm.state.value.facets)
    }

    @Test fun `setPayment resets to page 1 and carries the payment filter`() = runTest {
        val src = FakeSource(); val vm = OrdersListViewModel(src); advanceUntilIdle()
        src.emitFacets(page1(), OrderFacets(emptyMap(), debt = 0, paid = 0, total = 99, totalArea = BigDecimal.ZERO))
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
