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
    /** The 11 sp step at 600 — a form field's label, a KPI footnote, a segment. [meta] is the same
     *  size at 400, and eight call sites used to write out the `copy` by hand. */
    val labelSm = Base.copy(fontSize = 11.sp, fontWeight = FontWeight.W600)
    val tag = Base.copy(fontSize = 10.sp, fontWeight = FontWeight.W600)
    /**
     * The 10.5/600 step. §2 gives it to a tag on an indigo panel, and the same half-point lift is
     * what `OrderRow`'s debt line and `MonthHeader` are set in — the name says where it came from,
     * not who is allowed to use it.
     */
    val tagPanel = Base.copy(fontSize = 10.5.sp, fontWeight = FontWeight.W600)
    val caption = Base.copy(fontSize = 10.sp, fontWeight = FontWeight.W600)
    /** The 10 sp step at 400 — a tile's caption under its figure, where [caption]'s 600 would
     *  compete with the number above it. */
    val captionLight = Base.copy(fontSize = 10.sp, fontWeight = FontWeight.W400)

    /**
     * The capacity calendar's day cell, top right: that day's order count (design §4.2 — the «5»
     * on 12 сентябр). Two steps under [caption], because it shares a 56 dp cell with the day
     * number and the m² line and must never be mistaken for either — it is the smallest figure the
     * app draws, a footnote to the load line under it.
     */
    val calendarCount = Base.copy(fontSize = 9.sp, fontWeight = FontWeight.W700)

    /**
     * The same cell's middle line: that day's load, «204 м²» (design §4.2). Half a point above
     * [calendarCount] and a weight below it — this is the line a planner reads first, and it is
     * set in the tier's own colour rather than in ink.
     */
    val calendarArea = Base.copy(fontSize = 9.5.sp, fontWeight = FontWeight.W600)
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
