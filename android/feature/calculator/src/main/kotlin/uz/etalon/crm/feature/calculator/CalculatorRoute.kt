package uz.etalon.crm.feature.calculator

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/**
 * A top-level bottom-bar destination (Destination.CALCULATOR), so — like `OrdersListRoute` and
 * `ConfirmQueueRoute` — it carries no back arrow.
 *
 * [onOpenOrder] fires once an ONLINE placement has come back with an order id. A QUEUED one has
 * nothing to navigate to — the order does not exist yet — so it stays on the calculator with the
 * queued notice instead.
 */
@Composable
fun CalculatorRoute(onOpenOrder: (String) -> Unit, vm: CalculatorViewModel = hiltViewModel<HiltCalculatorViewModel>()) {
    val s by vm.state.collectAsStateWithLifecycle()
    // Consumed immediately, so a recomposition (or coming back to this tab) cannot navigate a
    // second time to an order the operator has already left.
    LaunchedEffect(s.placedOrderId) {
        s.placedOrderId?.let { id ->
            vm.consumePlacedOrder()
            onOpenOrder(id)
        }
    }
    val roomCallbacks = RoomExtrasCallbacks(
        onExtraBeams = vm::setExtraBeams,
        onBearing = vm::setBearing,
        onCorrection = vm::setCorrection,
        onForceStartBeam = vm::setForceStartBeam,
        onPattern = vm::setPattern,
        onApplyRateOverride = vm::applyRateOverride,
        onClearRateOverride = vm::clearRateOverride,
    )
    CalculatorScreen(
        s = s,
        roomCallbacks = roomCallbacks,
        onAddRoom = vm::addRoom,
        onDuplicateRoom = vm::duplicateRoom,
        onDeleteRoom = vm::deleteRoom,
        onMoveRoom = vm::moveRoom,
        onSetName = vm::setName,
        onToggleExpanded = vm::toggleExpanded,
        clientBarCollapsed = { ClientBarCollapsed(state = s, onReopen = vm::toggleClientForm) },
        clientBarExpanded = { ClientBarExpanded(state = s, vm = vm) },
        totalsSheetContent = { TotalsSheet(state = s, vm = vm) { CalculatorActions(state = s, vm = vm) } },
    )
}
