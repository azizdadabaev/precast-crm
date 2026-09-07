package uz.etalon.crm.feature.payments.discrepancies

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.DiscrepancyStatusChip
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.SectionLabel
import uz.etalon.crm.core.designsystem.components.StatusStripeCard
import uz.etalon.crm.core.designsystem.components.discrepancyStatusLabel
import uz.etalon.crm.core.designsystem.components.discrepancyStatusTone
import uz.etalon.crm.core.designsystem.components.toneColor
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors
import uz.etalon.crm.core.model.Discrepancy
import uz.etalon.crm.core.model.DiscrepancyStatus
import uz.etalon.crm.core.ui.format.formatDateTime
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.feature.payments.R
import uz.etalon.crm.core.designsystem.R as DesignSystemR

/** Each resolution's own explanation, alongside the one-word label [discrepancyStatusLabel]
 *  already gives every status chip in the app — reused here rather than a second mapping. */
private val RESOLUTION_HINTS = mapOf(
    DiscrepancyStatus.RESOLVED_RECOVERED to R.string.resolve_option_recovered_hint,
    DiscrepancyStatus.RESOLVED_DISCOUNT to R.string.resolve_option_discount_hint,
    DiscrepancyStatus.RESOLVED_WRITEOFF to R.string.resolve_option_writeoff_hint,
    DiscrepancyStatus.DISPUTED to R.string.resolve_option_disputed_hint,
)

/**
 * A screen reached from elsewhere in the app (a menu, a button), never a bottom-bar destination
 * of its own — exactly like `RecordPaymentRoute`, it takes no `onBack`: the caller's own nav
 * host supplies that.
 */
@Composable
fun DiscrepanciesRoute(
    onOpenOrder: (String) -> Unit,
    vm: HiltDiscrepanciesViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    DiscrepanciesScreen(
        s = s,
        onOpenOrder = onOpenOrder,
        onRefresh = vm::refresh,
        onOpenResolve = vm::openResolve,
        onCloseSheet = vm::closeSheet,
        onSetStatus = vm::setStatus,
        onSetNote = vm::setNote,
        onSubmitResolve = vm::submitResolve,
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DiscrepanciesScreen(
    s: DiscrepanciesUiState,
    onOpenOrder: (String) -> Unit,
    onRefresh: () -> Unit,
    onOpenResolve: (Discrepancy) -> Unit,
    onCloseSheet: () -> Unit,
    onSetStatus: (DiscrepancyStatus) -> Unit,
    onSetNote: (String) -> Unit,
    onSubmitResolve: () -> Unit,
) {
    Scaffold { pad ->
        PullToRefreshBox(isRefreshing = s.loading, onRefresh = onRefresh, modifier = Modifier.padding(pad)) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                // Resolving is online-only — the route is not withIdempotency-wrapped, so it may
                // never be queued. The banner says so before the tap does.
                if (s.isOffline) {
                    item { ErrorBanner(stringResource(R.string.payments_offline_blocked), onRetry = onRefresh) }
                } else {
                    val error = s.error
                    if (error != null) item { ErrorBanner(error, onRetry = onRefresh) }
                }
                if (!s.canResolve) item { ErrorBanner(stringResource(R.string.discrepancies_no_resolve_permission)) }
                // Never beside an error banner and never while loading: an empty list there reads
                // as "no discrepancies" when the truth is "couldn't check".
                if (s.showEmptyState) item { EmptyState(stringResource(R.string.discrepancies_empty)) }
                items(s.items, key = { it.id }) { d ->
                    DiscrepancyCard(
                        d = d,
                        resolvable = s.canResolve,
                        actionsDisabled = s.busy || s.isOffline,
                        onOpenOrder = { onOpenOrder(d.orderId) },
                        onResolve = { onOpenResolve(d) },
                    )
                }
            }
        }
    }

    val sheet = s.sheet
    if (sheet != null) {
        ResolveSheet(
            sheet = sheet,
            submitting = s.busy,
            onDismiss = onCloseSheet,
            onSetStatus = onSetStatus,
            onSetNote = onSetNote,
            onSubmitResolve = onSubmitResolve,
        )
    }
}

/** One flagged shortfall: expected versus received, the gap in the danger colour, the driver,
 *  and the order — exactly what the brief asks the list to show. */
@Composable
private fun DiscrepancyCard(
    d: Discrepancy,
    resolvable: Boolean,
    actionsDisabled: Boolean,
    onOpenOrder: () -> Unit,
    onResolve: () -> Unit,
) {
    val ext = LocalEtalonColors.current
    StatusStripeCard(stripe = toneColor(discrepancyStatusTone(d.status)), onClick = onOpenOrder) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
            Text(
                d.orderNumber, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold,
                maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.weight(1f),
            )
            DiscrepancyStatusChip(d.status)
        }
        Text(
            d.clientName, style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis,
        )
        Text(
            stringResource(R.string.queue_expected, formatMoney(d.expectedAmount)),
            style = EtalonType.monoBody, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            stringResource(R.string.discrepancies_received, formatMoney(d.receivedAmount)),
            style = EtalonType.monoBody, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (!d.gap.isZero) {
            Text(
                stringResource(R.string.queue_shortfall, formatMoney(d.gap)),
                style = EtalonType.monoBody, fontWeight = FontWeight.Bold, color = ext.danger,
            )
        }
        d.driverName?.let {
            Text(
                stringResource(R.string.discrepancies_driver, it),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            formatDateTime(d.reportedAt),
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        d.resolutionNote?.let {
            Text(
                stringResource(R.string.discrepancies_resolution_note, it),
                style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (resolvable) {
            PrimaryButton(
                text = stringResource(R.string.discrepancy_action_resolve), onClick = onResolve,
                enabled = !actionsDisabled, modifier = Modifier.padding(top = 10.dp),
            )
        }
    }
}

/**
 * The one gate in front of resolving a discrepancy. Everything it collects mirrors what
 * `PATCH /api/discrepancies/{id}` will actually read — a status from [RESOLUTION_OPTIONS] and a
 * note of at least five characters.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ResolveSheet(
    sheet: ResolveSheetState,
    submitting: Boolean,
    onDismiss: () -> Unit,
    onSetStatus: (DiscrepancyStatus) -> Unit,
    onSetNote: (String) -> Unit,
    onSubmitResolve: () -> Unit,
) {
    // A swipe, a scrim tap and a back press are the same decision the Cancel button is, so they
    // are held shut for the same reason ConfirmSheet holds shut: dismissing mid-flight drops the
    // sheet the failure message is written into, on the one screen where the action cannot be
    // taken back once it lands.
    val submittingNow by rememberUpdatedState(submitting)
    val sheetState = rememberModalBottomSheetState(
        confirmValueChange = { target -> target != SheetValue.Hidden || !submittingNow },
    )
    ModalBottomSheet(
        sheetState = sheetState,
        onDismissRequest = { if (!submittingNow) onDismiss() },
    ) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Text(stringResource(R.string.discrepancy_resolve_sheet_title), style = MaterialTheme.typography.titleLarge)
            Text(
                "${sheet.discrepancy.orderNumber} · ${sheet.discrepancy.clientName}",
                style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                stringResource(R.string.queue_expected, formatMoney(sheet.discrepancy.expectedAmount)),
                style = EtalonType.monoBody, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Text(
                stringResource(R.string.discrepancies_received, formatMoney(sheet.discrepancy.receivedAmount)),
                style = EtalonType.monoBody, color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            SectionLabel(stringResource(R.string.discrepancy_resolve_status_label))
            RESOLUTION_OPTIONS.forEach { status ->
                ResolveOption(
                    selected = sheet.status == status,
                    label = stringResource(discrepancyStatusLabel(status)),
                    hint = stringResource(requireNotNull(RESOLUTION_HINTS[status])),
                    onSelect = { onSetStatus(status) },
                )
            }

            OutlinedTextField(
                value = sheet.note, onValueChange = onSetNote,
                label = { Text(stringResource(R.string.discrepancy_note_label)) },
                placeholder = { Text(stringResource(R.string.discrepancy_note_hint)) },
                modifier = Modifier.fillMaxWidth(),
            )

            sheet.error?.let { ErrorBanner(it) }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                SecondaryButton(
                    stringResource(DesignSystemR.string.action_cancel), onClick = onDismiss,
                    enabled = !submitting, modifier = Modifier.weight(1f),
                )
                PrimaryButton(
                    text = stringResource(R.string.discrepancy_action_resolve), onClick = onSubmitResolve,
                    enabled = !submitting, loading = submitting, modifier = Modifier.weight(1f),
                )
            }
        }
    }
}

/** A 48 dp radio row, matching ConfirmSheet's discrepancy-action row: the owner is choosing how
 *  a shortfall is written off, and the four options must be distinguishable and reachable with
 *  a thumb. */
@Composable
private fun ResolveOption(selected: Boolean, label: String, hint: String, onSelect: () -> Unit) {
    val ext = LocalEtalonColors.current
    val shape = MaterialTheme.shapes.medium
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp)
            .border(1.dp, if (selected) MaterialTheme.colorScheme.primary else ext.border, shape)
            .selectable(selected = selected, role = Role.RadioButton, onClick = onSelect)
            .padding(horizontal = 8.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        RadioButton(selected = selected, onClick = null)
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(label, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
            Text(hint, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
