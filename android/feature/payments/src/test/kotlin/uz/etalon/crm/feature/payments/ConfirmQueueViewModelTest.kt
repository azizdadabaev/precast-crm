package uz.etalon.crm.feature.payments

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.CustodyChain
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.PaymentMethod
import uz.etalon.crm.core.model.PaymentQueueItem
import uz.etalon.crm.core.model.PaymentStatus
import uz.etalon.crm.feature.payments.queue.*
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class ConfirmQueueViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    // ── confirmBlocker: the route's contextual requirements, before the network ────

    @Test fun `changing the amount requires a note of at least five characters`() {
        val item = item(amount = "1000000")
        // Unchanged: no note needed.
        assertNull(confirmBlocker(item, Money.parse("1000000"), "", null, ""))
        // Changed with nothing, or with too short a note: refused.
        assertNotNull(confirmBlocker(item, Money.parse("900000"), "", null, ""))
        assertNotNull(confirmBlocker(item, Money.parse("900000"), "тўрт", null, ""))
        // Five characters, and it passes.
        assertNull(confirmBlocker(item, Money.parse("900000"), "хатоси", null, ""))
        // Whitespace is not five characters — the server trims before measuring.
        assertNotNull(confirmBlocker(item, Money.parse("900000"), "  ж  ", null, ""))
    }

    @Test fun `a shortfall requires both an action and a note`() {
        val item = item(amount = "800000", expected = "1000000", fromDriver = true)
        assertEquals(Money.parse("200000"), item.shortfall)

        // Neither, then only an action, then only a note: each refused.
        assertNotNull(confirmBlocker(item, item.amount, "", null, ""))
        assertNotNull(confirmBlocker(item, item.amount, "", DiscrepancyAction.TRACK, ""))
        assertNotNull(confirmBlocker(item, item.amount, "", DiscrepancyAction.TRACK, "қис"))
        assertNotNull(confirmBlocker(item, item.amount, "", null, "жумагача тўлайди"))

        // Both, and it passes — for every one of the three actions.
        DiscrepancyAction.entries.forEach { action ->
            assertNull(confirmBlocker(item, item.amount, "", action, "жумагача тўлайди"), "refused $action")
        }

        // Adjusting the amount UP past what was expected removes the shortfall entirely, so the
        // action and the note stop being required — only the adjustment note remains.
        assertNull(confirmBlocker(item, Money.parse("1000000"), "қайта саналди", null, ""))
    }

    @Test fun `an in-office payment is never treated as short, whatever the dispatch expected`() {
        // The order WAS dispatched with a collection expected, but this cash came over the office
        // counter — no driver was sent anywhere with it, so it is not short of anything.
        val item = item(amount = "300000", expected = "1000000", fromDriver = false)
        assertEquals(Money.ZERO, item.shortfall)
        assertNull(confirmBlocker(item, item.amount, "", null, ""))
    }

    @Test fun `a bank transfer is never treated as short`() {
        val item = item(
            amount = "300000", expected = "1000000", fromDriver = false, method = PaymentMethod.BANK_TRANSFER,
        )
        assertEquals(Money.ZERO, item.shortfall)
        assertNull(confirmBlocker(item, item.amount, "", null, ""))
    }

    @Test fun `an unchanged amount with no shortfall needs nothing at all`() {
        assertNull(confirmBlocker(item(amount = "1000000"), Money.parse("1000000"), "", null, ""))
        // ...and a driver-collected payment that met the expectation is equally free.
        val met = item(amount = "1000000", expected = "1000000", fromDriver = true)
        assertNull(confirmBlocker(met, met.amount, "", null, ""))
    }

    /** The confirmed amount goes to the server as `z.coerce.number().positive()`. */
    @Test fun `a zero or negative amount is refused`() {
        val item = item(amount = "1000000")
        assertNotNull(confirmBlocker(item, Money.ZERO, "нолга тушди", null, ""))
        assertNotNull(confirmBlocker(item, Money.parse("-1"), "манфий сумма", null, ""))
    }

    /** Both notes are `z.string().max(500)` server-side. */
    @Test fun `a note longer than the server allows is refused`() {
        val item = item(amount = "1000000")
        assertNotNull(confirmBlocker(item, Money.parse("900000"), "ж".repeat(501), null, ""))
        assertNull(confirmBlocker(item, Money.parse("900000"), "ж".repeat(500), null, ""))

        val short = item(amount = "800000", expected = "1000000", fromDriver = true)
        assertNotNull(confirmBlocker(short, short.amount, "", DiscrepancyAction.TRACK, "ж".repeat(501)))
        assertNull(confirmBlocker(short, short.amount, "", DiscrepancyAction.TRACK, "ж".repeat(500)))
    }

    @Test fun `rejecting needs a reason of at least three characters`() {
        assertNotNull(rejectBlocker(""))
        assertNotNull(rejectBlocker("ха"))
        assertNotNull(rejectBlocker("  ж "))
        assertNull(rejectBlocker("хато"))
    }

    @Test fun `every refusal is written in Uzbek Cyrillic`() {
        val cyrillic = Regex("[\\u0400-\\u04FF]")
        val plain = item(amount = "1000000")
        val short = item(amount = "800000", expected = "1000000", fromDriver = true)
        val messages = listOfNotNull(
            confirmBlocker(plain, Money.ZERO, "", null, ""),
            confirmBlocker(plain, Money.parse("900000"), "", null, ""),
            confirmBlocker(plain, Money.parse("900000"), "ж".repeat(501), null, ""),
            confirmBlocker(short, short.amount, "", null, ""),
            confirmBlocker(short, short.amount, "", DiscrepancyAction.TRACK, ""),
            confirmBlocker(short, short.amount, "", DiscrepancyAction.TRACK, "ж".repeat(501)),
            rejectBlocker(""),
        )
        assertEquals(7, messages.size, "one of the refusals went missing")
        messages.forEach { assertTrue(cyrillic.containsMatchIn(it), "not Uzbek Cyrillic: $it") }
    }

    /**
     * The sheet measures the shortfall against the amount the owner is about to confirm, which
     * the model's own [PaymentQueueItem.shortfall] cannot know. The two must agree on the one
     * case they share — the recorded amount — or the card and the sheet would disagree about
     * whether a discrepancy exists.
     */
    @Test fun `the sheet's shortfall agrees with the model's on the recorded amount`() {
        listOf(
            item(amount = "800000", expected = "1000000", fromDriver = true),
            item(amount = "800000", expected = "1000000", fromDriver = false),
            item(amount = "1200000", expected = "1000000", fromDriver = true),
            item(amount = "800000", expected = null, fromDriver = true),
        ).forEach { assertEquals(it.shortfall, shortfallOf(it, it.amount), "disagreed on $it") }
    }

    // ── the ViewModel ─────────────────────────────────────────────────────────────

    @Test fun `each tab fetches its own status`() = runTest {
        val asked = mutableListOf<PaymentStatus>()
        val vm = viewModel(queue = { status -> asked += status; Result.success(emptyList()) })
        advanceUntilIdle()
        assertEquals(listOf(PaymentStatus.PENDING_CONFIRMATION), asked)

        vm.setTab(PaymentStatus.CONFIRMED)
        advanceUntilIdle()
        vm.setTab(PaymentStatus.REJECTED)
        advanceUntilIdle()
        assertEquals(
            listOf(PaymentStatus.PENDING_CONFIRMATION, PaymentStatus.CONFIRMED, PaymentStatus.REJECTED),
            asked,
        )
        assertEquals(PaymentStatus.REJECTED, vm.state.value.tab)
    }

    /** The defect found twice in Phase 1b: an empty list beside an error banner reads as "no
     *  payments" when the truth is "couldn't check". */
    @Test fun `no empty state while loading or while an error shows`() = runTest {
        val vm = viewModel(queue = { Result.failure(java.io.IOException("no net")) })
        assertFalse(vm.state.value.showEmptyState) // still loading
        advanceUntilIdle()
        assertNotNull(vm.state.value.error)
        assertFalse(vm.state.value.showEmptyState)
        assertTrue(vm.state.value.isOffline)

        val empty = viewModel(queue = { Result.success(emptyList()) })
        advanceUntilIdle()
        assertTrue(empty.state.value.showEmptyState)
    }

    @Test fun `approving sends the adjusted amount, the action and the note`() = runTest {
        var sent: List<Any?>? = null
        val row = item(id = "p1", amount = "800000", expected = "1000000", fromDriver = true)
        val vm = viewModel(
            queue = { Result.success(listOf(row)) },
            confirm = { id, amount, adjustmentNote, action, note ->
                sent = listOf(id, amount, adjustmentNote, action, note); Result.success(Unit)
            },
        )
        advanceUntilIdle()
        vm.openApprove(row)
        vm.setAction(DiscrepancyAction.DISCOUNT)
        vm.setNote("чегирма сифатида")
        vm.submitApprove()
        advanceUntilIdle()

        assertEquals(listOf("p1", null, null, "DISCOUNT", "чегирма сифатида"), sent)
        assertNull(vm.state.value.sheet)
    }

    /** Unchanged amounts travel as null, exactly as the web dialog sends `undefined`: the route
     *  reads `body.amount != null` to decide whether the owner adjusted anything. */
    @Test fun `an unchanged amount is not sent as an adjustment`() = runTest {
        var sentAmount: Money? = Money.parse("1")
        var sentNote: String? = "x"
        val row = item(id = "p2", amount = "1000000")
        val vm = viewModel(
            queue = { Result.success(listOf(row)) },
            confirm = { _, amount, adjustmentNote, _, _ ->
                sentAmount = amount; sentNote = adjustmentNote; Result.success(Unit)
            },
        )
        advanceUntilIdle()
        vm.openApprove(row)
        assertEquals("1000000", vm.state.value.sheet?.amountDigits)
        vm.submitApprove()
        advanceUntilIdle()

        assertNull(sentAmount)
        assertNull(sentNote)
    }

    @Test fun `an adjusted amount travels with its note`() = runTest {
        var sentAmount: Money? = null
        var sentNote: String? = null
        val row = item(id = "p3", amount = "1000000")
        val vm = viewModel(
            queue = { Result.success(listOf(row)) },
            confirm = { _, amount, adjustmentNote, _, _ ->
                sentAmount = amount; sentNote = adjustmentNote; Result.success(Unit)
            },
        )
        advanceUntilIdle()
        vm.openApprove(row)
        vm.setAmountDigits("950000")
        vm.setAdjustmentNote("  чекдан тузатилди  ")
        vm.submitApprove()
        advanceUntilIdle()

        assertEquals(Money.parse("950000"), sentAmount)
        assertEquals("чекдан тузатилди", sentNote)
    }

    @Test fun `a blocked approval never reaches the network`() = runTest {
        var calls = 0
        val row = item(id = "p4", amount = "800000", expected = "1000000", fromDriver = true)
        val vm = viewModel(queue = { Result.success(listOf(row)) }, confirm = { _, _, _, _, _ -> calls++; Result.success(Unit) })
        advanceUntilIdle()
        vm.openApprove(row)
        vm.submitApprove() // shortfall, no action, no note
        advanceUntilIdle()

        assertEquals(0, calls)
        assertNotNull(vm.state.value.sheet?.error)
        assertNotNull(vm.state.value.sheet) // and the sheet stays open, holding what was typed
    }

    @Test fun `rejecting sends the trimmed reason and closes the sheet`() = runTest {
        var sent: Pair<String, String>? = null
        val row = item(id = "p5", amount = "1000000")
        val vm = viewModel(queue = { Result.success(listOf(row)) }, reject = { id, reason -> sent = id to reason; Result.success(Unit) })
        advanceUntilIdle()
        vm.openReject(row)
        vm.setRejectReason("  сумма нотўғри  ")
        vm.submitReject()
        advanceUntilIdle()

        assertEquals("p5" to "сумма нотўғри", sent)
        assertNull(vm.state.value.sheet)
    }

    @Test fun `a reason too short never reaches the network`() = runTest {
        var calls = 0
        val row = item(id = "p6", amount = "1000000")
        val vm = viewModel(queue = { Result.success(listOf(row)) }, reject = { _, _ -> calls++; Result.success(Unit) })
        advanceUntilIdle()
        vm.openReject(row)
        vm.setRejectReason("ха")
        vm.submitReject()
        advanceUntilIdle()

        assertEquals(0, calls)
        assertNotNull(vm.state.value.sheet?.error)
    }

    /** Neither confirm nor reject is `withIdempotency`-wrapped server-side, so neither may ever
     *  be queued: with no signal they are refused outright rather than sent and failed. */
    @Test fun `confirming and rejecting are refused while offline instead of being queued`() = runTest {
        var confirms = 0
        var rejects = 0
        val row = item(id = "p7", amount = "1000000")
        val vm = viewModel(
            queue = { Result.failure(java.io.IOException("no net")) },
            confirm = { _, _, _, _, _ -> confirms++; Result.success(Unit) },
            reject = { _, _ -> rejects++; Result.success(Unit) },
        )
        advanceUntilIdle()
        assertTrue(vm.state.value.isOffline)

        vm.openApprove(row)
        vm.submitApprove()
        advanceUntilIdle()
        assertEquals(0, confirms)
        assertNotNull(vm.state.value.sheet?.error)

        vm.openReject(row)
        vm.setRejectReason("хато")
        vm.submitReject()
        advanceUntilIdle()
        assertEquals(0, rejects)
        assertNotNull(vm.state.value.sheet?.error)
    }

    @Test fun `without payment confirm neither action is offered or performed`() = runTest {
        var confirms = 0
        val row = item(id = "p8", amount = "1000000")
        val vm = viewModel(
            queue = { Result.success(listOf(row)) },
            confirm = { _, _, _, _, _ -> confirms++; Result.success(Unit) },
            permissions = { false },
        )
        advanceUntilIdle()
        assertFalse(vm.state.value.canConfirm)

        vm.openApprove(row)
        vm.submitApprove()
        advanceUntilIdle()
        assertEquals(0, confirms)
        assertNotNull(vm.state.value.sheet?.error)
    }

    @Test fun `a second tap while the first call is in flight is a no-op`() = runTest {
        var calls = 0
        val row = item(id = "p9", amount = "1000000")
        val vm = viewModel(queue = { Result.success(listOf(row)) }, confirm = { _, _, _, _, _ -> calls++; Result.success(Unit) })
        advanceUntilIdle()
        vm.openApprove(row)
        vm.submitApprove()
        vm.submitApprove()
        advanceUntilIdle()

        assertEquals(1, calls)
    }

    /** A confirmed payment must leave the pending tab, or the owner confirms it twice — and the
     *  second call 422s with "Payment is already CONFIRMED". */
    @Test fun `a successful approval re-fetches the tab`() = runTest {
        var fetches = 0
        val row = item(id = "p10", amount = "1000000")
        val vm = viewModel(queue = { fetches++; Result.success(listOf(row)) })
        advanceUntilIdle()
        assertEquals(1, fetches)

        vm.openApprove(row)
        vm.submitApprove()
        advanceUntilIdle()
        assertEquals(2, fetches)
    }

    @Test fun `a failed approval keeps the sheet open with what was typed`() = runTest {
        val row = item(id = "p11", amount = "1000000")
        val vm = viewModel(
            queue = { Result.success(listOf(row)) },
            confirm = { _, _, _, _, _ -> Result.failure(IllegalStateException("сервер хатоси")) },
        )
        advanceUntilIdle()
        vm.openApprove(row)
        vm.setAmountDigits("950000")
        vm.setAdjustmentNote("чекдан тузатилди")
        vm.submitApprove()
        advanceUntilIdle()

        val sheet = requireNotNull(vm.state.value.sheet)
        assertEquals("950000", sheet.amountDigits)
        assertEquals("чекдан тузатилди", sheet.adjustmentNote)
        assertNotNull(sheet.error)
        assertFalse(vm.state.value.busy)
    }

    /** Read during composition, so it must never throw — the same rule the record sheet follows. */
    @Test fun `an unparsable amount reads as zero rather than crashing the sheet`() {
        val row = item(amount = "1000000")
        assertEquals(Money.ZERO, sheet(row, "").amount)
        assertEquals(Money.ZERO, sheet(row, "-").amount)
        assertEquals(Money.ZERO, sheet(row, "1 2 3").amount)
    }

    // ── fixtures ──────────────────────────────────────────────────────────────────

    private fun viewModel(
        queue: suspend (PaymentStatus) -> Result<List<PaymentQueueItem>> = { Result.success(emptyList()) },
        confirm: suspend (String, Money?, String?, String?, String?) -> Result<Unit> = { _, _, _, _, _ -> Result.success(Unit) },
        reject: suspend (String, String) -> Result<Unit> = { _, _ -> Result.success(Unit) },
        permissions: suspend (String) -> Boolean = { true },
    ) = ConfirmQueueViewModel(
        queue = PaymentQueueUseCase { queue(it) },
        confirm = PaymentConfirmUseCase { id, amount, adjustmentNote, action, note ->
            confirm(id, amount, adjustmentNote, action, note)
        },
        reject = PaymentRejectUseCase { id, reason -> reject(id, reason) },
        permissions = ConfirmPermissionUseCase { permissions(it) },
    )

    private fun sheet(item: PaymentQueueItem, amountDigits: String) =
        ConfirmSheetState(item = item, amountDigits = amountDigits)

    private fun item(
        id: String = "p1",
        amount: String = "1000000",
        expected: String? = null,
        fromDriver: Boolean = false,
        method: PaymentMethod = PaymentMethod.CASH,
        status: PaymentStatus = PaymentStatus.PENDING_CONFIRMATION,
    ) = PaymentQueueItem(
        id = id,
        orderId = "o1",
        orderNumber = "ORD-1",
        clientName = "Мижоз",
        amount = Money.parse(amount),
        originalAmount = null,
        method = method,
        status = status,
        recordedAt = Instant.EPOCH,
        paidOn = null,
        expectedCollection = expected?.let(Money::parse),
        fromDriver = fromDriver,
        custody = CustodyChain(
            collectedBy = if (fromDriver) "Аброр Каримов" else null,
            recordedBy = "Оператор",
            handedOverTo = null,
            confirmedBy = null,
        ),
        receiptUrls = emptyList(),
        rejectionReason = null,
    )
}
