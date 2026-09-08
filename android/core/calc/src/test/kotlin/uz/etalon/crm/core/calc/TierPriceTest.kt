package uz.etalon.crm.core.calc

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class TierPriceTest {
    @Test fun `tierPrice clamps above the last tier and honours the epsilon at a boundary`() {
        val t = DEFAULT_PRICE_CONFIG.m2PriceTiers
        assertEquals(140000.0, tierPrice(4.3, t))
        assertEquals(140000.0, tierPrice(4.0 + 2 * 0.15, t)) // 4.3 computed, not literal
        assertEquals(160000.0, tierPrice(4.3000001, t))
        assertEquals(230000.0, tierPrice(9.0, t))
    }

    @Test fun `autoPickPattern thresholds match the engine`() {
        assertEquals(AutoPick(Pattern.GB, false), autoPickPattern(0.0))
        assertEquals(AutoPick(Pattern.BGB, false), autoPickPattern(0.20))
        assertEquals(AutoPick(Pattern.GBG, false), autoPickPattern(0.45))
        assertEquals(AutoPick(Pattern.GB, true), autoPickPattern(0.4500001))
    }
}
