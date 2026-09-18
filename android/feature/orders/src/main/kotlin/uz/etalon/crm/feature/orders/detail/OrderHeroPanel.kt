package uz.etalon.crm.feature.orders.detail

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import uz.etalon.crm.core.ui.format.formatPhone
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.components.Avatar
import uz.etalon.crm.core.designsystem.components.EtalonIconButton
import uz.etalon.crm.core.designsystem.components.PaymentStateTag
import uz.etalon.crm.core.designsystem.components.TagSurface
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.owesNothing
import uz.etalon.crm.core.ui.format.formatAddressLine
import uz.etalon.crm.core.ui.format.formatDate
import uz.etalon.crm.core.ui.format.formatLongDate
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.feature.orders.R

/**
 * Design 7a's hero, rebuilt from the prototype rather than from the old 2b panel.
 *
 * The 2b hero this replaces led with «Буюртма / # 0003» and a Майдон / Жами / Қолди triple. 7a
 * leads with the customer and answers one question underneath: what is this worth, how much of it
 * has been paid, and how much is still owed. The order number and status moved to the sticky top
 * bar, where they stay visible for the whole screen instead of scrolling away — so repeating them
 * here would only cost the panel a line.
 *
 * Everything the payment card used to hold separately now lives inside the panel, which is what
 * the prototype draws: the state tag sits in the date row, and the total, the two figures, the bar
 * and the pending line form one block under the divider. Splitting them across two cards made the
 * reader join a total on a dark panel to a percentage on a white card below it.
 */
@Composable
internal fun OrderHeroPanel(o: OrderDetail, onPhone: () -> Unit) = Column(
    // §1.3's nesting: navy(22, pad 10) → indigoPanel(18, pad 14).
    Modifier.fillMaxWidth().clip(EtalonShapes.sheet).background(EtalonColors.navy)
        .padding(EtalonSpace.rowGap),
) {
    Column(
        Modifier.fillMaxWidth().clip(EtalonShapes.xxl).background(EtalonColors.indigoPanel)
            .padding(horizontal = 14.dp, vertical = EtalonSpace.lg),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Avatar(o.summary.client.name, size = AvatarSize, onPanel = true)
            Spacer(Modifier.width(EtalonSpace.rowGap))
            Column(Modifier.weight(1f)) {
                Text(
                    o.summary.client.name,
                    style = EtalonType.titleSm,
                    color = EtalonColors.onDark,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                formatAddressLine(o.summary.client.address)?.takeIf { it.isNotBlank() }?.let {
                    Text(
                        it,
                        style = EtalonType.meta,
                        color = EtalonColors.onDarkMuted,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                // The number itself, readable without tapping anything — the web has always shown
                // it and only the phone hid it behind an icon. Tapping asks what to do with it.
                if (o.summary.client.phone.isNotBlank()) {
                    Text(
                        formatPhone(o.summary.client.phone),
                        style = EtalonType.rowAmount,
                        color = EtalonColors.onDark,
                        maxLines = 1,
                        modifier = Modifier
                            .padding(top = 1.dp)
                            .clip(EtalonShapes.xs)
                            .clickable(role = Role.Button, onClick = onPhone),
                    )
                }
            }
            // A phone with no number is a button that cannot work; the slot stays so the name
            // column keeps its width either way.
            if (o.summary.client.phone.isNotBlank()) {
                EtalonIconButton(EtalonIcons.Phone, stringResource(R.string.detail_cd_call), onPhone, onDark = true)
            } else {
                Spacer(Modifier.size(EtalonSpace.minTouch))
            }
        }

        Spacer(Modifier.height(EtalonSpace.md))
        Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
            // Scheduled day in full, then when it was taken — the two dates an operator is asked
            // about on the phone. One line, ellipsised, so a long month never pushes the tag off.
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    formatLongDate(o.summary.scheduledAt),
                    style = EtalonType.meta,
                    color = EtalonColors.onDark,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    stringResource(R.string.detail_placed_on, formatDate(o.summary.placedAt)),
                    style = EtalonType.meta,
                    color = EtalonColors.onDarkMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            Spacer(Modifier.width(EtalonSpace.sm))
            PaymentStateTag(o.summary.paymentState, TagSurface.PANEL_ON_INDIGO)
        }

        Spacer(Modifier.height(14.dp))
        HorizontalDivider(color = EtalonColors.onDarkDivider, thickness = EtalonSpace.hairline)
        Spacer(Modifier.height(EtalonSpace.md))

        Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.Bottom) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.detail_total), style = EtalonType.caption, color = EtalonColors.onDarkMuted)
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        formatMoney(o.summary.totalPrice),
                        style = EtalonType.heroAmount,
                        color = EtalonColors.onDark,
                        maxLines = 1,
                    )
                    Spacer(Modifier.width(EtalonSpace.xs))
                    Text(
                        stringResource(R.string.detail_uzs),
                        style = EtalonType.label,
                        color = EtalonColors.onDarkMuted,
                        modifier = Modifier.padding(bottom = 2.dp),
                    )
                }
            }
            Column(horizontalAlignment = Alignment.End) {
                HeroFigure(stringResource(R.string.detail_hero_paid), formatMoney(o.summary.confirmedPaid), EtalonColors.paidOnDark)
                // A canceled order owes nothing, so «Қолди» is a dash rather than its untouched
                // total — the same rule the rows on Home and Orders already follow.
                val owesNothing = o.summary.status.owesNothing
                HeroFigure(
                    stringResource(R.string.detail_remaining),
                    if (owesNothing) stringResource(R.string.detail_no_balance) else formatMoney(o.remaining),
                    when {
                        owesNothing -> EtalonColors.onDarkMuted
                        o.remaining.isZero -> EtalonColors.paidOnDark
                        // Amber, not red: money still owed on a live order is the normal state of
                        // an order, not an error.
                        else -> EtalonColors.amberOnDark
                    },
                )
            }
        }

        Spacer(Modifier.height(EtalonSpace.rowGap))
        // Driven by paidPercent, not the raw fraction: it carries the rule that a customer who
        // has paid something never reads as nothing and one still owing never reads as settled.
        // 7a dropped the «45 % тўланган» caption, so the bar is now the only thing saying this —
        // a 1 % payment must still show a sliver.
        val width by animateFloatAsState(
            targetValue = paidPercent(o) / 100f,
            animationSpec = tween(durationMillis = 400),
            label = "heroPaidFraction",
        )
        Box(
            Modifier.fillMaxWidth().height(6.dp).clip(EtalonShapes.pill)
                .background(EtalonColors.onDarkDivider),
        ) {
            Box(Modifier.fillMaxWidth(width).fillMaxHeight().clip(EtalonShapes.pill).background(EtalonColors.onDark))
        }

        // Recorded but unconfirmed: neither paid nor outstanding, so it hangs below the bar rather
        // than moving either figure above it.
        o.pendingAmount.takeIf { !it.isZero }?.let {
            Spacer(Modifier.height(EtalonSpace.xs))
            Text(
                stringResource(R.string.detail_pending_confirmation, formatMoney(it)),
                style = EtalonType.caption,
                color = EtalonColors.onDarkMuted,
                maxLines = 2,
            )
        }
    }
}

/** One of the panel's two right-hand figures: a quiet label with the number carrying the colour. */
@Composable
private fun HeroFigure(label: String, value: String, valueColor: Color) = Row(
    verticalAlignment = Alignment.Bottom,
) {
    Text(label, style = EtalonType.meta, color = EtalonColors.onDarkMuted)
    Spacer(Modifier.width(EtalonSpace.xs))
    Text(
        value,
        style = EtalonType.rowAmount,
        color = valueColor,
        maxLines = 1,
        textAlign = TextAlign.End,
    )
}

private val AvatarSize = 40.dp
