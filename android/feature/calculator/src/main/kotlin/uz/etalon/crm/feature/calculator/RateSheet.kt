package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.background
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.calc.M2_OVERRIDE_TIERS
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.autoPickedRate
import uz.etalon.crm.core.calc.tierPriceMoney
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.etalonRipple
import uz.etalon.crm.core.ui.format.formatMoney

// ── §3.4 «RateSheet», every size named ────────────────────────────

/** §3.4: «sheet inset 10» — the sheet floats clear of the screen's edges, the way the navy
 *  summary sheet above it does, rather than sitting flush like a plain `sheetTop` modal. */
internal val RATE_SHEET_INSET = 10.dp
/** §3.4: «pad 16/14/14» — 16 on each side. */
private val SHEET_PAD_H = EtalonSpace.cardMargin
/** §3.4: «pad 16/14/14» — 14 top and 14 bottom. */
private val SHEET_PAD_V = EtalonSpace.cardPadV
/** §3.4: «list of 6 rows h46 radius lg gap 6». */
private val ROW_HEIGHT = 46.dp
private val ROW_GAP = 6.dp
/** The row's own inset — the figure sits in from the `lg` corner by the same 12 dp a
 *  `ConfirmTile` uses inside a panel. */
private val ROW_PAD_H = EtalonSpace.md
/** The air between the caption and the title, and between a row's two lines. */
private val TITLE_GAP = EtalonSpace.xs
/** §3.4: the «авто» mini tag on the tier the engine would pick by itself. */
private val TAG_PAD_H = 6.dp
private val TAG_PAD_V = 2.dp

/** §3.4: «scrim `rgba(27,32,51,.55)`» — `navy` at 55 %, the one scrim this app draws
 *  (`ConfirmSheet`, `Lightbox`). M3's own default is a grey derived from its colour scheme. */
internal val SHEET_SCRIM = EtalonColors.navy.copy(alpha = 0.55f)

/** §3.4: «title "Тарифни танланг" 16/800» — the scale's `titleSm`, exactly. */
private val TitleStyle = EtalonType.titleSm

/**
 * §3.4 «RateSheet» — the six rows the m² rate can be: «Авто» and the five [M2_OVERRIDE_TIERS]
 * catalogue prices.
 *
 * Catalogue-only, never a typed number: the server's Zod validator checks `m2PriceOverrideValue`
 * against that exact static list (never the live, owner-editable bootstrap pricing a session could
 * be carrying — see [M2_OVERRIDE_TIERS]'s own KDoc).
 *
 * The sheet decides nothing. Every tap goes straight to [onPick], and ruling R2 is the ViewModel's
 * ([CalculatorViewModel.pickRate]): «Авто» and the tier that EQUALS the auto-picked rate change
 * nothing about the quote, so they clear any override immediately; every other tier parks in
 * [CalculatorUiState.rateConfirm] until a reason is given (D5). That is why the auto-equal tier
 * carries the «авто» tag — it is the one row here that looks like an override and is not.
 *
 * @param onPick `null` for «Авто», otherwise the tier's catalogue price.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RateSheet(row: SlabRow, onDismiss: () -> Unit, onPick: (Double?) -> Unit) {
    val auto = autoPickedRate(row)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        modifier = Modifier.padding(RATE_SHEET_INSET),
        containerColor = EtalonColors.surface,
        scrimColor = SHEET_SCRIM,
        shape = EtalonShapes.sheet,
        dragHandle = null,
        // Six 46 dp rows plus the title fit well inside half a screen, but Material's partial
        // anchor is a FRACTION of the window: at 130 % the last tier lands under the fold, and a
        // price list whose last price is hidden is how the wrong one gets tapped.
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = SHEET_PAD_H, vertical = SHEET_PAD_V),
            verticalArrangement = Arrangement.spacedBy(ROW_GAP),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(TITLE_GAP)) {
                Text(
                    stringResource(R.string.calc_rate_sheet_caption, row.name),
                    style = EtalonType.labelSm,
                    color = EtalonColors.ink2,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(stringResource(R.string.calc_rate_sheet_title), style = TitleStyle, color = EtalonColors.ink)
            }

            // «Авто» first: it is the state a room is in until somebody decides otherwise, and the
            // one row that is never an override.
            RateRow(
                title = stringResource(R.string.calc_rate_auto_row),
                subtitle = stringResource(R.string.calc_rate_auto_sub, formatMoney(tierPriceMoney(auto))),
                selected = !row.m2PriceOverride,
                isAuto = false,
                onClick = { onPick(null) },
            )
            M2_OVERRIDE_TIERS.forEach { tier ->
                RateRow(
                    title = formatMoney(tierPriceMoney(tier.price)),
                    subtitle = stringResource(
                        R.string.calc_rate_tier_sub,
                        // `dimensionText`, not `formatDecimal`/`formatMeters`: both strip trailing
                        // zeros, and §3.4 writes the bracket boundary as the two-decimal factory
                        // constant it is — «балка ≤ 4,30 м», never «4,3». The string carries the «м».
                        dimensionText(tier.maxBeamLength),
                    ),
                    selected = row.m2PriceOverride && row.m2PriceOverrideValue == tier.price,
                    isAuto = tier.price == auto,
                    onClick = { onPick(tier.price) },
                )
            }
        }
    }
}

/**
 * One row of the list: the price (or «Авто») over its one-line reason, `indigo`/`onDark` when it
 * is the rate the room is priced at.
 *
 * `selectable` rather than `clickable` — the indigo fill is the whole of the selected state, and
 * without the role a screen reader reads all six rows identically.
 */
@Composable
private fun RateRow(
    title: String,
    subtitle: String,
    selected: Boolean,
    isAuto: Boolean,
    onClick: () -> Unit,
) = Row(
    Modifier
        .minimumInteractiveComponentSize()
        .fillMaxWidth()
        .height(ROW_HEIGHT)
        .clip(EtalonShapes.lg)
        .background(if (selected) EtalonColors.indigo else EtalonColors.page)
        .selectable(
            selected = selected,
            role = Role.RadioButton,
            indication = etalonRipple(onDark = selected),
            interactionSource = remember { MutableInteractionSource() },
            onClick = onClick,
        )
        .padding(horizontal = ROW_PAD_H),
    verticalAlignment = Alignment.CenterVertically,
) {
    Column(Modifier.weight(1f)) {
        Text(
            title,
            style = EtalonType.rowTitle,
            color = if (selected) EtalonColors.onDark else EtalonColors.ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            subtitle,
            style = EtalonType.meta,
            color = if (selected) EtalonColors.onDarkMuted else EtalonColors.ink3,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
    if (isAuto) {
        Text(
            stringResource(R.string.calc_pattern_auto_suffix),
            style = EtalonType.tag,
            color = EtalonColors.indigo,
            maxLines = 1,
            modifier = Modifier
                .clip(EtalonShapes.xs)
                .background(EtalonColors.lavenderBg)
                .padding(horizontal = TAG_PAD_H, vertical = TAG_PAD_V),
        )
    }
}
