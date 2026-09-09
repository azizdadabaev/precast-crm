package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.NumericKeypad

/**
 * How much of the WHOLE sheet `BottomSheetScaffold`'s `sheetPeekHeight` must reserve for
 * `TotalsSheet`'s collapsed peek to render uncut — `sheetPeekHeight` measures the sheet from ITS
 * OWN top (Material3's drag handle) down, not just `sheetContent`. Three real parts, not a guess:
 *  - [BottomSheetDefaults.DragHandle]: a 4dp bar in 22dp of vertical padding on each side
 *    (`SheetDefaults.kt`/`SheetBottomTokens.kt`) — 48dp. `CalculatorScreen` passes no
 *    `sheetDragHandle`, so this default renders.
 *  - `TotalsSheet`'s own `Column`'s top `padding(vertical = 12.dp)`, before its peek `Row` starts.
 *  - That peek `Row`'s own `heightIn(min = 48.dp)`.
 * This screen intentionally has no compile-time reference to `TotalsSheet` (`totalsSheetContent`
 * is a caller-supplied slot — see this file's own KDoc), so this stays a documented constant
 * rather than a shared import: a future edit to either of `TotalsSheet`'s two numbers above must
 * update this one too, or the peek clips again exactly as it did before this fix.
 */
internal val CALC_SHEET_PEEK_HEIGHT: Dp = 48.dp + 12.dp + 48.dp

/**
 * [clientBar]'s `stickyHeader` below is the room `LazyColumn`'s own item index 0, so a room at
 * position `i` within [CalculatorUiState.rows] sits at overall list index `i + ROOM_LIST_HEADER_OFFSET`.
 * Two places need this translation: the keypad's auto-scroll effect just below, and `RoomCard.kt`'s
 * `DragHandle`, which reads/writes [androidx.compose.foundation.lazy.LazyListState.layoutInfo]
 * (overall indices) but calls back with room-local ones (`onMove`, `CalculatorViewModel.moveRoom`).
 */
internal const val ROOM_LIST_HEADER_OFFSET = 1

/**
 * The room list, docked directly above the keypad rather than a `ModalBottomSheet` — see
 * `NumericKeypadSheet.kt`'s KDoc for why — with the totals sheet ([TotalsSheet]) as a second,
 * PERSISTENT bottom sheet beneath it (`BottomSheetScaffold`, never `Hidden` — see
 * `TotalsSheet.kt`'s KDoc). [totalsSheetContent] is that sheet's content, handed in by the caller
 * rather than built here: this screen carries no `CalculatorViewModel` of its own, matching every
 * other feature's `*Route`/`*Screen` split — only [CalculatorRoute] knows about the ViewModel.
 * The screen renders [CalculatorUiState] and sends events back through the callbacks; it computes
 * nothing itself — every figure a room card shows came off the engine already.
 *
 * [clientBar] is [ClientBar] handed in the same way [totalsSheetContent] hands in `TotalsSheet`:
 * a slot built by [CalculatorRoute] (which alone holds the `CalculatorViewModel`), rendered here
 * as this `LazyColumn`'s own `stickyHeader` so it stays pinned above the rooms while they scroll.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun CalculatorScreen(
    s: CalculatorUiState,
    roomCallbacks: RoomExtrasCallbacks,
    onAddRoom: () -> Unit,
    onDuplicateRoom: (String) -> Unit,
    onDeleteRoom: (String) -> Unit,
    onMoveRoom: (Int, Int) -> Unit,
    onSetName: (String, String) -> Unit,
    onToggleExpanded: (String) -> Unit,
    onOpenField: (String, KeypadTarget.Field) -> Unit,
    onKeypadValue: (String) -> Unit,
    onKeypadConfirm: () -> Unit,
    clientBar: @Composable () -> Unit,
    totalsSheetContent: @Composable ColumnScope.() -> Unit,
) {
    val listState = rememberLazyListState()
    // Keeps the room the keypad is walking through on screen: a Кейинги from the last visible
    // room's ЭНИ to the next room's БЎЙИ must not leave the operator staring at a field that
    // scrolled out from under the docked keypad. +ROOM_LIST_HEADER_OFFSET — see that constant's
    // own doc — or this lands one room early.
    LaunchedEffect(s.keypad?.rowId) {
        s.keypad?.rowId?.let { id ->
            s.rows.indexOfFirst { it.id == id }.takeIf { i -> i >= 0 }
                ?.let { listState.animateScrollToItem(it + ROOM_LIST_HEADER_OFFSET) }
        }
    }

    val sheetState = rememberStandardBottomSheetState(initialValue = SheetValue.PartiallyExpanded, skipHiddenState = true)
    val scaffoldState = rememberBottomSheetScaffoldState(bottomSheetState = sheetState)

    BottomSheetScaffold(
        scaffoldState = scaffoldState,
        sheetPeekHeight = CALC_SHEET_PEEK_HEIGHT,
        sheetContent = totalsSheetContent,
    ) { pad ->
        Column(Modifier.fillMaxSize().padding(pad)) {
            // The FAB floats within THIS Box only, not the whole body — so its BottomEnd anchor
            // sits above the docked keypad below (a sibling here, not a child), rather than on
            // top of its «Кейинги» confirm button the way it did when both shared one Box.
            Box(Modifier.weight(1f)) {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.fillMaxSize(),
                    // Extra bottom room so the FAB — which floats over the list, not the layout —
                    // never sits on top of the last card's «Қўшимча» row.
                    contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    stickyHeader { clientBar() }
                    if (s.rows.isEmpty()) item { EmptyState(stringResource(R.string.calc_empty)) }
                    itemsIndexed(s.rows, key = { _, row -> row.id }) { index, row ->
                        RoomCard(
                            row = row, index = index, listState = listState,
                            keypadTarget = s.keypad, expanded = s.expandedRowId == row.id, callbacks = roomCallbacks,
                            onNameChange = { onSetName(row.id, it) },
                            onOpenField = { field -> onOpenField(row.id, field) },
                            onToggleExpanded = { onToggleExpanded(row.id) },
                            onDuplicate = { onDuplicateRoom(row.id) },
                            onDelete = { onDeleteRoom(row.id) },
                            onMove = onMoveRoom,
                        )
                    }
                }
                FloatingActionButton(
                    onClick = onAddRoom,
                    modifier = Modifier.align(Alignment.BottomEnd).padding(16.dp),
                ) {
                    Icon(Icons.Default.Add, contentDescription = stringResource(R.string.calc_add_room))
                }
            }
            if (s.keypad != null) {
                // No `navigationBarsPadding()` here: `CalculatorRoute` is hosted inside
                // `SignedInShell`'s `NavigationSuiteScaffold` (`EtalonNavHost.kt`), which already
                // consumes `WindowInsets.navigationBars` for its content slot — the same way plain
                // `Scaffold` consumes it for its own `bottomBar`. `BottomSheetScaffold` itself does
                // NOT add that inset back (its content padding is bare `sheetPeekHeight`, no window
                // insets — verified against `BottomSheetScaffold.kt`), so re-adding it here just
                // padded the keypad up by the system nav bar's height for no reason.
                Column(Modifier.background(MaterialTheme.colorScheme.surface).padding(16.dp)) {
                    NumericKeypad(
                        value = s.keypadText, suffix = "м", allowDecimal = true,
                        confirmLabel = stringResource(R.string.calc_action_next),
                        onValue = onKeypadValue, onConfirm = onKeypadConfirm,
                    )
                }
            }
        }
    }
}
