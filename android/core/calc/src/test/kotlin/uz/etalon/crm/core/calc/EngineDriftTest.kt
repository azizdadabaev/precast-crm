package uz.etalon.crm.core.calc

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File
import uz.etalon.crm.core.calc.gazoblok.DEFAULT_GLUE_BAG_KG
import uz.etalon.crm.core.calc.gazoblok.DEFAULT_GLUE_KG_PER_M2
import uz.etalon.crm.core.calc.gazoblok.DEFAULT_JOINT_MM
import uz.etalon.crm.core.calc.gazoblok.DEFAULT_WASTE_PCT

/**
 * A golden-vector regeneration re-runs the parity suite (`build.gradle.kts` declares both JSON
 * files as `Test` inputs). But a constant edited in `calculation-engine.ts` / `gazoblok-engine.ts`
 * WITHOUT a regeneration leaves the vector file and the Kotlin port agreeing with each other while
 * both are wrong — nothing catches that, because the parity tests never read the TS source itself.
 *
 * So, same technique as `:core:network`'s `ServerContractTest`: this reads the REAL TypeScript
 * sources (declared as `Test` inputs in `build.gradle.kts`, same as the golden JSON) and asserts
 * their `export const` values still equal this module's Kotlin constants. Comments are stripped
 * first so a stale doc-comment example number can't be mistaken for the live value.
 *
 * It is deliberately narrow: physical constants, the two price-tier tables, `BLOCK_UNIT_PRICE`,
 * and the four gazoblok defaults — exactly the values a factory/pricing change would touch without
 * necessarily touching a test input, and therefore without necessarily regenerating a vector.
 */
class EngineDriftTest {

    // ── locating the server sources ───────────────────────────────

    /** Walks up from this module to the repo root, the same way `ServerContractTest` does. */
    private fun repoRoot(): File {
        var dir: File? = File(System.getProperty("user.dir") ?: ".").absoluteFile
        while (dir != null) {
            if (File(dir, "precast-crm/src/services/calculation-engine.ts").isFile) return dir
            dir = dir.parentFile
        }
        bail(
            "Could not find precast-crm/src from ${System.getProperty("user.dir")}. This test " +
                "reads the real engine sources; the Android modules live in the same repository.",
        )
    }

    private fun serverFile(relative: String): String {
        val f = File(repoRoot(), relative)
        assertTrue(f.isFile, "missing server source: $relative")
        return stripComments(f.readText())
    }

    private fun bail(message: String): Nothing = throw AssertionError(message)

    private fun stripComments(s: String): String = s
        .replace(Regex("""/\*.*?\*/""", RegexOption.DOT_MATCHES_ALL), "")
        .replace(Regex("""(?m)//.*$"""), "")

    // ── constant extraction ─────────────────────────────────────────

    /** Reads `export const NAME = 1_234.5;`, underscores stripped, as a [Double]. */
    private fun numberConstant(source: String, name: String): Double {
        val m = Regex("""export const $name\s*=\s*(-?[\d_]+(?:\.[\d_]+)?)\s*;""").find(source)
            ?: bail("no `export const $name = ...;` — the constant was renamed or removed")
        return m.groupValues[1].replace("_", "").toDouble()
    }

    /** Reads a `PriceTier[]` literal: `export const NAME: readonly PriceTier[] = [ { max_beam_length: X, price: Y }, ... ] as const;`. */
    private fun tierTable(source: String, name: String): List<PriceTier> {
        val head = Regex("""export const $name\s*:[^=]*=\s*\[""").find(source)
            ?: bail("no `export const $name: ... = [...]` — the tier table was renamed or removed")
        val body = bracketed(source, head.range.last)
        val entries = Regex("""max_beam_length:\s*(-?[\d_.]+),\s*price:\s*(-?[\d_.]+)""").findAll(body)
            .map { PriceTier(it.groupValues[1].replace("_", "").toDouble(), it.groupValues[2].replace("_", "").toDouble()) }
            .toList()
        assertTrue(entries.isNotEmpty(), "no tier entries found in `$name`")
        return entries
    }

    /** The text between the `[` at [open] and its matching `]`. */
    private fun bracketed(source: String, open: Int): String {
        var depth = 0
        for (i in open until source.length) {
            when (source[i]) {
                '[' -> depth++
                ']' -> if (--depth == 0) return source.substring(open + 1, i)
            }
        }
        bail("unbalanced brackets from offset $open")
    }

    // ── calculation-engine.ts ───────────────────────────────────────

    @Test
    fun `the eight physical constants still match calculation-engine ts`() {
        val src = serverFile("precast-crm/src/services/calculation-engine.ts")
        assertEquals(Calc.PITCH, numberConstant(src, "PITCH"), "PITCH")
        assertEquals(Calc.BEAM_WIDTH, numberConstant(src, "BEAM_WIDTH"), "BEAM_WIDTH")
        assertEquals(Calc.BLOCK_LENGTH, numberConstant(src, "BLOCK_LENGTH"), "BLOCK_LENGTH")
        assertEquals(Calc.BLOCK_VISIBLE, numberConstant(src, "BLOCK_VISIBLE"), "BLOCK_VISIBLE")
        assertEquals(Calc.TOPPING_THICKNESS, numberConstant(src, "TOPPING_THICKNESS"), "TOPPING_THICKNESS")
        assertEquals(Calc.DEFAULT_BEARING, numberConstant(src, "DEFAULT_BEARING"), "DEFAULT_BEARING")
        assertEquals(Calc.SMALL_REMAINDER, numberConstant(src, "SMALL_REMAINDER"), "SMALL_REMAINDER")
        assertEquals(Calc.MEDIUM_REMAINDER, numberConstant(src, "MEDIUM_REMAINDER"), "MEDIUM_REMAINDER")
    }

    @Test
    fun `both price tier tables still match calculation-engine ts`() {
        val src = serverFile("precast-crm/src/services/calculation-engine.ts")
        assertEquals(DEFAULT_PRICE_CONFIG.m2PriceTiers, tierTable(src, "M2_PRICE_TIERS"), "M2_PRICE_TIERS")
        assertEquals(DEFAULT_PRICE_CONFIG.extraBeamPriceTiers, tierTable(src, "EXTRA_BEAM_PRICE_TIERS"), "EXTRA_BEAM_PRICE_TIERS")
    }

    @Test
    fun `BLOCK_UNIT_PRICE still matches calculation-engine ts`() {
        val src = serverFile("precast-crm/src/services/calculation-engine.ts")
        assertEquals(DEFAULT_PRICE_CONFIG.blockUnitPrice, numberConstant(src, "BLOCK_UNIT_PRICE"), "BLOCK_UNIT_PRICE")
    }

    // ── gazoblok-engine.ts ───────────────────────────────────────────

    @Test
    fun `the gazoblok defaults still match gazoblok-engine ts`() {
        val src = serverFile("precast-crm/src/services/gazoblok-engine.ts")
        assertEquals(DEFAULT_WASTE_PCT, numberConstant(src, "DEFAULT_WASTE_PCT"), "DEFAULT_WASTE_PCT")
        assertEquals(DEFAULT_JOINT_MM, numberConstant(src, "DEFAULT_JOINT_MM"), "DEFAULT_JOINT_MM")
        assertEquals(DEFAULT_GLUE_KG_PER_M2, numberConstant(src, "DEFAULT_GLUE_KG_PER_M2"), "DEFAULT_GLUE_KG_PER_M2")
        assertEquals(DEFAULT_GLUE_BAG_KG, numberConstant(src, "DEFAULT_GLUE_BAG_KG"), "DEFAULT_GLUE_BAG_KG")
    }
}
