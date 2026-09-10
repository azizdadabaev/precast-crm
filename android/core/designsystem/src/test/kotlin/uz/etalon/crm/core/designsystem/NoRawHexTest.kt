package uz.etalon.crm.core.designsystem

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Design §8 / acceptance: every colour in the app resolves to a token. A `Color(0x…)` anywhere but
 * `EtalonColors.kt` is a colour that no theme change can reach, and this project has already
 * shipped one design system whose "tokens" were half bypassed by literals. `EtalonColors`' own
 * KDoc has claimed since Task 1 that a stray literal fails the build — this is the test that
 * makes the claim true.
 *
 * Scope is `src/main` only. Test sources are excluded on purpose: a screenshot fixture may need a
 * throwaway colour to prove a component tints what it is handed, and that colour never ships.
 *
 * `Color.White`, `Color.Black`, `Color.Transparent` and `Color.Unspecified` are **not** banned.
 * `Color.White.copy(alpha = …)` is how an on-dark overlay is written and banning it would push
 * people back to hex; `Unspecified` is the absence of a colour rather than a literal one.
 *
 * Vector drawables are exempt by construction: their `#FF000000` stroke is a placeholder that
 * `EtalonIcon`'s tint replaces, and this test reads `.kt` files only.
 */
class NoRawHexTest {
    private val allowed = setOf("EtalonColors.kt")

    private val repoRoot: File =
        generateSequence(File(".").absoluteFile) { it.parentFile }
            .first { File(it, "settings.gradle.kts").exists() }

    /**
     * Three shapes of the same mistake: a packed ARGB literal, one of Compose's named colours that
     * is not a sentinel, and a `"#RRGGBB"` string handed to a parser or a canvas paint.
     */
    private val rx = Regex(
        """Color\(\s*0x[0-9A-Fa-f]{6,8}""" +
            """|Color\.(Red|Green|Blue|Yellow|Magenta|Cyan|LightGray|DarkGray|Gray)\b""" +
            "|\"#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?\"",
    )

    private val mainSrc = "${File.separator}src${File.separator}main${File.separator}"
    private val buildDir = "${File.separator}build${File.separator}"

    @Test fun `no colour literal lives outside EtalonColors`() {
        val offenders = repoRoot.walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .filter { it.path.contains(mainSrc) }
            .filterNot { it.path.contains(buildDir) }
            .filterNot { it.name in allowed }
            .filter { rx.containsMatchIn(it.readText()) }
            .map { it.relativeTo(repoRoot).path }
            .toList()
        assertTrue(
            offenders.isEmpty(),
            "raw colour literals outside EtalonColors.kt:\n${offenders.joinToString("\n")}",
        )
    }

    /** A lint that silently stopped matching is worse than none; this pins what the pattern sees. */
    @Test fun `the pattern still catches what it is meant to catch`() {
        val flagged = listOf(
            "val c = Color(0xFF5646EE)",
            "val c = Color( 0x5646EE )",
            "tint = Color.Red",
            """val c = "#5646EE"""",
            """val c = "#FF5646EE"""",
        )
        val ignored = listOf(
            "tint = Color.White.copy(alpha = 0.72f)",
            "background = Color.Transparent",
            "color = Color.Unspecified",
            "SystemBarStyle.light(android.graphics.Color.TRANSPARENT, 0)",
            "background(EtalonColors.indigo)",
        )
        flagged.forEach { assertTrue(rx.containsMatchIn(it), "should have been flagged: $it") }
        ignored.forEach { assertTrue(!rx.containsMatchIn(it), "should not have been flagged: $it") }
    }
}
