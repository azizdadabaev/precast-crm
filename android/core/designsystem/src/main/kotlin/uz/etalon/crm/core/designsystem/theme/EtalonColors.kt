package uz.etalon.crm.core.designsystem.theme

import androidx.compose.ui.graphics.Color

/**
 * Etalon Mobile §1.1, light only (design decision D6). **This is the only file in the repo that
 * may contain a colour literal** — `core/designsystem/src/test/.../NoRawHexTest.kt` scans every
 * module's `src/main` and fails the build otherwise. Every component reads
 * these directly; `MaterialTheme.colorScheme` is mapped onto them in [EtalonTheme] only so that a
 * stray M3 component inherits something sensible.
 */
object EtalonColors {
    val page = Color(0xFFF8F8FA)
    val surface = Color(0xFFFFFFFF)
    /** 1 dp hairline on every white surface — the system has no card shadows. */
    val surfaceBorder = Color(0xFFECEBF3)

    val navy = Color(0xFF1B2033)
    val navy2 = Color(0xFF262B40)

    val indigo = Color(0xFF5646EE)
    val indigoPressed = Color(0xFF4A3AD9)
    val indigoPanel = Color(0xFF625BB8)
    val indigoTile = Color(0xFF7770CC)
    val indigoTint = Color(0xFF8A82F1)

    val lavender = Color(0xFFC2BCFF)
    val lavenderBg = Color(0xFFEDEBFF)

    val ink = Color(0xFF0F0F17)
    val ink2 = Color(0xFF5D5F70)
    val ink3 = Color(0xFFA7A6AE)

    val green = Color(0xFF22B07D)
    val greenBg = Color(0xFFE6F7F0)
    val red = Color(0xFFE5484D)
    val redBg = Color(0xFFFDECEC)

    /** Capacity calendar §4.2, the «ўртача» (MODERATE) tier — figure, bar and tag text. */
    val warning = Color(0xFFF0A868)
    /** The «ўртача» tier's cell ground. */
    val warningBg = Color(0xFFFDF1E6)
    /** The «юқори» (HEAVY) tier — a burnt orange, dark enough to read as a step past [warning]. */
    val heavy = Color(0xFFC2622D)
    /** The «юқори» tier's cell ground. */
    val heavyBg = Color(0xFFF8E6DC)

    val onDark = Color(0xFFFFFFFF)
    val onDarkMuted = Color(0xFFFFFFFF).copy(alpha = 0.72f)
    val onDarkDivider = Color(0xFFFFFFFF).copy(alpha = 0.18f)
    /** Debt and "paid" on a navy row read at a different weight than on white. */
    val debtOnDark = Color(0xFFFF8A8E)
    val paidOnDark = Color(0xFF5CD6A6)

    /** Seven avatar fills, §1.1. Index is deterministic per client name — see [avatarColor].
     *  Six of them are the palette's own colours and say so — the last is the capacity calendar's
     *  [warning] amber; only the sand exists here alone, to break up a screen of otherwise
     *  identical indigo circles. */
    val avatarPalette = listOf(
        indigo, indigoTint, indigoPanel, Color(0xFFE5BBAD),
        green, indigoTile, warning,
    )

    /**
     * The prototype's rule, verbatim: sum of char codes mod 7. It must stay exactly this — the
     * same client has to keep the same colour on the phone, in the share image and in whatever
     * renders next, and any "better" hash silently repaints every avatar in the app.
     * Char codes are non-negative, so the remainder is too.
     */
    fun avatarColor(name: String): Color = avatarPalette[name.sumOf { it.code } % avatarPalette.size]
}
