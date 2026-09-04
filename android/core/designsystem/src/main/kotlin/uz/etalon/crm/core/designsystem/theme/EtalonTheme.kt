package uz.etalon.crm.core.designsystem.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.unit.dp

/** Radii from globals.css: 10 / 6 / 4 px. Brand is fixed; dynamic colour is off on purpose. */
val EtalonShapes = Shapes(small = RoundedCornerShape(4.dp), medium = RoundedCornerShape(6.dp), large = RoundedCornerShape(10.dp), extraLarge = RoundedCornerShape(14.dp))

@Composable
fun EtalonTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val extended = if (darkTheme) DarkExtended else LightExtended
    CompositionLocalProvider(LocalEtalonColors provides extended) {
        MaterialTheme(
            colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme,
            typography = EtalonTypography,
            shapes = EtalonShapes,
            content = content,
        )
    }
}
