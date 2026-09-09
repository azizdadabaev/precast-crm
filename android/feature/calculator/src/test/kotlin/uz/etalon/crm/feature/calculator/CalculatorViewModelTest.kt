package uz.etalon.crm.feature.calculator

import androidx.lifecycle.SavedStateHandle
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.calc.CalculatorDraft
import uz.etalon.crm.core.calc.PlaceOrderInput
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.recomputeRow
import uz.etalon.crm.core.data.ClientsRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.RejectedOrder
import uz.etalon.crm.core.data.SessionPricing
import uz.etalon.crm.core.network.ApiException
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.PriceTier
import uz.etalon.crm.core.model.Pricing
import uz.etalon.crm.core.testing.FakeEtalonApi
import uz.etalon.crm.feature.calculator.KeypadTarget.Field.LENGTH
import uz.etalon.crm.feature.calculator.KeypadTarget.Field.WIDTH
import java.math.BigDecimal

/** A [SessionPricing] that already holds a value — no bootstrap round trip to fake. */
private class FakeSessionPricing(pricing: Pricing?) : SessionPricing {
    override val pricing: StateFlow<Pricing?> = MutableStateFlow(pricing)
}

/** The same wire strings the server sends for the default tiers ("4.30", "140000", …), built the
 *  way `:core:data`'s `SessionMappers` builds a `Pricing` — so `toPriceConfig()` reproduces
 *  `DEFAULT_PRICE_CONFIG`, the equality Phase 2a's `BoundaryTest` already pins. */
private fun defaultAndroidPricing(): Pricing = Pricing(
    m2Tiers = listOf(
        PriceTier(BigDecimal("4.30"), Money.parse("140000")),
        PriceTier(BigDecimal("5.30"), Money.parse("160000")),
        PriceTier(BigDecimal("6.30"), Money.parse("180000")),
        PriceTier(BigDecimal("7.30"), Money.parse("200000")),
        PriceTier(BigDecimal("8.30"), Money.parse("230000")),
    ),
    extraBeamTiers = listOf(
        PriceTier(BigDecimal("4.30"), Money.parse("60000")),
        PriceTier(BigDecimal("5.30"), Money.parse("70000")),
        PriceTier(BigDecimal("6.30"), Money.parse("80000")),
        PriceTier(BigDecimal("7.30"), Money.parse("100000")),
        PriceTier(BigDecimal("8.30"), Money.parse("120000")),
    ),
    blockUnitPrice = Money.parse("6000"),
)

@ExperimentalCoroutinesApi
class CalculatorViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    /** The bootstrap `Pricing` built from the same strings the server sends ("4.30", "140000"),
     *  so `toPriceConfig()` reproduces DEFAULT_PRICE_CONFIG — the equality Phase 2a's
     *  `BoundaryTest` already pins. None of these tests exercise the client bar, so [ClientsRepository]
     *  is wired to a [FakeEtalonApi] that throws by name if anything ever calls it. */
    private fun vm(
        canWrite: Boolean = true,
        observeDraft: ObserveDraftUseCase = ObserveDraftUseCase { flowOf(null) },
        persistDraft: PersistDraftUseCase = PersistDraftUseCase { },
        clearDraft: ClearDraftUseCase = ClearDraftUseCase { },
        saveDraft: SaveDraftUseCase = SaveDraftUseCase { _, _ -> Result.success("proj-1") },
        placeOrder: PlaceOrderUseCase = PlaceOrderUseCase { _, _ -> Result.success("order-1") },
        queuePlaceOrder: QueuePlaceOrderUseCase = QueuePlaceOrderUseCase { _, key -> Result.success(key) },
        rejected: ObserveRejectedOrdersUseCase = ObserveRejectedOrdersUseCase { flowOf(emptyList()) },
        discardRejected: DiscardRejectedOrderUseCase = DiscardRejectedOrderUseCase { },
        saved: SavedStateHandle = SavedStateHandle(),
    ) = CalculatorViewModel(
        session = FakeSessionPricing(defaultAndroidPricing()),
        permissions = PermissionGate { it == "order.create" && canWrite },
        clients = ClientsRepository(object : FakeEtalonApi() {}, PermissionGate { true }),
        observeDraft = observeDraft, persistDraft = persistDraft, clearDraftUseCase = clearDraft, saveDraftUseCase = saveDraft,
        placeOrderUseCase = placeOrder, queuePlaceOrderUseCase = queuePlaceOrder,
        observeRejectedOrders = rejected, discardRejectedOrderUseCase = discardRejected,
        saved = saved,
    )

    /** A quote a placement will actually accept: one priced room plus the three client fields
     *  `PlaceOrderSchema` requires (the draft route takes them as optional). */
    private fun CalculatorViewModel.readyToPlace() {
        addPricedRoom()
        setClientPhoneDigits("901234567")
        setClientName("Aziz")
        setClientViloyat("Тошкент"); setClientTuman("Юнусобод"); setClientStreet("12-уй")
    }

    /** Adds one priced room («Хона 1», 4×6) and returns its id — the shape every save/idempotency
     *  test below needs before `saveDraft` will let a request through (`SlabRow.canPersist`). */
    private fun CalculatorViewModel.addPricedRoom(): String {
        addRoom()
        val id = state.value.rows[0].id
        openKeypad(KeypadTarget(id, WIDTH)); "4".forEach(::keypadDigit); commitKeypad()
        openKeypad(KeypadTarget(id, LENGTH)); "6".forEach(::keypadDigit); commitKeypad()
        return id
    }

    @Test fun `rooms are auto-named Хона N and numbering does not reuse a deleted name`() = runTest {
        val v = vm(); v.addRoom(); v.addRoom()
        assertEquals(listOf("Хона 1", "Хона 2"), v.state.value.rows.map { it.name })
        v.deleteRoom(v.state.value.rows[0].id); v.addRoom()
        assertEquals(listOf("Хона 2", "Хона 3"), v.state.value.rows.map { it.name })
    }
    @Test fun `every keystroke recomputes the row and the totals`() = runTest {
        val v = vm(); v.addRoom()
        val id = v.state.value.rows[0].id
        v.openKeypad(KeypadTarget(id, WIDTH)); "4".forEach(v::keypadDigit); v.commitKeypad()
        assertEquals(0.0, v.state.value.totals.projTotal.total, "width alone is not a room yet")
        v.openKeypad(KeypadTarget(id, LENGTH)); "6".forEach(v::keypadDigit); v.commitKeypad()
        assertTrue(v.state.value.totals.projTotal.total > 0.0)
        assertEquals(v.state.value.rows[0].result!!.subtotal, v.state.value.totals.projTotal.roomsSubtotal)
    }
    @Test fun `the keypad reads a decimal comma`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.openKeypad(KeypadTarget(id, WIDTH)); "4,25".forEach(v::keypadDigit); v.commitKeypad()
        assertEquals(4.25, v.state.value.rows[0].innerWidth)
    }
    @Test fun `Кейинги walks width to length to the next room's width and stops at the end`() = runTest {
        val v = vm(); v.addRoom(); v.addRoom()
        val (a, b) = v.state.value.rows.map { it.id }
        v.openKeypad(KeypadTarget(a, WIDTH)); v.nextField()
        assertEquals(KeypadTarget(a, LENGTH), v.state.value.keypad)
        v.nextField(); assertEquals(KeypadTarget(b, WIDTH), v.state.value.keypad)
        v.nextField(); v.nextField(); assertNull(v.state.value.keypad, "past the last field the keypad closes")
    }
    @Test fun `duplicate copies every input and gives the copy its own id and name`() = runTest {
        val v = vm(); v.addRoom(); val src = v.state.value.rows[0]
        v.duplicateRoom(src.id)
        val copy = v.state.value.rows[1]
        assertNotEquals(src.id, copy.id); assertEquals("Хона 2", copy.name)
        assertEquals(src.innerWidth, copy.innerWidth); assertEquals(src.bearing, copy.bearing)
    }
    @Test fun `moveRoom reorders without recomputing anything`() = runTest {
        val v = vm(); v.addRoom(); v.addRoom(); v.addRoom()
        val before = v.state.value.rows.map { it.id }
        v.moveRoom(0, 2)
        assertEquals(listOf(before[1], before[2], before[0]), v.state.value.rows.map { it.id })
    }
    @Test fun `the width bump uses the chosen grid`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.openKeypad(KeypadTarget(id, WIDTH)); "4".forEach(v::keypadDigit); v.commitKeypad()
        v.bumpWidth(id, up = true); assertEquals(4.1, v.state.value.rows[0].innerWidth)
        v.setGrid(Grid.CM5); v.bumpWidth(id, up = false); assertEquals(4.05, v.state.value.rows[0].innerWidth)
    }
    @Test fun `an extras-only room is named as unpersistable rather than dropped`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.openKeypad(KeypadTarget(id, WIDTH)); "4".forEach(v::keypadDigit); v.commitKeypad()
        v.setExtraBeams(id, 2)
        assertEquals(listOf("Хона 1"), v.state.value.unpersistableRoomNames)
        assertTrue(v.state.value.totals.projTotal.total > 0.0, "it still counts in the quote")
    }
    @Test fun `an operator without order_create can still quote`() = runTest {
        val v = vm(canWrite = false); v.addRoom()
        assertFalse(v.state.value.canWrite); assertEquals(1, v.state.value.rows.size)
    }

    // ── Trap: the focused room can be deleted out from under the keypad ────────────────

    @Test fun `deleting the room the keypad is focused on closes the keypad and collapses its card`() = runTest {
        val v = vm(); v.addRoom(); v.addRoom()
        val (a, b) = v.state.value.rows.map { it.id }
        v.openKeypad(KeypadTarget(a, WIDTH))
        v.toggleExpanded(a)
        v.deleteRoom(a)
        assertNull(v.state.value.keypad, "the keypad followed the deleted room")
        assertNull(v.state.value.expandedRowId, "the expanded card followed the deleted room too")
        assertEquals(listOf(b), v.state.value.rows.map { it.id })
    }

    @Test fun `deleting a room the keypad is NOT focused on leaves the keypad open`() = runTest {
        val v = vm(); v.addRoom(); v.addRoom()
        val (a, b) = v.state.value.rows.map { it.id }
        v.openKeypad(KeypadTarget(b, WIDTH))
        v.deleteRoom(a)
        assertEquals(KeypadTarget(b, WIDTH), v.state.value.keypad)
    }

    // ── Task 8: draft restore, autosave, save, clear ───────────────────────────────

    @Test fun `a persisted draft is restored into state before the operator types anything`() = runTest {
        val restored = CalculatorDraft(
            rows = listOf(recomputeRow(SlabRow(id = "r1", name = "Хона 3", innerWidth = 4.0, innerLength = 6.0))),
            clientPhone = "998901234567", clientName = "Aziz", clientAddress = "",
            discountPercent = 0.0, discountAmount = 20_000.0, deliveryCost = 5_000.0, otherCost = 1_000.0,
            projectId = "proj-9",
        )
        val v = vm(observeDraft = ObserveDraftUseCase { flowOf(restored) })
        advanceUntilIdle()

        assertEquals(listOf("Хона 3"), v.state.value.rows.map { it.name })
        assertEquals("901234567", v.state.value.clientPhoneDigits)
        assertEquals("Aziz", v.state.value.clientName)
        assertEquals(DiscountMode.AMOUNT, v.state.value.discountMode, "discountAmount > 0 wins, as the engine boundary resolves it")
        assertEquals(20_000.0, v.state.value.discountAmount)
        assertEquals(5_000.0, v.state.value.deliveryCost)
        assertEquals("proj-9", v.state.value.projectId)
        assertTrue(v.state.value.totals.projTotal.total > 0.0, "the restored room is recomputed, not left blank")

        v.addRoom()
        assertEquals("Хона 4", v.state.value.rows.last().name, "numbering continues past the restored room, never reusing it")
    }

    @Test fun `mutations are persisted after the 500ms debounce, not before`() = runTest {
        var saves = 0
        val v = vm(persistDraft = PersistDraftUseCase { saves++ })
        advanceUntilIdle() // let init's restore settle and the very first (empty) draft flush
        val baseline = saves

        v.addRoom()
        advanceTimeBy(400)
        assertEquals(baseline, saves, "not yet — the debounce has not elapsed")
        advanceTimeBy(200); advanceUntilIdle()
        assertEquals(baseline + 1, saves)
    }

    @Test fun `saveDraft succeeds, keeps the projectId, shows a confirmation, and persists it immediately`() = runTest {
        var persisted: CalculatorDraft? = null
        val v = vm(saveDraft = SaveDraftUseCase { _, _ -> Result.success("proj-1") }, persistDraft = PersistDraftUseCase { d -> persisted = d })
        advanceUntilIdle()
        v.addRoom(); val id = v.state.value.rows[0].id
        v.openKeypad(KeypadTarget(id, WIDTH)); "4".forEach(v::keypadDigit); v.commitKeypad()
        v.openKeypad(KeypadTarget(id, LENGTH)); "6".forEach(v::keypadDigit); v.commitKeypad()

        v.saveDraft()
        advanceUntilIdle()

        assertEquals("proj-1", v.state.value.projectId)
        assertEquals("Лойиҳа сақланди", v.state.value.saveMessage)
        assertFalse(v.state.value.saving)
        assertEquals("proj-1", persisted?.projectId, "the returned id is written to Room right away, not left to the autosave debounce")
    }

    @Test fun `saveDraft is blocked before the network when a room is unpersistable`() = runTest {
        var called = false
        val v = vm(saveDraft = SaveDraftUseCase { _, _ -> called = true; Result.success("x") })
        advanceUntilIdle()
        v.addRoom(); val id = v.state.value.rows[0].id
        v.openKeypad(KeypadTarget(id, WIDTH)); "4".forEach(v::keypadDigit); v.commitKeypad()
        v.setExtraBeams(id, 2) // extras-only: canPersist is false

        v.saveDraft()
        advanceUntilIdle()

        assertFalse(called, "an unpersistable row must block the whole save before it ever reaches the use case")
        assertNotNull(v.state.value.error)
        assertNull(v.state.value.projectId)
    }

    @Test fun `saveDraft is refused without order_create, before the network`() = runTest {
        var called = false
        val v = vm(canWrite = false, saveDraft = SaveDraftUseCase { _, _ -> called = true; Result.success("x") })
        advanceUntilIdle()

        v.saveDraft()
        advanceUntilIdle()

        assertFalse(called)
        assertNotNull(v.state.value.error)
    }

    @Test fun `clearAll empties the client bar and the discounts too, and clears the persisted draft`() = runTest {
        var cleared = false
        val v = vm(clearDraft = ClearDraftUseCase { cleared = true })
        advanceUntilIdle()
        v.addRoom(); v.setClientPhoneDigits("901234567"); v.setClientName("Aziz")
        v.setDiscountMode(DiscountMode.AMOUNT); v.setDiscountAmount(10_000.0)

        v.clearAll()
        advanceUntilIdle()

        assertTrue(v.state.value.rows.isEmpty())
        assertEquals("", v.state.value.clientPhoneDigits)
        assertEquals("", v.state.value.clientName)
        assertEquals(0.0, v.state.value.discountAmount)
        assertTrue(cleared, "the Room draft must go too, or reopening the screen brings the just-cleared quote back")
    }

    /**
     * The bug the whole `draftGeneration` mechanism exists for: a save started for one customer
     * must not land on the fresh quote the operator has since started for the next one.
     * `saveDraft` never resolves until the test completes it, so `clearAll` genuinely runs while
     * the request is in flight — not just before the ViewModel had a chance to send it.
     */
    @Test fun `clearing mid-save is not resurrected once the stale save completes`() = runTest {
        val saveResult = CompletableDeferred<Result<String>>()
        var persisted: CalculatorDraft? = null
        var roomDeleted = false
        val v = vm(
            saveDraft = SaveDraftUseCase { _, _ -> saveResult.await() },
            persistDraft = PersistDraftUseCase { d -> persisted = d },
            clearDraft = ClearDraftUseCase { roomDeleted = true },
        )
        advanceUntilIdle()
        v.addPricedRoom()

        v.saveDraft()
        assertTrue(v.state.value.saving)

        v.clearAll()
        advanceUntilIdle() // let clearAll's own `clearDraftUseCase()` launch run; saveResult is still pending
        assertTrue(v.state.value.rows.isEmpty(), "Тозалаш takes effect immediately, even mid-save")
        assertFalse(v.state.value.saving, "the abandoned save's spinner must not linger over the fresh quote")
        assertTrue(roomDeleted)

        saveResult.complete(Result.success("proj-1"))
        advanceUntilIdle()

        assertNull(v.state.value.projectId, "the stale save must not stamp its id onto the quote started since")
        assertTrue(v.state.value.rows.isEmpty())
        assertNull(persisted, "the stale save's onSuccess must not resurrect the deleted Room row")
    }

    @Test fun `a save that fails after clearAll must not surface its error over the fresh quote`() = runTest {
        val saveResult = CompletableDeferred<Result<String>>()
        val v = vm(saveDraft = SaveDraftUseCase { _, _ -> saveResult.await() })
        advanceUntilIdle()
        v.addPricedRoom()
        v.saveDraft()
        v.clearAll()

        saveResult.complete(Result.failure(IllegalStateException("сервер хатоси")))
        advanceUntilIdle()

        assertNull(v.state.value.error)
        assertFalse(v.state.value.saving)
    }

    @Test fun `clearAll's Room row is not re-created by the autosave debounce that follows it`() = runTest {
        var upserts = 0
        var deletes = 0
        val v = vm(persistDraft = PersistDraftUseCase { upserts++ }, clearDraft = ClearDraftUseCase { deletes++ })
        advanceUntilIdle()
        v.addRoom()
        advanceTimeBy(600); advanceUntilIdle() // let the new room's own autosave flush first
        val beforeClear = upserts

        v.clearAll()
        advanceUntilIdle()
        assertEquals(1, deletes)

        advanceTimeBy(600); advanceUntilIdle() // past the debounce window clearAll leaves pending
        assertEquals(beforeClear, upserts, "the empty draft clearAll leaves behind must not be persisted back")
    }

    // ── Task 8: the Idempotency-Key fingerprints the wire, not the local draft ─────

    @Test fun `a retry of the same submission sends the same idempotency key`() = runTest {
        val keys = mutableListOf<String>()
        val v = vm(saveDraft = SaveDraftUseCase { _, key -> keys += key; Result.failure(java.io.IOException("dropped")) })
        advanceUntilIdle()
        v.addPricedRoom()

        v.saveDraft(); advanceUntilIdle()
        v.saveDraft(); advanceUntilIdle()

        assertEquals(2, keys.size)
        assertEquals(keys[0], keys[1])
        assertTrue(keys[0].isNotBlank())
    }

    @Test fun `editing the submission mints a new idempotency key`() = runTest {
        val keys = mutableListOf<String>()
        val v = vm(saveDraft = SaveDraftUseCase { _, key -> keys += key; Result.failure(IllegalStateException("сумма ортиқча")) })
        advanceUntilIdle()
        v.addPricedRoom()

        v.saveDraft(); advanceUntilIdle()
        v.setDiscountMode(DiscountMode.AMOUNT); v.setDiscountAmount(20_000.0)
        v.saveDraft(); advanceUntilIdle()

        assertEquals(2, keys.size)
        assertNotEquals(keys[0], keys[1])
    }

    /** Process death between the send and the response is the case the key exists for — see
     *  `RecordPaymentViewModelTest`'s identical test for `POST /api/payments`. */
    @Test fun `the idempotency key survives process death`() = runTest {
        val saved = SavedStateHandle()
        val first = mutableListOf<String>()
        val v = vm(saveDraft = SaveDraftUseCase { _, key -> first += key; Result.failure(java.io.IOException("dropped")) }, saved = saved)
        advanceUntilIdle()
        v.addPricedRoom()
        v.saveDraft(); advanceUntilIdle()

        val second = mutableListOf<String>()
        val restored = vm(saveDraft = SaveDraftUseCase { _, key -> second += key; Result.success("proj-1") }, saved = saved)
        advanceUntilIdle()
        restored.addPricedRoom()
        restored.saveDraft(); advanceUntilIdle()

        assertEquals(first, second)
    }

    /** Important 2: `deliveryCost` never reaches `SaveProjectDraftSchema` (it exists only on
     *  Place Order) — fingerprinting it would rotate the key for a reason the server never sees,
     *  and a save whose response was lost, followed by the operator nudging this field and
     *  retrying, would mint a fresh key and create a duplicate project. */
    @Test fun `changing the delivery cost between saves does not rotate the idempotency key`() = runTest {
        val keys = mutableListOf<String>()
        val v = vm(saveDraft = SaveDraftUseCase { _, key -> keys += key; Result.failure(IllegalStateException("boom")) })
        advanceUntilIdle()
        v.addPricedRoom()

        v.saveDraft(); advanceUntilIdle()
        v.setDeliveryCost(50_000.0)
        v.saveDraft(); advanceUntilIdle()

        assertEquals(2, keys.size)
        assertEquals(keys[0], keys[1])
    }

    @Test fun `changing a room dimension rotates the idempotency key`() = runTest {
        val keys = mutableListOf<String>()
        val v = vm(saveDraft = SaveDraftUseCase { _, key -> keys += key; Result.failure(IllegalStateException("boom")) })
        advanceUntilIdle()
        val id = v.addPricedRoom()

        v.saveDraft(); advanceUntilIdle()
        v.openKeypad(KeypadTarget(id, LENGTH)); "6,5".forEach(v::keypadDigit); v.commitKeypad()
        v.saveDraft(); advanceUntilIdle()

        assertEquals(2, keys.size)
        assertNotEquals(keys[0], keys[1])
    }

    @Test fun `a successful save mints a new key for the next one, because projectId is now set`() = runTest {
        val keys = mutableListOf<String>()
        val v = vm(saveDraft = SaveDraftUseCase { _, key -> keys += key; Result.success("proj-1") })
        advanceUntilIdle()
        v.addPricedRoom()

        v.saveDraft(); advanceUntilIdle()
        v.saveDraft(); advanceUntilIdle()

        assertEquals(2, keys.size)
        assertNotEquals(keys[0], keys[1], "the second save is an UPDATE — a stale key would replay the CREATE response")
    }

    // ── Task 9: «Буюртма бериш», online or queued ──────────────────

    private val scheduledAt = "2026-09-19T19:00:00Z"

    @Test fun `a placed order clears the quote and hands the route an id to navigate to`() = runTest {
        var cleared = false
        val v = vm(placeOrder = PlaceOrderUseCase { _, _ -> Result.success("order-1") }, clearDraft = ClearDraftUseCase { cleared = true })
        advanceUntilIdle()
        v.readyToPlace()

        v.placeOrder(scheduledAt, "тезкор"); advanceUntilIdle()

        assertEquals("order-1", v.state.value.placedOrderId)
        assertTrue(v.state.value.rows.isEmpty(), "the deal is committed — the calculator is free for the next customer")
        assertTrue(cleared, "the Room draft must go too, or reopening brings the placed quote back")
        assertFalse(v.state.value.placing)

        v.consumePlacedOrder()
        assertNull(v.state.value.placedOrderId, "consumed once, so a recomposition cannot navigate twice")
    }

    @Test fun `what the sheet submits is what the repository is asked to place`() = runTest {
        var sent: PlaceOrderInput? = null
        val v = vm(placeOrder = PlaceOrderUseCase { input, _ -> sent = input; Result.success("order-1") })
        advanceUntilIdle()
        v.readyToPlace()
        v.setDeliveryCost(150_000.0)

        v.placeOrder(scheduledAt, "тезкор"); advanceUntilIdle()

        assertEquals(scheduledAt, sent!!.scheduledAt)
        assertEquals("тезкор", sent!!.notes)
        assertEquals(150_000.0, sent!!.draft.deliveryCost)
        assertEquals("998901234567", sent!!.draft.clientPhone)
        assertEquals(listOf("Хона 1"), sent!!.draft.rows.map { it.name })
    }

    /** A lost signal is the case the queue exists for, so the sheet is offered it. A server
     *  refusal is not: queueing that same body would only fail again, later, unwatched. */
    @Test fun `only a network failure offers the queue`() = runTest {
        val network = vm(placeOrder = PlaceOrderUseCase { _, _ -> Result.failure(java.io.IOException("dropped")) })
        advanceUntilIdle()
        network.readyToPlace()
        network.placeOrder(scheduledAt, ""); advanceUntilIdle()
        assertTrue(network.state.value.queueOffered)
        assertFalse(network.state.value.placing)
        assertEquals("Интернет йўқ", network.state.value.error)

        val refused = vm(placeOrder = PlaceOrderUseCase { _, _ -> Result.failure(ApiException(422, "Мижоз манзили керак · required")) })
        advanceUntilIdle()
        refused.readyToPlace()
        refused.placeOrder(scheduledAt, ""); advanceUntilIdle()
        assertFalse(refused.state.value.queueOffered)
        assertEquals("Мижоз манзили керак", refused.state.value.error)
    }

    /**
     * The double-submit trap the whole idempotency story exists to close: the online attempt may
     * ALREADY have committed the order when the connection dropped. Queueing it afterwards must
     * reuse that submission's key — the queued row's id becomes that key — or the drain places a
     * second real order with a second order number and a second receivable.
     */
    @Test fun `queueing after a failed online attempt reuses that submission's key`() = runTest {
        val keys = mutableListOf<String>()
        val v = vm(
            placeOrder = PlaceOrderUseCase { _, key -> keys += key; Result.failure(java.io.IOException("dropped")) },
            queuePlaceOrder = QueuePlaceOrderUseCase { _, key -> keys += key; Result.success(key) },
        )
        advanceUntilIdle()
        v.readyToPlace()

        v.placeOrder(scheduledAt, "тезкор"); advanceUntilIdle()
        v.queuePlaceOrder(scheduledAt, "тезкор"); advanceUntilIdle()

        assertEquals(2, keys.size)
        assertEquals(keys[0], keys[1])
    }

    /** Two routes, two keys. A key first used on `POST /api/projects` is answered
     *  `IDEMPOTENT_ROUTE_MISMATCH` by `POST /api/orders` — the server scopes them per user, not
     *  per route, and refuses the crossover outright. */
    @Test fun `the place key is never the draft key`() = runTest {
        val draftKeys = mutableListOf<String>()
        val placeKeys = mutableListOf<String>()
        val v = vm(
            saveDraft = SaveDraftUseCase { _, key -> draftKeys += key; Result.success("proj-1") },
            placeOrder = PlaceOrderUseCase { _, key -> placeKeys += key; Result.failure(java.io.IOException("dropped")) },
        )
        advanceUntilIdle()
        v.readyToPlace()

        v.saveDraft(); advanceUntilIdle()
        v.placeOrder(scheduledAt, ""); advanceUntilIdle()

        assertNotEquals(draftKeys.single(), placeKeys.single())
    }

    /** Same rule the draft key follows, over its own SavedStateHandle slots. */
    @Test fun `the place key survives process death`() = runTest {
        val saved = SavedStateHandle()
        val first = mutableListOf<String>()
        val v = vm(placeOrder = PlaceOrderUseCase { _, key -> first += key; Result.failure(java.io.IOException("dropped")) }, saved = saved)
        advanceUntilIdle()
        v.readyToPlace()
        v.placeOrder(scheduledAt, "тезкор"); advanceUntilIdle()

        val second = mutableListOf<String>()
        val restored = vm(placeOrder = PlaceOrderUseCase { _, key -> second += key; Result.success("order-1") }, saved = saved)
        advanceUntilIdle()
        restored.readyToPlace()
        restored.placeOrder(scheduledAt, "тезкор"); advanceUntilIdle()

        assertEquals(first, second)
    }

    @Test fun `a queued placement clears the quote and says it is not sent yet`() = runTest {
        val v = vm(queuePlaceOrder = QueuePlaceOrderUseCase { _, key -> Result.success(key) })
        advanceUntilIdle()
        v.readyToPlace()

        v.queuePlaceOrder(scheduledAt, ""); advanceUntilIdle()

        assertTrue(v.state.value.rows.isEmpty())
        assertEquals(QUEUED_MESSAGE, v.state.value.saveMessage)
        assertNull(v.state.value.placedOrderId, "a queued order has no id — it does not exist yet")
    }

    /** The same `draftGeneration` guard `saveDraft` uses: a placement started for one customer
     *  must not land on the quote the operator has since started for the next one. */
    @Test fun `clearing mid-placement is not resurrected once the stale placement completes`() = runTest {
        val result = CompletableDeferred<Result<String>>()
        val v = vm(placeOrder = PlaceOrderUseCase { _, _ -> result.await() })
        advanceUntilIdle()
        v.readyToPlace()

        v.placeOrder(scheduledAt, "")
        assertTrue(v.state.value.placing)
        v.clearAll()
        advanceUntilIdle()
        assertFalse(v.state.value.placing, "the abandoned placement's spinner must not linger over the fresh quote")

        result.complete(Result.success("order-1"))
        advanceUntilIdle()

        assertNull(v.state.value.placedOrderId, "the stale placement must not navigate away from the quote started since")
    }

    @Test fun `placing is refused before the network when anything the server needs is missing`() = runTest {
        var called = false
        val place = PlaceOrderUseCase { _, _ -> called = true; Result.success("order-1") }

        val noRooms = vm(placeOrder = place); advanceUntilIdle()
        noRooms.setClientPhoneDigits("901234567"); noRooms.setClientName("Aziz")
        noRooms.setClientStreet("12-уй")
        noRooms.placeOrder(scheduledAt, ""); advanceUntilIdle()
        assertFalse(called); assertEquals("Камида битта хона керак", noRooms.state.value.error)

        val noClient = vm(placeOrder = place); advanceUntilIdle()
        noClient.addPricedRoom()
        noClient.placeOrder(scheduledAt, ""); advanceUntilIdle()
        assertFalse(called); assertEquals("Мижоз маълумотлари тўлиқ эмас", noClient.state.value.error)

        val noDate = vm(placeOrder = place); advanceUntilIdle()
        noDate.readyToPlace()
        noDate.placeOrder("", ""); advanceUntilIdle()
        assertFalse(called); assertEquals("Етказиб бериш санасини танланг", noDate.state.value.error)

        val noPermission = vm(canWrite = false, placeOrder = place); advanceUntilIdle()
        noPermission.readyToPlace()
        noPermission.placeOrder(scheduledAt, ""); advanceUntilIdle()
        assertFalse(called); assertEquals("Буюртма яратишга рухсат йўқ", noPermission.state.value.error)
    }

    /** An extras-only room is named, never dropped — sending the rest would place an order for
     *  less than the operator quoted. */
    @Test fun `an extras-only room blocks the placement and names itself`() = runTest {
        var called = false
        val v = vm(placeOrder = PlaceOrderUseCase { _, _ -> called = true; Result.success("order-1") })
        advanceUntilIdle()
        v.readyToPlace()
        v.addRoom()
        val extras = v.state.value.rows[1].id
        v.openKeypad(KeypadTarget(extras, WIDTH)); "4".forEach(v::keypadDigit); v.commitKeypad()
        v.setExtraBeams(extras, 2)

        v.placeOrder(scheduledAt, ""); advanceUntilIdle()

        assertFalse(called)
        assertEquals("Сақлаб бўлмайдиган хоналар: Хона 2", v.state.value.error)
    }

    /**
     * A queued order the server later refuses has nowhere else to surface — it never became an
     * order, so no order screen lists it, and the quote it came from was cleared the moment it was
     * queued. The calculator is where the operator finds out, and «Тозалаш» must not be a way to
     * lose that: it belongs to a different quote entirely.
     */
    @Test fun `a rejected queued order stays visible, and survives Тозалаш`() = runTest {
        val discarded = mutableListOf<String>()
        val rejected = RejectedOrder(id = "row-1", clientName = "Aziz", message = "Мижоз манзили керак")
        val v = vm(
            rejected = ObserveRejectedOrdersUseCase { flowOf(listOf(rejected)) },
            discardRejected = DiscardRejectedOrderUseCase { id -> discarded += id },
        )
        advanceUntilIdle()

        assertEquals(listOf(rejected), v.state.value.rejectedOrders)
        v.clearAll(); advanceUntilIdle()
        assertEquals(listOf(rejected), v.state.value.rejectedOrders)

        v.discardRejectedOrder("row-1"); advanceUntilIdle()
        assertEquals(listOf("row-1"), discarded)
    }
}
