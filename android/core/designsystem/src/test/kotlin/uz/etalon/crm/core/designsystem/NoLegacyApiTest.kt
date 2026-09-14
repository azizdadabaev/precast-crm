package uz.etalon.crm.core.designsystem

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * The phase-1 shim is gone; this is what keeps it gone. Phase 1 mapped the old vocabulary onto the
 * new palette so that screens could be redrawn one at a time, and every one of those aliases
 * carried a KDoc promising it would be deleted at the end of phase 5. A promise in a KDoc is not a
 * rule — this test is, the same way [NoRawHexTest] is the rule behind `EtalonColors`' own claim.
 *
 * Each banned name is a way to bypass the design system rather than read it:
 *
 *  - `LegacyTokens`, `LocalEtalonColors`, `EtalonType.mono*` — the phase-1 shim itself.
 *  - `MaterialTheme.colorScheme` / `MaterialTheme.typography` — M3's own tables. [EtalonTheme] maps
 *    §1.1 onto them so a stock Material component inherits something sensible; an Etalon component
 *    that reads them back is reading the mapping instead of the token, and a token change then
 *    reaches one of the two.
 *  - `androidx.compose.material.icons` — Material's icon set. The app draws `EtalonIcons`, whose
 *    glyphs are the design file's; one stray Material icon is a different stroke weight in a row of
 *    matched ones.
 *  - `StatusStripeCard`, `SectionLabel` and the six `*Chip` composables — the components the
 *    restyle replaced. `StatusTag` and friends, `FormCard` and a plain `sectionTitle` heading are
 *    what stands in their place.
 *
 * Scope, mechanism and the comment caveat are [NoRawHexTest]'s exactly: every module's `src/main`,
 * `.kt` only, `build/` excluded, and the scan is textual — a banned name written in a **comment**
 * is flagged like any other, so describe the old component in prose without naming it. Test sources
 * are excluded on purpose: this file names all thirteen.
 *
 * The files it walks are declared as inputs of this module's `Test` tasks in
 * `core/designsystem/build.gradle.kts`, so planting one of these in a feature module fails a warm
 * build and not only a cold one.
 */
class NoLegacyApiTest {
    /**
     * `LocalEtalonColors` was allowed in the file that provided it. Nothing provides it any more —
     * the allowance is kept so the rule reads the way the plan states it, and so that re-adding the
     * composition local still has exactly one legal home.
     */
    private val allowedIn = mapOf("LocalEtalonColors" to "EtalonTheme.kt")

    private val repoRoot: File =
        generateSequence(File(".").absoluteFile) { it.parentFile }
            .first { File(it, "settings.gradle.kts").exists() }

    /** The literal names, not a regex each: every one of them is a plain identifier. */
    private val banned = listOf(
        "LegacyTokens",
        "LocalEtalonColors",
        "EtalonType.mono",
        "MaterialTheme.colorScheme",
        "MaterialTheme.typography",
        "androidx.compose.material.icons",
        "StatusStripeCard",
        "SectionLabel",
        "StatusChip(",
        "PaymentStatusChip",
        "DiscrepancyStatusChip",
        "ShipmentStatusChip",
        "DriverStatusChip",
    )

    private val mainSrc = "${File.separator}src${File.separator}main${File.separator}"
    private val buildDir = "${File.separator}build${File.separator}"

    @Test fun `no file names a retired design-system API`() {
        val offenders = repoRoot.walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .filter { it.path.contains(mainSrc) }
            .filterNot { it.path.contains(buildDir) }
            .flatMap { file ->
                val text = file.readText()
                banned.asSequence()
                    .filter { name -> allowedIn[name] != file.name }
                    .filter { name -> text.contains(name) }
                    .map { name -> "${file.relativeTo(repoRoot).path}: $name" }
            }
            .toList()
        assertTrue(
            offenders.isEmpty(),
            "retired design-system APIs are still named:\n${offenders.joinToString("\n")}",
        )
    }

    /** A lint that silently stopped matching is worse than none; this pins what the list sees. */
    @Test fun `the ban list still catches what it is meant to catch`() {
        val flagged = listOf(
            "import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors",
            "style = EtalonType.monoTitle",
            "color = MaterialTheme.colorScheme.primary",
            "style = MaterialTheme.typography.bodyLarge",
            "import androidx.compose.material.icons.Icons",
            "StatusStripeCard(stripe = c) {}",
            "SectionLabel(title)",
            "StatusChip(status = s)",
            "PaymentStatusChip(p)",
            "DiscrepancyStatusChip(d)",
            "ShipmentStatusChip(s)",
            "DriverStatusChip(active)",
        )
        val ignored = listOf(
            "StatusTag(status, TagSurface.ROW_ON_LIGHT)",
            "PaymentStatusTag(status)",
            "style = EtalonType.amountLg",
            "import androidx.compose.material3.MaterialTheme",
            "color = EtalonColors.ink",
        )
        flagged.forEach { line ->
            assertTrue(banned.any { line.contains(it) }, "should have been flagged: $line")
        }
        ignored.forEach { line ->
            assertTrue(banned.none { line.contains(it) }, "should not have been flagged: $line")
        }
    }
}
