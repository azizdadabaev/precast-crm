package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.autoPickedRate
import uz.etalon.crm.core.calc.tierPriceMoney
import uz.etalon.crm.core.designsystem.components.ConfirmTile
import uz.etalon.crm.core.designsystem.components.DarkButton
import uz.etalon.crm.core.designsystem.components.InverseButton
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.ui.format.formatMoney

// ── §3.4 «RateConfirm», every size named ──────────────────────────
//
// «navy(22, pad 10) → indigoPanel(18, pad 16×14)» — §1.3's nesting, the same one `ConfirmSheet`
// draws. That component is not reused here: it takes a `Money` hero and has no room for a text
// field, and this modal exists ONLY to collect the reason.

/** §3.4: «navy(22, pad 10)» — the navy sheet's own inset from the screen, and its inner pad. */
internal val CONFIRM_SHEET_INSET = 10.dp
private val SHEET_PAD = 10.dp
/** §3.4: «indigoPanel(18, pad 16×14)» — 14 on each side, 16 top and bottom. */
private val PANEL_PAD_H = EtalonSpace.cardPadV
private val PANEL_PAD_V = EtalonSpace.lg
/** The air between the caption, the helper, the tiles, the field and the footer. */
private val BLOCK_GAP = EtalonSpace.rowGap
private val TILE_GAP = EtalonSpace.sm
/** §3.4: «reason field … radius md, h42». */
private val FIELD_HEIGHT = 42.dp
private val FIELD_PAD_H = EtalonSpace.md
/** §3.4: «white 14 % bg» — the field's fill on the indigo panel. */
private const val FIELD_ALPHA = 0.14f
/** The footer's own inset, as `ConfirmSheet` sets it. */
private val FOOTER_PAD_H = EtalonSpace.xs
private val FOOTER_PAD_V = 2.dp

/** §3.4: «helper 12 onDarkMuted» — the scale's `label` is 12/600; the helper is a sentence, not a
 *  label, so it is set at the same size in the body weight. */
private val HelperStyle = EtalonType.label

/**
 * §3.4 «RateConfirm» — the mandatory reason for a rate that is not the one the engine picked.
 *
 * **D5: the reason is mandatory on this client.** The web takes it as optional; here «Тасдиқлаш»
 * stays disabled until something has been typed, because an override is the one control in the
 * calculator that changes what a customer is charged and the only record of WHY is this sentence
 * (`RoomCalcInputBaseSchema.m2PriceReason`, capped at [MAX_REASON] server-side and here).
 *
 * The two tiles are the whole argument: what the room would have cost by the tier table, and what
 * it will cost now — with the direction spelt out, `red` for a mark-up and `green` for a discount,
 * so an operator who tapped the wrong row sees it before confirming rather than after. [price] is
 * never equal to the auto rate: [CalculatorViewModel.pickRate] resolves that case by clearing the
 * override outright, and this modal is never opened for it.
 *
 * @param onConfirm returns whether the override actually landed — the sheet is dismissed by the
 *   ViewModel clearing [CalculatorUiState.rateConfirm], never by this composable assuming it did.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RateConfirm(row: SlabRow, price: Double, onDismiss: () -> Unit, onConfirm: (String) -> Unit) {
    val auto = autoPickedRate(row)
    // Seeded from the row so re-opening the confirmation on an already-overridden room shows the
    // reason that is on file rather than an empty field the operator has to retype.
    var reason by remember(row.id, price) { mutableStateOf(row.m2PriceReason.orEmpty()) }
    val markup = price > auto

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        modifier = Modifier.padding(CONFIRM_SHEET_INSET),
        containerColor = EtalonColors.navy,
        scrimColor = SHEET_SCRIM,
        shape = EtalonShapes.sheet,
        dragHandle = null,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(Modifier.fillMaxWidth().padding(SHEET_PAD)) {
            Column(
                Modifier.fillMaxWidth()
                    .clip(EtalonShapes.xxl)
                    .background(EtalonColors.indigoPanel)
                    .padding(horizontal = PANEL_PAD_H, vertical = PANEL_PAD_V),
                verticalArrangement = Arrangement.spacedBy(BLOCK_GAP),
            ) {
                Text(
                    stringResource(R.string.calc_rate_confirm_caption, row.name),
                    style = EtalonType.tagPanel,
                    color = EtalonColors.onDarkMuted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    stringResource(R.string.calc_rate_confirm_help),
                    style = HelperStyle,
                    color = EtalonColors.onDarkMuted,
                )
                Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(TILE_GAP)) {
                    ConfirmTile(
                        caption = stringResource(R.string.calc_rate_tile_auto),
                        value = formatMoney(tierPriceMoney(auto)),
                        modifier = Modifier.weight(1f),
                    )
                    ChosenTile(
                        value = formatMoney(tierPriceMoney(price)),
                        direction = stringResource(
                            if (markup) R.string.calc_rate_markup else R.string.calc_rate_discount,
                        ),
                        directionColor = if (markup) EtalonColors.red else EtalonColors.green,
                        modifier = Modifier.weight(1f),
                    )
                }
                ReasonField(value = reason, onValueChange = { reason = it.take(MAX_REASON) })
            }
            Spacer(Modifier.height(SHEET_PAD))
            Row(
                Modifier.fillMaxWidth().padding(horizontal = FOOTER_PAD_H, vertical = FOOTER_PAD_V),
                Arrangement.spacedBy(TILE_GAP),
            ) {
                DarkButton(stringResource(R.string.calc_rate_cancel), onDismiss, Modifier.weight(1f))
                InverseButton(
                    text = stringResource(R.string.calc_rate_confirm_action),
                    onClick = { onConfirm(reason) },
                    modifier = Modifier.weight(1f),
                    // D5 in one expression: nothing to confirm until there is a reason.
                    enabled = reason.isNotBlank(),
                )
            }
        }
    }
}

/**
 * The second tile: what the room will be priced at, and which way that moved. White on the indigo
 * panel — the opposite skin to [ConfirmTile]'s `indigoTile`, so the two read as «what it was» and
 * «what it is» rather than as a pair of equals.
 */
@Composable
private fun ChosenTile(
    value: String,
    direction: String,
    directionColor: Color,
    modifier: Modifier = Modifier,
) = Column(
    modifier.clip(EtalonShapes.lg).background(EtalonColors.surface)
        .padding(horizontal = EtalonSpace.md, vertical = EtalonSpace.rowGap),
) {
    Text(
        stringResource(R.string.calc_rate_tile_chosen),
        style = EtalonType.captionLight,
        color = EtalonColors.ink2,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
    Spacer(Modifier.height(3.dp))
    Text(value, style = EtalonType.rowTitle, color = EtalonColors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
    Text(direction, style = EtalonType.tag, color = directionColor, maxLines = 1, overflow = TextOverflow.Ellipsis)
}

/**
 * §3.4's reason field: «white 14 % bg, radius md, h42» with an «n / 200» counter inside it.
 *
 * A [BasicTextField] rather than `EtalonTextField`: that one is the light form field (page fill,
 * hairline, M3's ~56 dp) and there is no dark skin for it in the system — the same reason the room
 * card's own 40 dp cells are drawn to their own geometry.
 */
@Composable
private fun ReasonField(value: String, onValueChange: (String) -> Unit) = Row(
    Modifier.fillMaxWidth()
        .height(FIELD_HEIGHT)
        .clip(EtalonShapes.md)
        .background(EtalonColors.onDark.copy(alpha = FIELD_ALPHA))
        .padding(horizontal = FIELD_PAD_H),
    verticalAlignment = Alignment.CenterVertically,
) {
    val label = stringResource(R.string.calc_rate_reason_mandatory)
    Box(Modifier.weight(1f)) {
        if (value.isEmpty()) {
            Text(
                label,
                style = EtalonType.body,
                color = EtalonColors.onDarkMuted,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            // The placeholder above is a SIBLING, so on the field itself a screen reader would
            // announce nothing at all: «Сабаб (мажбурий)» is this field's LABEL and is published
            // as one, alongside (not instead of) whatever has been typed into it.
            modifier = Modifier.fillMaxWidth().semantics { contentDescription = label },
            textStyle = EtalonType.body.copy(color = EtalonColors.onDark),
            cursorBrush = SolidColor(EtalonColors.onDark),
            singleLine = true,
        )
    }
    Text(
        stringResource(R.string.calc_rate_reason_counter, value.length, MAX_REASON),
        style = EtalonType.captionLight,
        color = EtalonColors.onDarkMuted,
        maxLines = 1,
        modifier = Modifier.padding(start = EtalonSpace.sm),
    )
}
