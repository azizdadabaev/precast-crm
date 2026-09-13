package uz.etalon.crm.feature.orders.calendar

import androidx.compose.foundation.background
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.calendar.LoadBar
import uz.etalon.crm.core.designsystem.calendar.loadFraction
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.MoneyText
import uz.etalon.crm.core.designsystem.components.NavySheet
import uz.etalon.crm.core.designsystem.components.OrderRow
import uz.etalon.crm.core.designsystem.components.TierTag
import uz.etalon.crm.core.designsystem.components.color
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.owesNothing
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatCountBare
import uz.etalon.crm.core.ui.format.formatDate
import uz.etalon.crm.core.ui.format.formatDecimal
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatOrderNo
import uz.etalon.crm.core.ui.format.formatWeekday
import uz.etalon.crm.feature.orders.R
import uz.etalon.crm.feature.orders.list.DaySheetState

private val SHEET_INSET = 6.dp
private val HERO_UNIT_GAP = 5.dp
private val HERO_TAG_GAP = 8.dp
private val HERO_BAR_GAP = 12.dp
private val BAR_H = 5.dp
private val BAR_ROWS_GAP = 10.dp
private val SKELETON_ROW_H = 56.dp
private const val SKELETON_ROWS = 3

/** The m² figure itself: two places, as every other area in this CRM (`formatArea` minus its
 *  unit, which the hero sets in a different style). */
private const val AREA_PLACES = 2

/**
 * The navy sheet under the capacity grid (design §4.5): «9 сен 2026 · Чоршанба», that day's load
 * as a hero figure with its tier tag, the count of orders and blocks with their money total, the
 * 5 dp capacity bar, and then the day's own orders as the list's own [OrderRow].
 *
 * It is a card, not a list surface — `fillsToBottom = false` — because it grows *under* the grid
 * rather than running off the bottom of the screen (§4.4). The clearance for the nav pill is the
 * enclosing list's `contentPadding`, which is Task 5's; the sheet adds none of its own.
 *
 * Nothing here reads the clock: the title comes from [DaySheetState.day], so a baseline recorded
 * in March is the baseline recorded in September.
 *
 * @param onOpenOrder the row tap — the order detail, the same destination Рўйхат's rows have.
 * @param onRetry what the failure banner offers: the screen's own `refreshCalendar`, which re-asks
 *   for the month AND for the open day's orders. Null leaves the banner as a statement — which is
 *   all a preview or a screenshot can honestly offer.
 */
@Composable
fun DaySheet(
    state: DaySheetState,
    onOpenOrder: (String) -> Unit,
    onRetry: (() -> Unit)? = null,
    modifier: Modifier = Modifier,
) = NavySheet(
    title = "${formatDate(state.day)} · ${formatWeekday(state.day)}",
    modifier = modifier,
    fillsToBottom = false,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = SHEET_INSET)) {
        Hero(state)
        Spacer(Modifier.height(HERO_BAR_GAP))
        LoadBar(
            fraction = loadFraction(state.capacity.totalArea, state.heavy),
            color = state.tier.color(),
            track = EtalonColors.navy2,
            height = BAR_H,
        )
    }
    Spacer(Modifier.height(BAR_ROWS_GAP))
    Orders(state, onOpenOrder, onRetry)
}

@Composable
private fun Hero(state: DaySheetState) = Row(
    Modifier.fillMaxWidth(),
    horizontalArrangement = Arrangement.SpaceBetween,
    verticalAlignment = Alignment.Bottom,
) {
    Row(verticalAlignment = Alignment.Bottom) {
        Text(
            formatDecimal(state.capacity.totalArea, AREA_PLACES),
            style = EtalonType.amountLg,
            color = EtalonColors.onDark,
            maxLines = 1,
        )
        Spacer(Modifier.width(HERO_UNIT_GAP))
        Text(
            stringResource(R.string.orders_unit_m2),
            style = EtalonType.label,
            color = EtalonColors.onDarkMuted,
            modifier = Modifier.padding(bottom = HERO_UNIT_GAP),
        )
        Spacer(Modifier.width(HERO_TAG_GAP))
        TierTag(state.tier, onDark = true, modifier = Modifier.padding(bottom = HERO_UNIT_GAP))
    }
    Column(horizontalAlignment = Alignment.End) {
        Text(
            stringResource(
                R.string.orders_day_sheet_summary,
                formatCountBare(state.capacity.totalOrders),
                formatCountBare(state.capacity.totalBlocks),
            ),
            style = EtalonType.meta,
            color = EtalonColors.onDarkMuted,
            maxLines = 1,
            textAlign = TextAlign.End,
        )
        Spacer(Modifier.height(2.dp))
        // Σ of the loaded orders' totalPrice (R6) — bare digits per D8, as every other amount
        // in a navy sheet is.
        MoneyText(state.moneyTotal, style = EtalonType.rowAmount, color = EtalonColors.onDark)
    }
}

/**
 * The day's orders, in the four states the list call can be in. An [Resource.Error] carrying a
 * cached page still shows the rows with the banner above them — the operator's last good answer
 * is better than an empty sheet — but an error with nothing behind it must never fall through to
 * «Бу кунга буюртма йўқ», which would state as fact the one thing the app does not know.
 */
@Composable
private fun Orders(state: DaySheetState, onOpenOrder: (String) -> Unit, onRetry: (() -> Unit)?) {
    val ctx = LocalContext.current
    val res = state.orders
    val rows = res.dataOrNull
    when {
        rows == null && res is Resource.Error -> ErrorBanner(
            res.error.message,
            onRetry = onRetry,
            modifier = Modifier.padding(horizontal = SHEET_INSET),
        )
        rows == null -> repeat(SKELETON_ROWS) { SkeletonRow() }
        rows.isEmpty() -> Text(
            stringResource(R.string.orders_day_sheet_empty, formatArea(state.heavy)),
            style = EtalonType.body,
            color = EtalonColors.onDarkMuted,
            modifier = Modifier.padding(horizontal = SHEET_INSET, vertical = EtalonSpace.sm),
        )
        else -> {
            if (res is Resource.Error) {
                ErrorBanner(res.error.message, onRetry = onRetry, modifier = Modifier.padding(horizontal = SHEET_INSET))
                Spacer(Modifier.height(EtalonSpace.sm))
            }
            rows.forEach { o ->
                // The wording rules are Рўйхат's, copied deliberately rather than shared: a
                // canceled order owes nothing and has paid nothing, so it carries no second line
                // at all (`OrderStatus.owesNothing`, the same rule the order detail reads).
                val canceled = o.status.owesNothing
                OrderRow(
                    clientName = o.client.name,
                    status = o.status,
                    metaLine = "${formatOrderNo(o.orderNumber)} · ${formatArea(o.totalArea)}",
                    total = o.totalPrice,
                    debt = if (canceled) null else o.remaining,
                    paidLabel = if (canceled) null else stringResource(R.string.orders_paid),
                    debtLabel = { ctx.getString(R.string.orders_debt, formatMoney(it)) },
                    onDark = true,
                    onClick = { onOpenOrder(o.id) },
                )
            }
        }
    }
}

/** A row-shaped block while the day's orders are in flight — the same 56 dp and radius `lg` an
 *  [OrderRow] occupies, so the sheet does not resize once they land. */
@Composable
private fun SkeletonRow() = Box(
    Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.rowPadH, vertical = 3.dp)
        .height(SKELETON_ROW_H).clip(EtalonShapes.lg).background(EtalonColors.navy2),
)
