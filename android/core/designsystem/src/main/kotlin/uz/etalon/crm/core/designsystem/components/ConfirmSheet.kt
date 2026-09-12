package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonElevation
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.etalonShadow
import uz.etalon.crm.core.model.Money

/**
 * One of the sheet's two figures — «Буюртма жами», «Тасдиқдан кейин қолади». Same tile geometry
 * as [RoomTile] (§1.3: `lg`, pad 10/12 inside an indigoPanel), caption above the number.
 *
 * [value] arrives already formatted by the caller, exactly as [PanelTotal] takes it: the design
 * system does not decide how a sum is written.
 */
@Composable
fun ConfirmTile(caption: String, value: String, modifier: Modifier = Modifier) = Column(
    modifier.clip(EtalonShapes.lg).background(EtalonColors.indigoTile).padding(horizontal = 12.dp, vertical = 10.dp),
) {
    Text(
        caption,
        style = EtalonType.captionLight,
        color = EtalonColors.onDarkMuted,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
    Spacer(Modifier.height(3.dp))
    Text(value, style = EtalonType.rowTitle, color = EtalonColors.onDark, maxLines = 1, overflow = TextOverflow.Ellipsis)
}

/**
 * §2's confirm modal — the owner's "тасдиқлаш" step over the payments queue (`2b-payments.png`).
 * §1.3's nesting made concrete once more: scrim → navy(22, pad 10) → indigoPanel(18).
 *
 * It draws the scrim and the sheet, and nothing else: it is composed into a screen's own `Box`
 * rather than a `Dialog`, so the screen keeps control of when it exists and what is behind it.
 *
 * @param caption the line above the figure, e.g. «Тўловни тасдиқлаш · № 09−0003». With no [amount]
 *   it IS the question, and it is drawn in the figure's place and weight.
 * @param amount the figure the decision is about. Null for a decision that is not about money —
 *   discarding something, say — where a «UZS 0» hero would be an answer to a question nobody asked.
 * @param meta the smaller line under it («Нақд · Азиз Р. · 16 сен»), or null.
 * @param tiles two [ConfirmTile]s, each carrying `Modifier.weight(1f)`; null when the decision has
 *   no figures to lay out.
 * @param confirmEnabled false while the confirm is in flight or the amount is not yet valid;
 *   dismissing stays available either way, because a modal a user cannot leave is a trap.
 */
@Composable
fun ConfirmSheet(
    caption: String,
    amount: Money?,
    meta: String?,
    tiles: (@Composable RowScope.() -> Unit)?,
    dismissText: String,
    confirmText: String,
    onDismiss: () -> Unit,
    onConfirm: () -> Unit,
    confirmEnabled: Boolean = true,
) = Box(
    Modifier
        .fillMaxSize()
        .background(EtalonColors.navy.copy(alpha = 0.55f))
        .clickable(indication = null, interactionSource = remember { MutableInteractionSource() }, onClick = onDismiss),
    Alignment.Center,
) {
    Column(
        Modifier
            .padding(10.dp)
            .fillMaxWidth()
            .etalonShadow(EtalonElevation.overlay, EtalonShapes.sheet, EtalonColors.navy)
            .clip(EtalonShapes.sheet)
            .background(EtalonColors.navy)
            .padding(10.dp)
            // The sheet swallows taps so the scrim's dismiss does not fire through it.
            .clickable(indication = null, interactionSource = remember { MutableInteractionSource() }) {},
    ) {
        Column(
            Modifier.fillMaxWidth().clip(EtalonShapes.xxl).background(EtalonColors.indigoPanel)
                .padding(horizontal = 14.dp, vertical = 16.dp),
        ) {
            if (amount != null) {
                Text(
                    caption,
                    style = EtalonType.captionLight,
                    color = EtalonColors.onDarkMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Spacer(Modifier.height(8.dp))
                MoneyHeroText(amount, style = EtalonType.amountLg, onDark = true)
            } else {
                // No figure to lead with, so the question takes the hero's place rather than being
                // whispered above an empty one. Two lines: «Ҳисоб-китоб ўчирилади» fits one at
                // every font scale the app supports, a longer question wraps instead of vanishing.
                Text(caption, style = EtalonType.titleSm, color = EtalonColors.onDark, maxLines = 2, overflow = TextOverflow.Ellipsis)
            }
            if (meta != null) {
                Spacer(Modifier.height(6.dp))
                Text(
                    meta,
                    style = EtalonType.meta,
                    color = EtalonColors.onDarkMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (tiles != null) {
                Spacer(Modifier.height(14.dp))
                Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(8.dp), content = tiles)
            }
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 2.dp), Arrangement.spacedBy(8.dp)) {
            DarkButton(dismissText, onDismiss, Modifier.weight(1f))
            InverseButton(confirmText, onConfirm, Modifier.weight(1f), enabled = confirmEnabled)
        }
    }
}

/**
 * The window a [ConfirmSheet] gate opens in — decided once here so all four gates draw the same
 * one (the approve gate, the record-payment summary, the resolve gate, and Home's outbox discard).
 *
 * A gate is raised OVER a sheet that already owns a window, so it cannot be composed into that
 * sheet's column: it would be laid out INSIDE the sheet, below the fold. Hence a `Dialog` of its
 * own, full-width (`usePlatformDefaultWidth = false`) and — the part that matters visually —
 * `decorFitsSystemWindows = false`. Without that the dialog's decor is inset by the status and
 * gesture bars, so [ConfirmSheet]'s `fillMaxSize` scrim stops short of both edges and leaves two
 * pale strips: the question then reads as a card sitting on the screen rather than a modal thrown
 * over everything, which is the wrong impression for a step that moves money.
 *
 * The content keeps responsibility for its own safe area. [ConfirmSheet] centres itself and is far
 * shorter than the screen, so it never reaches a system bar.
 */
@Composable
fun ConfirmGate(onDismiss: () -> Unit, content: @Composable () -> Unit) = Dialog(
    onDismissRequest = onDismiss,
    properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
    content = content,
)
