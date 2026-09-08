package uz.etalon.crm.core.calc

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
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
data class SlabCase(
    val name: String,
    val input: Map<String, JsonPrimitive>,
    val result: Map<String, JsonPrimitive>,
)

data class SlabGolden(
    val version: Int,
    val pricing: JsonObject,
    val cases: List<SlabCase>,
)

/**
 * Loads the golden vectors the server exports for parity testing against the Kotlin port of
 * `calculation-engine.ts`. `build.gradle.kts` declares `docs/api/calc-golden.json` as a `Test`
 * task input so Gradle re-runs this suite whenever the server regenerates the file — without
 * that declaration a parity break sails through as "up to date".
 */
object GoldenVectors {
    val slab: SlabGolden by lazy { loadSlab() }

    private fun loadSlab(): SlabGolden {
        val root = Json.parseToJsonElement(goldenFile("calc-golden.json").readText()).jsonObject
        val cases = root.getValue("cases").jsonArray.map { element ->
            val case = element.jsonObject
            SlabCase(
                name = case.getValue("name").jsonPrimitive.content,
                input = case.getValue("input").jsonObject.mapValues { it.value.jsonPrimitive },
                result = case.getValue("result").jsonObject.mapValues { it.value.jsonPrimitive },
            )
        }
        return SlabGolden(
            version = root.getValue("version").jsonPrimitive.int,
            pricing = root.getValue("pricing").jsonObject,
            cases = cases,
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
