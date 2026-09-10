package uz.etalon.crm.core.designsystem.theme

import androidx.compose.foundation.Indication
import androidx.compose.foundation.LocalIndication
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider

/**
 * §1.1 mapped onto M3 so that any Material component we have not replaced yet inherits something
 * sensible. Etalon components do **not** read this — they read [EtalonColors] directly.
 * Dynamic colour is deliberately absent: the brand is fixed and the owner signed off these exact
 * hexes. Elevation overlays never appear because every surface here is the same white.
 */
private val EtalonColorScheme: ColorScheme = lightColorScheme(
    primary = EtalonColors.indigo, onPrimary = EtalonColors.onDark,
    primaryContainer = EtalonColors.lavenderBg, onPrimaryContainer = EtalonColors.indigo,
    secondary = EtalonColors.indigoPanel, onSecondary = EtalonColors.onDark,
    background = EtalonColors.page, onBackground = EtalonColors.ink,
    surface = EtalonColors.surface, onSurface = EtalonColors.ink,
    surfaceVariant = EtalonColors.lavenderBg, onSurfaceVariant = EtalonColors.ink2,
    surfaceContainer = EtalonColors.surface, surfaceContainerHigh = EtalonColors.surface,
    surfaceContainerHighest = EtalonColors.surface, surfaceContainerLow = EtalonColors.page,
    outline = EtalonColors.surfaceBorder, outlineVariant = EtalonColors.surfaceBorder,
    error = EtalonColors.red, onError = EtalonColors.onDark,
    errorContainer = EtalonColors.redBg, onErrorContainer = EtalonColors.red,
    scrim = EtalonColors.navy,
)

/** §5: indigo 12 % on light, white 12 % on dark. 12 % is M3's own pressed alpha, so passing the
 *  colour is the whole configuration. Components sitting on navy or indigoPanel pass `onDark = true`. */
@Composable
fun etalonRipple(onDark: Boolean = false): Indication =
    ripple(color = if (onDark) EtalonColors.onDark else EtalonColors.indigo)

/**
 * @param darkTheme accepted and **ignored** — the restyle is light only (design decision D6).
 * The parameter survives because fifteen screenshot tests still pass it; phases 2–5 drop those
 * call sites as they redraw each screen.
 */
@Composable
@Suppress("UNUSED_PARAMETER", "DEPRECATION")
fun EtalonTheme(darkTheme: Boolean = false, content: @Composable () -> Unit) {
    CompositionLocalProvider(
        LocalEtalonColors provides LegacyExtended,
        LocalIndication provides etalonRipple(),
    ) {
        MaterialTheme(
            colorScheme = EtalonColorScheme,
            typography = EtalonTypography,
            shapes = EtalonShapes.material,
            content = content,
        )
    }
}
