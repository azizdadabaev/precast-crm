package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.calc.totalPriceMoney
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.MoneyHeroText
import uz.etalon.crm.core.designsystem.components.NoticeBanner
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.SectionLabel
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.ui.format.TASHKENT
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatCount
import uz.etalon.crm.core.ui.format.formatDate
import uz.etalon.crm.core.ui.format.formatPhone
import uz.etalon.crm.core.ui.regions.composeAddress
import java.math.BigDecimal
import java.time.LocalDate

/** `PlaceOrderSchema.notes` is `z.string().max(2000)` — the field is capped here so an over-long
 *  note is impossible to type rather than rejected after the customer has waited for a round trip. */
internal const val PLACE_NOTES_MAX = 2000

/** Milliseconds in a day — `DatePickerState` speaks UTC epoch millis, `LocalDate` speaks days.
 *  The same conversion `RecordPaymentScreen` does for `paidOn`. */
private const val MILLIS_PER_DAY = 86_400_000L

/**
 * Whether the client bar has collected everything `PlaceOrderSchema` insists on: a name, a full
 * nine-digit phone, and an address. All three are `min(1)`/`min(5)` server-side — unlike the draft
 * route, which takes them as optional — so a quote that would be perfectly saveable as a project
 * can still be unplaceable, and the sheet has to say which.
 */
internal fun canPlaceClient(s: CalculatorUiState): Boolean =
    s.clientName.isNotBlank() &&
        s.clientPhoneDigits.length == CLIENT_PHONE_DIGITS &&
        composeAddress(s.clientAddress.viloyat, s.clientAddress.tuman, s.clientAddress.street).isNotBlank()

/**
 * Whether «Буюртма бериш» may be tapped. Deliberately a plain function over the state plus the
 * one thing the sheet owns (the picked date), so the whole rule is testable without Compose —
 * `PlaceOrderSheetStateTest` is that test.
 *
 * An extras-only room blocks the submit rather than being dropped from it: the server rejects a
 * room whose `innerLength` is not positive, and quietly sending the other rooms would place an
 * order for less than the operator quoted. [CalculatorUiState.unpersistableRoomNames] is what the
 * sheet names in the notice above the button.
 */
internal fun canPlaceOrder(s: CalculatorUiState, scheduledAt: LocalDate?): Boolean =
    s.canWrite &&
        !s.placing &&
        !s.saving &&
        scheduledAt != null &&
        s.unpersistableRoomNames.isEmpty() &&
        s.rows.any { it.canPersist } &&
        canPlaceClient(s)

/**
 * The picked calendar day as the ISO-8601 instant `PlaceOrderSchema.scheduledAt` coerces.
 *
 * Resolved at the START OF DAY in `Asia/Tashkent`, not UTC: the server buckets an order into a
 * delivery day with `Date#getDate()` in its own local zone (see `GET /api/orders`'s `day` filter
 * and the capacity calendar), and a Tashkent day resolved as UTC midnight lands five hours early —
 * on the previous day for anyone reading the calendar. The customer said a day; this is that day.
 */
internal fun scheduledAtInstant(date: LocalDate): String =
    date.atStartOfDay(TASHKENT).toInstant().toString()

/**
 * «Буюртма бериш» — the sheet that turns the quote on screen into a real order.
 *
 * It computes nothing. Every figure it shows is read off [CalculatorUiState] exactly as
 * `TotalsSheet` renders it, and the SERVER recomputes every room from the inputs the repository
 * sends; nothing here is ever the source of a number the customer is charged.
 *
 * Two ways out, and the second is the reason this screen exists at all: a calculator is used at a
 * customer's site, where signal is worst. When the placement fails for want of a signal the sheet
 * stays open and offers «Навбатга қўйиш» — the same body, the same idempotency key, sent by the
 * outbox when a bar comes back.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PlaceOrderSheet(
    state: CalculatorUiState,
    onDismiss: () -> Unit,
    onPlace: (scheduledAt: String, notes: String) -> Unit,
    onQueue: (scheduledAt: String, notes: String) -> Unit,
) {
    // rememberSaveable: the sheet survives a rotation or a process death with the date and the
    // note the operator already typed, the same way the quote behind it survives.
    var scheduledEpochDay by rememberSaveable { mutableStateOf<Long?>(null) }
    var notes by rememberSaveable { mutableStateOf("") }
    var showDatePicker by remember { mutableStateOf(false) }
    val scheduledAt = scheduledEpochDay?.let(LocalDate::ofEpochDay)

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState()) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Text(stringResource(R.string.calc_place_title), style = MaterialTheme.typography.titleLarge)

            // Read-only: the client bar is where this is edited, and re-offering it here would be
            // a second place to change the customer a committed order belongs to.
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                SectionLabel(stringResource(R.string.calc_place_client))
                Text(state.clientName, style = MaterialTheme.typography.bodyLarge)
                Text(formatPhone(state.clientPhoneDigits), style = EtalonType.monoBody)
                Text(
                    composeAddress(state.clientAddress.viloyat, state.clientAddress.tuman, state.clientAddress.street),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // No default. `scheduledAt` is required server-side and a silent "today" would be a
            // real production commitment nobody chose.
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionLabel(stringResource(R.string.calc_place_scheduled_at))
                SecondaryButton(
                    text = scheduledAt?.let { formatDate(it.atStartOfDay(TASHKENT).toInstant()) }
                        ?: stringResource(R.string.calc_place_pick_date),
                    onClick = { showDatePicker = true },
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                OutlinedTextField(
                    value = notes,
                    onValueChange = { if (it.length <= PLACE_NOTES_MAX) notes = it },
                    label = { Text(stringResource(R.string.calc_place_notes)) },
                    modifier = Modifier.fillMaxWidth(),
                )
                Text(
                    stringResource(R.string.calc_place_notes_counter, notes.length, PLACE_NOTES_MAX),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }

            // The quote, read-only — the same three figures the totals sheet's peek shows.
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SummaryRow(stringResource(R.string.calc_place_summary_rooms)) {
                    Text(formatCount(state.rows.count { it.canPersist }), style = EtalonType.monoBody)
                }
                SummaryRow(stringResource(R.string.calc_place_summary_area)) {
                    Text(formatArea(BigDecimal.valueOf(state.totals.monolithArea)), style = EtalonType.monoBody)
                }
                SummaryRow(stringResource(R.string.calc_place_summary_total)) {
                    MoneyHeroText(state.orderTotals.totalPriceMoney(), style = EtalonType.monoTitle)
                }
            }

            // Named, never silently dropped — see canPlaceOrder's own doc.
            if (state.unpersistableRoomNames.isNotEmpty()) {
                NoticeBanner(
                    stringResource(R.string.calc_cannot_save_rooms, state.unpersistableRoomNames.joinToString(", ")),
                )
            }
            state.error?.let { ErrorBanner(it) }

            PrimaryButton(
                text = stringResource(R.string.calc_action_place_order),
                onClick = { scheduledAt?.let { onPlace(scheduledAtInstant(it), notes) } },
                enabled = canPlaceOrder(state, scheduledAt),
                loading = state.placing,
            )
            // Only after a lost signal. A server refusal is not queueable — the same body would
            // simply be refused again, hours later, with nobody watching.
            if (state.queueOffered) {
                SecondaryButton(
                    text = stringResource(R.string.calc_place_queue),
                    onClick = { scheduledAt?.let { onQueue(scheduledAtInstant(it), notes) } },
                    enabled = canPlaceOrder(state, scheduledAt),
                )
            }
        }
    }

    if (showDatePicker) {
        // Bounded to today onward: a delivery date in the past is not a schedule, it is a typo,
        // and the capacity calendar would file the order behind days already run.
        val today = remember { LocalDate.now(TASHKENT) }
        val bounds = remember(today) {
            object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long): Boolean =
                    !LocalDate.ofEpochDay(utcTimeMillis.floorDiv(MILLIS_PER_DAY)).isBefore(today)
            }
        }
        val pickerState = rememberDatePickerState(
            initialSelectedDateMillis = scheduledEpochDay?.times(MILLIS_PER_DAY),
            selectableDates = bounds,
        )
        DatePickerDialog(
            onDismissRequest = { showDatePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    pickerState.selectedDateMillis?.let { scheduledEpochDay = it.floorDiv(MILLIS_PER_DAY) }
                    showDatePicker = false
                }) { Text(stringResource(R.string.calc_place_date_done)) }
            },
            dismissButton = {
                TextButton(onClick = { showDatePicker = false }) { Text(stringResource(R.string.calc_place_cancel)) }
            },
        ) { DatePicker(pickerState) }
    }
}

/** A read-only label/value row — the same shape `TotalsSheet.kt`'s `LabelValueRow` uses, kept
 *  local per this module's existing per-file convention for these small helpers. */
@Composable
private fun SummaryRow(label: String, value: @Composable () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium)
        value()
    }
}
