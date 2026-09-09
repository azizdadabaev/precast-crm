package uz.etalon.crm.core.calc

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class RateOverrideTest {
    private val base = recomputeRow(SlabRow("r", "Хона 1", innerWidth = 4.0, innerLength = 6.0))

    @Test fun `an override replaces m2_price and recomputes m2_cost and subtotal only`() {
        val auto = base.result!!
        val over = recomputeRow(base.copy(m2PriceOverride = true, m2PriceOverrideValue = 230_000.0, m2PriceReason = "Такрорий мижоз"))
        val r = over.result!!
        assertEquals(230_000.0, r.m2Price)
        assertEquals(round2(r.billedArea * 230_000.0), r.m2Cost)
        assertEquals(round2(r.m2Cost + r.patternExtraCost + r.manualExtraBeamsCost), r.subtotal)
        // Everything the override must NOT touch.
        assertEquals(auto.billedArea, r.billedArea); assertEquals(auto.beamCount, r.beamCount)
        assertEquals(auto.patternExtraCost, r.patternExtraCost); assertEquals(auto.manualExtraBeamsCost, r.manualExtraBeamsCost)
    }
    @Test fun `a value that is not a catalogue tier is ignored, as on the web`() {
        val r = recomputeRow(base.copy(m2PriceOverride = true, m2PriceOverrideValue = 155_000.0)).result!!
        assertEquals(base.result!!.m2Price, r.m2Price)
    }
    @Test fun `autoPickedRate recovers the tier rate even while overridden`() {
        val auto = base.result!!.m2Price
        assertEquals(auto, autoPickedRate(recomputeRow(base.copy(m2PriceOverride = true, m2PriceOverrideValue = 230_000.0))))
        assertEquals(0.0, autoPickedRate(SlabRow("x", "Хона 2")))
    }
}
