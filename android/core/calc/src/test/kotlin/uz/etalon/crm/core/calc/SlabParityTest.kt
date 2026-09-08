package uz.etalon.crm.core.calc

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory

/**
 * Replays every case in `docs/api/calc-golden.json` — the vectors the server exports by running
 * the real `calculation-engine.ts` — against this Kotlin port of `calculateSlab`. Table-driven
 * over every field by its wire name, so a field the port forgot cannot pass. Doubles are compared
 * with no delta: a mismatch means the port is wrong, never the vector.
 */
class SlabParityTest {

    @TestFactory
    fun `every slab golden vector replays bit for bit`() = GoldenVectors.slab.cases.map { c ->
        DynamicTest.dynamicTest(c.name) {
            // A case's own `pricing` (an owner-edited PriceConfig) wins when present — this is
            // what proves calculateSlab actually reads its priceConfig argument rather than
            // silently falling back to DEFAULT_PRICE_CONFIG; see GoldenVectors.SlabCase.pricing.
            val priceConfig = (c.pricing ?: GoldenVectors.slab.pricing).toPriceConfig()
            val r = calculateSlab(c.input.toSlabInput(), priceConfig)
            val actual = r.toWireMap() // Map<String, Any> keyed by the 28 snake_case names
            assertEquals(c.result.keys, actual.keys, "field set")
            for ((k, expected) in c.result) assertEquals(expected.asKotlin(), actual[k], "${c.name}: $k")
        }
    }

    @Test
    fun `the vector file carries exactly the 66 cases the exporter produced, and every result has 28 fields`() {
        assertEquals(66, GoldenVectors.slab.cases.size)
        GoldenVectors.slab.cases.forEach { assertEquals(28, it.result.size, it.name) }
    }

    @Test
    fun `the golden vector file is version 1`() {
        assertEquals(1, GoldenVectors.slab.version)
    }

    @Test
    fun `the golden pricing block matches the module's default price config`() {
        assertEquals(DEFAULT_PRICE_CONFIG, GoldenVectors.slab.pricing.toPriceConfig())
    }
}

/** Decodes a case's raw `input` object into a [SlabInput]. Also used by BoundaryTest. */
fun Map<String, JsonPrimitive>.toSlabInput(): SlabInput = SlabInput(
    innerWidth = getValue("inner_width").double,
    innerLength = getValue("inner_length").double,
    bearing = this["bearing"]?.double,
    pattern = this["pattern"]?.content?.let { Pattern.valueOf(it) },
    correction = this["correction"]?.double,
    extraBeams = this["extra_beams"]?.int,
    forceStartBeam = this["force_start_beam"]?.boolean,
)

/** Decodes the golden file's `pricing` block into a [PriceConfig]. Also used by BoundaryTest. */
fun JsonObject.toPriceConfig(): PriceConfig = PriceConfig(
    m2PriceTiers = getValue("m2_price_tiers").jsonArray.map { it.jsonObject.toPriceTier() },
    extraBeamPriceTiers = getValue("extra_beam_price_tiers").jsonArray.map { it.jsonObject.toPriceTier() },
    blockUnitPrice = getValue("block_unit_price").jsonPrimitive.double,
)

private fun JsonObject.toPriceTier(): PriceTier = PriceTier(
    maxBeamLength = getValue("max_beam_length").jsonPrimitive.double,
    price = getValue("price").jsonPrimitive.double,
)

/**
 * Decodes one wire value for comparison against [SlabResult.toWireMap]'s output: a `String` for
 * the pattern fields, a `Boolean` for the two flags, and `Double` for every number — the JSON has
 * no int/double distinction, so this always widens to `Double` to match [toWireMap]'s count
 * fields, which do the same on the way out.
 */
private fun JsonPrimitive.asKotlin(): Any = when {
    isString -> content
    content == "true" || content == "false" -> boolean
    else -> double
}
