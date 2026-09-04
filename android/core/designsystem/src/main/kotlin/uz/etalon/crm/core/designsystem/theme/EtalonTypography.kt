package uz.etalon.crm.core.designsystem.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import uz.etalon.crm.core.designsystem.R

val Manrope = FontFamily(
    Font(R.font.manrope_regular, FontWeight.Normal), Font(R.font.manrope_medium, FontWeight.Medium),
    Font(R.font.manrope_semibold, FontWeight.SemiBold), Font(R.font.manrope_bold, FontWeight.Bold),
)
val JetBrainsMono = FontFamily(
    Font(R.font.jetbrainsmono_regular, FontWeight.Normal), Font(R.font.jetbrainsmono_medium, FontWeight.Medium),
    Font(R.font.jetbrainsmono_bold, FontWeight.Bold),
)

/** Every number in the app: mono, tabular, dotless zero (web: "tnum" + "cv14"). */
val MonoNumeric = TextStyle(fontFamily = JetBrainsMono, fontFeatureSettings = "tnum, cv14")

object EtalonType {
    val mono = MonoNumeric
    val monoLabel = MonoNumeric.copy(fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.1.em)
    val monoBody = MonoNumeric.copy(fontSize = 14.sp)
    val monoTitle = MonoNumeric.copy(fontSize = 22.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.01).em)
    val monoDisplay = MonoNumeric.copy(fontSize = 36.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.02).em)
}

val EtalonTypography = Typography(
    headlineMedium = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.Bold, fontSize = 24.sp, letterSpacing = (-0.02).em),
    titleLarge = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.SemiBold, fontSize = 18.sp),
    titleMedium = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.SemiBold, fontSize = 16.sp),
    bodyLarge = TextStyle(fontFamily = Manrope, fontSize = 15.sp),
    bodyMedium = TextStyle(fontFamily = Manrope, fontSize = 14.sp),
    bodySmall = TextStyle(fontFamily = Manrope, fontSize = 12.sp),
    labelLarge = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.SemiBold, fontSize = 14.sp),
    labelMedium = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, letterSpacing = 0.08.em),
    labelSmall = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 0.08.em),
)
