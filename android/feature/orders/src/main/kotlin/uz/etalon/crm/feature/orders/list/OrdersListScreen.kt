package uz.etalon.crm.feature.orders.list

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.core.content.FileProvider
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.calendar.CapacityCalendarCard
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonFilterChip
import uz.etalon.crm.core.designsystem.components.EtalonIconButton
import uz.etalon.crm.core.designsystem.components.MonthHeader
import uz.etalon.crm.core.designsystem.components.OrderRow
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SearchField
import uz.etalon.crm.core.designsystem.components.SegmentItem
import uz.etalon.crm.core.designsystem.components.SegmentedControl
import uz.etalon.crm.core.designsystem.components.navPillContentPadding
import uz.etalon.crm.core.designsystem.components.orderStatusShortLabel
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrdersView
import uz.etalon.crm.core.model.PaymentFilter
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.owesNothing
import uz.etalon.crm.core.ui.format.TASHKENT
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatCountBare
import uz.etalon.crm.core.ui.format.formatDate
import uz.etalon.crm.core.ui.format.formatMonthYear
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatOrderNo
import uz.etalon.crm.core.ui.format.formatShortDate
import uz.etalon.crm.feature.orders.R
import uz.etalon.crm.feature.orders.calendar.DaySheet
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * The chip row, left to right as `2b-orders.png` draws it — «Барчаси» then the app's real
 * statuses in the order an order moves through them, CANCELED last. Every status the list can
 * return is here (LOADED included, off the capture's right edge) so «Барчаси» is always the sum of
 * the chips beside it; DRAFT is the one omission — the mobile never lists a draft.
 */
private val STATUS_CHIPS = listOf(
    null, OrderStatus.PLACED, OrderStatus.IN_PRODUCTION, OrderStatus.LOADED, OrderStatus.DISPATCHED,
    OrderStatus.DELIVERED, OrderStatus.CANCELED,
)

/** §2's chip row: `spacedBy(6)` — off the 4-pt grid, so it is named once here. */
private val CHIP_GAP = 6.dp

/** The «Рўйхат» header and the month dividers line up on the sheet's own 6 dp inset
 *  ([MonthHeader] carries the same one), which is not a grid step either. */
private val SHEET_INSET = 6.dp

/** The paging spinner, sized like the one inside a button rather than a full-page indicator. */
private val SPINNER = 20.dp
private val SPINNER_STROKE = 2.dp

/** Rows left before the end of the list at which the next page is asked for. */
private const val PREFETCH_ROWS = 4

/** What the server streams from `/api/orders/export`, so the chooser offers the spreadsheet apps
 *  and not «every app that takes a file». */
private const val XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

@Composable
fun OrdersListRoute(
    onOpenOrder: (String) -> Unit,
    onNewOrder: (() -> Unit)?,
    canExport: Boolean = false,
    vm: HiltOrdersListViewModel = hiltViewModel<HiltOrdersListViewModel, HiltOrdersListViewModel.Factory>(
        creationCallback = { it.create(canExport) },
    ),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    OrdersListScreen(
        s = s,
        // The clock is read here and nowhere below: the calendar's «today» ring would otherwise
        // make every screenshot of this screen a photograph of the day it was recorded.
        today = LocalDate.now(TASHKENT),
        onQuery = vm::setQuery, onStatus = vm::setStatus, onPayment = vm::setPayment,
        onDay = vm::setDay, onView = vm::setView,
        onPrevMonth = vm::prevMonth, onNextMonth = vm::nextMonth,
        onRefreshCalendar = vm::refreshCalendar,
        onExport = vm::exportBackup, onExportConsumed = vm::consumeExport,
        onDismissExportError = vm::dismissExportError,
        onRefresh = vm::refresh, onLoadMore = vm::loadMore,
        onOpen = onOpenOrder, onNewOrder = onNewOrder,
    )
}

/**
 * `2b-orders.png`, top to bottom: «Буюртмалар» over its subtitle with the header action opposite,
 * the Рўйхат | Жадвал switch, and then whichever of the two views is on (design §2).
 *
 * **Рўйхат** is phase 2's screen unchanged — the search field with its filter square, the status
 * chips with facet counts, and the navy sheet with the Барчаси/Қарз/Тўланган switch over
 * month-headed [OrderRow]s — plus the dismissible day chip when a day is filtered (§3).
 * **Жадвал** is the capacity grid over the navy day sheet (§4). The two views share `query`,
 * `status`, `payment` and `day`: there is one ViewModel behind both (R1), and switching cannot
 * lose a filter.
 *
 * The shell no longer wraps the tabs in a `Scaffold`, so the screen applies [statusBarsPadding]
 * itself — without it the header draws under the clock. The bottom is each view's own
 * [navPillContentPadding], which is what the floating nav pill needs to scroll clear, plus
 * [imePadding] (ruling R13): `enableEdgeToEdge` makes the manifest's `adjustResize` inert, so
 * without it the search field at the top stays put while the keyboard eats the list under it. This
 * is the one pill consumer with a text field and no sticky bar to hide in its place — the pill's
 * own band nets the keyboard out inside `navPillInsetOf`.
 *
 * @param today the calendar's «Бугун» ring, passed in rather than read here — see [OrdersListRoute].
 * @param onNewOrder null for an operator without `calculator.use` — they get no «+ Янги» at all,
 * rather than a button that opens a tab they do not have.
 */
@Composable
fun OrdersListScreen(
    s: OrdersListUiState,
    today: LocalDate,
    onQuery: (String) -> Unit,
    onStatus: (OrderStatus?) -> Unit,
    onPayment: (PaymentFilter?) -> Unit,
    onDay: (LocalDate?) -> Unit,
    onView: (OrdersView) -> Unit,
    onPrevMonth: () -> Unit,
    onNextMonth: () -> Unit,
    onRefreshCalendar: () -> Unit,
    onExport: () -> Unit,
    onExportConsumed: () -> Unit,
    onDismissExportError: () -> Unit,
    onRefresh: () -> Unit,
    onLoadMore: () -> Unit,
    onOpen: (String) -> Unit,
    onNewOrder: (() -> Unit)?,
) {
    var pickDay by remember { mutableStateOf(false) }
    // The share sheet is the one failure the ViewModel cannot see: by the time the file exists its
    // work is done, and handing it to the system is this screen's. It raises the export's own
    // banner rather than a second wording for the same sentence.
    var shareFailed by remember { mutableStateOf(false) }
    val calendar = s.view == OrdersView.CALENDAR
    ShareBackupEffect(s.exportFile, onExportConsumed) { shareFailed = true }

    Column(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding().imePadding()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.headerMargin, vertical = EtalonSpace.md),
            verticalAlignment = Alignment.Bottom,
        ) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.orders_title), style = EtalonType.displayTitle, color = EtalonColors.ink)
                // §2: the subtitle describes the view. «N буюртма · X м²» is the filtered list's
                // own summary and would be a caption on the wrong picture over a month grid whose
                // every cell states its own count.
                if (calendar) {
                    Text(
                        stringResource(R.string.orders_subtitle_calendar),
                        style = EtalonType.meta,
                        color = EtalonColors.ink2,
                    )
                } else {
                    s.facets?.let {
                        Text(
                            stringResource(R.string.orders_count_area, formatCountBare(it.total), formatArea(it.totalArea)),
                            style = EtalonType.meta,
                            color = EtalonColors.ink2,
                        )
                    }
                }
            }
            // One slot, two views: «+ Янги» belongs to the list a new order joins, the Excel
            // backup to the planner's month. Neither is drawn without the permission behind it.
            if (calendar) {
                if (s.canExport) ExportAction(s.exporting, onExport)
            } else if (onNewOrder != null) {
                PrimaryButton(
                    stringResource(R.string.orders_new), onNewOrder,
                    compact = true, leadingIcon = EtalonIcons.Plus,
                )
            }
        }
        SegmentedControl(
            items = listOf(
                SegmentItem(stringResource(R.string.orders_view_list)),
                SegmentItem(stringResource(R.string.orders_view_calendar)),
            ),
            selectedIndex = if (calendar) 1 else 0,
            onSelect = {
                // Leaving Жадвал takes its banner with it: the export's failure belongs to the
                // header button that is no longer on screen, and Рўйхат has its own banner to show.
                if (it == 0) { onDismissExportError(); shareFailed = false }
                onView(if (it == 1) OrdersView.CALENDAR else OrdersView.LIST)
            },
            modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin),
            onNavy = false,
            fill = true,
        )
        Spacer(Modifier.height(EtalonSpace.sm))
        if (calendar) {
            CalendarView(
                s = s, today = today, exportFailed = s.exportFailed || shareFailed,
                onDismissExport = { onDismissExportError(); shareFailed = false },
                onDay = onDay, onPrevMonth = onPrevMonth, onNextMonth = onNextMonth,
                onRefreshCalendar = onRefreshCalendar, onExport = onExport, onOpen = onOpen,
            )
        } else {
            ListView(s, onQuery, onStatus, onPayment, onDay, onRefresh, onLoadMore, onOpen) { pickDay = true }
        }
    }
    if (pickDay) {
        DayPickerDialog(
            day = s.day,
            onPick = { onDay(it); pickDay = false },
            onClear = { onDay(null); pickDay = false },
            onDismiss = { pickDay = false },
        )
    }
}

/**
 * The export button, or the spinner that replaces it while the workbook streams (§5).
 * [EtalonIconButton] has no busy state of its own, so the indicator is drawn in the same 48 dp
 * slot the button occupies — the header must not reflow when the download starts.
 */
@Composable
private fun ExportAction(exporting: Boolean, onExport: () -> Unit) {
    if (exporting) {
        Box(Modifier.size(EtalonSpace.minTouch), Alignment.Center) {
            CircularProgressIndicator(
                color = EtalonColors.indigo, strokeWidth = SPINNER_STROKE,
                modifier = Modifier.size(SPINNER),
            )
        }
    } else {
        EtalonIconButton(EtalonIcons.Download, stringResource(R.string.orders_export_cd), onExport)
    }
}

/** Рўйхат as phase 2 built it, plus §3's day chip. */
@Composable
private fun ListView(
    s: OrdersListUiState,
    onQuery: (String) -> Unit,
    onStatus: (OrderStatus?) -> Unit,
    onPayment: (PaymentFilter?) -> Unit,
    onDay: (LocalDate?) -> Unit,
    onRefresh: () -> Unit,
    onLoadMore: () -> Unit,
    onOpen: (String) -> Unit,
    onPickDay: () -> Unit,
) {
    Row(
        Modifier.padding(horizontal = EtalonSpace.headerMargin),
        horizontalArrangement = Arrangement.spacedBy(EtalonSpace.sm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SearchField(
            s.query, onQuery, stringResource(R.string.orders_search_placeholder),
            Modifier.weight(1f), onClear = { onQuery("") },
        )
        // Ruling R5: the Material picker stays as Рўйхат's own way in — it is what an operator
        // has when the calendar view has no cached month to show — and it carries the badge while
        // a day is set. The chips stay visible.
        EtalonIconButton(
            EtalonIcons.SlidersHorizontal, stringResource(R.string.orders_filter_day),
            onClick = onPickDay, badge = s.day != null, shape = EtalonShapes.md,
        )
    }
    LazyRow(
        contentPadding = PaddingValues(horizontal = EtalonSpace.headerMargin),
        horizontalArrangement = Arrangement.spacedBy(CHIP_GAP),
    ) {
        items(STATUS_CHIPS) { st ->
            EtalonFilterChip(
                // §3.2 spells this chip out — «Ишлаб чиқариш», not the row tag's «Ишлаб чиқ.»,
                // which exists only because a tag inside a row has no width to spare.
                label = when (st) {
                    null -> stringResource(R.string.orders_seg_all)
                    OrderStatus.IN_PRODUCTION -> stringResource(R.string.orders_chip_in_production)
                    else -> stringResource(orderStatusShortLabel(st))
                },
                selected = s.status == st,
                onClick = { onStatus(st) },
                // Ruling R5: the counts describe the whole filtered set, not the loaded rows.
                count = s.facets?.let { f -> if (st == null) f.total else f.byStatus[st] ?: 0 },
            )
        }
    }
    // §3: the day filter, whichever view set it, is visible here as one dismissible chip. The ×
    // is the affordance and the whole pill is the target — see `EtalonFilterChip.trailingIcon`.
    s.day?.let { d ->
        val label = formatShortDate(d)
        Row(Modifier.padding(horizontal = EtalonSpace.headerMargin)) {
            EtalonFilterChip(
                label = label,
                selected = true,
                onClick = { onDay(null) },
                trailingIcon = EtalonIcons.X,
                contentDescription = stringResource(R.string.orders_day_chip_cd, label),
            )
        }
    }
    Spacer(Modifier.height(EtalonSpace.sm))
    s.error?.let {
        ErrorBanner(
            it, onRetry = onRefresh,
            modifier = Modifier.padding(horizontal = EtalonSpace.headerMargin).padding(bottom = EtalonSpace.rowGap),
        )
    }
    NavyList(s, onPayment, onOpen, onLoadMore, onRefresh)
}

/**
 * Жадвал (design §4): the month card, and under it the navy sheet for the selected day. The card
 * does not move when the sheet appears — the sheet grows *below* it, and its whole height is
 * inside one [AnimatedVisibility] — which is the acceptance's «no layout jump» and what
 * `OrdersListScreenTest` measures.
 *
 * The grid is the scrolling region's first item rather than a fixed header: at font scale 1,3 the
 * card alone is taller than a 360 dp phone, and a planner who cannot scroll to the last week of
 * the month has no calendar at all.
 *
 * @param exportFailed the download failed, or the share sheet would not open. One banner either
 *   way: what the operator can do about it — tap again — is the same.
 * @param onDismissExport the banner's ×. The export's failure is the one banner on this screen
 *   that outlives what caused it: the calendar under it is fine, and until Task 7 the only way to
 *   put the sentence away was to leave Жадвал and come back.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CalendarView(
    s: OrdersListUiState,
    today: LocalDate,
    exportFailed: Boolean,
    onDismissExport: () -> Unit,
    onDay: (LocalDate?) -> Unit,
    onPrevMonth: () -> Unit,
    onNextMonth: () -> Unit,
    onRefreshCalendar: () -> Unit,
    onExport: () -> Unit,
    onOpen: (String) -> Unit,
) {
    val sheet = s.daySheet
    // The sheet the exit animation draws while it shrinks. A plain holder, not a state: nothing
    // should recompose because the *departing* copy was kept, and a `null` day sheet with an
    // animation still running has no content of its own to offer.
    val lastSheet = remember { arrayOfNulls<DaySheetState>(1) }
    if (sheet != null) lastSheet[0] = sheet

    PullToRefreshBox(
        // The CALENDAR's own state, not the list's: pulling here re-fetches the month, and the
        // indicator must answer for that and not for a page of rows nobody is looking at.
        isRefreshing = s.isCalendarRefreshing,
        onRefresh = onRefreshCalendar,
        modifier = Modifier.fillMaxSize(),
    ) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = navPillContentPadding(
                start = EtalonSpace.cardMargin, top = EtalonSpace.sm, end = EtalonSpace.cardMargin,
            ),
        ) {
            if (exportFailed) {
                item {
                    ErrorBanner(
                        stringResource(R.string.orders_export_failed), onRetry = onExport,
                        onDismiss = onDismissExport,
                        modifier = Modifier.padding(bottom = EtalonSpace.rowGap),
                    )
                }
            }
            // §8: a month that could not be fetched shows the banner over a grid with dates and no
            // figures. The card itself draws that state; nothing here invents zeros for it.
            (s.capacity as? Resource.Error)?.let { failure ->
                item {
                    ErrorBanner(
                        failure.error.message, onRetry = onRefreshCalendar,
                        modifier = Modifier.padding(bottom = EtalonSpace.rowGap),
                    )
                }
            }
            // M6: the figures below are the last good ones and the pull that tried to replace them
            // failed. Mutually exclusive with the banner above — that one is for a month with
            // nothing behind it, this one for a month that has figures and could not freshen them.
            if (s.calendarRefreshFailed) {
                item {
                    ErrorBanner(
                        stringResource(R.string.orders_calendar_refresh_failed),
                        onRetry = onRefreshCalendar,
                        modifier = Modifier.padding(bottom = EtalonSpace.rowGap),
                    )
                }
            }
            item {
                CapacityCalendarCard(
                    month = s.cursorMonth,
                    capacity = s.capacity,
                    selected = s.day,
                    today = today,
                    onPrev = onPrevMonth,
                    onNext = onNextMonth,
                    onSelect = { onDay(it) },
                )
            }
            item {
                AnimatedVisibility(
                    visible = sheet != null,
                    enter = expandVertically(),
                    exit = shrinkVertically(),
                ) {
                    // The gap is inside the animation, so it collapses with the sheet instead of
                    // leaving 10 dp of nothing under the card on a month with no day selected.
                    Column {
                        Spacer(Modifier.height(EtalonSpace.rowGap))
                        lastSheet[0]?.let { DaySheet(it, onOpen, onRetry = onRefreshCalendar) }
                    }
                }
            }
        }
    }
}

/**
 * Hands the downloaded workbook to the system share sheet and tells the ViewModel it is done, so
 * the same file is never offered twice (§5). The `content://` grant is the quote PNG's own
 * `FileProvider`, scoped in `file_paths.xml` to `cache/exports` and nothing wider.
 */
@Composable
private fun ShareBackupEffect(file: File?, onConsumed: () -> Unit, onFailed: () -> Unit) {
    val context = LocalContext.current
    LaunchedEffect(file) {
        if (file == null) return@LaunchedEffect
        try {
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", file)
            context.startActivity(Intent.createChooser(shareBackupIntent(uri), null))
        } catch (e: Exception) {
            // A phone with nothing that opens a spreadsheet, or a provider grant that could not be
            // built: the workbook is on disk either way, and the banner offers the tap again.
            onFailed()
        }
        onConsumed()
    }
}

private fun shareBackupIntent(uri: Uri): Intent = Intent(Intent.ACTION_SEND).apply {
    type = XLSX_MIME
    putExtra(Intent.EXTRA_STREAM, uri)
    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION) // without this every receiver gets a SecurityException
}

/**
 * The navy sheet is Рўйхат's scrolling region: it runs to the bottom edge, so it rounds its
 * top corners only ([EtalonShapes.sheetTop]), and everything above it — header, switch, search,
 * chips — stays put while the months scroll under it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NavyList(
    s: OrdersListUiState,
    onPayment: (PaymentFilter?) -> Unit,
    onOpen: (String) -> Unit,
    onLoadMore: () -> Unit,
    onRefresh: () -> Unit,
) {
    // `debtLabel` is a plain lambda, not a @Composable one, so the wording is read from the
    // context rather than with `stringResource` at the point of use.
    val ctx = LocalContext.current
    val listState = rememberLazyListState()
    val nearEnd by remember {
        derivedStateOf {
            val l = listState.layoutInfo
            (l.visibleItemsInfo.lastOrNull()?.index ?: 0) >= l.totalItemsCount - PREFETCH_ROWS
        }
    }
    // `loadingMore` is a key, not just a condition: when a page lands while the list is still
    // parked at the end, nothing else changes, and without it the next page is never asked for.
    LaunchedEffect(nearEnd, s.hasMore, s.loadingMore) { if (nearEnd && s.hasMore && !s.loadingMore) onLoadMore() }
    PullToRefreshBox(isRefreshing = s.isRefreshing, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
        LazyColumn(
            state = listState,
            modifier = Modifier.fillMaxSize().clip(EtalonShapes.sheetTop).background(EtalonColors.navy),
            contentPadding = navPillContentPadding(
                start = EtalonSpace.rowGap, end = EtalonSpace.rowGap, top = EtalonSpace.cardPadV,
            ),
        ) {
            item {
                Row(
                    Modifier.fillMaxWidth().padding(start = SHEET_INSET),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    Text(stringResource(R.string.orders_list_title), style = EtalonType.sectionTitle, color = EtalonColors.onDark)
                    SegmentedControl(
                        items = listOf(
                            SegmentItem(stringResource(R.string.orders_seg_all), s.facets?.total),
                            SegmentItem(stringResource(R.string.orders_seg_debt), s.facets?.debt),
                            SegmentItem(stringResource(R.string.orders_seg_paid), s.facets?.paid),
                        ),
                        selectedIndex = when (s.payment) {
                            null -> 0
                            PaymentFilter.DEBT -> 1
                            PaymentFilter.PAID -> 2
                        },
                        onSelect = {
                            onPayment(
                                when (it) {
                                    1 -> PaymentFilter.DEBT
                                    2 -> PaymentFilter.PAID
                                    else -> null
                                },
                            )
                        },
                    )
                }
            }
            // Not while a refresh is in flight: "nothing found" must never be the answer shown
            // over a list that is still being fetched.
            if (s.groups.isEmpty() && !s.isRefreshing) {
                item {
                    Text(
                        stringResource(R.string.orders_not_found),
                        style = EtalonType.body,
                        color = EtalonColors.onDarkMuted,
                        modifier = Modifier.padding(EtalonSpace.lg),
                    )
                }
            }
            s.groups.forEach { g ->
                item(key = "m-${g.month}") { MonthHeader(formatMonthYear(g.month), g.total) }
                items(g.rows, key = { it.id }) { o ->
                    // A canceled order owes nothing and has paid nothing: neither «қолди …» nor
                    // «тўланган» is true of it, so the row carries no second line at all.
                    // The rule lives at `OrderStatus.owesNothing` (core:model) — the order detail
                    // reads the same one, so a row and the screen it opens cannot disagree.
                    val canceled = o.status.owesNothing
                    OrderRow(
                        clientName = o.client.name,
                        status = o.status,
                        metaLine = "${formatOrderNo(o.orderNumber)} · ${formatArea(o.totalArea)}",
                        total = o.totalPrice,
                        debt = if (canceled) null else o.remaining,
                        paidLabel = if (canceled) null else stringResource(R.string.orders_paid),
                        debtLabel = { ctx.getString(R.string.orders_debt, formatMoney(it)) },
                        onDark = true,
                        onClick = { onOpen(o.id) },
                    )
                }
            }
            if (s.loadingMore) {
                item {
                    Box(Modifier.fillMaxWidth().padding(EtalonSpace.md), Alignment.Center) {
                        CircularProgressIndicator(
                            color = EtalonColors.lavender, strokeWidth = SPINNER_STROKE,
                            modifier = Modifier.size(SPINNER),
                        )
                    }
                }
            }
        }
    }
}

/**
 * Ruling R6's day filter, and R5's fallback: Рўйхат keeps this picker for the operator whose
 * calendar view has no cached month to choose from. The picker works in UTC midnights, so the seed
 * and the read-back both use [ZoneOffset.UTC]; seeding from Tashkent midnight (19:00 UTC the day
 * before) would reopen the picker on the previous day and let «Танлаш» move the filter without the
 * operator touching a date.
 *
 * Material3's own «Select date» / «Selected date» headings are drawn from the platform's own
 * resources, so both slots are filled with the app's Uzbek wording instead and the keyboard-entry
 * toggle (whose hint and error text cannot be replaced at all) is turned off. The calendar grid's
 * month and weekday names still read English: CLDR does carry `uz-Cyrl` calendar data, but
 * `DatePicker` takes its `CalendarLocale` from the device, and this app ships no locale
 * configuration of its own — forcing one is an app-wide change, not this screen's. Жадвал is the
 * Uzbek answer to the same job.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DayPickerDialog(day: LocalDate?, onPick: (LocalDate) -> Unit, onClear: () -> Unit, onDismiss: () -> Unit) {
    val state = rememberDatePickerState(
        initialSelectedDateMillis = day?.atStartOfDay(ZoneOffset.UTC)?.toInstant()?.toEpochMilli(),
    )
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(
                onClick = { state.selectedDateMillis?.let { onPick(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) } },
                enabled = state.selectedDateMillis != null,
            ) { Text(stringResource(R.string.orders_day_pick), style = EtalonType.sectionTitle, color = EtalonColors.indigo) }
        },
        // «Тозалаш» rather than «Бекор»: dismissing the sheet already cancels, so the second
        // button is the one thing a tap outside cannot do — drop the day filter entirely.
        dismissButton = {
            TextButton(onClick = onClear) {
                Text(stringResource(R.string.orders_day_clear), style = EtalonType.sectionTitle, color = EtalonColors.ink2)
            }
        },
        colors = DatePickerDefaults.colors(containerColor = EtalonColors.surface),
    ) {
        DatePicker(
            state = state,
            title = {
                Text(
                    stringResource(R.string.orders_day_title),
                    style = EtalonType.sectionTitle, color = EtalonColors.ink2,
                    modifier = Modifier.padding(start = EtalonSpace.xl, top = EtalonSpace.lg),
                )
            },
            headline = {
                val picked = state.selectedDateMillis?.let { formatDate(Instant.ofEpochMilli(it)) }
                Text(
                    picked ?: stringResource(R.string.orders_day_none),
                    style = EtalonType.headline,
                    color = if (picked != null) EtalonColors.ink else EtalonColors.ink3,
                    modifier = Modifier.padding(start = EtalonSpace.xl, bottom = EtalonSpace.md),
                )
            },
            showModeToggle = false,
            colors = DatePickerDefaults.colors(
                containerColor = EtalonColors.surface,
                selectedDayContainerColor = EtalonColors.indigo,
                todayDateBorderColor = EtalonColors.indigo,
            ),
        )
    }
}
