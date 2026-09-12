package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonType

/** The gradient tile. 34 dp is off the prototype and not on the 4-pt grid, so it is named here
 *  rather than inlined — the mark is one object and its parts are not independently tunable. */
private val TILE = 34.dp

/** The wordmark's gap to the tile; 10 dp, off the prototype, not on the grid either. */
private val BRAND_GAP = 10.dp

/** «ETALON» is drawn 14/800 — one step down from [EtalonType.titleSm]'s 16, at the same weight. */
private val WORDMARK_SIZE = 14.sp

/**
 * The company mark: the indigo gradient tile, «ETALON» and «Йиғма монолит» under it.
 *
 * Extracted from Home's app bar, where it was drawn inline, because §3.7's login screen and §3.1's
 * dashboard have to show the *same* mark — two copies of a wordmark drift, and the one thing a
 * brand cannot do is appear twice at two weights. The strings moved here with it, so «ETALON» is
 * declared once for the whole app.
 *
 * «ETALON» is the one Latin word in a Cyrillic UI. It is a trademark, not copy, and is not
 * transliterated.
 */
@Composable
fun BrandMark(modifier: Modifier = Modifier) = Row(modifier, verticalAlignment = Alignment.CenterVertically) {
    Box(
        Modifier.size(TILE).clip(EtalonShapes.md)
            .background(Brush.linearGradient(listOf(EtalonColors.indigo, EtalonColors.indigoTint))),
    )
    Spacer(Modifier.width(BRAND_GAP))
    Column {
        Text(
            stringResource(R.string.ds_brand),
            style = EtalonType.titleSm.copy(fontWeight = FontWeight.W800, fontSize = WORDMARK_SIZE),
            color = EtalonColors.ink,
        )
        Text(stringResource(R.string.ds_brand_tagline), style = EtalonType.meta, color = EtalonColors.ink2)
    }
}
