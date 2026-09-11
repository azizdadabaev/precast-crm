package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.ExperimentalFoundationApi
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
import androidx.compose.material3.SheetValue
import androidx.compose.material3.rememberBottomSheetScaffoldState
import androidx.compose.material3.rememberStandardBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.navPillPadding

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
 * The room list, with the totals sheet ([TotalsSheet]) as a PERSISTENT bottom sheet beneath it
 * (`BottomSheetScaffold`, never `Hidden` — see `TotalsSheet.kt`'s KDoc). Room dimensions are typed
 * straight into the cards on the system decimal keyboard (`CalculatorViewModel.setWidthText`); the
 * docked keypad that used to sit here is gone.
 *
 * [totalsSheetContent] is that sheet's content, handed in by the caller
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
 * room card. Pinning the expanded form too used to fill the entire viewport and hide every room;
 * since the bar starts expanded (it collapses only once a phone AND a name are on file), that was
 * the state at the start of every quote.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalFoundationApi::class)
@Composable
fun CalculatorScreen(
    s: CalculatorUiState,
    onAddRoom: () -> Unit,
    onDuplicateRoom: (String) -> Unit,
    onDeleteRoom: (String) -> Unit,
    onMoveRoomUp: (String) -> Unit,
    onMoveRoomDown: (String) -> Unit,
    onSetName: (String, String) -> Unit,
    onToggleExpanded: (String) -> Unit,
    onWidthText: (String, String) -> Unit,
    onLengthText: (String, String) -> Unit,
    onBearingText: (String, String) -> Unit,
    onCorrectionText: (String, String) -> Unit,
    onCyclePattern: (String) -> Unit,
    onExtraBeams: (String, Int) -> Unit,
    onForceStartBeam: (String, Boolean) -> Unit,
    onApplyRateOverride: (String, Double, String) -> Unit,
    onClearRateOverride: (String) -> Unit,
    clientBarCollapsed: @Composable () -> Unit,
    clientBarExpanded: @Composable () -> Unit,
    totalsSheetContent: @Composable ColumnScope.() -> Unit,
) {
    val listState = rememberLazyListState()
    // One requester per room, owned here rather than inside the card: «next» on the Бўйи cell
    // hands the keyboard to the NEXT room's Эни, which no card can reach from inside itself.
    val widthFocus = remember { mutableMapOf<String, FocusRequester>() }
    val sheetState = rememberStandardBottomSheetState(initialValue = SheetValue.PartiallyExpanded, skipHiddenState = true)
    val scaffoldState = rememberBottomSheetScaffoldState(bottomSheetState = sheetState)

    BottomSheetScaffold(
        // The floating nav pill (`SignedInShell`) is drawn OVER this screen, and the collapsed
        // totals sheet is pinned to the window's bottom edge — so without this the pill sat on
        // the summary and a tap meant to expand it switched tabs instead. Padding the scaffold,
        // rather than the sheet, lifts the whole body with it. `clipToBounds` is the other
        // half: the sheet is a full-height child translated down, so without it the part of it
        // below the peek goes on drawing into the strip the pill occupies. The calculator is
        // restyled in its own phase; this is clearance, not the restyle.
        modifier = Modifier.navPillPadding().clipToBounds(),
        scaffoldState = scaffoldState,
        sheetPeekHeight = CALC_SHEET_PEEK_HEIGHT,
        sheetContent = totalsSheetContent,
    ) { pad ->
        Column(Modifier.fillMaxSize().padding(pad)) {
            // The FAB floats within THIS Box only, not the whole body.
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
                    // Only the collapsed one-liner is ever pinned (see this file's own KDoc);
                    // either branch occupies exactly one list index before the rooms.
                    if (s.clientFormOpen) {
                        item { clientBarExpanded() }
                    } else {
                        stickyHeader { clientBarCollapsed() }
                    }
                    if (s.rows.isEmpty()) item { EmptyState(stringResource(R.string.calc_empty), modifier = Modifier.padding(horizontal = 16.dp)) }
                    itemsIndexed(s.rows, key = { _, row -> row.id }) { index, row ->
                        val nextId = s.rows.getOrNull(index + 1)?.id
                        RoomCard(
                            row = row,
                            draft = s.draft(row.id),
                            expanded = s.expandedRowId == row.id,
                            canMoveUp = index > 0,
                            canMoveDown = index < s.rows.lastIndex,
                            focusRequester = widthFocus.getOrPut(row.id) { FocusRequester() },
                            // The next room may not be composed yet (it is below the fold), and a
                            // requester that is not attached throws rather than doing nothing —
                            // in which case the keyboard simply stays where it is.
                            onNext = nextId?.let { id ->
                                { runCatching { widthFocus.getOrPut(id) { FocusRequester() }.requestFocus() } }
                            },
                            onNameChange = { onSetName(row.id, it) },
                            onWidthChange = { onWidthText(row.id, it) },
                            onLengthChange = { onLengthText(row.id, it) },
                            onBearingChange = { onBearingText(row.id, it) },
                            onCorrectionChange = { onCorrectionText(row.id, it) },
                            onCyclePattern = { onCyclePattern(row.id) },
                            onToggleExpanded = { onToggleExpanded(row.id) },
                            onExtraBeams = { onExtraBeams(row.id, it) },
                            onForceStartBeam = { onForceStartBeam(row.id, it) },
                            onDuplicate = { onDuplicateRoom(row.id) },
                            onDelete = { onDeleteRoom(row.id) },
                            onMoveUp = { onMoveRoomUp(row.id) },
                            onMoveDown = { onMoveRoomDown(row.id) },
                            onApplyRateOverride = { price, reason -> onApplyRateOverride(row.id, price, reason) },
                            onClearRateOverride = { onClearRateOverride(row.id) },
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
        }
    }
}
