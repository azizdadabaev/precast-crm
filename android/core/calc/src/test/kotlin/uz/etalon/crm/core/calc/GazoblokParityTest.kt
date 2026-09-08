package uz.etalon.crm.core.calc

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.DynamicTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.TestFactory
import org.junit.jupiter.api.assertThrows
import uz.etalon.crm.core.calc.gazoblok.BlockOrderTotal
import uz.etalon.crm.core.calc.gazoblok.BlockProduct
import uz.etalon.crm.core.calc.gazoblok.GazoblokError
import uz.etalon.crm.core.calc.gazoblok.LabelledBlockProduct
import uz.etalon.crm.core.calc.gazoblok.Opening
import uz.etalon.crm.core.calc.gazoblok.OpeningKind
import uz.etalon.crm.core.calc.gazoblok.OrderLineInput
import uz.etalon.crm.core.calc.gazoblok.ProjectEstimateOpts
import uz.etalon.crm.core.calc.gazoblok.ProjectEstimateResult
import uz.etalon.crm.core.calc.gazoblok.WallEstimateInput
import uz.etalon.crm.core.calc.gazoblok.WallEstimateResult
import uz.etalon.crm.core.calc.gazoblok.WallInput
import uz.etalon.crm.core.calc.gazoblok.WallOrientation
import uz.etalon.crm.core.calc.gazoblok.blockVolumeM3
import uz.etalon.crm.core.calc.gazoblok.blocksPerM3
import uz.etalon.crm.core.calc.gazoblok.estimateProject
import uz.etalon.crm.core.calc.gazoblok.estimateWall
import uz.etalon.crm.core.calc.gazoblok.lineTotal
import uz.etalon.crm.core.calc.gazoblok.orderTotal
import uz.etalon.crm.core.calc.gazoblok.pricePerM3
import uz.etalon.crm.core.calc.gazoblok.toWireMap

/**
 * Replays every case in `docs/api/gazoblok-golden.json` — the vectors the server exports by
 * running the real `gazoblok-engine.ts` — against this Kotlin port. Dispatches on the case's `fn`
 * to the matching Kotlin function and asserts every result field by name; doubles compared with
 * no delta — a mismatch means the port is wrong, never the vector.
 */
class GazoblokParityTest {

    @TestFactory
    fun `every gazoblok golden vector replays bit for bit`() = GoldenVectors.gazoblok.cases.map { c ->
        DynamicTest.dynamicTest(c.name) { assertCase(c) }
    }

    @TestFactory
    fun `every gazoblok rejection vector throws GazoblokError with the verbatim message`() =
        GoldenVectors.gazoblok.rejects.map { c ->
            DynamicTest.dynamicTest(c.name) {
                val ex = assertThrows<GazoblokError>(c.name) { invokeForReject(c.fn, c.input) }
                assertEquals(c.error, ex.message, c.name)
            }
        }

    @Test
    fun `the vector file carries the 26 cases and 8 rejects Task 4's exporter produced`() {
        assertTrue(GoldenVectors.gazoblok.cases.size >= 26, "cases")
        assertTrue(GoldenVectors.gazoblok.rejects.size >= 8, "rejects")
    }

    @Test
    fun `the golden vector file is version 1`() {
        assertEquals(1, GoldenVectors.gazoblok.version)
    }
}

// ── Dispatch ─────────────────────────────────────────────────────

private fun assertCase(c: GazoblokCase) {
    when (c.fn) {
        "blockVolumeM3" -> assertEquals(c.result.jsonPrimitive.double, blockVolumeM3(c.input.toBlockProduct()), c.name)
        "pricePerM3" -> assertEquals(c.result.jsonPrimitive.double, pricePerM3(c.input.toBlockProduct()), c.name)
        "blocksPerM3" -> assertEquals(c.result.jsonPrimitive.double, blocksPerM3(c.input.toBlockProduct()), c.name)
        "estimateWall" -> assertWallResult(c)
        "lineTotal" -> assertEquals(
            c.result.jsonPrimitive.double,
            lineTotal(c.input.getValue("unitPrice").jsonPrimitive.double, c.input.getValue("quantity").jsonPrimitive.double),
            c.name,
        )
        "orderTotal" -> assertOrderTotalResult(c)
        "estimateProject" -> assertEstimateProjectResult(c)
        else -> error("GazoblokParityTest: no dispatch for fn '${c.fn}' (${c.name})")
    }
}

/** Calls the engine function a reject case names, purely for its thrown [GazoblokError] — the
 *  return value (if any) is discarded. Covers every `fn` that appears in the golden file's
 *  `rejects` list. */
private fun invokeForReject(fn: String, input: JsonObject) {
    when (fn) {
        "blockVolumeM3" -> blockVolumeM3(input.toBlockProduct())
        "pricePerM3" -> pricePerM3(input.toBlockProduct())
        "blocksPerM3" -> blocksPerM3(input.toBlockProduct())
        "estimateWall" -> estimateWall(
            input.getValue("product").jsonObject.toBlockProduct(),
            input.getValue("wall").jsonObject.toWallEstimateInput(),
        )
        "lineTotal" -> lineTotal(input.getValue("unitPrice").jsonPrimitive.double, input.getValue("quantity").jsonPrimitive.double)
        "orderTotal" -> callOrderTotal(input)
        "estimateProject" -> callEstimateProject(input)
        else -> error("GazoblokParityTest: no dispatch for fn '$fn'")
    }
}

// ── estimateWall ─────────────────────────────────────────────────

/** Also used by BoundaryTest, to get a real [WallEstimateResult] to run through `.money()`. */
fun callEstimateWall(input: JsonObject): WallEstimateResult =
    estimateWall(input.getValue("product").jsonObject.toBlockProduct(), input.getValue("wall").jsonObject.toWallEstimateInput())

private fun assertWallResult(c: GazoblokCase) {
    val r: WallEstimateResult = callEstimateWall(c.input)
    val expected = c.result.jsonObject
    assertEquals(expected.keys, r.toWireMap().keys, "${c.name}: field set")
    assertEquals(expected.getValue("wallAreaM2").jsonPrimitive.double, r.wallAreaM2, "${c.name}: wallAreaM2")
    assertEquals(expected.getValue("blockFaceAreaM2").jsonPrimitive.double, r.blockFaceAreaM2, "${c.name}: blockFaceAreaM2")
    assertEquals(expected.getValue("wastePct").jsonPrimitive.double, r.wastePct, "${c.name}: wastePct")
    assertEquals(expected.getValue("blocksNeeded").jsonPrimitive.int, r.blocksNeeded, "${c.name}: blocksNeeded")
    assertEquals(expected.getValue("volumeM3").jsonPrimitive.double, r.volumeM3, "${c.name}: volumeM3")
    assertEquals(expected.getValue("price").jsonPrimitive.double, r.price, "${c.name}: price")
}

// ── orderTotal ───────────────────────────────────────────────────

/** Also used by BoundaryTest, to get a real [BlockOrderTotal] to run through `.money()`. */
fun callOrderTotal(input: JsonObject): BlockOrderTotal {
    val lines = input.getValue("lines").jsonArray.map {
        val o = it.jsonObject
        OrderLineInput(unitPrice = o.getValue("unitPrice").jsonPrimitive.double, quantity = o.getValue("quantity").jsonPrimitive.double)
    }
    val opts = input.getValue("opts").jsonObject
    return orderTotal(
        lines = lines,
        discountPercent = opts["discountPercent"]?.jsonPrimitive?.double ?: 0.0,
        discountAmount = opts["discountAmount"]?.jsonPrimitive?.double ?: 0.0,
        deliveryCost = opts["deliveryCost"]?.jsonPrimitive?.double ?: 0.0,
    )
}

private fun assertOrderTotalResult(c: GazoblokCase) {
    val r = callOrderTotal(c.input)
    val expected = c.result.jsonObject
    assertEquals(expected.keys, r.toWireMap().keys, "${c.name}: field set")
    assertEquals(expected.getValue("linesSubtotal").jsonPrimitive.double, r.linesSubtotal, "${c.name}: linesSubtotal")
    assertEquals(expected.getValue("discountPercent").jsonPrimitive.double, r.discountPercent, "${c.name}: discountPercent")
    assertEquals(expected.getValue("discountAmount").jsonPrimitive.double, r.discountAmount, "${c.name}: discountAmount")
    assertEquals(expected.getValue("deliveryCost").jsonPrimitive.double, r.deliveryCost, "${c.name}: deliveryCost")
    assertEquals(expected.getValue("total").jsonPrimitive.double, r.total, "${c.name}: total")
    assertEquals(expected.getValue("totalBlocks").jsonPrimitive.double, r.totalBlocks, "${c.name}: totalBlocks")
}

// ── estimateProject ──────────────────────────────────────────────

/** Also used by BoundaryTest, to get a real [ProjectEstimateResult] to run through `.money()`. */
fun callEstimateProject(input: JsonObject): ProjectEstimateResult {
    val walls = input.getValue("walls").jsonArray.map { it.jsonObject.toWallInput() }
    val products = input.getValue("products").jsonObject.toProductsMap()
    val opts = input.getValue("opts").jsonObject.toProjectEstimateOpts()
    return estimateProject(walls, products, opts)
}

/** Asserts [ProjectEstimateResult.perSize] both by content AND by array position — `perSize` is
 *  sorted by price, and a wrong (unstable, or reordering) sort would still pass a set-based
 *  comparison while breaking the UI's block-size ordering. */
private fun assertEstimateProjectResult(c: GazoblokCase) {
    val r = callEstimateProject(c.input)
    val expected = c.result.jsonObject
    assertEquals(expected.keys, r.toWireMap().keys, "${c.name}: field set")

    val expectedPerSize = expected.getValue("perSize").jsonArray
    assertEquals(expectedPerSize.size, r.perSize.size, "${c.name}: perSize length")
    expectedPerSize.forEachIndexed { i, el ->
        val eo = el.jsonObject
        val a = r.perSize[i]
        assertEquals(eo.getValue("productId").jsonPrimitive.content, a.productId, "${c.name}: perSize[$i].productId")
        assertEquals(eo.getValue("label").jsonPrimitive.content, a.label, "${c.name}: perSize[$i].label")
        assertEquals(eo.getValue("netAreaM2").jsonPrimitive.double, a.netAreaM2, "${c.name}: perSize[$i].netAreaM2")
        assertEquals(eo.getValue("blocksNeeded").jsonPrimitive.int, a.blocksNeeded, "${c.name}: perSize[$i].blocksNeeded")
        assertEquals(eo.getValue("volumeM3").jsonPrimitive.double, a.volumeM3, "${c.name}: perSize[$i].volumeM3")
        assertEquals(eo.getValue("price").jsonPrimitive.double, a.price, "${c.name}: perSize[$i].price")
    }

    val glue = expected.getValue("glue").jsonObject
    assertEquals(glue.getValue("netAreaM2").jsonPrimitive.double, r.glue.netAreaM2, "${c.name}: glue.netAreaM2")
    assertEquals(glue.getValue("kg").jsonPrimitive.double, r.glue.kg, "${c.name}: glue.kg")
    assertEquals(glue.getValue("bags").jsonPrimitive.int, r.glue.bags, "${c.name}: glue.bags")

    assertEquals(expected.getValue("totalBlocks").jsonPrimitive.int, r.totalBlocks, "${c.name}: totalBlocks")
    assertEquals(expected.getValue("totalVolumeM3").jsonPrimitive.double, r.totalVolumeM3, "${c.name}: totalVolumeM3")
    assertEquals(expected.getValue("totalPrice").jsonPrimitive.double, r.totalPrice, "${c.name}: totalPrice")

    val expectedWarnings = expected.getValue("warnings").jsonArray
    assertEquals(expectedWarnings.size, r.warnings.size, "${c.name}: warnings length")
    expectedWarnings.forEachIndexed { i, el ->
        val eo = el.jsonObject
        val a = r.warnings[i]
        assertEquals(eo.getValue("wallId").jsonPrimitive.content, a.wallId, "${c.name}: warnings[$i].wallId")
        assertEquals(eo.getValue("code").jsonPrimitive.content, a.code.name, "${c.name}: warnings[$i].code")
        assertEquals(eo.getValue("message").jsonPrimitive.content, a.message, "${c.name}: warnings[$i].message")
    }
}

// ── Input decoding ───────────────────────────────────────────────

/** Also used by BoundaryTest, to decode a `pricePerM3`/`estimateWall` case's product input. */
fun JsonObject.toBlockProduct(): BlockProduct = BlockProduct(
    lengthM = getValue("lengthM").jsonPrimitive.double,
    heightM = getValue("heightM").jsonPrimitive.double,
    thicknessM = getValue("thicknessM").jsonPrimitive.double,
    pricePerBlock = getValue("pricePerBlock").jsonPrimitive.double,
)

private fun JsonObject.toWallEstimateInput(): WallEstimateInput = WallEstimateInput(
    lengthM = getValue("lengthM").jsonPrimitive.double,
    heightM = getValue("heightM").jsonPrimitive.double,
    openingsM2 = this["openingsM2"]?.jsonPrimitive?.double,
    wastePct = this["wastePct"]?.jsonPrimitive?.double,
)

private fun JsonObject.toOpening(): Opening = Opening(
    kind = OpeningKind.valueOf(getValue("kind").jsonPrimitive.content),
    widthM = getValue("widthM").jsonPrimitive.double,
    heightM = getValue("heightM").jsonPrimitive.double,
    qty = getValue("qty").jsonPrimitive.int,
)

private fun JsonObject.toWallInput(): WallInput = WallInput(
    id = getValue("id").jsonPrimitive.content,
    lengthM = getValue("lengthM").jsonPrimitive.double,
    heightM = getValue("heightM").jsonPrimitive.double,
    productId = getValue("productId").jsonPrimitive.content,
    openings = this["openings"]?.jsonArray?.map { it.jsonObject.toOpening() } ?: emptyList(),
    orientation = this["orientation"]?.jsonPrimitive?.content?.let { WallOrientation.valueOf(it) },
)

private fun JsonObject.toLabelledBlockProduct(): LabelledBlockProduct = LabelledBlockProduct(
    lengthM = getValue("lengthM").jsonPrimitive.double,
    heightM = getValue("heightM").jsonPrimitive.double,
    thicknessM = getValue("thicknessM").jsonPrimitive.double,
    pricePerBlock = getValue("pricePerBlock").jsonPrimitive.double,
    label = getValue("label").jsonPrimitive.content,
)

/** Decodes to a `LinkedHashMap`, preserving the JSON object's key order — `JsonObject` itself is
 *  order-preserving, so a plain iteration keeps the server's declared product order intact. */
private fun JsonObject.toProductsMap(): Map<String, LabelledBlockProduct> {
    val map = LinkedHashMap<String, LabelledBlockProduct>()
    for ((k, v) in this) map[k] = v.jsonObject.toLabelledBlockProduct()
    return map
}

private fun JsonObject.toProjectEstimateOpts(): ProjectEstimateOpts = ProjectEstimateOpts(
    jointMm = this["jointMm"]?.jsonPrimitive?.double,
    wastePct = this["wastePct"]?.jsonPrimitive?.double,
    glueKgPerM2 = this["glueKgPerM2"]?.jsonPrimitive?.double,
    glueBagKg = this["glueBagKg"]?.jsonPrimitive?.double,
)
