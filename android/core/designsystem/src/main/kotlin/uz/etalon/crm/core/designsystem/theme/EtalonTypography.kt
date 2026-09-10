package uz.etalon.crm.core.designsystem.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import uz.etalon.crm.core.designsystem.R

/**
 * §1.2 — 400/500/600/700/800 from five static faces, not the one variable file. `FontWeightTest`
 * proved the `FontVariation` weight axis does not apply under Robolectric (every weight measured
 * identical to Regular), so the brief's own fallback path applies: five statics from the same
 * upstream OFL project (tokotype/PlusJakartaSans), same licence, ~129 KB each.
 */
val PlusJakarta = FontFamily(
    Font(R.font.plusjakartasans_regular, FontWeight.W400),
    Font(R.font.plusjakartasans_medium, FontWeight.W500),
    Font(R.font.plusjakartasans_semibold, FontWeight.W600),
    Font(R.font.plusjakartasans_bold, FontWeight.W700),
    Font(R.font.plusjakartasans_extrabold, FontWeight.W800),
)

/**
 * `tnum` on every style, not only the numeric ones: it costs nothing on Cyrillic glyphs and it
 * removes the whole class of bug where a figure jiggles because it happens to be rendered by a
 * style somebody forgot to mark. Design decision D8 makes tabular figures the default everywhere.
 */
private val Base = TextStyle(fontFamily = PlusJakarta, fontFeatureSettings = "tnum")

object EtalonType {
    val displayTitle = Base.copy(fontSize = 28.sp, fontWeight = FontWeight.W800, letterSpacing = (-0.02).em)
    val headline = Base.copy(fontSize = 22.sp, fontWeight = FontWeight.W800, letterSpacing = (-0.01).em)
    val kpi = Base.copy(fontSize = 24.sp, fontWeight = FontWeight.W700, letterSpacing = (-0.02).em)
    /** The «UZS» in front of a KPI figure: 14/500 at 50 % opacity — the opacity is applied by the
     *  component, not baked in, so the same style works on light and on navy. */
    val kpiUnit = Base.copy(fontSize = 14.sp, fontWeight = FontWeight.W500)
    val amountLg = Base.copy(fontSize = 30.sp, fontWeight = FontWeight.W800, letterSpacing = (-0.02).em)
    val titleSm = Base.copy(fontSize = 16.sp, fontWeight = FontWeight.W800, letterSpacing = (-0.01).em)
    val sectionTitle = Base.copy(fontSize = 14.sp, fontWeight = FontWeight.W700)
    val body = Base.copy(fontSize = 13.sp, fontWeight = FontWeight.W500)
    val rowTitle = Base.copy(fontSize = 13.sp, fontWeight = FontWeight.W700)
    val rowAmount = Base.copy(fontSize = 13.sp, fontWeight = FontWeight.W700)
    val label = Base.copy(fontSize = 12.sp, fontWeight = FontWeight.W600)
    val meta = Base.copy(fontSize = 11.sp, fontWeight = FontWeight.W400)
    val tag = Base.copy(fontSize = 10.sp, fontWeight = FontWeight.W600)
    /** §2: a tag sitting on an indigo panel is set half a point larger. */
    val tagPanel = Base.copy(fontSize = 10.5.sp, fontWeight = FontWeight.W600)
    val caption = Base.copy(fontSize = 10.sp, fontWeight = FontWeight.W600)

    // ── Shim. Thirty files still name these; phases 2–5 move them onto the scale above and the
    // last task of phase 5 deletes the five lines. Re-pointing them here is what makes Manrope
    // and JetBrains Mono unreferenced, so Task 12 can delete the seven old font files. ─────────
    @Deprecated("Use EtalonType.body", ReplaceWith("body")) val mono = body
    @Deprecated("Use EtalonType.label", ReplaceWith("label")) val monoLabel = label
    @Deprecated("Use EtalonType.body", ReplaceWith("body")) val monoBody = body
    @Deprecated("Use EtalonType.headline", ReplaceWith("headline")) val monoTitle = headline
    @Deprecated("Use EtalonType.amountLg", ReplaceWith("amountLg")) val monoDisplay = amountLg
}

/** M3 slots, so a Material component we have not replaced yet is at least on the right face. */
val EtalonTypography = Typography(
    headlineLarge = EtalonType.displayTitle,
    headlineMedium = EtalonType.headline,
    titleLarge = EtalonType.titleSm,
    titleMedium = EtalonType.sectionTitle,
    titleSmall = EtalonType.label,
    bodyLarge = EtalonType.body,
    bodyMedium = EtalonType.body,
    bodySmall = EtalonType.meta,
    labelLarge = EtalonType.rowTitle,
    labelMedium = EtalonType.label,
    labelSmall = EtalonType.caption,
)
