package uz.etalon.crm.feature.orders.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.components.BrandMark
import uz.etalon.crm.core.designsystem.components.PaymentStateTag
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.ui.format.formatAddressLine
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatDate
import uz.etalon.crm.core.ui.format.formatDecimal
import uz.etalon.crm.core.ui.format.formatLongDate
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatPhone
import uz.etalon.crm.feature.orders.R
import java.time.Instant

/**
 * The order as a PNG a customer can be sent, mirroring the web's own order share card
 * (`ShareTarget` in `orders/[id]/page.tsx`) so the same order does not arrive looking like two
 * different documents depending on who sent it.
 *
 * Fixed width rather than the device's: a customer receiving this must see the same document
 * whatever phone it was sent from, and a card laid out at 411 dp and one at 360 dp wrap their
 * rooms differently. It is never placed in a visible layout — `rememberShareImage` measures it
 * offscreen — so the width here is the only one that ever applies.
 *
 * It carries a name, a phone and an address. See `writeShareFile` for what that means for the file.
 */
@Composable
internal fun OrderShareCard(o: OrderDetail, now: Instant = Instant.now()) = Column(
    Modifier.width(CARD_WIDTH).background(EtalonColors.page).padding(EtalonSpace.md),
    verticalArrangement = Arrangement.spacedBy(EtalonSpace.rowGap),
) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        BrandMark(Modifier.weight(1f))
        Text(formatDate(now), style = EtalonType.meta, color = EtalonColors.ink3, maxLines = 1)
    }

    ShareSurface {
        Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
            Text(
                stringResource(R.string.detail_share_title, o.summary.orderNumber),
                style = EtalonType.titleSm,
                color = EtalonColors.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
            PaymentStateTag(o.summary.paymentState)
        }
        Spacer(Modifier.height(EtalonSpace.xs))
        Text(formatLongDate(o.summary.scheduledAt), style = EtalonType.meta, color = EtalonColors.ink2)
        Hairline()
        Text(o.summary.client.name, style = EtalonType.rowTitle, color = EtalonColors.ink, maxLines = 1)
        // Phone and address on one line, each dropped when absent — an empty strip on a document a
        // customer receives reads as a field somebody forgot to fill in.
        listOfNotNull(
            o.summary.client.phone.takeIf { it.isNotBlank() }?.let(::formatPhone),
            formatAddressLine(o.summary.client.address)?.takeIf { it.isNotBlank() },
        ).takeIf { it.isNotEmpty() }?.let {
            Text(it.joinToString(" · "), style = EtalonType.meta, color = EtalonColors.ink2, maxLines = 2)
        }
    }

    if (o.rooms.isNotEmpty()) {
        ShareSurface {
            o.rooms.forEachIndexed { i, room ->
                if (i > 0) Spacer(Modifier.height(EtalonSpace.sm))
                Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.Top) {
                    Column(Modifier.weight(1f)) {
                        Text(
                            room.name?.takeIf { it.isNotBlank() }
                                ?: stringResource(R.string.room_n, i + 1),
                            style = EtalonType.body,
                            color = EtalonColors.ink,
                            maxLines = 1,
                            overflow = TextOverflow.Ellipsis,
                        )
                        // The same «·» the detail uses, for the same reason: the area is billed on
                        // whole tiles, not on width × length.
                        Text(
                            stringResource(
                                R.string.detail_room_dims_line,
                                formatDecimal(room.innerWidth, 2),
                                formatDecimal(room.innerLength, 2),
                                formatArea(room.monolithArea),
                            ),
                            style = EtalonType.meta,
                            color = EtalonColors.ink3,
                            maxLines = 1,
                        )
                    }
                    Text(formatMoney(room.subtotal), style = EtalonType.rowAmount, color = EtalonColors.ink, maxLines = 1)
                }
            }
        }
    }

    ShareSurface {
        ShareLine(stringResource(R.string.detail_room_subtotal), formatMoney(o.roomsSubtotal))
        if (!o.discountAmount.isZero) {
            ShareLine(stringResource(R.string.discount), "− ${formatMoney(o.discountAmount)}", EtalonColors.green)
        }
        if (!o.deliveryCost.isZero) ShareLine(stringResource(R.string.detail_delivery), formatMoney(o.deliveryCost))
        if (!o.otherCost.isZero) ShareLine(stringResource(R.string.other_cost), formatMoney(o.otherCost))
        Hairline()
        ShareLine(stringResource(R.string.detail_total), formatMoney(o.summary.totalPrice), strong = true)
        ShareLine(stringResource(R.string.orders_seg_paid), formatMoney(o.summary.confirmedPaid), EtalonColors.green)
        ShareLine(
            stringResource(R.string.detail_remaining),
            formatMoney(o.remaining),
            if (o.remaining.isZero) EtalonColors.green else EtalonColors.red,
        )
    }
}

/** §2's card, flattened onto the share sheet: `xl` radius, surface fill, one hairline. */
@Composable
private fun ShareSurface(content: @Composable ColumnScope.() -> Unit) = Column(
    Modifier.fillMaxWidth().clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .padding(horizontal = EtalonSpace.md, vertical = EtalonSpace.rowGap),
    content = content,
)

@Composable
private fun ShareLine(
    caption: String,
    value: String,
    valueColor: androidx.compose.ui.graphics.Color = EtalonColors.ink,
    strong: Boolean = false,
) = Row(
    Modifier.fillMaxWidth().padding(vertical = 2.dp),
    Arrangement.SpaceBetween,
    Alignment.CenterVertically,
) {
    Text(caption, style = EtalonType.label, color = EtalonColors.ink2, modifier = Modifier.weight(1f))
    Text(
        value,
        style = if (strong) EtalonType.rowAmount else EtalonType.body,
        color = valueColor,
        maxLines = 1,
    )
}

@Composable
private fun Hairline() = Box(
    Modifier.fillMaxWidth().padding(vertical = EtalonSpace.sm)
        .height(EtalonSpace.hairline).background(EtalonColors.surfaceBorder),
)

private val CARD_WIDTH = 360.dp
