package uz.etalon.crm.feature.calculator

import androidx.lifecycle.SavedStateHandle
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flow
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
import uz.etalon.crm.core.calc.Pattern
import uz.etalon.crm.core.calc.PlaceOrderInput
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.autoPickedRate
import uz.etalon.crm.core.calc.money
import uz.etalon.crm.core.calc.recomputeRow
import uz.etalon.crm.core.data.ClientsRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.SessionPricing
import uz.etalon.crm.core.network.ApiException
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.CapacityMonth
import uz.etalon.crm.core.model.CapacityThresholds
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.PriceTier
import uz.etalon.crm.core.model.Pricing
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.gridRange
import uz.etalon.crm.core.testing.FakeEtalonApi
import uz.etalon.crm.core.ui.format.TASHKENT
import uz.etalon.crm.feature.calculator.calendar.tierOfDate
import java.math.BigDecimal
import java.time.YearMonth

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
        capacity: CapacitySource = NoCapacity,
        saved: SavedStateHandle = SavedStateHandle(),
    ) = CalculatorViewModel(
        session = FakeSessionPricing(defaultAndroidPricing()),
        permissions = PermissionGate { it == "order.create" && canWrite },
        clients = ClientsRepository(object : FakeEtalonApi() {}, PermissionGate { true }),
        observeDraft = observeDraft, persistDraft = persistDraft, clearDraftUseCase = clearDraft, saveDraftUseCase = saveDraft,
        placeOrderUseCase = placeOrder, queuePlaceOrderUseCase = queuePlaceOrder,
        capacity = capacity,
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

    /** A quote «Лойиҳани сақлаш» will actually accept: one priced room plus the phone, the one
     *  client field `SaveProjectDraftSchema` insists on (`min(3)`, required — name and address are
     *  optional on that route). Returns the room's id. */
    private fun CalculatorViewModel.readyToSave(): String {
        val id = addPricedRoom()
        setClientPhoneDigits("901234567")
        return id
    }

    /**
     * One priced room named «Хона 1» plus the full client — deliberately IDENTICAL every time it
     * is built, unlike [readyToPlace], whose room takes the next «Хона N» and so fingerprints
     * differently on a second call. Two submissions built by this one fingerprint the same, which
     * is what makes a released Idempotency-Key the only thing that can tell them apart.
     */
    private fun CalculatorViewModel.identicalQuote() {
        addRoom()
        val id = state.value.rows.last().id
        setName(id, "Хона 1")
        setWidthText(id, "4")
        setLengthText(id, "6")
        setClientPhoneDigits("901234567")
        setClientName("Aziz")
        setClientViloyat("Тошкент"); setClientTuman("Юнусобод"); setClientStreet("12-уй")
    }

    /** Adds one priced room («Хона 1», 4×6) and returns its id — the shape every save/idempotency
     *  test below needs before `saveDraft` will let a request through (`SlabRow.canPersist`). */
    private fun CalculatorViewModel.addPricedRoom(): String {
        addRoom()
        val id = state.value.rows[0].id
        setWidthText(id, "4")
        setLengthText(id, "6")
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
        v.setWidthText(id, "4")
        assertEquals(0.0, v.state.value.totals.projTotal.total, "width alone is not a room yet")
        v.setLengthText(id, "6")
        assertTrue(v.state.value.totals.projTotal.total > 0.0)
        assertEquals(v.state.value.rows[0].result!!.subtotal, v.state.value.totals.projTotal.roomsSubtotal)
    }
    @Test fun `a cell reads a decimal comma`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.setWidthText(id, "4,25")
        assertEquals(4.25, v.state.value.rows[0].innerWidth)
    }

    /** §7 fixture 1, typed the way an operator types it: the cells are text, the engine is
     *  doubles, and the two must meet at exactly this number. */
    @Test fun `typing 5,2 by 7,1 into the cells prices fixture 1`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.setWidthText(id, "5,2")
        v.setLengthText(id, "7,1")
        assertEquals(Money.parse("7330400.00"), v.state.value.rows[0].result!!.money().subtotal)
    }

    /** There is no «commit» any more: the row is repriced on the keystroke, including the one
     *  that is only a comma — «5,» must price off the 5 it already has rather than dropping the
     *  room to zero for as long as the operator's finger is between digits. */
    @Test fun `the row reprices on every keystroke, the bare separator included`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.setLengthText(id, "7")

        v.setWidthText(id, "5")
        assertEquals(5.0, v.state.value.rows[0].innerWidth)
        val atFive = v.state.value.rows[0].result!!.subtotal
        assertTrue(atFive > 0.0)

        v.setWidthText(id, "5,")
        assertEquals("5,", v.state.value.draft(id).width, "the separator stays in the cell")
        assertEquals(5.0, v.state.value.rows[0].innerWidth)
        assertEquals(atFive, v.state.value.rows[0].result!!.subtotal, "a half-typed decimal is still the 5")

        v.setWidthText(id, "5,2")
        assertEquals(5.2, v.state.value.rows[0].innerWidth)
        assertNotEquals(atFive, v.state.value.rows[0].result!!.subtotal)
    }

    /** The system decimal keyboard emits whichever separator the device's locale gives it. */
    @Test fun `a cell reads a decimal point the same as a comma, and shows the comma`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.setWidthText(id, "4.25")
        assertEquals(4.25, v.state.value.rows[0].innerWidth)
        assertEquals("4,25", v.state.value.draft(id).width, "D8's decimal mark, whatever was typed")
    }

    @Test fun `a cell filters out everything that is not a digit or the first separator`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.setWidthText(id, "-4,2,5x")
        assertEquals("4,25", v.state.value.draft(id).width)
        assertEquals(4.25, v.state.value.rows[0].innerWidth)
    }

    /** Clearing a cell is not «leave the old number there»: the room stops being one the server
     *  would take, and the totals say so immediately. */
    @Test fun `an emptied cell prices as zero and the room stops being persistable`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.setWidthText(id, "4"); v.setLengthText(id, "6")
        assertTrue(v.state.value.rows[0].canPersist)

        v.setLengthText(id, "")

        assertEquals("", v.state.value.draft(id).length)
        assertEquals(0.0, v.state.value.rows[0].innerLength)
        assertFalse(v.state.value.rows[0].canPersist)
    }

    @Test fun `the bearing and correction cells are text too`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        assertEquals("0,15", v.state.value.draft(id).bearing, "a new room starts at the engine's default")
        v.setBearingText(id, "0,20"); v.setCorrectionText(id, "0,05")
        assertEquals(0.20, v.state.value.rows[0].bearing)
        assertEquals(0.05, v.state.value.rows[0].correction)
    }

    /** The `Double` setters «Қўшимча» used to own are still on the ViewModel (a restored draft and
     *  the ± bump reach the same rows), and they must leave the CELL agreeing with the row they
     *  just moved — otherwise the card shows one bearing and prices another. */
    @Test fun `setting the bearing or the correction as a number rewrites its cell`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.setBearing(id, 0.20)
        v.setCorrection(id, 0.05)
        assertEquals("0,20", v.state.value.draft(id).bearing)
        assertEquals("0,05", v.state.value.draft(id).correction)
    }

    @Test fun `rounding every width up rewrites every width cell`() = runTest {
        val v = vm()
        v.addRoom(); val a = v.state.value.rows[0].id
        v.addRoom(); val b = v.state.value.rows[1].id
        v.setWidthText(a, "4,02"); v.setLengthText(a, "6")
        v.setWidthText(b, "3,31"); v.setLengthText(b, "6")

        v.roundAllWidthsUp()

        assertEquals(4.1, v.state.value.rows[0].innerWidth)
        assertEquals(3.4, v.state.value.rows[1].innerWidth)
        assertEquals("4,10", v.state.value.draft(a).width)
        assertEquals("3,40", v.state.value.draft(b).width)
    }

    @Test fun `the width bump rewrites the cell it moved`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.setWidthText(id, "4"); v.setLengthText(id, "6")
        v.bumpWidth(id, up = true)
        assertEquals(4.1, v.state.value.rows[0].innerWidth)
        assertEquals("4,10", v.state.value.draft(id).width)
    }
    @Test fun `duplicate copies every input and gives the copy its own id and name`() = runTest {
        val v = vm(); v.addRoom(); val src = v.state.value.rows[0]
        v.duplicateRoom(src.id)
        val copy = v.state.value.rows[1]
        assertNotEquals(src.id, copy.id); assertEquals("Хона 2", copy.name)
        assertEquals(src.innerWidth, copy.innerWidth); assertEquals(src.bearing, copy.bearing)
    }
    /** The copy's CELLS have to come across with its doubles: a duplicate showing blank cells over
     *  dimensions it really has is a room the operator cannot correct without retyping it. */
    @Test fun `duplicate copies the cell texts too`() = runTest {
        val v = vm(); v.addRoom(); val src = v.state.value.rows[0].id
        v.setWidthText(src, "5,2"); v.setLengthText(src, "7,1"); v.setCorrectionText(src, "0,05")
        v.duplicateRoom(src)
        val copy = v.state.value.rows[1].id
        assertEquals(v.state.value.draft(src), v.state.value.draft(copy))
        assertEquals("5,2", v.state.value.draft(copy).width)
        assertEquals("7,1", v.state.value.draft(copy).length)
        assertEquals("0,05", v.state.value.draft(copy).correction)
    }
    @Test fun `moveRoom reorders without recomputing anything`() = runTest {
        val v = vm(); v.addRoom(); v.addRoom(); v.addRoom()
        val before = v.state.value.rows.map { it.id }
        v.moveRoom(0, 2)
        assertEquals(listOf(before[1], before[2], before[0]), v.state.value.rows.map { it.id })
    }
    @Test fun `the width bump uses the chosen grid`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.setWidthText(id, "4")
        v.bumpWidth(id, up = true); assertEquals(4.1, v.state.value.rows[0].innerWidth)
        v.setGrid(Grid.CM5); v.bumpWidth(id, up = false); assertEquals(4.05, v.state.value.rows[0].innerWidth)
    }
    @Test fun `an extras-only room is named as unpersistable rather than dropped`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.setWidthText(id, "4")
        v.setExtraBeams(id, 2)
        assertEquals(listOf("Хона 1"), v.state.value.unpersistableRoomNames)
        assertTrue(v.state.value.totals.projTotal.total > 0.0, "it still counts in the quote")
    }
    @Test fun `an operator without order_create can still quote`() = runTest {
        val v = vm(canWrite = false); v.addRoom()
        assertFalse(v.state.value.canWrite); assertEquals(1, v.state.value.rows.size)
    }

    // ── Trap: the room a card or a sheet is pointed at can be deleted ─────────────────

    @Test fun `deleting a room takes its cells, its expanded card and its rate confirmation with it`() = runTest {
        val v = vm(); v.addRoom(); v.addRoom()
        val (a, b) = v.state.value.rows.map { it.id }
        v.setWidthText(a, "4"); v.setLengthText(a, "6")
        v.toggleExpanded(a)
        v.pickRate(a, 230_000.0)
        assertNotNull(v.state.value.rateConfirm, "the confirmation is open on the room about to go")

        v.deleteRoom(a)

        assertNull(v.state.value.expandedRowId, "the expanded card followed the deleted room")
        assertNull(v.state.value.rateConfirm, "so did the rate confirmation")
        assertFalse(v.state.value.drafts.containsKey(a), "and its cell texts")
        assertEquals(listOf(b), v.state.value.rows.map { it.id })
    }

    @Test fun `deleting a room leaves another room's cells and confirmation alone`() = runTest {
        val v = vm(); v.addRoom(); v.addRoom()
        val (a, b) = v.state.value.rows.map { it.id }
        v.setWidthText(b, "4,25"); v.setLengthText(b, "6")
        v.pickRate(b, 230_000.0)

        v.deleteRoom(a)

        assertEquals("4,25", v.state.value.draft(b).width)
        assertEquals(RateConfirmState(b, 230_000.0), v.state.value.rateConfirm)
    }

    // ── The pattern chip and the rate sheet ───────────────────────────────────────

    @Test fun `the pattern chip cycles авто to Г-Б to Б-Г-Б to Г-Б-Г and back to авто`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.setWidthText(id, "4"); v.setLengthText(id, "6")
        assertNull(v.state.value.rows[0].patternOverride, "a room starts on авто")
        v.cyclePattern(id); assertEquals(Pattern.GB, v.state.value.rows[0].patternOverride)
        v.cyclePattern(id); assertEquals(Pattern.BGB, v.state.value.rows[0].patternOverride)
        v.cyclePattern(id); assertEquals(Pattern.GBG, v.state.value.rows[0].patternOverride)
        v.cyclePattern(id); assertNull(v.state.value.rows[0].patternOverride, "and round to авто again")
    }

    /** R2: picking the tier the engine would pick anyway changes nothing on the quote, so there is
     *  nothing to justify — it clears the override outright rather than asking for a reason. */
    @Test fun `picking the auto tier clears an override without asking for a reason`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.setWidthText(id, "4"); v.setLengthText(id, "6")
        val auto = autoPickedRate(v.state.value.rows[0])
        v.applyRateOverride(id, 230_000.0, "Йирик буюртма")
        assertTrue(v.state.value.rows[0].m2PriceOverride)

        v.pickRate(id, auto)

        assertFalse(v.state.value.rows[0].m2PriceOverride)
        assertNull(v.state.value.rateConfirm, "no confirmation is opened for a no-op")
    }

    @Test fun `picking Авто clears an override too`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.setWidthText(id, "4"); v.setLengthText(id, "6")
        v.applyRateOverride(id, 230_000.0, "Йирик буюртма")

        v.pickRate(id, null)

        assertFalse(v.state.value.rows[0].m2PriceOverride)
        assertNull(v.state.value.rateConfirm)
    }

    /** D5: the reason is mandatory. A blank one is not an error to report — the button is disabled
     *  until there is one — so «Тасдиқлаш» simply does nothing and the sheet stays open. */
    @Test fun `any other tier waits on a reason, and a blank reason applies nothing`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.setWidthText(id, "4"); v.setLengthText(id, "6")

        v.pickRate(id, 230_000.0)
        assertEquals(RateConfirmState(id, 230_000.0), v.state.value.rateConfirm)
        assertFalse(v.state.value.rows[0].m2PriceOverride, "nothing is applied until it is justified")

        assertFalse(v.confirmRate("   "), "a blank reason applies nothing")
        assertFalse(v.state.value.rows[0].m2PriceOverride)
        assertEquals(RateConfirmState(id, 230_000.0), v.state.value.rateConfirm, "the confirmation stays open")

        assertTrue(v.confirmRate("Мижоз билан келишилди"), "«Тасдиқлаш» reports what it applied")
        assertTrue(v.state.value.rows[0].m2PriceOverride)
        assertEquals(230_000.0, v.state.value.rows[0].m2PriceOverrideValue)
        assertEquals("Мижоз билан келишилди", v.state.value.rows[0].m2PriceReason)
        assertNull(v.state.value.rateConfirm)
    }

    /** The five catalogue tiers are what the server's Zod accepts; anything else would be refused
     *  by `applyRateOverride` AFTER the operator had typed a reason, so it never opens the
     *  confirmation in the first place. */
    @Test fun `a price that is not a catalogue tier opens no confirmation`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.setWidthText(id, "4"); v.setLengthText(id, "6")

        v.pickRate(id, 175_000.0)

        assertNull(v.state.value.rateConfirm)
        assertFalse(v.state.value.rows[0].m2PriceOverride)
    }

    @Test fun `dismissing the rate confirmation applies nothing`() = runTest {
        val v = vm(); v.addRoom(); val id = v.state.value.rows[0].id
        v.setWidthText(id, "4"); v.setLengthText(id, "6")
        v.pickRate(id, 230_000.0)

        v.dismissRateConfirm()

        assertNull(v.state.value.rateConfirm)
        assertFalse(v.state.value.rows[0].m2PriceOverride)
    }

    // ── Reordering with the ↑ / ↓ buttons (R3) ───────────────────────────────────

    @Test fun `moveRoomUp and moveRoomDown walk one place and do nothing at the ends`() = runTest {
        val v = vm(); v.addRoom(); v.addRoom(); v.addRoom()
        val (a, b, c) = v.state.value.rows.map { it.id }

        v.moveRoomUp(a)
        assertEquals(listOf(a, b, c), v.state.value.rows.map { it.id }, "the first room cannot go up")
        v.moveRoomDown(c)
        assertEquals(listOf(a, b, c), v.state.value.rows.map { it.id }, "nor the last one down")

        v.moveRoomDown(a)
        assertEquals(listOf(b, a, c), v.state.value.rows.map { it.id })
        v.moveRoomUp(a)
        assertEquals(listOf(a, b, c), v.state.value.rows.map { it.id })
    }

    // ── Task 8: draft restore, autosave, save, clear ───────────────────────────────

    /**
     * R8's gate. The screen's «open with one blank card» rule waits on [CalculatorUiState.restored],
     * and the whole point of the flag is the window BEFORE Room has answered: asked then, the screen
     * would add a room that the restored draft lands beside.
     *
     * Both cases, because the flag means «Room has been asked», not «Room had something»: a first
     * run with no draft at all must still end up true, or the operator would be looking at an
     * empty calculator with no card to type into.
     */
    @Test fun `restored is false until the draft has been looked for — with a draft`() = runTest {
        val draft = CalculatorDraft(
            rows = listOf(recomputeRow(SlabRow(id = "r1", name = "Хона 1", innerWidth = 4.0, innerLength = 6.0))),
            clientPhone = "998901234567", clientName = "Aziz", clientAddress = "",
            discountPercent = 0.0, discountAmount = 0.0, deliveryCost = 0.0, otherCost = 0.0,
            projectId = null,
        )
        val v = vm(observeDraft = ObserveDraftUseCase { flowOf(draft) })
        assertFalse(v.state.value.restored, "the init coroutine has not run yet")
        advanceUntilIdle()
        assertTrue(v.state.value.restored)
        assertEquals(listOf("Хона 1"), v.state.value.rows.map { it.name }, "and the draft is what it found")
    }

    @Test fun `restored is false until the draft has been looked for — with nothing to restore`() = runTest {
        val v = vm(observeDraft = ObserveDraftUseCase { flowOf(null) })
        assertFalse(v.state.value.restored)
        advanceUntilIdle()
        assertTrue(v.state.value.restored, "nothing found is still an answer")
        assertTrue(v.state.value.rows.isEmpty(), "and the ViewModel adds no room of its own — the screen does")
    }

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

    /** The persisted draft carries the engine's doubles and nothing else (this phase's ruling —
     *  no migration), so the cells are derived back from them: two decimals and a comma. */
    @Test fun `a restored room's cells are derived from its doubles`() = runTest {
        val restored = CalculatorDraft(
            rows = listOf(recomputeRow(SlabRow(id = "r1", name = "Хона 1", innerWidth = 5.2, innerLength = 7.1))),
            clientPhone = "998901234567", clientName = "Aziz", clientAddress = "",
            discountPercent = 0.0, discountAmount = 0.0, deliveryCost = 0.0, otherCost = 0.0,
            projectId = null,
        )
        val v = vm(observeDraft = ObserveDraftUseCase { flowOf(restored) })
        advanceUntilIdle()

        assertEquals(RoomDraft(width = "5,20", length = "7,10", bearing = "0,15", correction = "0"), v.state.value.draft("r1"))
        assertEquals(5.2, parseDecimal(v.state.value.draft("r1").width), "and they parse back to what they came from")
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
        v.setWidthText(id, "4")
        v.setLengthText(id, "6")
        v.setClientPhoneDigits("901234567")

        v.saveDraft()
        advanceUntilIdle()

        assertEquals("proj-1", v.state.value.projectId)
        assertEquals("Лойиҳа сақланди", v.state.value.toast, "the restyled screen shows it as a Toast")
        assertNull(
            v.state.value.saveMessage,
            "and ONLY as a toast — the screen renders saveMessage only when it is the queued notice",
        )
        v.dismissToast(); assertNull(v.state.value.toast)
        assertFalse(v.state.value.saving)
        assertEquals("proj-1", persisted?.projectId, "the returned id is written to Room right away, not left to the autosave debounce")
    }

    @Test fun `saveDraft is blocked before the network when a room is unpersistable`() = runTest {
        var called = false
        val v = vm(saveDraft = SaveDraftUseCase { _, _ -> called = true; Result.success("x") })
        advanceUntilIdle()
        v.addRoom(); val id = v.state.value.rows[0].id
        v.setWidthText(id, "4")
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

    /**
     * `SaveProjectDraftSchema.clientPhone` is `min(3)` and required. Without this refusal the empty
     * phone goes on the wire, the server answers 422, and the operator reads the generic
     * «Маълумот нотўғри» — which names no field at all.
     */
    @Test fun `saveDraft is refused before the network when there is no phone`() = runTest {
        var called = false
        val v = vm(saveDraft = SaveDraftUseCase { _, _ -> called = true; Result.success("x") })
        advanceUntilIdle()
        v.addPricedRoom()          // a perfectly good room, but nobody to save it for

        v.saveDraft()
        advanceUntilIdle()

        assertFalse(called, "an empty phone must block the save before it ever reaches the use case")
        assertEquals("Мижоз телефон рақамини киритинг", v.state.value.error)
        assertNull(v.state.value.projectId)
    }

    /** Parity with placement's own five refusals: `rooms` DEFAULTS to `[]` on the draft route, so
     *  an empty save is accepted server-side and creates a project holding nothing. */
    @Test fun `saveDraft is refused before the network when there are no rooms`() = runTest {
        var called = false
        val v = vm(saveDraft = SaveDraftUseCase { _, _ -> called = true; Result.success("x") })
        advanceUntilIdle()
        v.setClientPhoneDigits("901234567")

        v.saveDraft()
        advanceUntilIdle()

        assertFalse(called)
        assertEquals("Камида битта хона керак", v.state.value.error)
    }

    /** `clientName` is `max(120)` and `clientAddress` `max(200)` on both routes. Over-long values
     *  are impossible to enter rather than rejected later — an over-long value queued offline is a
     *  permanent 422 whose message is the server's English "Validation failed". */
    @Test fun `the client name and address are capped at the schema's own limits`() = runTest {
        val v = vm(); advanceUntilIdle()

        v.setClientName("а".repeat(200))
        assertEquals(120, v.state.value.clientName.length)

        v.setClientViloyat("Тошкент вилояти"); v.setClientTuman("Юнусобод тумани")
        v.setClientStreet("к".repeat(400))
        val composed = uz.etalon.crm.core.ui.regions.composeAddress(
            v.state.value.clientAddress.viloyat, v.state.value.clientAddress.tuman, v.state.value.clientAddress.street,
        )
        assertEquals(200, composed.length, "the street takes exactly the room the address still had")
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
        v.readyToSave()

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
        v.readyToSave()
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

    /**
     * The mirror of the test above, and the case the value-based `filter { it != EMPTY_DRAFT }`
     * silently swallowed: the operator deleting the LAST room is a real write, not clearAll's
     * leftovers. Dropped, the rooms stayed in Room and came back on the next restart.
     */
    @Test fun `deleting every room by hand clears the Room row instead of leaving the rooms in it`() = runTest {
        var upserts = 0
        var deletes = 0
        val v = vm(persistDraft = PersistDraftUseCase { upserts++ }, clearDraft = ClearDraftUseCase { deletes++ })
        advanceUntilIdle()
        v.addRoom()
        advanceTimeBy(600); advanceUntilIdle()
        assertEquals(1, upserts)
        assertEquals(0, deletes)

        v.deleteRoom(v.state.value.rows.single().id)
        advanceTimeBy(600); advanceUntilIdle()

        assertEquals(1, upserts, "an empty quote is a delete, not a row to write")
        assertEquals(1, deletes, "without this the deleted rooms are still in Room")
    }

    /** The same thing end to end, against a store the two ViewModels share: type a room, delete it,
     *  restart. The rooms must be gone. */
    @Test fun `a quote emptied by hand does not resurrect after a restart`() = runTest {
        var stored: CalculatorDraft? = null
        val persist = PersistDraftUseCase { d -> stored = d }
        val clear = ClearDraftUseCase { stored = null }

        val v = vm(observeDraft = ObserveDraftUseCase { flowOf(null) }, persistDraft = persist, clearDraft = clear)
        advanceUntilIdle()
        v.addRoom()
        advanceTimeBy(600); advanceUntilIdle()
        assertNotNull(stored, "the room reached Room in the first place")

        v.deleteRoom(v.state.value.rows.single().id)
        advanceTimeBy(600); advanceUntilIdle()

        val restarted = vm(observeDraft = ObserveDraftUseCase { flowOf(stored) }, persistDraft = persist, clearDraft = clear)
        advanceUntilIdle()

        assertTrue(restarted.state.value.rows.isEmpty(), "the rooms the operator deleted must not come back")
    }

    /** The autosave debounce is 500 ms wide; a save started at the beginning of one lands after the
     *  operator has already typed more. Writing the CAPTURED draft back would undo that much of
     *  their work every time a save returns. */
    @Test fun `a save's own write carries the edits made while it was in flight`() = runTest {
        val saveResult = CompletableDeferred<Result<String>>()
        val writes = mutableListOf<CalculatorDraft>()
        val v = vm(saveDraft = SaveDraftUseCase { _, _ -> saveResult.await() }, persistDraft = PersistDraftUseCase { d -> writes += d })
        advanceUntilIdle()
        v.readyToSave()

        v.saveDraft()
        v.addRoom()                 // the operator keeps working while the request is out
        val typedDuring = v.state.value.rows.size

        saveResult.complete(Result.success("proj-1"))
        advanceUntilIdle()

        // The save's OWN write — the first one carrying the id it just received, before the
        // autosave debounce that follows it writes the same state again.
        val saveWrite = writes.first { it.projectId == "proj-1" }
        assertEquals(typedDuring, saveWrite.rows.size, "the room added mid-save must survive the save's own write")
    }

    // ── Task 8: the Idempotency-Key fingerprints the wire, not the local draft ─────

    @Test fun `a retry of the same submission sends the same idempotency key`() = runTest {
        val keys = mutableListOf<String>()
        val v = vm(saveDraft = SaveDraftUseCase { _, key -> keys += key; Result.failure(java.io.IOException("dropped")) })
        advanceUntilIdle()
        v.readyToSave()

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
        v.readyToSave()

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
        v.readyToSave()
        v.saveDraft(); advanceUntilIdle()

        val second = mutableListOf<String>()
        val restored = vm(saveDraft = SaveDraftUseCase { _, key -> second += key; Result.success("proj-1") }, saved = saved)
        advanceUntilIdle()
        restored.readyToSave()
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
        v.readyToSave()

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
        val id = v.readyToSave()

        v.saveDraft(); advanceUntilIdle()
        v.setLengthText(id, "6,5")
        v.saveDraft(); advanceUntilIdle()

        assertEquals(2, keys.size)
        assertNotEquals(keys[0], keys[1])
    }

    @Test fun `a successful save mints a new key for the next one, because projectId is now set`() = runTest {
        val keys = mutableListOf<String>()
        val v = vm(saveDraft = SaveDraftUseCase { _, key -> keys += key; Result.success("proj-1") })
        advanceUntilIdle()
        v.readyToSave()

        v.saveDraft(); advanceUntilIdle()
        v.saveDraft(); advanceUntilIdle()

        assertEquals(2, keys.size)
        assertNotEquals(keys[0], keys[1], "the second save is an UPDATE — a stale key would replay the CREATE response")
    }

    /**
     * `ROOM_SEQ_REGEX` took the FIRST digit group, so a room the operator had renamed
     * «2-қават Хона 5» handed back 2 — and the next room added was «Хона 5» all over again. Two
     * rooms with one name are indistinguishable in the photo of the screen the customer is sent.
     */
    @Test fun `numbering after a restore reads the room's own number, not the first digits in its name`() = runTest {
        val restored = CalculatorDraft(
            rows = listOf(
                recomputeRow(SlabRow(id = "r1", name = "2-қават Хона 5", innerWidth = 4.0, innerLength = 6.0)),
                recomputeRow(SlabRow(id = "r2", name = "Болалар хонаси", innerWidth = 4.0, innerLength = 6.0)),
            ),
            clientPhone = "998901234567", clientName = "Aziz", clientAddress = "",
            discountPercent = 0.0, discountAmount = 0.0, deliveryCost = 0.0, otherCost = 0.0, projectId = null,
        )
        val v = vm(observeDraft = ObserveDraftUseCase { flowOf(restored) })
        advanceUntilIdle()

        v.addRoom()

        assertEquals("Хона 6", v.state.value.rows.last().name, "a number already on screen must never be reused")
    }

    /** Rows price against `DEFAULT_PRICE_CONFIG` until the bootstrap `Pricing` lands — a coroutine
     *  race in `init`. If the owner has edited a tier, a cold-start operator would quote, and share
     *  a PNG of, the WRONG price unless every row already on screen is re-priced when it arrives.
     *  `BoundaryTest` only proves the exported default pricing agrees with the default config,
     *  which is precisely the one case that cannot catch this. */
    @Test fun `an owner-edited pricing re-prices every row already on screen`() = runTest {
        val pricing = MutableStateFlow<Pricing?>(null)
        val v = CalculatorViewModel(
            session = object : SessionPricing { override val pricing: StateFlow<Pricing?> = pricing },
            permissions = PermissionGate { true },
            clients = ClientsRepository(object : FakeEtalonApi() {}, PermissionGate { true }),
        )
        advanceUntilIdle()
        val id = v.addPricedRoom()   // 4.0 × 6.0 — a 4.30 beam, so the first m² tier

        val atDefault = v.state.value.rows.single { it.id == id }.result!!
        assertEquals(140_000.0, atDefault.m2Price, "until the catalogue lands, the engine's own default")

        val edited = defaultAndroidPricing().let { p ->
            p.copy(m2Tiers = p.m2Tiers.mapIndexed { i, t -> if (i == 0) t.copy(price = Money.parse("155000")) else t })
        }
        pricing.value = edited
        advanceUntilIdle()

        val repriced = v.state.value.rows.single { it.id == id }.result!!
        assertEquals(155_000.0, repriced.m2Price, "the owner's tier, not the default")
        assertTrue(repriced.subtotal > atDefault.subtotal, "the whole row re-runs, not just its rate")
        assertEquals(repriced.subtotal, v.state.value.totals.projTotal.roomsSubtotal, "and the totals with it")
        assertEquals(repriced.subtotal, v.state.value.orderTotals.totalPrice)
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

    /**
     * Save, then order. The placement must carry the projectId the save returned, or the server
     * creates a SECOND `DRAFT` Project for the very same quote — one duplicate row in production
     * per save-then-order. The ViewModel is what has to keep that id and hand it on.
     */
    @Test fun `an order placed after a save carries the saved projectId`() = runTest {
        var sent: PlaceOrderInput? = null
        val v = vm(
            saveDraft = SaveDraftUseCase { _, _ -> Result.success("proj-9") },
            placeOrder = PlaceOrderUseCase { input, _ -> sent = input; Result.success("order-1") },
        )
        advanceUntilIdle()
        v.readyToPlace()

        v.saveDraft(); advanceUntilIdle()
        assertEquals("proj-9", v.state.value.projectId)

        v.placeOrder(scheduledAt, ""); advanceUntilIdle()

        assertEquals("proj-9", sent!!.draft.projectId)
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
        v.setWidthText(extras, "4")
        v.setExtraBeams(extras, 2)

        v.placeOrder(scheduledAt, ""); advanceUntilIdle()

        assertFalse(called)
        assertEquals("Бу хоналарни сақлаб бўлмайди: Хона 2", v.state.value.error)
    }

    /**
     * The trap the server's 24 h idempotency TTL sets. The SAME customer ordering the SAME rooms
     * for the SAME day again — which happens — replayed the first order's response and was
     * silently never placed, because nothing ever released the key that submission had pinned.
     */
    @Test fun `an identical repeat order gets its own key instead of replaying the first`() = runTest {
        val keys = mutableListOf<String>()
        val v = vm(placeOrder = PlaceOrderUseCase { _, key -> keys += key; Result.success("order-1") })
        advanceUntilIdle()

        v.identicalQuote()
        v.placeOrder(scheduledAt, ""); advanceUntilIdle()
        v.consumePlacedOrder()

        v.identicalQuote()
        v.placeOrder(scheduledAt, ""); advanceUntilIdle()

        assertEquals(2, keys.size)
        assertNotEquals(keys[0], keys[1], "two real orders, not one answered twice")
    }

    /** «Тозалаш» ends the quote a key belongs to, the same way a placement does. */
    @Test fun `Тозалаш releases the draft key, so the same quote typed again is a new submission`() = runTest {
        val keys = mutableListOf<String>()
        val v = vm(saveDraft = SaveDraftUseCase { _, key -> keys += key; Result.success("proj-1") })
        advanceUntilIdle()

        v.identicalQuote()
        v.saveDraft(); advanceUntilIdle()

        v.clearAll(); advanceUntilIdle()

        v.identicalQuote()
        v.saveDraft(); advanceUntilIdle()

        assertEquals(2, keys.size)
        assertNotEquals(keys[0], keys[1])
    }

    // ── The delivery-date grid (design §7) ──────────────────────────

    /**
     * Stands in for `CapacityRepository`, its per-month cache included.
     *
     * [fetches] counts what would be a network call reached through `observe` — a month the picker
     * pages back to must not raise it — and [refreshes] counts the forced ones, which is how the
     * "every opening re-fetches, every ‹ › does not" rule is measured. [fails] is the offline
     * server: nothing is ever cached, and the month arrives as [Resource.Error].
     */
    private class FakeCapacity(private val fails: Boolean = false) : CapacitySource {
        var fetches = 0
        var refreshes = 0
        private val cache = mutableMapOf<YearMonth, CapacityMonth>()
        override fun observe(month: YearMonth): Flow<Resource<CapacityMonth>> = flow {
            cache[month]?.let { emit(Resource.Success(it)); return@flow }
            emit(Resource.Loading(null))
            fetches++
            if (fails) emit(Resource.Error(null, AppError.Network("Интернет алоқаси йўқ")))
            else emit(Resource.Success(monthOf(month).also { cache[month] = it }))
        }
        override suspend fun refresh(month: YearMonth): Result<Unit> {
            refreshes++
            if (fails) return Result.failure(IllegalStateException("offline"))
            cache[month] = monthOf(month)
            return Result.success(Unit)
        }
        private fun monthOf(m: YearMonth) =
            CapacityMonth(m, gridRange(m), emptyMap(), CapacityThresholds.DEFAULT)
    }

    /** The grid opens on the month of the day already promised — not on today's, which would make
     *  the operator page back to the date they can see in the field. */
    @Test fun `openDateGrid opens on the picked date's month`() = runTest {
        val v = vm(capacity = FakeCapacity())
        advanceUntilIdle()

        // Relative to the clock, never a literal date: the picker's own ‹ floor is «this month»,
        // and a hard-coded 2026 would start failing on its own one morning.
        val month = YearMonth.now(TASHKENT).plusMonths(3)
        v.openDateGrid(month.atDay(20))
        advanceUntilIdle()

        assertEquals(month, v.state.value.dateGrid?.cursor)
    }

    /**
     * The place-order sheet's own prefetch: the month behind a date the sheet RESTORED (it is
     * `rememberSaveable`, so it outlives a process death that took `capacityMonths` with it)
     * arrives without the grid being opened, and the tier tag beside «Етказиб бериш санаси» is
     * there to be drawn. Nothing about the picker changes — `dateGrid` stays null.
     */
    @Test fun `prefetchCapacity fills the month behind a restored date without opening the grid`() = runTest {
        val cap = FakeCapacity()
        val v = vm(capacity = cap)
        advanceUntilIdle()

        val month = YearMonth.now(TASHKENT).plusMonths(2)
        v.prefetchCapacity(month)
        advanceUntilIdle()

        assertEquals(month, v.state.value.capacityMonths[month]?.month)
        assertNotNull(tierOfDate(v.state.value.capacityMonths[month], month.atDay(20)))
        assertNull(v.state.value.dateGrid, "a prefetch is not an opening")
    }

    /** A month already in hand is not fetched again: the usual case is a day the operator just
     *  picked on the grid, whose month the grid cached on the way. */
    @Test fun `prefetchCapacity does not re-fetch a month already in hand`() = runTest {
        val cap = FakeCapacity()
        val v = vm(capacity = cap)
        advanceUntilIdle()

        val month = YearMonth.now(TASHKENT).plusMonths(1)
        v.openDateGrid(month.atDay(20)); advanceUntilIdle()
        v.closeDateGrid()
        val fetched = cap.fetches

        v.prefetchCapacity(month); advanceUntilIdle()
        assertEquals(fetched, cap.fetches)
    }

    /** Nothing picked yet: the month being lived in. */
    @Test fun `openDateGrid with no date opens on this month`() = runTest {
        val v = vm(capacity = FakeCapacity())
        advanceUntilIdle()

        v.openDateGrid(null)
        advanceUntilIdle()

        assertEquals(YearMonth.now(TASHKENT), v.state.value.dateGrid?.cursor)
    }

    /** The month arrives through the seam and lands both on the grid and in the session's own
     *  cache — the second is what keeps the tier tag beside the field after the grid has closed. */
    @Test fun `the month is observed through the source and kept`() = runTest {
        val cap = FakeCapacity()
        val v = vm(capacity = cap)
        advanceUntilIdle()

        val month = YearMonth.now(TASHKENT).plusMonths(1)
        v.openDateGrid(month.atDay(20))
        advanceUntilIdle()

        assertEquals(month, v.state.value.dateGrid?.capacity?.dataOrNull?.month)
        v.closeDateGrid()
        assertNull(v.state.value.dateGrid)
        // Closed, and the month is still in hand.
        assertEquals(month, v.state.value.capacityMonths[month]?.month)
    }

    /** ‹ › move the cursor and fetch each new month once; coming back to one already in hand
     *  costs nothing — and neither ‹ nor › ever forces a refresh (I1's other half). */
    @Test fun `paging fetches a month once and refreshes nothing`() = runTest {
        val cap = FakeCapacity()
        val v = vm(capacity = cap)
        advanceUntilIdle()

        val month = YearMonth.now(TASHKENT).plusMonths(1)
        v.openDateGrid(month.atDay(20)); advanceUntilIdle()
        v.dateGridNext(); advanceUntilIdle()
        assertEquals(month.plusMonths(1), v.state.value.dateGrid?.cursor)
        v.dateGridPrev(); advanceUntilIdle()
        assertEquals(month, v.state.value.dateGrid?.cursor)

        assertEquals(1, cap.fetches, "only the month paged INTO was fetched")
        assertEquals(1, cap.refreshes, "the opening refreshed; the two page taps did not")
        // And the opened month is on the card again, straight from the cache.
        assertEquals(month, v.state.value.dateGrid?.capacity?.dataOrNull?.month)
    }

    /**
     * **I1.** Every opening re-fetches the cursor month: the figures decide which day the customer
     * is promised, and another operator's order lands in them between two openings.
     */
    @Test fun `re-opening the same month refreshes it`() = runTest {
        val cap = FakeCapacity()
        val v = vm(capacity = cap)
        advanceUntilIdle()

        val day = YearMonth.now(TASHKENT).plusMonths(1).atDay(20)
        v.openDateGrid(day); advanceUntilIdle()
        v.closeDateGrid()
        v.openDateGrid(day); advanceUntilIdle()

        assertEquals(2, cap.refreshes)
        assertEquals(YearMonth.from(day), v.state.value.dateGrid?.capacity?.dataOrNull?.month)
    }

    /** The banner's retry asks again for the month on the card. */
    @Test fun `retryDateGrid refreshes the cursor month`() = runTest {
        val cap = FakeCapacity(fails = true)
        val v = vm(capacity = cap)
        advanceUntilIdle()

        v.openDateGrid(null); advanceUntilIdle()
        v.retryDateGrid(); advanceUntilIdle()

        assertEquals(2, cap.refreshes)
    }

    /**
     * **R17, in the ViewModel.** The server is down: the grid still opens, on the right month,
     * carrying the error for the sheet's banner — and nothing about it stops a date being picked
     * (the sheet owns the picked date; what this proves is that no month lands in
     * [CalculatorUiState.capacityMonths], so `tierOfDate` has nothing to invent a tier from).
     */
    @Test fun `R17 a failed month still opens the grid and names no tier`() = runTest {
        val cap = FakeCapacity(fails = true)
        val v = vm(capacity = cap)
        advanceUntilIdle()

        val month = YearMonth.now(TASHKENT).plusMonths(1)
        v.openDateGrid(month.atDay(20))
        advanceUntilIdle()

        val grid = v.state.value.dateGrid
        assertNotNull(grid)
        assertEquals(month, grid?.cursor)
        assertTrue(grid?.capacity is Resource.Error, "the sheet draws its banner off this")
        assertTrue(v.state.value.capacityMonths.isEmpty(), "no month, so no tier tag")
        assertNull(tierOfDate(v.state.value.capacityMonths[month], month.atDay(20)))
    }

    /** ‹ stops at the current month: a delivery date before today cannot be picked anyway, and a
     *  picker that pages into last year is one the operator has to page out of again. */
    @Test fun `the grid does not page into the past`() = runTest {
        val v = vm(capacity = FakeCapacity())
        advanceUntilIdle()

        v.openDateGrid(null); advanceUntilIdle()
        val thisMonth = YearMonth.now(TASHKENT)
        assertEquals(thisMonth, v.state.value.dateGrid?.cursor)

        v.dateGridPrev(); advanceUntilIdle()
        assertEquals(thisMonth, v.state.value.dateGrid?.cursor)

        // Forward and back is still allowed, down to this month and no further.
        v.dateGridNext(); advanceUntilIdle()
        assertEquals(thisMonth.plusMonths(1), v.state.value.dateGrid?.cursor)
        v.dateGridPrev(); advanceUntilIdle()
        assertEquals(thisMonth, v.state.value.dateGrid?.cursor)
    }

    /** ‹ › while the grid is closed are dead — a callback from a sheet that has gone must not
     *  bring it back. */
    @Test fun `paging a closed grid does nothing`() = runTest {
        val v = vm(capacity = FakeCapacity())
        advanceUntilIdle()

        v.dateGridNext(); v.dateGridPrev(); advanceUntilIdle()

        assertNull(v.state.value.dateGrid)
    }
}
