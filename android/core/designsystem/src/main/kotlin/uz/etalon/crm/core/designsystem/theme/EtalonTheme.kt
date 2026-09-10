package uz.etalon.crm.core.designsystem.theme

import androidx.compose.foundation.Indication
import androidx.compose.foundation.LocalIndication
import androidx.compose.material.ripple.RippleAlpha
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.LocalRippleConfiguration
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RippleConfiguration
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.graphics.Color

/**
 * §1.1 mapped onto M3 so that any Material component we have not replaced yet inherits something
 * sensible. Etalon components do **not** read this — they read [EtalonColors] directly.
 * Dynamic colour is deliberately absent: the brand is fixed and the owner signed off these exact
 * hexes. Elevation overlays never appear because every surface here is the same white.
 *
 * Every slot a component in this tree actually reads is set — `secondaryContainer` /
 * `onSecondaryContainer` (M3's selected-`FilterChip` fill) included. `tertiary*`, `inverse*` and
 * `surfaceContainerLowest` are left on M3's default: nothing in the tree reads them (no `Slider`,
 * `Snackbar`, `TabRow`, tooltip or `ElevatedCard` exists yet), so there is no Etalon token to map
 * them to. Re-check this note if one of those components is ever added.
 */
private val EtalonColorScheme: ColorScheme = lightColorScheme(
    primary = EtalonColors.indigo, onPrimary = EtalonColors.onDark,
    primaryContainer = EtalonColors.lavenderBg, onPrimaryContainer = EtalonColors.indigo,
    secondary = EtalonColors.indigoPanel, onSecondary = EtalonColors.onDark,
    secondaryContainer = EtalonColors.lavenderBg, onSecondaryContainer = EtalonColors.indigo,
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

/** M3's own dragged/focused/hovered alphas (0.16/0.10/0.08), pressed raised from M3's 0.10
 *  default to the spec's 12 % (§5). Read via [LocalRippleConfiguration], which every ripple —
 *  ours and a stock M3 component's alike — consults for its state-layer alpha. */
private val EtalonRippleAlpha = RippleAlpha(
    draggedAlpha = 0.16f, focusedAlpha = 0.10f, hoveredAlpha = 0.08f, pressedAlpha = 0.12f,
)

/** §5: indigo 12 % on light, white 12 % on dark. Alpha comes from [EtalonRippleAlpha], provided
 *  once in [EtalonTheme]; passing the colour here is the rest of the configuration. Components
 *  sitting on navy or indigoPanel pass `onDark = true`. */
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
        LocalRippleConfiguration provides RippleConfiguration(color = Color.Unspecified, rippleAlpha = EtalonRippleAlpha),
    ) {
        MaterialTheme(
            colorScheme = EtalonColorScheme,
            typography = EtalonTypography,
            shapes = EtalonShapes.material,
            content = content,
        )
    }
}
