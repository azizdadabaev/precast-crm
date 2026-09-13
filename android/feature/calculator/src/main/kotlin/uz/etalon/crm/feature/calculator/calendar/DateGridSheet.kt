package uz.etalon.crm.feature.calculator.calendar

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import uz.etalon.crm.core.designsystem.calendar.CapacityCalendarCard
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.CapacityMonth
import uz.etalon.crm.core.model.CapacityTier
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.tierFor
import uz.etalon.crm.feature.calculator.R
import uz.etalon.crm.feature.calculator.SHEET_SCRIM
import java.time.LocalDate
import java.time.YearMonth

/** The month on the grid and the load behind it — `CalculatorViewModel.openDateGrid` builds it,
 *  `dateGridPrev`/`dateGridNext` move it, and [CapacityCalendarCard] draws it.
 *
 *  [capacity] is never null (the card's own parameter allows it, meaning «never asked»; this
 *  picker asks the moment it opens): an unloaded month arrives as `Resource.Loading(null)`, which
 *  is what puts the card on its skeleton instead of a grid of blank dates. */
data class DateGridState(val cursor: YearMonth, val capacity: Resource<CapacityMonth>)

/**
 * The load tier of one day, for the tag beside «Етказиб бериш санаси» (design §7) — null when
 * [month] is not the month [d] falls in, so a day the app knows nothing about is never labelled.
 *
 * A day the server never reported is `CapacityMonth.day`'s zero bucket and therefore «мавжуд»:
 * an empty delivery day IS available, which is exactly what the seller is asking the field. (The
 * grid cell draws that same day white rather than green — there is no load to colour — and the
 * tag is what puts the word on it.)
 */
fun tierOfDate(month: CapacityMonth?, d: LocalDate): CapacityTier? =
    month?.takeIf { it.month == YearMonth.from(d) }?.let { tierFor(it.day(d).totalArea, it.thresholds) }

/** The same 20/16 inset the place-order sheet this one opens from carries. */
private val SHEET_PAD_V = EtalonSpace.lg

/** 16, not the sheet family's 20: the grid is [CapacityCalendarCard] exactly as Жадвал draws it,
 *  and the orders screen gives it `cardMargin` — a wider inset here would shave two dp off every
 *  one of the seven columns and make the picker's cells narrower than the ones the planner
 *  already knows (R15's ≥ 40 dp at 360 dp). */
private val SHEET_PAD_H = EtalonSpace.cardMargin

/** The air between the title, the card and «Бекор қилиш». */
private val BLOCK_GAP = EtalonSpace.md

/**
 * «Етказиб бериш кунини танланг» — the capacity calendar as a picker (design §7).
 *
 * The SAME card Жадвал draws, read-only: the seller sees how loaded each day already is while
 * they are promising one, and one tap picks the day and closes the sheet. There is no day sheet
 * and no export here; the only two ways out are a day and «Бекор қилиш».
 *
 * Past days are not selectable — `readOnly` alone would give that, and [today] is passed as
 * `minSelectable` as well so the floor is stated rather than implied. They are drawn exactly as
 * an adjacent month's days are: dimmed and inert.
 *
 * **Ruling R17: this grid never blocks a placement.** A month that failed to load (or has not
 * arrived yet) still draws its dates and still takes a tap — `selectableWithoutData` — because
 * this is the ONLY way to name a delivery date, and `PlaceOrderSchema` requires one: a grid that
 * went inert offline would leave the operator unable to place the order AND unable to queue it,
 * which is exactly the site with no signal the queue exists for. A failed month says so in a
 * banner over the card, with the retry design §8 asks for; the day picked without figures simply
 * carries no tier tag (`tierOfDate` answers null rather than inventing «мавжуд»).
 *
 * @param selected the date already picked, so re-opening the grid lands on it rather than on
 *   nothing.
 * @param today «Бугун» and the floor under the month. Taken from the caller rather than read from
 *   the system clock here, so the frame photographs the same every day.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DateGridSheet(
    grid: DateGridState,
    selected: LocalDate?,
    today: LocalDate,
    onPrev: () -> Unit,
    onNext: () -> Unit,
    onPick: (LocalDate) -> Unit,
    onRetry: () -> Unit,
    onDismiss: () -> Unit,
) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = EtalonColors.surface,
        scrimColor = SHEET_SCRIM,
        shape = EtalonShapes.sheetTop,
        dragHandle = null,
        // As every sheet in this feature: at Material's half-screen anchor the last row of the
        // month lands under the fold, and a calendar whose last week has to be dragged into view
        // is how the wrong day gets tapped.
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
    ) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = SHEET_PAD_H, vertical = SHEET_PAD_V),
            verticalArrangement = Arrangement.spacedBy(BLOCK_GAP),
        ) {
            Text(
                stringResource(R.string.calc_place_date_grid_title),
                style = EtalonType.sectionTitle,
                color = EtalonColors.ink,
            )
            // §8: a banner and a retry over a grid that still works. The server's own message is
            // not shown — it names an endpoint the seller cannot act on, where this says which
            // part of the sheet is missing and leaves the dates below it tappable.
            if (grid.capacity is Resource.Error) {
                ErrorBanner(stringResource(R.string.calc_place_date_grid_error), onRetry = onRetry)
            }
            CapacityCalendarCard(
                month = grid.cursor,
                capacity = grid.capacity,
                selected = selected,
                today = today,
                onPrev = onPrev,
                onNext = onNext,
                onSelect = onPick,
                readOnly = true,
                minSelectable = today,
                selectableWithoutData = true,
            )
            SecondaryButton(text = stringResource(R.string.calc_place_cancel), onClick = onDismiss)
        }
    }
}
