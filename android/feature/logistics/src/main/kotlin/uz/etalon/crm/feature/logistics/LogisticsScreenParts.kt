package uz.etalon.crm.feature.logistics

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import uz.etalon.crm.core.designsystem.components.ConfirmTile
import uz.etalon.crm.core.designsystem.components.EtalonIconButton
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.core.designsystem.R as DesignSystemR

/**
 * The header every camera-first screen carries: the back circle, the job's name, and the order the
 * job belongs to. The same row `RecordPaymentScreen` and `DiscrepanciesScreen` draw — a driver
 * moving between the payment and the load screens must not find the way out somewhere else.
 *
 * The title is allowed two lines: «Юк машинасига юклаш» is the wording the viewfinder he just left
 * showed him, and at font scale 1,3 it does not fit one line at `headline`'s 22 sp.
 */
@Composable
internal fun LogisticsHeader(title: String, meta: String?, onBack: () -> Unit) = Row(
    Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.headerMargin, vertical = EtalonSpace.md),
    horizontalArrangement = Arrangement.spacedBy(EtalonSpace.md),
    verticalAlignment = Alignment.CenterVertically,
) {
    EtalonIconButton(
        icon = EtalonIcons.ArrowLeft,
        contentDescription = stringResource(DesignSystemR.string.ds_cd_back),
        onClick = onBack,
        shape = EtalonShapes.md,
    )
    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(EtalonSpace.xs)) {
        Text(
            title,
            style = EtalonType.headline,
            color = EtalonColors.ink,
            maxLines = TITLE_LINES,
            overflow = TextOverflow.Ellipsis,
        )
        if (meta != null) {
            Text(
                meta,
                style = EtalonType.meta,
                color = EtalonColors.ink2,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/** §2's white card — `xl`, hairline, 16/14 padding, a 14/700 title over its content. The surface
 *  the photo review and the delivery hero stand on, matching the load list's card beside them. */
@Composable
internal fun LogisticsCard(
    title: String,
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) = Column(
    modifier.fillMaxWidth().clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
) {
    Text(
        title,
        style = EtalonType.sectionTitle,
        color = EtalonColors.ink,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
    Spacer(Modifier.height(EtalonSpace.rowGap))
    content()
}

/**
 * What the driver just photographed, and the one control that undoes it (ruling R3: the viewfinder
 * takes the picture, the calling screen reviews it).
 *
 * «Қайта олиш» is a full-width [SecondaryButton] rather than the 56 dp icon circle the mapping row
 * sketches: after Task 1 an [EtalonIconButton] hangs its clickable on D7's 48 dp slot, so a `size`
 * above 48 would paint a disc wider than the target it answers to. A labelled 48 dp pill is both
 * the larger target and the clearer one with a truck idling behind him.
 */
@Composable
internal fun PhotoReviewCard(photo: PreparedImage, onRetake: () -> Unit) =
    LogisticsCard(stringResource(R.string.logistics_photo_taken)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(EtalonSpace.md)) {
            AsyncImage(
                model = photo.file,
                contentDescription = stringResource(DesignSystemR.string.photo_n, 1),
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(THUMB).clip(EtalonShapes.lg)
                    .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.lg),
            )
            Text(
                stringResource(R.string.upload_queued_hint),
                style = EtalonType.meta,
                color = EtalonColors.ink2,
                maxLines = HINT_LINES,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }
        Spacer(Modifier.height(EtalonSpace.md))
        SecondaryButton(
            stringResource(R.string.action_retake),
            onClick = onRetake,
            leadingIcon = EtalonIcons.RefreshCw,
        )
    }

/**
 * The load screens' primary action. Ruling R12: the pill says «Юкланди» — «Юкланди деб белгилаш»
 * ellipsized on it at font scale 1,3, and the header one line above already names the job — while
 * the full sentence stays as what a screen reader announces, so nothing is lost to the shortening.
 */
@Composable
internal fun MarkLoadedButton(loading: Boolean, onClick: () -> Unit) {
    val spoken = stringResource(R.string.action_mark_loaded)
    PrimaryButton(
        text = stringResource(R.string.logistics_action_loaded),
        onClick = onClick,
        loading = loading,
        modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = spoken },
    )
}

/**
 * Ruling R5's result summary: what was just handed to the outbox, as a 2-column grid of
 * `indigoTile`s. It sits in the sticky bar above the button rather than at the foot of the
 * scrolling column — the driver is looking at the bar when he taps, and a summary he has to scroll
 * to is a summary nobody reads.
 *
 * @param cells caption → value, in reading order; an odd last cell takes the full width.
 */
@Composable
internal fun ResultTileGrid(cells: List<Pair<String, String>>) = Column(
    Modifier.fillMaxWidth(),
    verticalArrangement = Arrangement.spacedBy(EtalonSpace.sm),
) {
    cells.chunked(2).forEach { row ->
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(EtalonSpace.sm)) {
            row.forEach { (caption, value) -> ConfirmTile(caption, value, Modifier.weight(1f)) }
        }
    }
}

/** The review thumbnail, the same 104 dp square [uz.etalon.crm.core.designsystem.components.PhotoStrip]
 *  draws a receipt at. */
private val THUMB = 104.dp

/** «Юк машинасига юклаш» wraps to two lines at font scale 1,3. */
private const val TITLE_LINES = 2

/** The queue hint beside the thumbnail: two lines of room at 1,0 and four at 1,3. */
private const val HINT_LINES = 4

/** How long ruling R5's summary stays on screen before the route pops back. Long enough to read
 *  four tiles, short enough that nobody taps back to escape it. */
internal const val RESULT_DWELL_MS = 1_200L
