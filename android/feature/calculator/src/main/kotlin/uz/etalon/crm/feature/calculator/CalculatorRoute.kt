package uz.etalon.crm.feature.calculator

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/**
 * A top-level bottom-bar destination (Destination.CALCULATOR), so — like `OrdersListRoute` and
 * `ConfirmQueueRoute` — it carries no back arrow: `onBack = null` below, which is what makes
 * §3.4's header draw the title block without the back circle. A circle that pops nothing is worse
 * than no circle, and this screen is reached by switching tabs, never by pushing.
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
    CalculatorScreen(
        s = s,
        onBack = null,
        onAddRoom = vm::addRoom,
        onDuplicateRoom = vm::duplicateRoom,
        onDeleteRoom = vm::deleteRoom,
        onMoveRoomUp = vm::moveRoomUp,
        onMoveRoomDown = vm::moveRoomDown,
        onSetName = vm::setName,
        onToggleExpanded = vm::toggleExpanded,
        onWidthText = vm::setWidthText,
        onLengthText = vm::setLengthText,
        onBearingText = vm::setBearingText,
        onCorrectionText = vm::setCorrectionText,
        onCyclePattern = vm::cyclePattern,
        onExtraBeams = vm::setExtraBeams,
        onForceStartBeam = vm::setForceStartBeam,
        onApplyRateOverride = vm::applyRateOverride,
        onClearRateOverride = vm::clearRateOverride,
        onToggleClientForm = vm::toggleClientForm,
        onDismissToast = vm::dismissToast,
        clientForm = { ClientForm(state = s, vm = vm) },
        summarySheet = { SummarySheet(state = s, vm = vm) },
    )
}
