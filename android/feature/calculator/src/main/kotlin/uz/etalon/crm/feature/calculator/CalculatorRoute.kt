package uz.etalon.crm.feature.calculator

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle

/**
 * A top-level bottom-bar destination (Destination.CALCULATOR), so — like `OrdersListRoute` and
 * `ConfirmQueueRoute` — it carries no back arrow.
 *
 * [onOpenOrder] is unused today: it is the hook a later task (Save Project / Place Order) wires
 * up once the calculator can create something to navigate to, kept here now so the destination's
 * signature does not change again when that task lands.
 */
@Composable
fun CalculatorRoute(onOpenOrder: (String) -> Unit, vm: CalculatorViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
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
        onOpenField = { id, field -> vm.openKeypad(KeypadTarget(id, field)) },
        onKeypadValue = vm::setKeypadText,
        onKeypadConfirm = vm::nextField,
        clientBarCollapsed = { ClientBarCollapsed(state = s, onReopen = vm::reopenClientBar) },
        clientBarExpanded = { ClientBarExpanded(state = s, vm = vm) },
        totalsSheetContent = { TotalsSheet(state = s, vm = vm) {} },
    )
}
