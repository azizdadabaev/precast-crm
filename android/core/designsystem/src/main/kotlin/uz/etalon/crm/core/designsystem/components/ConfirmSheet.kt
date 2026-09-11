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
 * @param caption the line above the figure, e.g. «Тўловни тасдиқлаш · № 09−0003».
 * @param meta the smaller line under it («Нақд · Азиз Р. · 16 сен»), or null.
 * @param tiles two [ConfirmTile]s, each carrying `Modifier.weight(1f)`.
 * @param confirmEnabled false while the confirm is in flight or the amount is not yet valid;
 *   dismissing stays available either way, because a modal a user cannot leave is a trap.
 */
@Composable
fun ConfirmSheet(
    caption: String,
    amount: Money,
    meta: String?,
    tiles: @Composable RowScope.() -> Unit,
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
            Text(
                caption,
                style = EtalonType.captionLight,
                color = EtalonColors.onDarkMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Spacer(Modifier.height(8.dp))
            MoneyHeroText(amount, style = EtalonType.amountLg, onDark = true)
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
            Spacer(Modifier.height(14.dp))
            Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(8.dp), content = tiles)
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 2.dp), Arrangement.spacedBy(8.dp)) {
            DarkButton(dismissText, onDismiss, Modifier.weight(1f))
            InverseButton(confirmText, onConfirm, Modifier.weight(1f), enabled = confirmEnabled)
        }
    }
}
