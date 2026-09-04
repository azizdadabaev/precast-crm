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

@OptIn(ExperimentalCoroutinesApi::class)
class OrdersListViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    private fun order(n: String) = OrderSummary("id-$n", n, OrderStatus.PLACED, PaymentState.AWAITING_PAYMENT, Money.parse("1"), Money.ZERO, BigDecimal.ONE, 1, 1, Instant.EPOCH, Instant.EPOCH, ClientRef("c", "A", "998901112233", null))

    private class FakeSource : OrdersSource {
        val flows = mutableMapOf<String, MutableStateFlow<Resource<List<OrderSummary>>>>()
        val refreshed = mutableListOf<OrdersFilter>()
        override fun list(filter: OrdersFilter): Flow<Resource<List<OrderSummary>>> = flows.getOrPut(filter.listKey) { MutableStateFlow(Resource.Loading(null)) }
        override suspend fun refreshList(filter: OrdersFilter) { refreshed += filter }
    }

    @Test fun `refreshes page 1 on start and exposes rows`() = runTest {
        val src = FakeSource()
        val vm = OrdersListViewModel(src)
        advanceUntilIdle()
        assertEquals(listOf(OrdersFilter()), src.refreshed)
        src.flows[OrdersFilter().listKey]!!.value = Resource.Success(listOf(order("2026-09-0001")))
        advanceUntilIdle()
        assertEquals("2026-09-0001", vm.state.value.items.single().orderNumber)
    }
    @Test fun `changing the status chip re-queries with page 1`() = runTest {
        val src = FakeSource(); val vm = OrdersListViewModel(src); advanceUntilIdle()
        vm.setStatus(OrderStatus.DELIVERED); advanceUntilIdle()
        assertEquals(OrdersFilter(status = OrderStatus.DELIVERED), src.refreshed.last())
        assertEquals(1, vm.state.value.page)
    }
    @Test fun `query is debounced`() = runTest {
        val src = FakeSource(); val vm = OrdersListViewModel(src); advanceUntilIdle()
        vm.setQuery("Аз"); vm.setQuery("Ази"); vm.setQuery("Азиз")
        advanceTimeBy(100); assertEquals(1, src.refreshed.size)
        advanceTimeBy(400); advanceUntilIdle()
        assertEquals(OrdersFilter(q = "Азиз"), src.refreshed.last())
        assertEquals(2, src.refreshed.size)
    }
}
