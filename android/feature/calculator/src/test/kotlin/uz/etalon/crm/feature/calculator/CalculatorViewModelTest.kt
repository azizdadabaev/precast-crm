package uz.etalon.crm.feature.calculator

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.SessionPricing
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.PriceTier
import uz.etalon.crm.core.model.Pricing
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
     *  `BoundaryTest` already pins. */
    private fun vm(canWrite: Boolean = true) = CalculatorViewModel(
        session = FakeSessionPricing(defaultAndroidPricing()),
        permissions = PermissionGate { it == "order.create" && canWrite },
    )

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
}
