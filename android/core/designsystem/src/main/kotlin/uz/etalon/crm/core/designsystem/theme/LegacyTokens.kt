package uz.etalon.crm.core.designsystem.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * **Temporary.** Sixteen feature files still read `LocalEtalonColors` and thirty read
 * `EtalonType.mono*`; they are restyled one screen at a time in phases 2–5, and this file is what
 * keeps the tree compiling in between. Every field is now a view onto [EtalonColors], so a screen
 * that has not been redrawn yet is already wearing the new palette.
 *
 * **Do not add a new use of anything in this file.** The last task of phase 5 deletes it, and that
 * deletion must be a pure removal — if it turns into a refactor, this rule was broken.
 */
@Deprecated("Restyle the caller onto EtalonColors; this shim is deleted at the end of phase 5.")
@Immutable
data class EtalonExtendedColors(
    val success: Color, val warning: Color, val gold: Color, val danger: Color,
    val border: Color, val borderStrong: Color, val textTertiary: Color, val surfaceHover: Color,
    val paper: Color, val ink: Color, val paperSurface: Color, val paperLine: Color, val paperMuted: Color,
    val accentGreen: Color, val terracotta: Color,
)

/**
 * The old tone vocabulary mapped onto the new palette, following design §5.1's status semantics:
 * paid/positive → green, in-production and partial → the indigo family, dispatched → indigo,
 * rejected/overdue → red, and every neutral surface value → its §1.1 equivalent.
 */
@Suppress("DEPRECATION")
internal val LegacyExtended = EtalonExtendedColors(
    success = EtalonColors.green,
    warning = EtalonColors.indigo,
    gold = EtalonColors.indigo,
    danger = EtalonColors.red,
    border = EtalonColors.surfaceBorder,
    borderStrong = EtalonColors.surfaceBorder,
    textTertiary = EtalonColors.ink3,
    surfaceHover = EtalonColors.lavenderBg,
    paper = EtalonColors.page,
    ink = EtalonColors.ink,
    paperSurface = EtalonColors.surface,
    paperLine = EtalonColors.surfaceBorder,
    paperMuted = EtalonColors.ink2,
    accentGreen = EtalonColors.green,
    terracotta = EtalonColors.red,
)

@Suppress("DEPRECATION")
@Deprecated("Read EtalonColors directly; this composition local is deleted at the end of phase 5.")
val LocalEtalonColors = staticCompositionLocalOf<EtalonExtendedColors> { error("EtalonTheme not applied") }
