package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material3.BottomSheetScaffold
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SheetValue
import androidx.compose.material3.rememberBottomSheetScaffoldState
import androidx.compose.material3.rememberStandardBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.NumericKeypad

/**
 * The room list, docked directly above the keypad rather than a `ModalBottomSheet` — see
 * `NumericKeypadSheet.kt`'s KDoc for why — with the totals sheet ([TotalsSheet]) as a second,
 * PERSISTENT bottom sheet beneath it (`BottomSheetScaffold`, never `Hidden` — see
 * `TotalsSheet.kt`'s KDoc). The screen renders [CalculatorUiState] and sends events back through
 * the callbacks; it computes nothing itself — every figure a room card or the totals sheet shows
 * came off [CalculatorViewModel] already.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CalculatorScreen(
    s: CalculatorUiState,
    vm: CalculatorViewModel,
    onAddRoom: () -> Unit,
    onDuplicateRoom: (String) -> Unit,
    onDeleteRoom: (String) -> Unit,
    onMoveRoom: (Int, Int) -> Unit,
    onSetName: (String, String) -> Unit,
    onToggleExpanded: (String) -> Unit,
    onOpenField: (String, KeypadTarget.Field) -> Unit,
    onKeypadValue: (String) -> Unit,
    onKeypadConfirm: () -> Unit,
) {
    val listState = rememberLazyListState()
    // Keeps the room the keypad is walking through on screen: a Кейинги from the last visible
    // room's ЭНИ to the next room's БЎЙИ must not leave the operator staring at a field that
    // scrolled out from under the docked keypad.
    LaunchedEffect(s.keypad?.rowId) {
        s.keypad?.rowId?.let { id ->
            s.rows.indexOfFirst { it.id == id }.takeIf { i -> i >= 0 }?.let { listState.animateScrollToItem(it) }
        }
    }

    val sheetState = rememberStandardBottomSheetState(initialValue = SheetValue.PartiallyExpanded, skipHiddenState = true)
    val scaffoldState = rememberBottomSheetScaffoldState(bottomSheetState = sheetState)

    BottomSheetScaffold(
        scaffoldState = scaffoldState,
        sheetPeekHeight = 88.dp,
        sheetContent = { TotalsSheet(state = s, vm = vm) {} },
    ) { pad ->
        Box(Modifier.fillMaxSize().padding(pad)) {
            Column(Modifier.fillMaxSize()) {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxWidth().weight(1f),
                    // Extra bottom room so the FAB — which floats over the list, not the layout —
                    // never sits on top of the last card's «Қўшимча» row.
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    if (s.rows.isEmpty()) item { EmptyState(stringResource(R.string.calc_empty)) }
                    itemsIndexed(s.rows, key = { _, row -> row.id }) { index, row ->
                        RoomCard(
                            row = row, index = index, listState = listState,
                            keypadTarget = s.keypad, expanded = s.expandedRowId == row.id, vm = vm,
                            onNameChange = { onSetName(row.id, it) },
                            onOpenField = { field -> onOpenField(row.id, field) },
                            onToggleExpanded = { onToggleExpanded(row.id) },
                            onDuplicate = { onDuplicateRoom(row.id) },
                            onDelete = { onDeleteRoom(row.id) },
                            onMove = onMoveRoom,
                        )
                    }
                }
                if (s.keypad != null) {
                    Column(Modifier.background(MaterialTheme.colorScheme.surface).navigationBarsPadding().padding(16.dp)) {
                        NumericKeypad(
                            value = s.keypadText, suffix = "м", allowDecimal = true,
                            confirmLabel = stringResource(R.string.calc_action_next),
                            onValue = onKeypadValue, onConfirm = onKeypadConfirm,
                        )
                    }
                }
            }
            FloatingActionButton(
                onClick = onAddRoom,
                modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
            ) {
                Icon(Icons.Default.Add, contentDescription = stringResource(R.string.calc_add_room))
            }
        }
    }
}
