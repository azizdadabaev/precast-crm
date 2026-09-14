package uz.etalon.crm.feature.logistics.dispatch

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.ConfirmGate
import uz.etalon.crm.core.designsystem.components.ConfirmSheet
import uz.etalon.crm.core.designsystem.components.ConfirmTile
import uz.etalon.crm.core.designsystem.components.DriverPicker
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonTextField
import uz.etalon.crm.core.designsystem.components.FormCard
import uz.etalon.crm.core.designsystem.components.FormField
import uz.etalon.crm.core.designsystem.components.FormFieldValue
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.components.MoneyHeroText
import uz.etalon.crm.core.designsystem.components.NumericKeypadSheet
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.StepTimeline
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.components.TimelineStep
import uz.etalon.crm.core.designsystem.components.timelineFor
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.ui.format.formatOrderNo
import uz.etalon.crm.feature.logistics.LogisticsCard
import uz.etalon.crm.feature.logistics.LogisticsHeader
import uz.etalon.crm.feature.logistics.R
import uz.etalon.crm.feature.logistics.tokenSwitchColors
import uz.etalon.crm.core.designsystem.R as DesignSystemR

/**
 * `shipmentId == null` dispatches the whole order (LogisticsRepository.createDispatch); a
 * non-null id dispatches one truck of a split shipment (dispatchShipment). Both are online-only
 * — see DispatchViewModel's isOffline, derived the same way ShipmentsUiState derives its own.
 */
@Composable
fun DispatchRoute(
    orderId: String, shipmentId: String?, onDone: () -> Unit, onCancel: () -> Unit,
    vm: HiltDispatchViewModel = hiltViewModel<HiltDispatchViewModel, HiltDispatchViewModel.Factory>(
        creationCallback = { it.create(orderId, shipmentId) },
    ),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(s.done) { if (s.done) onDone() }
    DispatchScreen(
        s = s, shipmentNumber = shipmentNumberOf(s.order, shipmentId),
        isShipment = shipmentId != null, onCancel = onCancel,
        onSetDriverId = vm::setDriverId, onSetTruck = vm::setTruck,
        onSetWillCollectCash = vm::setWillCollectCash, onSetAmountDigits = vm::setAmountDigits,
        onSubmit = vm::submit, onRetryDrivers = vm::refreshDrivers,
    )
}

/**
 * §5.2's row for this screen: «white card list with StepTimeline; DriverPicker restyled». Top to
 * bottom — the header, the order's own three-step timeline in a white [LogisticsCard] so the
 * operator can see where sending this lorry puts the deal, one [FormCard] holding the driver, the
 * truck, the cash switch and the sum, and a sticky «Жўнатиш» that opens the navy gate.
 *
 * The timeline is [timelineFor], the order detail's own builder — moved to the design system by
 * ruling R13 so both screens draw one timeline rather than two that can drift.
 *
 * @param shipmentNumber the truck's own «Жўнатма N» for the header and the gate. The nav key
 *   carries only the shipment's id, so the route resolves the number from the order the ViewModel
 *   loads ([shipmentNumberOf]) — the gate's meta is the one place a split order's operator sees
 *   WHICH lorry is leaving, exactly as the deliver gate on the shipments list names it. Null for a
 *   whole-order dispatch and while the detail is still resolving: both lines then name the order
 *   alone rather than a truck number that might be wrong.
 * @param barVisible whether the sticky bar is drawn at all (ruling R13). It steps aside for the
 *   keyboard — «Машина рақами» is typed at the bottom of the form, and a bottom-aligned bar would
 *   otherwise land on top of it. Defaulted from the window and passed in only by the tests —
 *   Robolectric reports the ime inset as absent whatever is focused.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DispatchScreen(
    s: DispatchUiState,
    isShipment: Boolean,
    onCancel: () -> Unit,
    onSetDriverId: (String?) -> Unit,
    onSetTruck: (String) -> Unit,
    onSetWillCollectCash: (Boolean) -> Unit,
    onSetAmountDigits: (String) -> Unit,
    onSubmit: () -> Unit,
    onRetryDrivers: () -> Unit,
    shipmentNumber: Int? = null,
    barVisible: Boolean = !WindowInsets.isImeVisible,
) {
    var showPicker by remember { mutableStateOf(false) }
    var showKeypad by remember { mutableStateOf(false) }
    var gateOpen by remember { mutableStateOf(false) }
    var barHeightPx by remember { mutableIntStateOf(0) }
    val barHeight = with(LocalDensity.current) { barHeightPx.toDp() }
    // The whole-order route always requires an amount; the per-shipment route only collects one
    // when the driver-will-collect-cash switch is on — see HiltDispatchViewModel's DispatchUseCase.
    val amountApplies = !isShipment || s.willCollectCash
    val meta = dispatchMeta(shipmentNumber, s.order)

    // `imePadding` on the root, not on the column: the bar is bottom-aligned inside this box rather
    // than laid out under the column, so padding the column alone would leave the bar behind the
    // keyboard.
    Box(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding().imePadding()) {
        Column(Modifier.fillMaxSize()) {
            LogisticsHeader(
                title = stringResource(R.string.dispatch_title),
                meta = meta,
                onBack = onCancel,
            )
            Column(
                Modifier.fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = EtalonSpace.cardMargin)
                    .padding(top = EtalonSpace.sm, bottom = maxOf(barHeight, LocalNavPillInset.current)),
                verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
            ) {
                // The active-driver fetch's own outcome — any failure, not only offline — with a
                // retry, so a 403/500/decode error is never silently swallowed and offline is
                // never a dead end. It also IS the offline banner: `isOffline` is one narrower
                // reading of the same failure, and two banners saying the same thing is noise.
                s.driversErrorMessage?.let { ErrorBanner(it, onRetry = onRetryDrivers) }
                s.error?.let { ErrorBanner(it) }

                // Where sending this lorry puts the order. Only once the detail has resolved — a
                // timeline of three empty columns says less than no card at all.
                s.order?.let { o ->
                    LogisticsCard(stringResource(R.string.dispatch_progress)) {
                        StepTimeline(
                            timelineFor(o).map { TimelineStep(stringResource(it.labelRes), it.caption, it.state) },
                        )
                    }
                }

                FormCard {
                    FormField(stringResource(R.string.logistics_driver_label)) {
                        // Both dispatch endpoints accept a null driverId outright, so «Ҳайдовчисиз»
                        // is a value here and not an empty field: it is drawn in ink like any other.
                        PickerRow(
                            value = s.drivers.find { it.id == s.driverId }?.name
                                ?: stringResource(DesignSystemR.string.driver_none),
                            onClick = { showPicker = true },
                        )
                    }
                    FormField(
                        stringResource(R.string.dispatch_truck),
                        divider = isShipment || amountApplies,
                    ) {
                        EtalonTextField(
                            value = s.truck,
                            onValueChange = onSetTruck,
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                    // Only a split shipment asks: a whole-order dispatch has one expected
                    // collection and no per-truck choice to make about it.
                    if (isShipment) {
                        FormField(stringResource(R.string.dispatch_will_collect_cash), divider = amountApplies) {
                            TokenSwitch(s.willCollectCash, onSetWillCollectCash)
                        }
                    }
                    // The figure IS the control, the same way the delivery-proof hero is. On the
                    // whole-order route it is always shown and always required — the server's
                    // schema demands it and the Dispatch row is unique per order, so a zero
                    // mis-submit cannot be walked back from the phone.
                    if (amountApplies) {
                        FormField(stringResource(R.string.dispatch_expected), divider = false) {
                            Column(
                                Modifier.fillMaxWidth()
                                    .clickable(role = Role.Button) { showKeypad = true }
                                    .padding(vertical = EtalonSpace.xs),
                                verticalArrangement = Arrangement.spacedBy(EtalonSpace.xs),
                            ) {
                                MoneyHeroText(s.amount, style = EtalonType.amountLg)
                                if (!isShipment) {
                                    Text(
                                        stringResource(R.string.dispatch_amount_required),
                                        style = EtalonType.meta,
                                        color = if (s.amount.isZero) EtalonColors.red else EtalonColors.ink2,
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // Always composed so the box measures zero while the bar is away — that zero is what
        // «the keyboard does not have to fight the bar for the truck number» means in layout terms.
        Box(Modifier.align(Alignment.BottomCenter).onSizeChanged { barHeightPx = it.height }) {
            if (barVisible) {
                StickyActionBar {
                    // The gate is a CONFIRMATION, so it only opens on a submit the ViewModel would
                    // accept. A tap it would refuse goes straight to `submit()`, which writes the
                    // Uzbek reason into the banner above — never to a navy panel the operator
                    // agrees to for nothing. `DispatchGateTest` pins both directions.
                    PrimaryButton(
                        text = stringResource(R.string.action_dispatch),
                        onClick = { if (canSubmit(s, isShipment)) gateOpen = true else onSubmit() },
                        // Dead once the dispatch has landed: the route pops on `done`, and a second
                        // tap in that frame would raise a second dispatch against an order whose
                        // Dispatch row is unique.
                        enabled = !s.done,
                        loading = s.submitting,
                    )
                }
            }
        }
    }

    if (showPicker) {
        DriverPicker(drivers = s.drivers, selected = s.driverId, onSelect = { onSetDriverId(it); showPicker = false })
    }
    if (showKeypad) {
        NumericKeypadSheet(
            title = stringResource(R.string.dispatch_expected),
            initial = s.amountDigits,
            suffix = MONEY_SUFFIX,
            // Cash physically has no kopeks: whole UZS only, so the number this screen shows is
            // always exactly the number that goes on the wire.
            allowDecimal = false,
            onConfirm = { onSetAmountDigits(it); showKeypad = false },
            onDismiss = { showKeypad = false },
        )
    }

    // In a `Dialog` of its own, the way every gate in the app is: a full-screen scrim composed into
    // the column above would be laid out INSIDE the scroll.
    if (gateOpen) {
        ConfirmGate(onDismiss = { gateOpen = false }) {
            ConfirmSheet(
                caption = stringResource(R.string.action_dispatch),
                // The figure only where there is one to agree to. A shipment leaving with no cash
                // to collect is legitimate, and a «UZS 0» hero over it would be an answer to a
                // question nobody asked.
                amount = if (amountApplies) s.amount else null,
                meta = meta,
                tiles = {
                    ConfirmTile(
                        stringResource(R.string.logistics_driver_label),
                        s.drivers.find { it.id == s.driverId }?.name
                            ?: stringResource(DesignSystemR.string.driver_none),
                        Modifier.weight(1f),
                    )
                    ConfirmTile(
                        stringResource(R.string.logistics_tile_truck),
                        s.truck.trim().ifEmpty { UNKNOWN },
                        Modifier.weight(1f),
                    )
                },
                dismissText = stringResource(DesignSystemR.string.ds_action_cancel),
                confirmText = stringResource(R.string.logistics_action_confirm),
                onDismiss = { gateOpen = false },
                // The gate closes and the screen behind it carries the outcome — the spinner while
                // the call is in flight, the reason if it fails.
                onConfirm = { gateOpen = false; onSubmit() },
            )
        }
    }
}

/**
 * Exactly what [DispatchViewModel.submit] checks before it sends anything: a network (neither
 * dispatch route is idempotent, so neither may be queued) and, on the whole-order route, an amount
 * the server will take. A driver is deliberately NOT required — both endpoints accept a null
 * driverId, and a lorry going out with the driver unnamed is a real thing that happens.
 *
 * `done` is the third term. `submit()` has no guard of its own there, and the route pops on it, so
 * a gate re-opened in that frame would take the operator's agreement and raise a second dispatch
 * against an order whose `Dispatch` row is unique.
 */
internal fun canSubmit(s: DispatchUiState, isShipment: Boolean): Boolean =
    !s.isOffline && (isShipment || !s.amount.isZero) && !s.submitting && !s.done

/**
 * The truck's own «Жўнатма N», read off the order the ViewModel already loads. The nav key carries
 * only the shipment's id, and an operator dispatching one lorry out of several must see WHICH one
 * is leaving — the deliver gate one screen back names it, so this one cannot stay silent about it.
 * Null for a whole-order dispatch, and while the detail is still resolving (or if the id is not in
 * it): the header and the gate then name the order alone rather than a number that might be wrong.
 */
internal fun shipmentNumberOf(order: OrderDetail?, shipmentId: String?): Int? =
    shipmentId?.let { id -> order?.shipments?.firstOrNull { it.id == id }?.number }

/** «Жўнатма 2 · № 09−0021», or the order alone where the route does not know the truck's number. */
@Composable
private fun dispatchMeta(shipmentNumber: Int?, order: OrderDetail?): String? = listOfNotNull(
    shipmentNumber?.let { stringResource(R.string.logistics_shipment_n, it) },
    order?.let { formatOrderNo(it.summary.orderNumber) },
).joinToString(" · ").ifEmpty { null }

/**
 * A [FormCard] value that opens a picker: the value at [FormFieldValue] with §3.4's 10 dp chevron
 * after it, held at D7's 48 dp — the same row the record-payment form's driver field draws.
 */
@Composable
private fun PickerRow(value: String, onClick: () -> Unit) = Row(
    Modifier.fillMaxWidth().heightIn(min = EtalonSpace.minTouch).clickable(role = Role.Button, onClick = onClick),
    verticalAlignment = Alignment.CenterVertically,
) {
    Text(
        value,
        style = FormFieldValue,
        color = EtalonColors.ink,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier.weight(1f),
    )
    EtalonIcon(EtalonIcons.ChevronDown, null, size = CHEVRON, tint = EtalonColors.ink3)
}

/** §2's switch in the system's palette — the same one the delivery-proof form carries, held at
 *  D7's 48 dp inside its [FormField] row. */
@Composable
private fun TokenSwitch(checked: Boolean, onCheckedChange: (Boolean) -> Unit) = Row(
    Modifier.fillMaxWidth().heightIn(min = EtalonSpace.minTouch),
    verticalAlignment = Alignment.CenterVertically,
) {
    Switch(checked = checked, onCheckedChange = onCheckedChange, colors = tokenSwitchColors())
}

/** §3.4's picker chevron. */
private val CHEVRON = 10.dp

/** The keypad's own unit label. The figures themselves carry it through [MoneyHeroText]. */
private const val MONEY_SUFFIX = "UZS"

/** Stands where a truck number was not typed, the same dash §3.6's «Қарз —» uses. */
private const val UNKNOWN = "—"
