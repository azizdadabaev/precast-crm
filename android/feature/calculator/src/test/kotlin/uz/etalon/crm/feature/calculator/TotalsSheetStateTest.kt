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
private class TotalsSheetFakeSessionPricing(pricing: Pricing?) : SessionPricing {
    override val pricing: StateFlow<Pricing?> = MutableStateFlow(pricing)
}

/** Same wire strings the server sends for the default tiers, built the way `:core:data`'s
 *  `SessionMappers` builds a `Pricing` — see `CalculatorViewModelTest`'s copy of this helper. */
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

/** Task-6 brief, verbatim. Adds one room and sets its ЭНИ/БЎЙИ through the docked keypad, the same
 *  path a real operator drives — comma-decimal, unlike `RoomExtrasStateTest`'s whole-metre-only
 *  `setDims`, since this brief's own vectors need a fractional width (`4.03`). */
@ExperimentalCoroutinesApi
class TotalsSheetStateTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    private fun vm() = CalculatorViewModel(
        session = TotalsSheetFakeSessionPricing(defaultAndroidPricing()),
        permissions = PermissionGate { true },
    )

    /** Adds a new room and drives its ЭНИ/БЎЙИ through the docked keypad — comma-decimal text, so
     *  a fractional width like `4.03` round-trips the same way a real keystroke sequence would. */
    private fun addRoom(v: CalculatorViewModel, width: Double, length: Double) {
        v.addRoom()
        val id = v.state.value.rows.last().id
        v.openKeypad(KeypadTarget(id, WIDTH))
        width.toString().replace('.', ',').forEach(v::keypadDigit)
        v.commitKeypad()
        v.openKeypad(KeypadTarget(id, LENGTH))
        length.toString().replace('.', ',').forEach(v::keypadDigit)
        v.commitKeypad()
    }

    @Test fun `the two discount modes are mutually exclusive, as the engine resolves them`() = runTest {
        val v = vm(); addRoom(v, 4.0, 6.0)
        v.setDiscountMode(DiscountMode.PERCENT); v.setDiscountPercent(10.0)
        assertEquals(0.0, v.state.value.discountAmount)
        v.setDiscountMode(DiscountMode.AMOUNT); v.setDiscountAmount(50_000.0)
        assertEquals(0.0, v.state.value.discountPercent, "switching mode clears the other field")
        assertEquals(50_000.0, v.state.value.totals.projTotal.discountAmount)
    }
    @Test fun `the percent is clamped to 0 through 100`() = runTest {
        val v = vm(); addRoom(v, 4.0, 6.0); v.setDiscountPercent(140.0)
        assertEquals(100.0, v.state.value.discountPercent)
    }
    @Test fun `weight is monolith area times 180`() = runTest {
        val v = vm(); addRoom(v, 4.0, 6.0)
        assertEquals(v.state.value.totals.monolithArea * 180.0, v.state.value.totalWeightKg)
    }
    @Test fun `round all up applies the grid to every row that has a width`() = runTest {
        val v = vm(); addRoom(v, 4.03, 6.0); v.addRoom()
        v.setGrid(Grid.CM10); v.roundAllWidthsUp()
        assertEquals(4.1, v.state.value.rows[0].innerWidth)
        assertEquals(0.0, v.state.value.rows[1].innerWidth, "a row with no width is left alone")
    }

    // ── delivery/other must visibly move the headline total ────────────

    @Test fun `delivery and other cost move orderTotals totalPrice but not projTotal total`() = runTest {
        val v = vm(); addRoom(v, 4.0, 6.0)
        val before = v.state.value.orderTotals.totalPrice
        val beforeProjTotal = v.state.value.totals.projTotal.total
        v.setDeliveryCost(150_000.0); v.setOtherCost(25_000.0)
        assertEquals(before + 175_000.0, v.state.value.orderTotals.totalPrice)
        assertEquals(beforeProjTotal, v.state.value.totals.projTotal.total, "projTotal never includes delivery/other")
    }
    @Test fun `delivery and other cost are never negative`() = runTest {
        val v = vm(); addRoom(v, 4.0, 6.0)
        v.setDeliveryCost(-1.0); v.setOtherCost(-1.0)
        assertEquals(0.0, v.state.value.deliveryCost)
        assertEquals(0.0, v.state.value.otherCost)
    }
}
