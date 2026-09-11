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
import uz.etalon.crm.core.model.MonthCollected
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.RecentOrder
import uz.etalon.crm.core.model.TodayDelivery
import uz.etalon.crm.core.model.Trend
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
        assertTrue(vm.state.value.showNoAccessState, "renders the withheld-permission text, not the empty one")
        assertFalse(vm.state.value.showEmptyState)
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

    /** The editorial Home's own two lists: the recent orders it renders in the white card, and
     *  the twelve-month series its collected card draws as a sparkline. Both are carried whole —
     *  the series is mapped to its amounts, not truncated here — and the trend rides along. */
    @Test fun `the recent orders and the collected series reach the state whole`() = runTest {
        val s = summary(
            recent = listOf(recentOrder("r1"), recentOrder("r2")),
            collectedThisMonth = Money.parse("13500000"),
            collectedTrend = Trend(BigDecimal("8.2"), up = true),
            collectedByMonth = (1..12).map { MonthCollected("2026-%02d".format(it), Money.parse("${it}000000")) },
        )
        val vm = viewModel(home = { Result.success(s) })
        advanceUntilIdle()
        val tiles = vm.state.value.tiles!!
        assertEquals(2, vm.state.value.recent.size)
        assertEquals(listOf("r1", "r2"), vm.state.value.recent.map { it.orderId })
        assertEquals(12, tiles.collectedByMonth.size)
        assertEquals(Money.parse("12000000"), tiles.collectedByMonth.last())
        assertEquals(Money.parse("13500000"), tiles.collectedThisMonth)
        assertEquals(BigDecimal("8.2"), tiles.collectedTrend?.deltaPct)
        assertTrue(tiles.collectedTrend?.up == true)
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
        orderId = id, orderNumber = "ORD-$id", clientName = "Навоий Build", clientAddress = "Навоий кўча 1",
        area = BigDecimal("10.000"), status = OrderStatus.PLACED, totalPrice = Money.parse("1000000"), remaining = Money.parse("1000000"),
    )

    private fun recentOrder(id: String) = RecentOrder(
        orderId = id, orderNumber = "ORD-$id", clientName = "Навоий Build", status = OrderStatus.PLACED,
        scheduledAt = java.time.Instant.parse("2026-09-04T06:00:00Z"),
        totalPrice = Money.parse("1000000"), remaining = Money.parse("1000000"),
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
        collectedThisMonth: Money = Money.ZERO,
        collectedTrend: Trend? = null,
        collectedByMonth: List<MonthCollected> = emptyList(),
    ) = HomeSummary(
        today = today, todayArea = todayArea,
        openDiscrepancies = openDiscrepancies, openDiscrepancyTotal = openDiscrepancyTotal,
        receivables = receivables, receivableOrders = receivableOrders,
        paidOrders = paidOrders, partialOrders = partialOrders, awaitingOrders = awaitingOrders,
        recent = recent, collectedThisMonth = collectedThisMonth, collectedTrend = collectedTrend, collectedByMonth = collectedByMonth,
    )
}
