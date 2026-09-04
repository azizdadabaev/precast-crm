package uz.etalon.crm.core.data

import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.PriceTier
import uz.etalon.crm.core.network.dto.BootstrapDto
import java.math.BigDecimal

class SessionMappersTest {
    private val json = Json { ignoreUnknownKeys = true }

    private fun bootstrapJson(m2Tier: String, blockUnitPrice: String) = """
        {"me":{"id":"u1","name":"Азиз","role":"SALES","permissions":["order.view"],"mustChangePassword":false},
         "pricing":{"m2PriceTiers":[$m2Tier],"extraBeamPriceTiers":[{"max_beam_length":4.3,"price":25000}],
                    "blockUnitPrice":$blockUnitPrice},
         "capacityThresholds":{"low":1,"moderate":2,"heavy":3},
         "regionsVersion":"1","minSupportedAppVersion":"0.1.0","serverTime":"2026-09-04T00:00:00Z"}
    """.trimIndent()

    @Test fun `a pricing tier keeps the server's exact decimal digits`() {
        val b = json.decodeFromString(BootstrapDto.serializer(), bootstrapJson("""{"max_beam_length":4.3,"price":140000}""", "13500.5")).toDomain()
        assertEquals(PriceTier(BigDecimal("4.3"), Money.parse("140000")), b.pricing.m2Tiers.single())
        assertEquals(Money.parse("13500.5"), b.pricing.blockUnitPrice)
    }

    /** A price beyond Double's exact-integer range proves nothing is routed through a float. */
    @Test fun `a very large price survives without float rounding`() {
        val b = json.decodeFromString(BootstrapDto.serializer(), bootstrapJson("""{"max_beam_length":6,"price":9007199254740993}""", "1")).toDomain()
        assertEquals(Money.parse("9007199254740993"), b.pricing.m2Tiers.single().price)
        assertEquals(BigDecimal("6"), b.pricing.m2Tiers.single().maxBeamLength)
    }
}
