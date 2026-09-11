package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.FlowRowScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.etalonRipple

/** §2 sets a room tile's area figure at 15/700; the scale's nearest step, `titleSm`, is 16/800. */
private val TileArea = EtalonType.titleSm.copy(fontSize = 15.sp, fontWeight = FontWeight.W700)

/**
 * One room of an order, `2b-order-detail.png`: the area, an arrow-out affordance when the room can
 * be opened, and the caller's caption («Зал · 5,8 × 6,4»).
 *
 * Give it `Modifier.weight(1f)` from inside the panel's `FlowRow` to make two equal columns.
 *
 * The 58 dp floor is [AddTile]'s: with three rooms the two sit side by side on the last row, and a
 * tile an inch shorter than the slot beside it leaves the panel a ragged bottom edge.
 */
@Composable
fun RoomTile(
    areaText: String,
    caption: String,
    onOpen: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) = Column(
    modifier
        .heightIn(min = 58.dp)
        .clip(EtalonShapes.lg)
        .background(EtalonColors.indigoTile)
        .then(
            if (onOpen != null) {
                Modifier.clickable(
                    role = Role.Button,
                    indication = etalonRipple(true),
                    interactionSource = remember { MutableInteractionSource() },
                    onClick = onOpen,
                )
            } else {
                Modifier
            },
        )
        .padding(horizontal = 12.dp, vertical = 10.dp),
) {
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.Top) {
        Text(areaText, style = TileArea, color = EtalonColors.onDark, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (onOpen != null) EtalonIcon(EtalonIcons.ArrowUpRight, null, size = 12.dp, tint = EtalonColors.onDarkMuted)
    }
    Spacer(Modifier.height(2.dp))
    Text(
        caption,
        style = EtalonType.captionLight,
        color = EtalonColors.onDarkMuted,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

/** The empty slot beside the rooms: [dashedTileBorder] in white-40 %, min height 58 (§2). */
@Composable
fun AddTile(label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    Box(
        modifier
            .heightIn(min = 58.dp)
            .clip(EtalonShapes.lg)
            .dashedTileBorder(EtalonColors.onDark.copy(alpha = 0.40f))
            .clickable(
                role = Role.Button,
                indication = etalonRipple(true),
                interactionSource = remember { MutableInteractionSource() },
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            EtalonIcon(EtalonIcons.Plus, null, size = 12.dp, tint = EtalonColors.onDark)
            Spacer(Modifier.width(6.dp))
            Text(label, style = EtalonType.caption, color = EtalonColors.onDark, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/**
 * One column of the panel's footer — «Майдон» / «Жами» / «Қолди», caption above a 13/700 figure.
 * [value] is already formatted by the caller (`formatArea`, `formatMoney`); it ellipsizes rather
 * than clipping, so a figure squeezed by a large font scale can never read as a smaller number
 * than it is.
 */
@Composable
fun PanelTotal(
    caption: String,
    value: String,
    valueColor: Color = EtalonColors.onDark,
    modifier: Modifier = Modifier,
) = Column(modifier) {
    Text(
        caption,
        style = EtalonType.captionLight,
        color = EtalonColors.onDarkMuted,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
    Spacer(Modifier.height(3.dp))
    Text(value, style = EtalonType.rowTitle, color = valueColor, maxLines = 1, overflow = TextOverflow.Ellipsis)
}

/**
 * The order detail's hero, `2b-order-detail.png`: §1.3's nesting rule made concrete —
 * navy(22, pad 10) → indigoPanel(18, pad 14/16).
 *
 * @param statusTag a [StatusTag] on [TagSurface.PANEL_ON_INDIGO]; a slot rather than a status so
 *   the panel serves shipments and payments as well as orders. Null where the screen has no status
 *   to show — the 10 dp of air in front of it goes with it, rather than leaving the headline
 *   trailing an empty gap.
 * @param tiles [RoomTile]s and one [AddTile], each carrying `Modifier.weight(1f)`; the caller
 *   supplies them so the panel does not need to know what a room is.
 * @param totals two or three [PanelTotal]s, **each carrying `Modifier.weight(1f)`** — without it
 *   a long figure pushes its neighbours out of the row instead of ellipsizing inside its own third.
 * @param onCall null hides the call button and leaves its 48 dp in place, so the date stays centred.
 */
@Composable
fun DetailPanel(
    caption: String,
    headline: String,
    statusTag: (@Composable () -> Unit)? = null,
    clientName: String,
    addressLine: String?,
    tiles: @Composable FlowRowScope.() -> Unit,
    totals: @Composable RowScope.() -> Unit,
    onBack: () -> Unit,
    dateLabel: String,
    onCall: (() -> Unit)?,
    modifier: Modifier = Modifier,
) = Column(
    modifier.fillMaxWidth().clip(EtalonShapes.sheet).background(EtalonColors.navy).padding(10.dp),
) {
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
        EtalonIconButton(EtalonIcons.ArrowLeft, stringResource(R.string.ds_cd_back), onBack, onDark = true)
        Text(dateLabel, style = EtalonType.label, color = EtalonColors.onDarkMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (onCall != null) EtalonIconButton(EtalonIcons.Phone, stringResource(R.string.ds_cd_call), onCall, onDark = true)
        else Spacer(Modifier.size(EtalonSpace.minTouch))
    }
    Spacer(Modifier.height(6.dp))
    Column(
        Modifier.fillMaxWidth().clip(EtalonShapes.xxl).background(EtalonColors.indigoPanel)
            .padding(horizontal = 14.dp, vertical = 16.dp),
    ) {
        Text(caption, style = EtalonType.captionLight, color = EtalonColors.onDarkMuted)
        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(headline, style = EtalonType.headline, color = EtalonColors.onDark, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (statusTag != null) {
                Spacer(Modifier.width(10.dp))
                statusTag()
            }
        }
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(clientName, size = 34.dp, onPanel = true)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(clientName, style = EtalonType.rowTitle, color = EtalonColors.onDark, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (addressLine != null) {
                    Text(
                        addressLine,
                        style = EtalonType.meta,
                        color = EtalonColors.onDarkMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        Spacer(Modifier.height(12.dp))
        FlowRow(
            Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            maxItemsInEachRow = 2,
            content = tiles,
        )
        Spacer(Modifier.height(14.dp))
        HorizontalDivider(color = EtalonColors.onDarkDivider, thickness = EtalonSpace.hairline)
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, content = totals)
    }
}
