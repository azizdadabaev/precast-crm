package uz.etalon.crm.feature.payments

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.Discrepancy
import uz.etalon.crm.core.model.DiscrepancyStatus
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.network.ApiException
import uz.etalon.crm.feature.payments.discrepancies.*
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class DiscrepanciesViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    // ── resolveBlocker: DiscrepancyUpdateSchema's own requirements, before the network ────

    @Test fun `a status must be chosen before resolving`() {
        assertNotNull(resolveBlocker(null, "мижоз тўлади"))
        assertNull(resolveBlocker(DiscrepancyStatus.RESOLVED_RECOVERED, "мижоз тўлади"))
    }

    @Test fun `resolution requires a note of at least five characters`() {
        assertNotNull(resolveBlocker(DiscrepancyStatus.RESOLVED_RECOVERED, ""))
        assertNotNull(resolveBlocker(DiscrepancyStatus.RESOLVED_RECOVERED, "тўрт"))
        assertNull(resolveBlocker(DiscrepancyStatus.RESOLVED_RECOVERED, "хатоси"))
    }

    /** The server trims before measuring, so a note of five spaces is refused, not accepted and
     *  then stored empty. */
    @Test fun `whitespace does not count toward the five characters`() {
        assertNotNull(resolveBlocker(DiscrepancyStatus.RESOLVED_RECOVERED, "     "))
        assertNotNull(resolveBlocker(DiscrepancyStatus.RESOLVED_RECOVERED, "  ж  "))
    }

    @Test fun `a note longer than the server allows is refused`() {
        assertNotNull(resolveBlocker(DiscrepancyStatus.RESOLVED_RECOVERED, "ж".repeat(501)))
        assertNull(resolveBlocker(DiscrepancyStatus.RESOLVED_RECOVERED, "ж".repeat(500)))
    }

    @Test fun `every one of the four resolution statuses is accepted with a valid note`() {
        RESOLUTION_OPTIONS.forEach { status ->
            assertNull(resolveBlocker(status, "жумагача тўлайди"), "refused $status")
        }
    }

    @Test fun `every refusal is written in Uzbek Cyrillic`() {
        val cyrillic = Regex("[\\u0400-\\u04FF]")
        val messages = listOfNotNull(
            resolveBlocker(null, "жумагача тўлайди"),
            resolveBlocker(DiscrepancyStatus.RESOLVED_RECOVERED, ""),
            resolveBlocker(DiscrepancyStatus.RESOLVED_RECOVERED, "ж".repeat(501)),
        )
        assertEquals(3, messages.size)
        messages.forEach { assertTrue(cyrillic.containsMatchIn(it), "not Uzbek Cyrillic: $it") }
    }

    // ── RESOLUTION_OPTIONS: exactly the four closing statuses, never OPEN ──────────

    @Test fun `the four resolution statuses map to the right server values`() {
        assertEquals(
            listOf(
                DiscrepancyStatus.RESOLVED_RECOVERED,
                DiscrepancyStatus.RESOLVED_DISCOUNT,
                DiscrepancyStatus.RESOLVED_WRITEOFF,
                DiscrepancyStatus.DISPUTED,
            ),
            RESOLUTION_OPTIONS,
        )
    }

    /**
     * OPEN clears the resolver server-side (`resolvedById`/`resolvedAt` both go to null) rather
     * than setting one — it is the opposite of a resolution, so this screen must never offer it
     * as one.
     */
    @Test fun `OPEN is never offered as a resolution choice`() {
        assertFalse(RESOLUTION_OPTIONS.contains(DiscrepancyStatus.OPEN))
        assertFalse(RESOLUTION_OPTIONS.contains(DiscrepancyStatus.UNKNOWN))
    }

    // ── the ViewModel ─────────────────────────────────────────────────────────────

    @Test fun `refresh loads every discrepancy`() = runTest {
        var calls = 0
        val row = item()
        val vm = viewModel(list = { calls++; Result.success(listOf(row)) })
        advanceUntilIdle()
        assertEquals(1, calls)
        assertEquals(listOf(row), vm.state.value.items)
    }

    /** OPEN and DISPUTED are both still actionable — a long resolved history must not bury them.
     *  Within each group nothing reorders the server's own `reportedAt` order: the sort is
     *  stable, and the fixture below checks exactly that by giving each group more than one
     *  row and asserting their relative order survived. */
    @Test fun `open and disputed rows sort before resolved ones, each group keeping the server order`() = runTest {
        val rows = listOf(
            item(id = "r1", status = DiscrepancyStatus.RESOLVED_RECOVERED),
            item(id = "o1", status = DiscrepancyStatus.OPEN),
            item(id = "r2", status = DiscrepancyStatus.RESOLVED_WRITEOFF),
            item(id = "d1", status = DiscrepancyStatus.DISPUTED),
            item(id = "o2", status = DiscrepancyStatus.OPEN),
        )
        val vm = viewModel(list = { Result.success(rows) })
        advanceUntilIdle()
        assertEquals(listOf("o1", "d1", "o2", "r1", "r2"), vm.state.value.items.map { it.id })
    }

    /** The defect found twice in Phase 1b: an empty list beside an error banner reads as "no
     *  discrepancies" when the truth is "couldn't check". */
    @Test fun `no empty state while loading or while an error shows`() = runTest {
        val vm = viewModel(list = { Result.failure(java.io.IOException("no net")) })
        assertFalse(vm.state.value.showEmptyState) // still loading
        advanceUntilIdle()
        assertNotNull(vm.state.value.error)
        assertFalse(vm.state.value.showEmptyState)
        assertTrue(vm.state.value.isOffline)

        val empty = viewModel(list = { Result.success(emptyList()) })
        advanceUntilIdle()
        assertTrue(empty.state.value.showEmptyState)
    }

    /** "Not yet known" is not "no" — the same rule the confirm queue and the record sheet follow. */
    @Test fun `the no-permission notice waits until the permission is actually known`() = runTest {
        val readOnly = viewModel(permissions = { false })
        assertFalse(readOnly.state.value.permissionsResolved)
        assertFalse(readOnly.state.value.showNoResolvePermission)
        advanceUntilIdle()
        assertTrue(readOnly.state.value.showNoResolvePermission)

        val owner = viewModel(permissions = { true })
        advanceUntilIdle()
        assertFalse(owner.state.value.showNoResolvePermission)
    }

    @Test fun `resolving sends the chosen status and the trimmed note`() = runTest {
        var sent: Triple<String, DiscrepancyStatus, String>? = null
        val row = item(id = "d1")
        val vm = viewModel(
            list = { Result.success(listOf(row)) },
            resolve = { id, status, note -> sent = Triple(id, status, note); Result.success(Unit) },
        )
        advanceUntilIdle()
        vm.openResolve(row)
        vm.setStatus(DiscrepancyStatus.RESOLVED_RECOVERED)
        vm.setNote("  мижоз жумагача тўлади  ")
        vm.submitResolve()
        advanceUntilIdle()

        assertEquals(Triple("d1", DiscrepancyStatus.RESOLVED_RECOVERED, "мижоз жумагача тўлади"), sent)
        assertNull(vm.state.value.sheet)
    }

    @Test fun `each of the four statuses reaches the repository unchanged`() = runTest {
        RESOLUTION_OPTIONS.forEach { status ->
            var sentStatus: DiscrepancyStatus? = null
            val row = item(id = "d-$status")
            val vm = viewModel(
                list = { Result.success(listOf(row)) },
                resolve = { _, s, _ -> sentStatus = s; Result.success(Unit) },
            )
            advanceUntilIdle()
            vm.openResolve(row)
            vm.setStatus(status)
            vm.setNote("жумагача тўлайди")
            vm.submitResolve()
            advanceUntilIdle()
            assertEquals(status, sentStatus, "wrong status sent for $status")
        }
    }

    @Test fun `resolving without a status never reaches the network`() = runTest {
        var calls = 0
        val row = item(id = "d2")
        val vm = viewModel(list = { Result.success(listOf(row)) }, resolve = { _, _, _ -> calls++; Result.success(Unit) })
        advanceUntilIdle()
        vm.openResolve(row)
        vm.setNote("жумагача тўлайди")
        vm.submitResolve() // no status chosen
        advanceUntilIdle()

        assertEquals(0, calls)
        assertNotNull(vm.state.value.sheet?.error)
        assertNotNull(vm.state.value.sheet) // and the sheet stays open, holding what was typed
    }

    @Test fun `resolving with a note that is too short never reaches the network`() = runTest {
        var calls = 0
        val row = item(id = "d3")
        val vm = viewModel(list = { Result.success(listOf(row)) }, resolve = { _, _, _ -> calls++; Result.success(Unit) })
        advanceUntilIdle()
        vm.openResolve(row)
        vm.setStatus(DiscrepancyStatus.RESOLVED_DISCOUNT)
        vm.setNote("ха")
        vm.submitResolve()
        advanceUntilIdle()

        assertEquals(0, calls)
        assertNotNull(vm.state.value.sheet?.error)
    }

    /** `resolveBlocker` is proven at the pure-function level above; this pins that the ViewModel
     *  seam actually applies it — the server trims before measuring, so five spaces must be
     *  refused, not accepted and stored as an empty note. */
    @Test fun `an all-whitespace note never reaches the network`() = runTest {
        var calls = 0
        val row = item(id = "d3b")
        val vm = viewModel(list = { Result.success(listOf(row)) }, resolve = { _, _, _ -> calls++; Result.success(Unit) })
        advanceUntilIdle()
        vm.openResolve(row)
        vm.setStatus(DiscrepancyStatus.RESOLVED_RECOVERED)
        vm.setNote("     ")
        vm.submitResolve()
        advanceUntilIdle()

        assertEquals(0, calls)
        assertNotNull(vm.state.value.sheet?.error)
    }

    /** `PATCH /api/discrepancies/{id}` carries no server-side idempotency wrapper, so it may
     *  never be queued: with no signal it is refused outright rather than sent and failed. */
    @Test fun `resolving is refused while offline instead of being queued`() = runTest {
        var calls = 0
        val row = item(id = "d4")
        val vm = viewModel(
            list = { Result.failure(java.io.IOException("no net")) },
            resolve = { _, _, _ -> calls++; Result.success(Unit) },
        )
        advanceUntilIdle()
        assertTrue(vm.state.value.isOffline)

        vm.openResolve(row)
        vm.setStatus(DiscrepancyStatus.RESOLVED_WRITEOFF)
        vm.setNote("жумагача тўлайди")
        vm.submitResolve()
        advanceUntilIdle()

        assertEquals(0, calls)
        assertNotNull(vm.state.value.sheet?.error)
    }

    @Test fun `without discrepancy resolve permission the action is refused`() = runTest {
        var calls = 0
        val row = item(id = "d5")
        val vm = viewModel(
            list = { Result.success(listOf(row)) },
            resolve = { _, _, _ -> calls++; Result.success(Unit) },
            permissions = { false },
        )
        advanceUntilIdle()
        assertFalse(vm.state.value.canResolve)

        vm.openResolve(row)
        vm.setStatus(DiscrepancyStatus.DISPUTED)
        vm.setNote("жумагача тўлайди")
        vm.submitResolve()
        advanceUntilIdle()

        assertEquals(0, calls)
        assertNotNull(vm.state.value.sheet?.error)
    }

    @Test fun `a second tap while the first call is in flight is a no-op`() = runTest {
        var calls = 0
        val row = item(id = "d6")
        val vm = viewModel(list = { Result.success(listOf(row)) }, resolve = { _, _, _ -> calls++; Result.success(Unit) })
        advanceUntilIdle()
        vm.openResolve(row)
        vm.setStatus(DiscrepancyStatus.RESOLVED_RECOVERED)
        vm.setNote("жумагача тўлайди")
        vm.submitResolve()
        vm.submitResolve()
        advanceUntilIdle()

        assertEquals(1, calls)
    }

    /** A resolved discrepancy must be re-fetched so its new status and note show up right away. */
    @Test fun `a successful resolution re-fetches the list`() = runTest {
        var fetches = 0
        val row = item(id = "d7")
        val vm = viewModel(list = { fetches++; Result.success(listOf(row)) })
        advanceUntilIdle()
        assertEquals(1, fetches)

        vm.openResolve(row)
        vm.setStatus(DiscrepancyStatus.RESOLVED_RECOVERED)
        vm.setNote("жумагача тўлайди")
        vm.submitResolve()
        advanceUntilIdle()
        assertEquals(2, fetches)
    }

    /**
     * The same rule the confirm queue follows. A discrepancy the server no longer has, or no
     * longer accepts a resolution for, leaves the row on screen still offering «Ҳал қилиш» — and
     * the owner retries a write that can never land. The sheet closes, the list is re-read, and
     * the reason survives the refresh that clears every other error.
     */
    @Test fun `a resolution the server refuses as stale closes the sheet and re-reads the list`() = runTest {
        val row = item(id = "d9")
        var fetches = 0
        val vm = viewModel(
            list = { fetches++; Result.success(listOf(row)) },
            resolve = { _, _, _ -> Result.failure(ApiException(404, "Тафовут топилмади · Discrepancy not found")) },
        )
        advanceUntilIdle()
        assertEquals(1, fetches)

        vm.openResolve(row)
        vm.setStatus(DiscrepancyStatus.RESOLVED_WRITEOFF)
        vm.setNote("зарар сифатида")
        vm.submitResolve()
        advanceUntilIdle()

        assertNull(vm.state.value.sheet)
        assertEquals(2, fetches)
        assertEquals("Тафовут топилмади", vm.state.value.error)
        assertFalse(vm.state.value.busy)
    }

    @Test fun `a failed resolution keeps the sheet open with what was typed`() = runTest {
        val row = item(id = "d8")
        val vm = viewModel(
            list = { Result.success(listOf(row)) },
            resolve = { _, _, _ -> Result.failure(IllegalStateException("сервер хатоси")) },
        )
        advanceUntilIdle()
        vm.openResolve(row)
        vm.setStatus(DiscrepancyStatus.RESOLVED_DISCOUNT)
        vm.setNote("жумагача тўлайди")
        vm.submitResolve()
        advanceUntilIdle()

        val sheet = requireNotNull(vm.state.value.sheet)
        assertEquals(DiscrepancyStatus.RESOLVED_DISCOUNT, sheet.status)
        assertEquals("жумагача тўлайди", sheet.note)
        assertNotNull(sheet.error)
        assertFalse(vm.state.value.busy)
    }

    /** OPEN is the only status with nothing to show — every other status was reached through a
     *  resolve pass, so it has a decision to display before offering a new one. UNKNOWN falls on
     *  the same side as OPEN: there is nothing meaningful to show for a status the app does not
     *  recognise. */
    @Test fun `hasExistingResolution is true only when the discrepancy already carries a resolution`() {
        assertFalse(ResolveSheetState(item(status = DiscrepancyStatus.OPEN)).hasExistingResolution)
        assertFalse(ResolveSheetState(item(status = DiscrepancyStatus.UNKNOWN)).hasExistingResolution)
        assertTrue(ResolveSheetState(item(status = DiscrepancyStatus.RESOLVED_RECOVERED)).hasExistingResolution)
        assertTrue(ResolveSheetState(item(status = DiscrepancyStatus.RESOLVED_DISCOUNT)).hasExistingResolution)
        assertTrue(ResolveSheetState(item(status = DiscrepancyStatus.RESOLVED_WRITEOFF)).hasExistingResolution)
        assertTrue(ResolveSheetState(item(status = DiscrepancyStatus.DISPUTED)).hasExistingResolution)
    }

    // ── fixtures ──────────────────────────────────────────────────────────────────

    private fun viewModel(
        list: suspend () -> Result<List<Discrepancy>> = { Result.success(emptyList()) },
        resolve: suspend (String, DiscrepancyStatus, String) -> Result<Unit> = { _, _, _ -> Result.success(Unit) },
        permissions: suspend (String) -> Boolean = { true },
    ) = DiscrepanciesViewModel(
        list = DiscrepancyListUseCase { list() },
        resolve = DiscrepancyResolveUseCase { id, status, note -> resolve(id, status, note) },
        permissions = DiscrepancyPermissionUseCase { permissions(it) },
    )

    private fun item(
        id: String = "d1",
        expected: String = "1000000",
        received: String = "800000",
        status: DiscrepancyStatus = DiscrepancyStatus.OPEN,
        driverName: String? = "Аброр Каримов",
    ) = Discrepancy(
        id = id,
        orderId = "o1",
        orderNumber = "ORD-1",
        clientName = "Мижоз",
        driverName = driverName,
        expectedAmount = Money.parse(expected),
        receivedAmount = Money.parse(received),
        status = status,
        reportedAt = Instant.EPOCH,
        resolutionNote = null,
    )
}
