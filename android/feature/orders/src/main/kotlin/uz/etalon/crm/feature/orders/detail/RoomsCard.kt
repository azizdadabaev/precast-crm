package uz.etalon.crm.feature.orders.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.components.Tag
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.RoomLine
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatDecimal
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.feature.orders.R
import java.math.BigDecimal

/**
 * §3.3 «Ҳисоб-китоб» — one card per order, one row per room.
 *
 * This replaces the two-column room tiles that used to sit inside the hero panel. A tile read
 * «36,89 м² / Garage · 5 × 7»: a figure, a name and a pair of numbers with no stated relationship,
 * which the owner rejected. A room is a priced line item, so it is drawn as one — the dimensions
 * as a sentence, the subtotal beside it, and, on tap, the arithmetic that produced it.
 *
 * **The two areas are not interchangeable.** [RoomLine.monolithArea] is the physical slab and is
 * what the collapsed line and «Майдон» print; [RoomLine.billedArea] is what the m² charge is
 * computed from. Billing counts whole tiles at N × PITCH, so the two differ, and neither equals
 * width × length. That is why the dimensions line joins its figures with «·» — see
 * `detail_room_dims_line`.
 */
@Composable
internal fun RoomsCard(rooms: List<RoomLine>) {
    // Every row starts shut. v1.3 §3.3 opens the first one, but that was written for a card in
    // isolation: on the real screen an open row is a beam diagram, six detail lines and the price
    // composition sitting between the hero and everything the operator came to do — payments,
    // delivery, the shipment. Checking the quote is the «Check» job, not the first one.
    var openIndex by remember { mutableStateOf(-1) }
    WhiteCard(
        title = stringResource(R.string.detail_rooms),
        trailing = {
            Text(
                stringResource(R.string.detail_rooms_hint, rooms.size),
                style = EtalonType.meta,
                color = EtalonColors.ink3,
                maxLines = 1,
            )
        },
    ) {
        rooms.forEachIndexed { i, room ->
            if (i > 0) {
                Spacer(Modifier.height(EtalonSpace.rowGap))
                Box(
                    Modifier.fillMaxWidth().height(EtalonSpace.hairline)
                        .background(EtalonColors.surfaceBorder),
                )
                Spacer(Modifier.height(EtalonSpace.rowGap))
            }
            RoomRow(
                room = room,
                index = i,
                open = i == openIndex,
                // Tapping the open row shuts it; -1 is "none open", which is reachable and fine.
                onToggle = { openIndex = if (openIndex == i) -1 else i },
            )
        }
        FooterStrip(rooms)
    }
}

@Composable
private fun RoomRow(room: RoomLine, index: Int, open: Boolean, onToggle: () -> Unit) = Column(
    Modifier.fillMaxWidth().clickable(role = Role.Button, onClick = onToggle),
) {
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.Top) {
        Row(
            Modifier.weight(1f),
            Arrangement.spacedBy(EtalonSpace.xs),
            Alignment.CenterVertically,
        ) {
            Text(
                room.name?.takeIf { it.isNotBlank() }
                    ?: stringResource(R.string.room_n, index + 1),
                style = EtalonType.rowTitle,
                color = if (room.name.isNullOrBlank()) EtalonColors.ink3 else EtalonColors.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            PatternChip(room)
            // Only when someone typed the rate by hand — otherwise the row says nothing about
            // pricing, which is the normal case and should stay quiet.
            if (room.m2PriceOverride) {
                Tag(
                    text = stringResource(R.string.detail_room_rate_manual),
                    fg = EtalonColors.heavy,
                    bg = EtalonColors.warningBg,
                )
            }
        }
        Text(
            formatMoney(room.subtotal),
            style = EtalonType.rowAmount,
            color = EtalonColors.ink,
            maxLines = 1,
        )
    }
    Spacer(Modifier.height(EtalonSpace.xs))
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
        Text(
            stringResource(
                R.string.detail_room_dims_line,
                formatDecimal(room.innerWidth, 2),
                formatDecimal(room.innerLength, 2),
                formatArea(room.monolithArea),
            ),
            style = EtalonType.body,
            color = EtalonColors.ink2,
            maxLines = 2,
            modifier = Modifier.weight(1f),
        )
        Text(
            stringResource(R.string.detail_room_counts, room.beamCount, room.totalBlocks),
            style = EtalonType.meta,
            color = EtalonColors.ink3,
            maxLines = 1,
        )
    }
    if (open) {
        Spacer(Modifier.height(EtalonSpace.rowGap))
        BeamDiagram(room)
        Spacer(Modifier.height(EtalonSpace.rowGap))
        DetailGrid(room)
        PriceComposition(room)
        // The operator's own words for why the rate was overridden. Worth more than the flag.
        room.m2PriceReason?.takeIf { it.isNotBlank() }?.let {
            Spacer(Modifier.height(EtalonSpace.xs))
            Text(it, style = EtalonType.meta, color = EtalonColors.ink3)
        }
    }
}

/**
 * The beam run across the room's width, with the bearing it sits on at each end.
 *
 * Deliberately schematic, not to scale: it answers "which way do the beams run, and what is
 * resting on what", which is the question an operator standing at a truck actually has. A
 * to-scale drawing of a 5,5 m beam on a phone would be a line.
 */
@Composable
private fun BeamDiagram(room: RoomLine) = Column(
    Modifier.fillMaxWidth().clip(EtalonShapes.lg).background(EtalonColors.page)
        .padding(horizontal = EtalonSpace.sm, vertical = EtalonSpace.sm),
) {
    Row(Modifier.fillMaxWidth().height(BeamBarHeight), verticalAlignment = Alignment.CenterVertically) {
        BearingZone()
        Box(
            Modifier.weight(1f).height(BeamBarHeight)
                .clip(EtalonShapes.xs).background(EtalonColors.indigo),
        )
        BearingZone()
    }
    Spacer(Modifier.height(EtalonSpace.xs))
    Text(
        stringResource(R.string.detail_beam_caption, formatDecimal(room.beamLength, 2)),
        style = EtalonType.label,
        color = EtalonColors.ink2,
    )
    Text(
        stringResource(
            R.string.detail_beam_sub,
            formatDecimal(room.innerWidth, 2),
            // Bearing is stored in metres; the caption reads in centimetres because that is how
            // it is measured on site.
            formatDecimal(room.bearing.multiply(BigDecimal(100)), 0),
        ),
        style = EtalonType.meta,
        color = EtalonColors.ink3,
    )
}

/** The wall the beam bears on — hatched in the panel's own lavender so it reads as structure. */
@Composable
private fun BearingZone() = Box(
    Modifier.width(BearingWidth).height(BeamBarHeight)
        .clip(EtalonShapes.xs).background(EtalonColors.lavender),
)

/** §3.3's detail grid, as label/value rows rather than three columns — at 130 % font scale three
 *  columns of Cyrillic captions cannot hold «Ғишт / қатор» and a figure on one line. */
@Composable
private fun DetailGrid(room: RoomLine) = Column(Modifier.fillMaxWidth()) {
    DetailLine(
        stringResource(R.string.detail_room_pattern),
        buildString {
            append(stringResource(patternLabel(room.pattern)))
            // Only when a human overrode the engine's pick — otherwise the note is noise.
            if (room.pattern != room.patternAuto) {
                append(' ')
                append(stringResource(R.string.detail_room_pattern_auto, stringResource(patternLabel(room.patternAuto))))
            }
        },
    )
    DetailLine(
        stringResource(R.string.detail_room_blocks_per_row),
        stringResource(R.string.detail_room_blocks_rows, room.blocksPerRow, room.blockRows),
    )
    DetailLine(stringResource(R.string.detail_room_monolith), formatDecimal(room.monolithLength, 2) + " м")
    DetailLine(stringResource(R.string.detail_area), formatArea(room.monolithArea))
    DetailLine(stringResource(R.string.detail_room_m2price), formatMoney(room.m2Price))
    DetailLine(stringResource(R.string.detail_room_subtotal), formatMoney(room.subtotal), strong = true)
}

@Composable
private fun DetailLine(caption: String, value: String, strong: Boolean = false) = Row(
    Modifier.fillMaxWidth().padding(vertical = EtalonSpace.xs),
    Arrangement.SpaceBetween,
    Alignment.CenterVertically,
) {
    Text(caption, style = EtalonType.label, color = EtalonColors.ink2, modifier = Modifier.weight(1f))
    Text(
        value,
        style = if (strong) EtalonType.rowAmount else EtalonType.body,
        color = EtalonColors.ink,
        maxLines = 1,
    )
}

/**
 * Why the subtotal is the number it is.
 *
 * The m² charge alone does not explain it: Б-Г-Б's closing beam and any manual extra beams are
 * priced per metre and added on top. Without this line «Майдон × М² нархи ≠ Сумма» reads as a bug
 * on a screen the owner checks money on. The two lines here sum to Сумма exactly.
 */
@Composable
private fun PriceComposition(room: RoomLine) = Column(
    Modifier.fillMaxWidth().padding(top = EtalonSpace.xs),
) {
    Text(
        stringResource(
            R.string.detail_room_price_line,
            formatMoney(room.m2Price),
            formatArea(room.billedArea),
            formatMoney(room.m2Cost),
        ),
        style = EtalonType.meta,
        color = EtalonColors.ink2,
    )
    if (!room.extrasCost.isZero) {
        Text(
            stringResource(R.string.detail_room_price_extras, formatMoney(room.extrasCost)),
            style = EtalonType.meta,
            color = EtalonColors.ink2,
        )
    }
}

/** The order's materials in one line — what the yard loads, summed across every room. */
@Composable
private fun FooterStrip(rooms: List<RoomLine>) {
    val monolith = rooms.fold(BigDecimal.ZERO) { acc, r -> acc + r.monolithLength }
    val area = rooms.fold(BigDecimal.ZERO) { acc, r -> acc + r.monolithArea }
    Spacer(Modifier.height(EtalonSpace.rowGap))
    Row(
        Modifier.fillMaxWidth().clip(EtalonShapes.lg).background(EtalonColors.page)
            .padding(horizontal = EtalonSpace.sm, vertical = EtalonSpace.xs),
    ) {
        Text(
            stringResource(
                R.string.detail_rooms_footer,
                rooms.sumOf { it.totalBlocks },
                rooms.sumOf { it.beamCount },
                formatDecimal(monolith, 2),
                formatArea(area),
            ),
            style = EtalonType.label,
            color = EtalonColors.ink2,
        )
    }
}

/** §3.3's pattern chip, read-only: the order is placed, so the layout is a fact, not a choice.
 *  Auto and overridden are drawn the same — the «(авто: …)» note in the detail grid is what
 *  carries the difference, and a second signal on the collapsed row would only crowd the name. */
@Composable
private fun PatternChip(room: RoomLine) = Tag(
    text = stringResource(patternLabel(room.pattern)),
    fg = EtalonColors.indigo,
    bg = EtalonColors.lavenderBg,
)

/** Server pattern codes. Unknown codes print as themselves rather than «Номаълум» — a new
 *  pattern added server-side is still more informative raw than blanked out. */
private fun patternLabel(code: String): Int = when (code) {
    "GB" -> R.string.detail_pattern_gb
    "BGB" -> R.string.detail_pattern_bgb
    else -> R.string.detail_pattern_gbg
}

private val BeamBarHeight = 10.dp
private val BearingWidth = 18.dp
