package uz.etalon.crm.core.calc

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.double
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.File

/**
 * One case from `docs/api/calc-golden.json`: a named slab input/result pair the server produced
 * by running the real `calculation-engine.ts`. Every field of `input` and `result` is kept as a
 * raw [JsonPrimitive] — undecoded — so a later parity test can assert each field of the engine's
 * output by name against whatever this Kotlin port computes, rather than this loader silently
 * dropping a field nobody remembered to type into a hand-written data class.
 */
/**
 * [pricing] is non-null only for the handful of cases the exporter computed against an
 * owner-edited [PriceConfig] rather than [SlabGolden.pricing] (`docs/api/calc-golden.json`'s
 * `export-calc-golden.ts` header comment documents the schema) — proving `calculateSlab` actually
 * honours its `priceConfig` argument rather than silently reading the module default. A `null`
 * here means "computed with `SlabGolden.pricing`", same as every case before this field existed.
 */
data class SlabCase(
    val name: String,
    val input: Map<String, JsonPrimitive>,
    val result: Map<String, JsonPrimitive>,
    val pricing: JsonObject?,
)

data class SlabGolden(
    val version: Int,
    val pricing: JsonObject,
    val cases: List<SlabCase>,
)

/**
 * One case from `calc-golden.json`'s `project` block: [projectTotal] replayed over a list of
 * room SUBTOTALS rather than full [SlabResult]s — `projectTotal` only ever reads `room.subtotal`,
 * so the exporter (see the header comment in `precast-crm/scripts/export-calc-golden.ts`) records
 * a plain `number[]` and this loader builds dummy rooms carrying only that field.
 *
 * [discountAmountOverride] is `null` only when the wire value is JSON `null`; a wire `0` decodes
 * to `0.0`, not `null`. Two vectors exist specifically to pin that distinction — an override of
 * `0` and of a negative number both fall through to the percent branch because `projectTotal`
 * tests `> 0`, not "is present" — so collapsing JSON `null` and `0` here would make those two
 * vectors indistinguishable from every case that omits an override.
 */
data class ProjectCase(
    val name: String,
    val roomSubtotals: List<Double>,
    val discountPercent: Double,
    val discountAmountOverride: Double?,
    val result: Map<String, JsonPrimitive>,
)

data class ProjectGolden(val cases: List<ProjectCase>)

/**
 * One room of an [OrderTotalsCase]. Every case in this block leaves [bearing]/[correction]/etc. at
 * the engine's defaults — only [innerWidth]/[innerLength] and, for the one case that exercises a
 * per-row rate override, [m2PriceOverride]/[m2PriceOverrideValue] ever carry a non-default wire
 * value — so the parity test builds each row with [SlabRow]'s own defaults via [recomputeRow]
 * (which is also where [applyRateOverride] bakes an override into `result.subtotal`), exactly as
 * `CalculatorViewModel` does.
 */
data class OrderTotalsRoomInput(
    val innerWidth: Double,
    val innerLength: Double,
    val m2PriceOverride: Boolean,
    val m2PriceOverrideValue: Double?,
)

/**
 * One case from `calc-golden.json`'s `orderTotals` block: `computeOrderTotals` (order-totals.ts)
 * replayed over real room geometry — unlike [ProjectCase] above, this function runs the engine
 * itself, so the exporter records `RoomInput`-shaped rooms rather than pre-computed subtotals (see
 * the header comment in `precast-crm/scripts/export-calc-golden.ts`).
 */
data class OrderTotalsCase(
    val name: String,
    val rooms: List<OrderTotalsRoomInput>,
    val discountPercent: Double,
    val discountAmount: Double,
    val deliveryCost: Double,
    val otherCost: Double,
    val result: Map<String, JsonPrimitive>,
)

data class OrderTotalsGolden(val cases: List<OrderTotalsCase>)

/**
 * One case from `docs/api/gazoblok-golden.json`. Unlike [SlabCase], `gazoblok-engine.ts` exports
 * several distinct functions (`fn`) with different input shapes and result shapes — some a bare
 * number, some a nested object, some an object with array fields — so `input`/`result` are kept
 * as raw [JsonElement]s for the parity test to decode per `fn`, rather than flattened into a
 * `Map<String, JsonPrimitive>` the way the single-shaped slab cases are.
 */
data class GazoblokCase(
    val name: String,
    val fn: String,
    val input: JsonObject,
    val result: JsonElement,
)

/** One case from `gazoblok-golden.json`'s `rejects` — the exception type is always
 *  [uz.etalon.crm.core.calc.gazoblok.GazoblokError]; [error] is that exception's message,
 *  captured verbatim from the real thrown error. */
data class GazoblokReject(
    val name: String,
    val fn: String,
    val input: JsonObject,
    val error: String,
)

data class GazoblokGolden(
    val version: Int,
    val catalogue: JsonObject,
    val cases: List<GazoblokCase>,
    val rejects: List<GazoblokReject>,
)

/**
 * Loads the golden vectors the server exports for parity testing against the Kotlin port of
 * `calculation-engine.ts`. `build.gradle.kts` declares `docs/api/calc-golden.json` as a `Test`
 * task input so Gradle re-runs this suite whenever the server regenerates the file — without
 * that declaration a parity break sails through as "up to date".
 */
object GoldenVectors {
    val slab: SlabGolden by lazy { parseSlab(calcGoldenRoot) }
    val project: ProjectGolden by lazy { parseProject(calcGoldenRoot) }
    val orderTotals: OrderTotalsGolden by lazy { parseOrderTotals(calcGoldenRoot) }
    val gazoblok: GazoblokGolden by lazy { loadGazoblok() }

    /** `calc-golden.json` parsed once; [slab] and [project] both read off this same root instead
     *  of each re-reading and re-parsing the file. */
    private val calcGoldenRoot: JsonObject by lazy {
        Json.parseToJsonElement(goldenFile("calc-golden.json").readText()).jsonObject
    }

    private fun parseSlab(root: JsonObject): SlabGolden {
        val cases = root.getValue("cases").jsonArray.map { element ->
            val case = element.jsonObject
            SlabCase(
                name = case.getValue("name").jsonPrimitive.content,
                input = case.getValue("input").jsonObject.mapValues { it.value.jsonPrimitive },
                result = case.getValue("result").jsonObject.mapValues { it.value.jsonPrimitive },
                pricing = case["pricing"]?.jsonObject,
            )
        }
        return SlabGolden(
            version = root.getValue("version").jsonPrimitive.int,
            pricing = root.getValue("pricing").jsonObject,
            cases = cases,
        )
    }

    private fun parseProject(root: JsonObject): ProjectGolden {
        val cases = root.getValue("project").jsonObject.getValue("cases").jsonArray.map { element ->
            val case = element.jsonObject
            val input = case.getValue("input").jsonObject
            val overrideElement = input.getValue("discount_amount_override")
            ProjectCase(
                name = case.getValue("name").jsonPrimitive.content,
                roomSubtotals = input.getValue("room_subtotals").jsonArray.map { it.jsonPrimitive.double },
                discountPercent = input.getValue("discount_percent").jsonPrimitive.double,
                discountAmountOverride = if (overrideElement is JsonNull) null else overrideElement.jsonPrimitive.double,
                result = case.getValue("result").jsonObject.mapValues { it.value.jsonPrimitive },
            )
        }
        return ProjectGolden(cases = cases)
    }

    private fun parseOrderTotals(root: JsonObject): OrderTotalsGolden {
        val cases = root.getValue("orderTotals").jsonObject.getValue("cases").jsonArray.map { element ->
            val case = element.jsonObject
            val input = case.getValue("input").jsonObject
            val rooms = input.getValue("rooms").jsonArray.map {
                val room = it.jsonObject
                OrderTotalsRoomInput(
                    innerWidth = room.getValue("innerWidth").jsonPrimitive.double,
                    innerLength = room.getValue("innerLength").jsonPrimitive.double,
                    m2PriceOverride = room["m2PriceOverride"]?.jsonPrimitive?.boolean ?: false,
                    m2PriceOverrideValue = room["m2PriceOverrideValue"]?.jsonPrimitive?.double,
                )
            }
            OrderTotalsCase(
                name = case.getValue("name").jsonPrimitive.content,
                rooms = rooms,
                discountPercent = input.getValue("discount_percent").jsonPrimitive.double,
                discountAmount = input.getValue("discount_amount").jsonPrimitive.double,
                deliveryCost = input.getValue("delivery_cost").jsonPrimitive.double,
                otherCost = input.getValue("other_cost").jsonPrimitive.double,
                result = case.getValue("result").jsonObject.mapValues { it.value.jsonPrimitive },
            )
        }
        return OrderTotalsGolden(cases = cases)
    }

    private fun loadGazoblok(): GazoblokGolden {
        val root = Json.parseToJsonElement(goldenFile("gazoblok-golden.json").readText()).jsonObject
        val cases = root.getValue("cases").jsonArray.map { element ->
            val case = element.jsonObject
            GazoblokCase(
                name = case.getValue("name").jsonPrimitive.content,
                fn = case.getValue("fn").jsonPrimitive.content,
                input = case.getValue("input").jsonObject,
                result = case.getValue("result"),
            )
        }
        val rejects = root.getValue("rejects").jsonArray.map { element ->
            val reject = element.jsonObject
            GazoblokReject(
                name = reject.getValue("name").jsonPrimitive.content,
                fn = reject.getValue("fn").jsonPrimitive.content,
                input = reject.getValue("input").jsonObject,
                error = reject.getValue("error").jsonPrimitive.content,
            )
        }
        return GazoblokGolden(
            version = root.getValue("version").jsonPrimitive.int,
            catalogue = root.getValue("catalogue").jsonObject,
            cases = cases,
            rejects = rejects,
        )
    }

    /**
     * Walks up from the module's working directory until a `docs/api` directory holding [name]
     * exists, rather than hardcoding `../../` — that breaks the moment Gradle's working
     * directory differs between the IDE and the CLI.
     */
    private fun goldenFile(name: String): File {
        var dir: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        while (dir != null) {
            val candidate = File(dir, "docs/api/$name")
            if (candidate.isFile) return candidate
            dir = dir.parentFile
        }
        error("Could not locate docs/api/$name by walking up from ${System.getProperty("user.dir")}")
    }
}
