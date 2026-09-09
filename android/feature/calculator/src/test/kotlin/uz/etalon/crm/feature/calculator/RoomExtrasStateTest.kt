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
import uz.etalon.crm.core.calc.M2_OVERRIDE_TIERS
import uz.etalon.crm.core.calc.Pattern
import uz.etalon.crm.core.data.ClientsRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.SessionPricing
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.PriceTier
import uz.etalon.crm.core.model.Pricing
import uz.etalon.crm.core.testing.FakeEtalonApi
import uz.etalon.crm.feature.calculator.KeypadTarget.Field.LENGTH
import uz.etalon.crm.feature.calculator.KeypadTarget.Field.WIDTH
import java.math.BigDecimal

/** A [SessionPricing] that already holds a value — no bootstrap round trip to fake. */
private class RoomExtrasFakeSessionPricing(pricing: Pricing?) : SessionPricing {
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

/** «Қўшимча»'s ViewModel-level contract — Task 5's brief, verbatim. `room(v)` reads the id of the
 *  single room `addRoom()` already placed at `rows[0]`; it does not add a second one. */
@ExperimentalCoroutinesApi
class RoomExtrasStateTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    private fun vm() = CalculatorViewModel(
        session = RoomExtrasFakeSessionPricing(defaultAndroidPricing()),
        permissions = PermissionGate { true },
        clients = ClientsRepository(object : FakeEtalonApi() {}, PermissionGate { true }),
    )

    private fun room(v: CalculatorViewModel): String = v.state.value.rows[0].id

    /** Whole metres only, so plain digits are enough — no comma parsing to get right here. */
    private fun setDims(v: CalculatorViewModel, id: String, width: Double, length: Double) {
        v.openKeypad(KeypadTarget(id, WIDTH))
        width.toInt().toString().forEach(v::keypadDigit)
        v.commitKeypad()
        v.openKeypad(KeypadTarget(id, LENGTH))
        length.toInt().toString().forEach(v::keypadDigit)
        v.commitKeypad()
    }

    @Test fun `changing bearing or correction recomputes the row immediately`() = runTest {
        val v = vm(); v.addRoom(); val id = room(v); setDims(v, id, 4.0, 6.0)
        val before = v.state.value.rows[0].result!!.beamLength
        v.setBearing(id, 0.20)
        assertNotEquals(before, v.state.value.rows[0].result!!.beamLength)
    }
    @Test fun `a pattern override takes precedence and Авто gives it back`() = runTest {
        val v = vm(); v.addRoom(); val id = room(v); setDims(v, id, 4.0, 6.0)
        v.setPattern(id, Pattern.GBG)
        assertEquals(Pattern.GBG, v.state.value.rows[0].result!!.pattern)
        v.setPattern(id, null)
        assertEquals(v.state.value.rows[0].result!!.patternAuto, v.state.value.rows[0].result!!.pattern)
    }
    @Test fun `applying an override stores the reason and clearing wipes both`() = runTest {
        val v = vm(); v.addRoom(); val id = room(v); setDims(v, id, 4.0, 6.0)
        v.applyRateOverride(id, 230_000.0, "Йирик буюртма")
        val r = v.state.value.rows[0]
        assertTrue(r.m2PriceOverride); assertEquals(230_000.0, r.m2PriceOverrideValue)
        assertEquals("Йирик буюртма", r.m2PriceReason); assertEquals(230_000.0, r.result!!.m2Price)
        v.clearRateOverride(id)
        val c = v.state.value.rows[0]
        // The wire refuses a value or reason while m2PriceOverride is false (validation.ts:206).
        assertFalse(c.m2PriceOverride); assertNull(c.m2PriceOverrideValue); assertNull(c.m2PriceReason)
    }
    @Test fun `a blank reason is refused — the override is never applied without one`() = runTest {
        val v = vm(); v.addRoom(); val id = room(v); setDims(v, id, 4.0, 6.0)
        v.applyRateOverride(id, 230_000.0, "   ")
        assertFalse(v.state.value.rows[0].m2PriceOverride)
    }
    @Test fun `the override picker offers exactly the five static catalogue tiers`() {
        assertEquals(listOf(140_000.0, 160_000.0, 180_000.0, 200_000.0, 230_000.0), M2_OVERRIDE_TIERS.map { it.price })
    }
}
