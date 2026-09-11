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
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.NumericKeypad
import uz.etalon.crm.core.designsystem.theme.EtalonSpace

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
 * The client bar occupies the room `LazyColumn`'s own item index 0 — either as a `stickyHeader`
 * ([clientBarCollapsed]) or as a plain scrolling `item` ([clientBarExpanded]), exactly one of the
 * two per [CalculatorUiState.clientBarCollapsed] (see the `LazyColumn` body below) — so a room at
 * position `i` within [CalculatorUiState.rows] sits at overall list index `i + ROOM_LIST_HEADER_OFFSET`
 * either way. Two places need this translation: the keypad's auto-scroll effect just below, and
 * `RoomCard.kt`'s `DragHandle`, which reads/writes [androidx.compose.foundation.lazy.LazyListState.layoutInfo]
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
 * [clientBarCollapsed] and [clientBarExpanded] are `ClientBar.kt`'s `ClientBarCollapsed`/
 * `ClientBarExpanded`, handed in the same way [totalsSheetContent] hands in `TotalsSheet`: slots
 * built by [CalculatorRoute] (which alone holds the `CalculatorViewModel`). Only ONE of the two
 * ever renders at a time (below), and only the collapsed one-liner is ever pinned as a
 * `stickyHeader` — the five-field expanded form is an ordinary item that scrolls away like any
 * room card. Pinning the expanded form too used to fill the entire viewport under the docked
 * keypad and hide every room; since the bar starts expanded (it collapses only once a phone AND a
 * name are on file), that was the state at the start of every quote.
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
    clientBarCollapsed: @Composable () -> Unit,
    clientBarExpanded: @Composable () -> Unit,
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
        // The floating nav pill (`SignedInShell`) is drawn OVER this screen, and the collapsed
        // totals sheet is pinned to the window's bottom edge — so without this the pill sat on
        // the summary and a tap meant to expand it switched tabs instead. Padding the scaffold,
        // rather than the sheet, lifts the docked keypad with it. `clipToBounds` is the other
        // half: the sheet is a full-height child translated down, so without it the part of it
        // below the peek goes on drawing into the strip the pill occupies. The calculator is
        // restyled in its own phase; this is clearance, not the restyle.
        modifier = Modifier.padding(bottom = EtalonSpace.underNav).clipToBounds(),
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
                    // No horizontal inset here — unlike before, the client bar's own background
                    // (`ClientBar.kt`) must span the FULL width edge to edge whether it's the
                    // pinned collapsed row or the scrolling expanded form, so each item insets
                    // itself by 16dp instead (matching `ClientBar.kt`'s own 16dp content padding).
                    // Extra bottom room so the FAB — which floats over the list, not the layout —
                    // never sits on top of the last card's «Қўшимча» row.
                    contentPadding = PaddingValues(top = 16.dp, bottom = 96.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    // Only the collapsed one-liner is ever pinned — see [ROOM_LIST_HEADER_OFFSET]'s
                    // own doc. Either branch occupies exactly one list index before the rooms.
                    if (s.clientBarCollapsed) {
                        stickyHeader { clientBarCollapsed() }
                    } else {
                        item { clientBarExpanded() }
                    }
                    if (s.rows.isEmpty()) item { EmptyState(stringResource(R.string.calc_empty), modifier = Modifier.padding(horizontal = 16.dp)) }
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
                            modifier = Modifier.padding(horizontal = 16.dp),
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
                // No `navigationBarsPadding()` here: the scaffold above already reserves
                // `EtalonSpace.underNav` at the bottom. (Until the restyle this said
                // `NavigationSuiteScaffold` consumed the navigation-bar insets for the content
                // slot; that scaffold is gone, and `SignedInShell` consumes nothing.)
                //
                // That 100 dp clears the pill under GESTURE navigation, where the inset is a few
                // dp of handle. Under THREE-BUTTON navigation the pill sits at inset + 72 dp —
                // about 120 dp on this device — so `underNav` is roughly 20 dp short and the
                // pill overlaps the bottom of the sheet. Fixing it properly means an inset-aware
                // clearance in the design system rather than a constant, so it is carried to the
                // phase-3 plan instead of being patched screen by screen here.
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
