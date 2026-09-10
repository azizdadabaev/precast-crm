package uz.etalon.crm.core.designsystem.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** §1.3. Nesting rule: navy(sheet, pad 10) → indigoPanel(xxl, pad 16/14) → tile(lg, pad 10/12). */
object EtalonShapes {
    val xs = RoundedCornerShape(6.dp)      // status tags in rows
    val sm = RoundedCornerShape(8.dp)      // 22 dp tinted icon squares, chips on a panel
    val md = RoundedCornerShape(10.dp)     // square icon buttons, form inputs
    val lg = RoundedCornerShape(12.dp)     // tiles inside panels, row highlight
    val xl = RoundedCornerShape(16.dp)     // white cards, KPI cards
    val xxl = RoundedCornerShape(18.dp)    // indigoPanel inside navy
    val sheet = RoundedCornerShape(22.dp)  // navy sheets and outer panels
    /** A list sheet that runs to the bottom edge rounds its top corners only. */
    val sheetTop = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp)
    val pill = RoundedCornerShape(percent = 50)
    val toast = RoundedCornerShape(14.dp)

    /** What [EtalonTheme] hands to MaterialTheme. */
    val material = Shapes(extraSmall = xs, small = sm, medium = md, large = lg, extraLarge = xl)
}

/** §1.4, a 4-pt grid. Names are roles, not sizes, wherever the spec gives a role. */
object EtalonSpace {
    val xs = 4.dp
    val sm = 8.dp
    val md = 12.dp
    val lg = 16.dp
    val xl = 20.dp

    /** Screen horizontal margin: 20 for headers, 16 for cards and sheets. */
    val headerMargin = 20.dp
    val cardMargin = 16.dp

    val cardPadV = 14.dp
    val cardPadH = 16.dp
    val rowPadV = 10.dp
    val rowPadH = 8.dp
    val rowGap = 10.dp
    val hairline = 1.dp

    /** Content padding under the floating nav, and under a sticky action bar as well. */
    val underNav = 100.dp
    val underStickyBar = 160.dp

    /** D7: visual size may be smaller, the hit area may not. */
    val minTouch = 48.dp
}

/**
 * §1.5 — the system is flat: hairline borders, not shadows. These three are the only exceptions,
 * and the dp values are Compose's nearest reading of the designer's CSS blurs
 * (`0 6 16 rgba(86,70,238,.30)`, `0 10 30 rgba(27,32,51,.28)`, `0 12 32 rgba(27,32,51,.30)`).
 */
object EtalonElevation {
    val primaryButton = 8.dp
    val floatingNav = 16.dp
    val overlay = 20.dp
}

/**
 * Compose derives shadow alpha from the elevation, so the designer's `.28`–`.30` arrives as the
 * spot/ambient colour rather than a literal alpha. Always pass the shape — a shadow drawn on the
 * wrong outline is the one bug that survives every screenshot review at thumbnail size.
 */
fun Modifier.etalonShadow(elevation: Dp, shape: Shape, color: Color): Modifier =
    shadow(elevation = elevation, shape = shape, ambientColor = color, spotColor = color)
