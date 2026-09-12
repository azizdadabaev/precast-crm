package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import kotlinx.coroutines.delay
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonIconButton
import uz.etalon.crm.core.designsystem.components.EtalonToast
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.components.NoticeBanner
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.TOAST_DURATION_MS
import uz.etalon.crm.core.designsystem.components.navPillContentPadding
import uz.etalon.crm.core.designsystem.components.navPillPadding
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.etalonRipple

// ── §3.4's screen sizes, every one named ──────────────────────────

/**
 * §3.4: «Content bottom padding 190dp» — what the list leaves under its last row for the FIXED
 * summary sheet, which is drawn over the list rather than laid out beside it. The acceptance
 * checklist's own line: «Fixed SummarySheet never covers the last room card (190dp content
 * padding)», asserted at font scale 130 % by `CalculatorScreenshotTest.calculatorFont13`.
 */
internal val SUMMARY_CLEARANCE = 190.dp

/** The fixed sheet's own node. It is drawn OVER the list, so «the last card is not covered» can
 *  only be asserted by measuring where this starts — there is no layout relationship to read it
 *  from, which is exactly why [SUMMARY_CLEARANCE] can drift without anything failing. */
internal const val SUMMARY_SHEET_TAG = "calculatorSummarySheet"

/** §3.4 Header: «pad 10/16» — 16 on each side. */
private val HEADER_PAD_H = EtalonSpace.cardMargin
/** §3.4 Header: «pad 10/16» — 10 top and bottom. */
private val HEADER_PAD_V = EtalonSpace.rowGap
/** The air between the back circle, the title block and «Чизиш». */
private val HEADER_GAP = EtalonSpace.rowGap
/** §3.4 Header: «back IconButton (40, pill, white, hairline)». */
private val BACK_BUTTON = 40.dp

/** §3.4 ClientRow: «margin 12/16/0» — 16 on each side, which every row of the list shares. */
private val LIST_MARGIN_H = EtalonSpace.cardMargin
/** §3.4 ClientRow: «margin 12/16/0» — 12 above it, under the header. */
private val CLIENT_MARGIN_TOP = EtalonSpace.md
/** §3.4 RoomCard: «gap 10 between cards» — and the same air above the first card, below the add
 *  button, and around each banner. Carried by every item rather than by the list's own
 *  `verticalArrangement`, which cannot tell the client row's 12 from a card's 10. */
private val ITEM_GAP = EtalonSpace.rowGap

/** §3.4 AddRoomButton: «h46, dashed 1dp lavender, radius xl, indigo 13/700». */
private val ADD_HEIGHT = 46.dp
/** The dash `DashedTile.kt` draws, restated here because that one is `internal` to the design
 *  system AND fixed at the `lg` radius — this tile is `xl`. */
private val DASH_STROKE = EtalonSpace.hairline
private val DASH_ON = 6.dp
private val DASH_OFF = 5.dp

/** §3.4 SummarySheet: «gradient scrim above» — the same page-to-transparent wash `BottomNavScrim`
 *  lays under the nav pill, at the height this sheet needs. */
private val SCRIM_HEIGHT = 24.dp

/** What `EtalonToast` already holds below itself (§2: «sitting 96 dp above the bottom»). The
 *  calculator's toast has to clear the summary sheet instead, so the sheet's MEASURED height less
 *  this is the lift — measured, not guessed, so it tracks a taller sheet (an error banner, a
 *  wrapped label at 130 %) on its own. */
private val TOAST_OWN_CLEARANCE = 96.dp

/**
 * The calculator, design 3a (`3a-calculator.png`, spec §3.4): the header, the one-line client row
 * over its form, the room cards, «+ Янги хона», and the fixed navy summary sheet over the lot.
 *
 * The screen holds no `CalculatorViewModel` — it renders [CalculatorUiState] and sends events back
 * through the callbacks, matching every other feature's `*Route`/`*Screen` split. [clientForm] and
 * [summarySheet] are the two slots that DO need the ViewModel (the client lookup and its region
 * pickers; the three sheets behind the summary's actions), handed in by [CalculatorRoute] the same
 * way `TotalsSheet` used to be.
 *
 * It computes nothing: every figure a card or the sheet shows came off the engine already.
 *
 * @param onBack null on the bottom-bar tab, where there is nothing to pop — the back circle is
 *   then not drawn at all, rather than drawn dead. See [CalculatorRoute].
 */
@Composable
fun CalculatorScreen(
    s: CalculatorUiState,
    onBack: (() -> Unit)?,
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
    onPickRate: (String, Double?) -> Unit,
    onConfirmRate: (String) -> Boolean,
    onDismissRateConfirm: () -> Unit,
    onToggleClientForm: () -> Unit,
    onDismissToast: () -> Unit,
    clientForm: @Composable () -> Unit,
    summarySheet: @Composable () -> Unit,
) {
    val listState = rememberLazyListState()
    val density = LocalDensity.current
    // One requester per room, owned here rather than inside the card: «next» on the Бўйи cell
    // hands the keyboard to the NEXT room's Эни, which no card can reach from inside itself.
    val widthFocus = remember { mutableMapOf<String, FocusRequester>() }
    // Which room's Эни the keyboard is on its way to. The next room is often below the fold, and
    // an unattached requester throws rather than doing nothing — so the list is scrolled to it
    // first and the focus asked for after (below).
    var pendingFocus by remember { mutableStateOf<String?>(null) }
    var sheetHeight by remember { mutableIntStateOf(0) }

    // R8: the capture never shows an empty calculator, and a blank card is what the operator types
    // into. `restored` is what keeps this from racing the draft: without it the first composition
    // — which happens before Room has answered — would add a room that the restored draft then
    // lands beside.
    LaunchedEffect(s.restored, s.rows.isEmpty()) {
        if (s.restored && s.rows.isEmpty()) onAddRoom()
    }

    LaunchedEffect(s.toast) {
        if (s.toast != null) {
            delay(TOAST_DURATION_MS)
            onDismissToast()
        }
    }

    // A deleted room must not keep its requester alive: the map is the only thing holding it, and
    // a stale entry would hand the keyboard to a card that is no longer on screen.
    LaunchedEffect(s.rows) {
        widthFocus.keys.retainAll(s.rows.mapTo(mutableSetOf()) { it.id })
    }

    // The items ABOVE the rooms, as a list rather than as a run of `item {}` calls: the focus walk
    // below has to scroll to `rooms[i]`, and that is `leading.size + i` — a count that cannot
    // drift from what is actually emitted, unlike a hand-kept constant.
    val leading: List<@Composable () -> Unit> = buildList {
        add {
            CalculatorHeader(
                rooms = s.rows.size,
                onBack = onBack,
                modifier = Modifier.padding(horizontal = HEADER_PAD_H, vertical = HEADER_PAD_V),
            )
        }
        add {
            ClientRow(
                state = s, open = s.clientFormOpen, onToggle = onToggleClientForm,
                modifier = Modifier.padding(horizontal = LIST_MARGIN_H).padding(top = CLIENT_MARGIN_TOP),
            )
        }
        if (s.clientFormOpen) {
            add { Box(Modifier.padding(horizontal = LIST_MARGIN_H).padding(top = ITEM_GAP)) { clientForm() } }
        }
        s.error?.let { message ->
            add { Box(Modifier.padding(horizontal = LIST_MARGIN_H).padding(top = ITEM_GAP)) { ErrorBanner(message) } }
        }
        if (!s.canWrite) {
            add {
                Box(Modifier.padding(horizontal = LIST_MARGIN_H).padding(top = ITEM_GAP)) {
                    NoticeBanner(stringResource(R.string.calc_no_write_permission))
                }
            }
        }
        // The one `saveMessage` that is NOT also a toast: an order the operator queued for later.
        // It is the only place that placement is ever reported, so it stays on screen as a banner
        // rather than passing as a toast (task 5 moves it onto the placement sheet itself).
        if (s.saveMessage == QUEUED_MESSAGE) {
            add {
                Box(Modifier.padding(horizontal = LIST_MARGIN_H).padding(top = ITEM_GAP)) {
                    NoticeBanner(QUEUED_MESSAGE)
                }
            }
        }
        val blocked = s.unpersistableRoomNames
        if (blocked.isNotEmpty()) {
            add {
                Box(Modifier.padding(horizontal = LIST_MARGIN_H).padding(top = ITEM_GAP)) {
                    NoticeBanner(stringResource(R.string.calc_cannot_save_rooms, blocked.joinToString(", ")))
                }
            }
        }
    }

    LaunchedEffect(pendingFocus) {
        val id = pendingFocus ?: return@LaunchedEffect
        val index = s.rows.indexOfFirst { it.id == id }
        if (index >= 0) {
            listState.animateScrollToItem(leading.size + index)
            runCatching { widthFocus.getOrPut(id) { FocusRequester() }.requestFocus() }
        }
        pendingFocus = null
    }

    Box(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding()) {
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize(),
            // Each item carries its own 16 dp inset (see [LIST_MARGIN_H]) so a banner or a card can
            // never disagree with the header about where the page's edge is.
            contentPadding = navPillContentPadding(extraBottom = SUMMARY_CLEARANCE),
        ) {
            items(leading.size) { leading[it]() }
            itemsIndexed(s.rows, key = { _, row -> row.id }) { index, row ->
                val nextId = s.rows.getOrNull(index + 1)?.id
                RoomCard(
                    row = row,
                    draft = s.draft(row.id),
                    expanded = s.expandedRowId == row.id,
                    canMoveUp = index > 0,
                    canMoveDown = index < s.rows.lastIndex,
                    focusRequester = widthFocus.getOrPut(row.id) { FocusRequester() },
                    onNext = nextId?.let { id -> { pendingFocus = id } },
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
                    // The pending confirmation belongs to ONE room — every other card is handed
                    // null, so only the room whose rate was tapped opens the navy panel.
                    rateConfirmPrice = s.rateConfirm?.takeIf { it.rowId == row.id }?.price,
                    onPickRate = { price -> onPickRate(row.id, price) },
                    onConfirmRate = onConfirmRate,
                    onDismissRateConfirm = onDismissRateConfirm,
                    modifier = Modifier.padding(horizontal = LIST_MARGIN_H).padding(top = ITEM_GAP),
                )
            }
            item {
                AddRoomButton(
                    onClick = onAddRoom,
                    modifier = Modifier.padding(horizontal = LIST_MARGIN_H).padding(top = ITEM_GAP),
                )
            }
        }

        Column(Modifier.align(Alignment.BottomCenter).navPillPadding()) {
            Box(
                Modifier.fillMaxWidth().height(SCRIM_HEIGHT).background(
                    Brush.verticalGradient(listOf(EtalonColors.page.copy(alpha = 0f), EtalonColors.page)),
                ),
            )
            Box(Modifier.onSizeChanged { sheetHeight = it.height }.testTag(SUMMARY_SHEET_TAG)) { summarySheet() }
        }

        val toastLift = (with(density) { sheetHeight.toDp() } + LocalNavPillInset.current - TOAST_OWN_CLEARANCE)
            .coerceAtLeast(0.dp)
        EtalonToast(
            message = s.toast.orEmpty(),
            visible = s.toast != null,
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = toastLift),
        )
    }
}

/**
 * §3.4 «Header»: the back circle, «Калькулятор» over «N хона · нарх балка узунлигига қараб», and
 * «Чизиш».
 *
 * «Чизиш» opens the room drawing tool, which is out of v1 scope and stays disabled — §3.4 says to
 * keep the button, and the owner's ruling is that no CAD ships on mobile for now. It is drawn
 * rather than hidden so the header keeps the shape the capture gives it.
 */
@Composable
private fun CalculatorHeader(rooms: Int, onBack: (() -> Unit)?, modifier: Modifier = Modifier) = Row(
    modifier.fillMaxWidth(),
    horizontalArrangement = Arrangement.spacedBy(HEADER_GAP),
    verticalAlignment = Alignment.CenterVertically,
) {
    if (onBack != null) {
        EtalonIconButton(
            icon = EtalonIcons.ArrowLeft,
            contentDescription = stringResource(R.string.calc_back),
            onClick = onBack,
            size = BACK_BUTTON,
        )
    }
    Column(Modifier.weight(1f)) {
        Text(stringResource(R.string.calc_title), style = EtalonType.titleSm, color = EtalonColors.ink, maxLines = 1)
        Text(
            stringResource(R.string.calc_subtitle, rooms),
            style = EtalonType.meta,
            color = EtalonColors.ink2,
            maxLines = 1,
        )
    }
    SecondaryButton(
        text = stringResource(R.string.calc_draw),
        onClick = {},
        enabled = false,
        leadingIcon = EtalonIcons.Pencil,
        compact = true,
    )
}

/** §3.4 «AddRoomButton» — the dashed lavender tile under the last card. */
@Composable
private fun AddRoomButton(onClick: () -> Unit, modifier: Modifier = Modifier) = Box(
    modifier
        .minimumInteractiveComponentSize()
        .fillMaxWidth()
        .height(ADD_HEIGHT)
        .clip(EtalonShapes.xl)
        .dashedXlBorder(EtalonColors.lavender)
        .clickable(
            role = Role.Button,
            indication = etalonRipple(false),
            interactionSource = remember { MutableInteractionSource() },
            onClick = onClick,
        ),
    contentAlignment = Alignment.Center,
) {
    Text(stringResource(R.string.calc_add_room_new), style = EtalonType.rowTitle, color = EtalonColors.indigo)
}

/**
 * The dashed outline of that tile, on the `xl` corner.
 *
 * `DashedTile.kt`'s `dashedTileBorder` is the same dash but it is `internal` to the design system
 * and reads [EtalonShapes.lg] — this tile is a card-sized `xl`, so the radius is read from the
 * shape here for the same reason: the dash can never drift from the `clip` it is drawn inside.
 * The stroke is inset by half its width, or the clip eats half of it.
 */
private fun Modifier.dashedXlBorder(color: Color): Modifier = drawBehind {
    val w = DASH_STROKE.toPx()
    val radius = EtalonShapes.xl.topStart.toPx(size, this)
    drawRoundRect(
        color = color,
        topLeft = Offset(w / 2f, w / 2f),
        size = Size(size.width - w, size.height - w),
        cornerRadius = CornerRadius(radius - w / 2f),
        style = Stroke(width = w, pathEffect = PathEffect.dashPathEffect(floatArrayOf(DASH_ON.toPx(), DASH_OFF.toPx()))),
    )
}

