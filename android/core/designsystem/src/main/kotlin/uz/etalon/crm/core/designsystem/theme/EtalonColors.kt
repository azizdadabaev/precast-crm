package uz.etalon.crm.core.designsystem.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

@Immutable
data class EtalonExtendedColors(
    val success: Color, val warning: Color, val gold: Color, val danger: Color,
    val border: Color, val borderStrong: Color, val textTertiary: Color, val surfaceHover: Color,
    // Editorial (owner home) palette
    val paper: Color, val ink: Color, val paperSurface: Color, val paperLine: Color, val paperMuted: Color,
    val accentGreen: Color, val terracotta: Color,
)

val LocalEtalonColors = staticCompositionLocalOf<EtalonExtendedColors> { error("EtalonTheme not applied") }

// App shell — light
private val LightBackground = Color(0xFFF3F5FB); private val LightSurface = Color(0xFFFFFFFF)
private val LightForeground = Color(0xFF0C0F1A); private val LightMuted = Color(0xFFEAECF5)
private val LightMutedFg = Color(0xFF5A6488); private val LightBorder = Color(0xFFDDE1F0)
private val LightPrimary = Color(0xFF4E80FF)
// App shell — dark
private val DarkBackground = Color(0xFF1A1C21); private val DarkSurface = Color(0xFF262830)
private val DarkForeground = Color(0xFFE0E1E6); private val DarkMuted = Color(0xFF353842)
private val DarkMutedFg = Color(0xFF989BA4); private val DarkBorder = Color(0xFF41444F)
private val DarkPrimary = Color(0xFF5D85ED)

val LightColorScheme: ColorScheme = lightColorScheme(
    primary = LightPrimary, onPrimary = Color.White,
    primaryContainer = LightPrimary.copy(alpha = 0.14f), onPrimaryContainer = LightPrimary,
    background = LightBackground, onBackground = LightForeground,
    surface = LightSurface, onSurface = LightForeground,
    surfaceVariant = LightMuted, onSurfaceVariant = LightMutedFg,
    outline = LightBorder, outlineVariant = LightBorder,
    error = Color(0xFFDC2626), onError = Color.White,
    errorContainer = Color(0xFFDC2626).copy(alpha = 0.10f), onErrorContainer = Color(0xFFDC2626),
)
val DarkColorScheme: ColorScheme = darkColorScheme(
    primary = DarkPrimary, onPrimary = Color.White,
    primaryContainer = DarkPrimary.copy(alpha = 0.14f), onPrimaryContainer = DarkPrimary,
    background = DarkBackground, onBackground = DarkForeground,
    surface = DarkSurface, onSurface = DarkForeground,
    surfaceVariant = DarkMuted, onSurfaceVariant = DarkMutedFg,
    outline = DarkBorder, outlineVariant = DarkBorder,
    error = Color(0xFFD65D63), onError = Color.White,
    errorContainer = Color(0xFFD65D63).copy(alpha = 0.10f), onErrorContainer = Color(0xFFD65D63),
)
val LightExtended = EtalonExtendedColors(
    success = Color(0xFF059669), warning = Color(0xFFD97706), gold = Color(0xFFB45309), danger = Color(0xFFDC2626),
    border = LightBorder, borderStrong = Color(0xFFC4CADF), textTertiary = Color(0xFF9AA3BF), surfaceHover = Color(0xFFF8F9FD),
    paper = Color(0xFFF4F3EE), ink = Color(0xFF15181D), paperSurface = Color(0xFFFFFFFF), paperLine = Color(0xFFE6E4DC), paperMuted = Color(0xFF6E7682),
    accentGreen = Color(0xFF0E7C5A), terracotta = Color(0xFFC0492F),
)
val DarkExtended = EtalonExtendedColors(
    success = Color(0xFF45C2A0), warning = Color(0xFFE29A4D), gold = Color(0xFFD4A258), danger = Color(0xFFD65D63),
    border = DarkBorder, borderStrong = Color(0xFF565A66), textTertiary = Color(0xFF757983), surfaceHover = Color(0xFF2C2E36),
    paper = Color(0xFF0E1311), ink = Color(0xFFECEFEA), paperSurface = Color(0xFF161D1A), paperLine = Color(0xFF27302C), paperMuted = Color(0xFF8A958D),
    accentGreen = Color(0xFF34D39A), terracotta = Color(0xFFF08A6E),
)
