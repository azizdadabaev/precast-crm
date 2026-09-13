package uz.etalon.crm.feature.orders.list

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
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
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
import uz.etalon.crm.core.model.PaymentFilter
import uz.etalon.crm.core.model.owesNothing
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatCountBare
import uz.etalon.crm.core.ui.format.formatDate
import uz.etalon.crm.core.ui.format.formatMonthYear
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatOrderNo
import uz.etalon.crm.feature.orders.R
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
        s = s, onQuery = vm::setQuery, onStatus = vm::setStatus, onPayment = vm::setPayment,
        onDay = vm::setDay, onRefresh = vm::refresh, onLoadMore = vm::loadMore,
        onOpen = onOpenOrder, onNewOrder = onNewOrder,
    )
}

/**
 * `2b-orders.png`, top to bottom: «Буюртмалар» over «N буюртма · X м²» with the «+ Янги» pill
 * opposite, the search field with its filter square, the status chips with facet counts, and the
 * navy sheet — «Рўйхат» + the Барчаси/Қарз/Тўланган switch over month-headed [OrderRow]s.
 *
 * The shell no longer wraps the tabs in a `Scaffold`, so the screen applies
 * [statusBarsPadding] itself — without it the header draws under the clock. The bottom is the
 * list's own [navPillContentPadding], which is what the floating nav pill needs to scroll clear,
 * plus [imePadding] (ruling R13): `enableEdgeToEdge` makes the manifest's `adjustResize` inert, so
 * without it the search field at the top stays put while the keyboard eats the list under it. This
 * is the one pill consumer with a text field and no sticky bar to hide in its place — the pill's
 * own band nets the keyboard out inside `navPillInsetOf`.
 *
 * @param onNewOrder null for an operator without `calculator.use` — they get no «+ Янги» at all,
 * rather than a button that opens a tab they do not have.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrdersListScreen(
    s: OrdersListUiState,
    onQuery: (String) -> Unit,
    onStatus: (OrderStatus?) -> Unit,
    onPayment: (PaymentFilter?) -> Unit,
    onDay: (LocalDate?) -> Unit,
    onRefresh: () -> Unit,
    onLoadMore: () -> Unit,
    onOpen: (String) -> Unit,
    onNewOrder: (() -> Unit)?,
) {
    var pickDay by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding().imePadding()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.headerMargin, vertical = EtalonSpace.md),
            verticalAlignment = Alignment.Bottom,
        ) {
            Column(Modifier.weight(1f)) {
                Text(stringResource(R.string.orders_title), style = EtalonType.displayTitle, color = EtalonColors.ink)
                s.facets?.let {
                    Text(
                        stringResource(R.string.orders_count_area, formatCountBare(it.total), formatArea(it.totalArea)),
                        style = EtalonType.meta,
                        color = EtalonColors.ink2,
                    )
                }
            }
            if (onNewOrder != null) {
                PrimaryButton(
                    stringResource(R.string.orders_new), onNewOrder,
                    compact = true, leadingIcon = EtalonIcons.Plus,
                )
            }
        }
        // No spacer between the three header blocks: D7's 48 dp slots around the 40 dp field and
        // the 32 dp chips already supply the capture's gaps. Adding the drawn gap on top of the
        // reserved one is what pushes the sheet down the screen.
        Row(
            Modifier.padding(horizontal = EtalonSpace.headerMargin),
            horizontalArrangement = Arrangement.spacedBy(EtalonSpace.sm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SearchField(
                s.query, onQuery, stringResource(R.string.orders_search_placeholder),
                Modifier.weight(1f), onClear = { onQuery("") },
            )
            // Ruling R6: the filter square opens the day picker — `day=` is a filter the API
            // already has — and carries the badge while a day is set. The chips stay visible.
            EtalonIconButton(
                EtalonIcons.SlidersHorizontal, stringResource(R.string.orders_filter_day),
                onClick = { pickDay = true }, badge = s.day != null, shape = EtalonShapes.md,
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
        Spacer(Modifier.height(EtalonSpace.sm))
        s.error?.let {
            ErrorBanner(
                it, onRetry = onRefresh,
                modifier = Modifier.padding(horizontal = EtalonSpace.headerMargin).padding(bottom = EtalonSpace.rowGap),
            )
        }
        NavyList(s, onPayment, onOpen, onLoadMore, onRefresh)
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
 * The navy sheet is the screen's scrolling region: it runs to the bottom edge, so it rounds its
 * top corners only ([EtalonShapes.sheetTop]), and everything above it — header, search, chips —
 * stays put while the months scroll under it.
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
 * Ruling R6's day filter. The picker works in UTC midnights, so the seed and the read-back both use
 * [ZoneOffset.UTC]; seeding from Tashkent midnight (19:00 UTC the day before) would reopen the
 * picker on the previous day and let «Танлаш» move the filter without the operator touching a date.
 *
 * Material3's own «Select date» / «Selected date» headings are drawn from the platform's own
 * resources, so both slots are filled with the app's Uzbek wording instead and the keyboard-entry
 * toggle (whose hint and error text cannot be replaced at all) is turned off. The calendar grid's
 * month and weekday names still read English: CLDR does carry `uz-Cyrl` calendar data, but
 * `DatePicker` takes its `CalendarLocale` from the device, and this app ships no locale
 * configuration of its own — forcing one is an app-wide change, not this screen's.
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
