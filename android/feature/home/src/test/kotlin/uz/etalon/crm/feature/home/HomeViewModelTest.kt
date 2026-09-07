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
import uz.etalon.crm.core.model.HomeSummary
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.TodayDelivery
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
     *  than a [HomeTiles] full of zeros, which the brief calls out as the easy mistake here. */
    @Test fun `without dashboard access the column is empty and the tiles are absent, not zero`() = runTest {
        val vm = viewModel(permissions = { false })
        advanceUntilIdle()
        assertTrue(vm.state.value.permissionsResolved)
        assertEquals(emptyList<TodayDelivery>(), vm.state.value.today)
        assertNull(vm.state.value.tiles, "absent, not a HomeTiles(0, ZERO, 0, ZERO, ZERO, 0)")
        assertNull(vm.state.value.error, "no dashboard access is a fact, not a failure")
        assertTrue(vm.state.value.showEmptyState)
        assertFalse(vm.state.value.loading)
    }

    @Test fun `dashboard viewBasic alone is enough to see the tiles`() = runTest {
        val vm = viewModel(permissions = { it == "dashboard.viewBasic" })
        advanceUntilIdle()
        assertTrue(vm.state.value.hasDashboardAccess)
        assertNotNull(vm.state.value.tiles)
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
        assertNull(vm.state.value.tiles)
        assertEquals(emptyList<TodayDelivery>(), vm.state.value.today)
    }

    // ── field-for-field, not a same-typed neighbour ──────────────────────────────────

    /** `HomeSummary` carries five `Int`s and two `Money`s; this proves the ViewModel's own
     *  [HomeTiles] construction keeps each one in its place, independent of the mapper-level
     *  guarantee `DashboardMappersTest` already gives the DTO decode. */
    @Test fun `the tiles carry the summary's fields, not a same-typed neighbour`() = runTest {
        val s = summary(
            today = listOf(delivery("o1"), delivery("o2")),
            todayArea = BigDecimal("12.5"),
            openDiscrepancies = 3,
            openDiscrepancyTotal = Money.parse("500000"),
            receivables = Money.parse("9000000"),
            receivableOrders = 7,
        )
        val vm = viewModel(home = { Result.success(s) })
        advanceUntilIdle()
        val tiles = vm.state.value.tiles!!
        assertEquals(2, vm.state.value.today.size)
        assertEquals(2, tiles.todayCount)
        assertEquals(BigDecimal("12.5"), tiles.todayArea)
        assertEquals(3, tiles.openDiscrepancies)
        assertEquals(Money.parse("500000"), tiles.openDiscrepancyTotal)
        assertEquals(Money.parse("9000000"), tiles.receivables)
        assertEquals(7, tiles.receivableOrders)
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

    // ── fixtures ──────────────────────────────────────────────────────────────────

    private fun viewModel(
        home: suspend () -> Result<HomeSummary> = { Result.success(summary()) },
        permissions: suspend (String) -> Boolean = { true },
        outboxPending: () -> kotlinx.coroutines.flow.Flow<Int> = { flowOf(0) },
    ) = HomeViewModel(
        home = HomeUseCase { home() },
        permissions = HomePermissionUseCase { permissions(it) },
        outboxPending = HomeOutboxUseCase { outboxPending() },
    )

    private fun delivery(id: String) = TodayDelivery(
        orderId = id, orderNumber = "ORD-$id", clientName = "Навоий Build", area = BigDecimal("10.000"),
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
    ) = HomeSummary(
        today = today, todayArea = todayArea,
        openDiscrepancies = openDiscrepancies, openDiscrepancyTotal = openDiscrepancyTotal,
        receivables = receivables, receivableOrders = receivableOrders,
        paidOrders = paidOrders, partialOrders = partialOrders, awaitingOrders = awaitingOrders,
    )
}
