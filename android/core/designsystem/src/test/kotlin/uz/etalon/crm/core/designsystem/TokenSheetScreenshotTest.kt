package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.ui.format.formatMoney
import java.util.Locale

/**
 * The phase's review artefact: §1.1's palette, §1.2's type scale and §1.3's radii on one sheet,
 * laid out like `docs/android/restyle-prototype/2a-token-sheet.png` — swatch, name, hex; each type
 * style named with its size and weight beside the same figure; the eight radii in a row.
 *
 * Every colour here is read from [EtalonColors] and every hex is printed from that colour rather
 * than typed, so the sheet cannot drift from the tokens. (Saying it "passes `NoRawHexTest`" would
 * be vacuous — that lint scans `src/main` and this file is a test — the point is that the hexes
 * printed here are computed from [EtalonColors], not transcribed.)
 *
 * Light only — design decision D6 gives the system one theme.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h1600dp")
class TokenSheetScreenshotTest {
    @get:Rule val rule = createComposeRule()

    @Test fun tokenSheet() {
        rule.setContent { EtalonTheme { Sheet() } }
        rule.onRoot().captureRoboImage("screenshots/ds_token_sheet_light.png")
    }
}

/** §1.1 in the spec's own order, so the sheet can be read against the table line by line. */
private val SWATCHES = listOf(
    "page" to EtalonColors.page,
    "surface" to EtalonColors.surface,
    "surfaceBorder" to EtalonColors.surfaceBorder,
    "navy" to EtalonColors.navy,
    "navy2" to EtalonColors.navy2,
    "indigo" to EtalonColors.indigo,
    "indigoPressed" to EtalonColors.indigoPressed,
    "indigoPanel" to EtalonColors.indigoPanel,
    "indigoTile" to EtalonColors.indigoTile,
    "indigoTint" to EtalonColors.indigoTint,
    "lavender" to EtalonColors.lavender,
    "lavenderBg" to EtalonColors.lavenderBg,
    "ink" to EtalonColors.ink,
    "ink2" to EtalonColors.ink2,
    "ink3" to EtalonColors.ink3,
    "green" to EtalonColors.green,
    "greenBg" to EtalonColors.greenBg,
    "red" to EtalonColors.red,
    "redBg" to EtalonColors.redBg,
    "debtOnDark" to EtalonColors.debtOnDark,
    "paidOnDark" to EtalonColors.paidOnDark,
)

/** Every style on [EtalonType] bar the five deprecated shims phase 5 deletes. */
private val STYLES = listOf(
    "displayTitle" to EtalonType.displayTitle,
    "headline" to EtalonType.headline,
    "kpi" to EtalonType.kpi,
    "kpiUnit" to EtalonType.kpiUnit,
    "amountLg" to EtalonType.amountLg,
    "titleSm" to EtalonType.titleSm,
    "sectionTitle" to EtalonType.sectionTitle,
    "body" to EtalonType.body,
    "rowTitle" to EtalonType.rowTitle,
    "rowAmount" to EtalonType.rowAmount,
    "label" to EtalonType.label,
    "meta" to EtalonType.meta,
    "labelSm" to EtalonType.labelSm,
    "tag" to EtalonType.tag,
    "tagPanel" to EtalonType.tagPanel,
    "caption" to EtalonType.caption,
    "captionLight" to EtalonType.captionLight,
)

private val RADII = listOf(
    "xs" to EtalonShapes.xs,
    "sm" to EtalonShapes.sm,
    "md" to EtalonShapes.md,
    "lg" to EtalonShapes.lg,
    "xl" to EtalonShapes.xl,
    "xxl" to EtalonShapes.xxl,
    "sheet" to EtalonShapes.sheet,
    "pill" to EtalonShapes.pill,
)

/**
 * The house figure, produced by the real formatter rather than typed: the U+2009 groups on the
 * sheet are then the same ones every row in the app draws, at all fifteen sizes at once.
 */
private val SAMPLE = formatMoney(Money.parse("53268760.00"))

// The mask drops the alpha byte. That is right for the 21 opaque tokens printed here; a
// translucent one (onDarkMuted, onDarkDivider) would print as its RGB alone and is not on the sheet.
private fun hex(c: Color): String = String.format(Locale.ROOT, "#%06X", c.toArgb() and 0xFFFFFF)

private fun sizeLabel(sp: Float): String =
    if (sp % 1f == 0f) sp.toInt().toString() else sp.toString()

@Composable
private fun Sheet() = Column(
    Modifier.fillMaxWidth().background(EtalonColors.page).padding(16.dp),
) {
    Head("COLOR")
    SWATCHES.chunked(2).forEach { pair ->
        Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), Arrangement.spacedBy(10.dp)) {
            pair.forEach { (name, c) -> Swatch(name, c, Modifier.weight(1f)) }
            // The palette has an odd number of entries; keep the last one in its column.
            if (pair.size == 1) Spacer(Modifier.weight(1f))
        }
    }

    Spacer(Modifier.height(10.dp))
    Text("avatarPalette", style = EtalonType.label, color = EtalonColors.ink)
    Row(Modifier.fillMaxWidth().padding(top = 6.dp), Arrangement.spacedBy(8.dp)) {
        EtalonColors.avatarPalette.forEachIndexed { i, c ->
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box22(c)
                Text("$i", style = EtalonType.meta, color = EtalonColors.ink3)
            }
        }
    }

    Spacer(Modifier.height(16.dp))
    Head("TYPE · PLUS JAKARTA SANS")
    STYLES.forEach { (name, s) ->
        Row(
            Modifier.fillMaxWidth().padding(vertical = 2.dp),
            Arrangement.SpaceBetween,
            Alignment.Bottom,
        ) {
            Text(
                "$name ${sizeLabel(s.fontSize.value)}/${s.fontWeight?.weight ?: 400}",
                style = EtalonType.meta,
                color = EtalonColors.ink3,
            )
            Text(SAMPLE, style = s, color = EtalonColors.ink)
        }
    }

    Spacer(Modifier.height(16.dp))
    Head("SHAPE")
    Row(Modifier.fillMaxWidth().padding(top = 8.dp), Arrangement.spacedBy(8.dp)) {
        RADII.forEach { (_, shape) ->
            Box(
                Modifier.weight(1f).height(40.dp).clip(shape).background(EtalonColors.lavenderBg)
                    .border(1.dp, EtalonColors.lavender, shape),
            )
        }
    }
    Row(Modifier.fillMaxWidth().padding(top = 4.dp), Arrangement.spacedBy(8.dp)) {
        RADII.forEach { (name, _) ->
            Text(
                name,
                style = EtalonType.meta,
                color = EtalonColors.ink3,
                textAlign = TextAlign.Center,
                modifier = Modifier.weight(1f),
            )
        }
    }
}

@Composable
private fun Head(text: String) =
    Text(text, style = EtalonType.sectionTitle, color = EtalonColors.ink2)

@Composable
private fun Swatch(name: String, c: Color, modifier: Modifier) = Row(
    modifier,
    verticalAlignment = Alignment.CenterVertically,
) {
    Box22(c)
    Spacer(Modifier.width(8.dp))
    Column {
        Text(name, style = EtalonType.label, color = EtalonColors.ink)
        Text(hex(c), style = EtalonType.meta, color = EtalonColors.ink3)
    }
}

/** The hairline is what makes `surface` and `page` visible on a page that is nearly both. */
@Composable
private fun Box22(c: Color) = Box(
    Modifier.size(22.dp).clip(EtalonShapes.sm).background(c)
        .border(1.dp, EtalonColors.surfaceBorder, EtalonShapes.sm),
)
