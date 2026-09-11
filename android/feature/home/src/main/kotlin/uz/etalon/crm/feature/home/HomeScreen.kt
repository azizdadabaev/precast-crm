package uz.etalon.crm.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.Avatar
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonIconButton
import uz.etalon.crm.core.designsystem.components.KpiAccent
import uz.etalon.crm.core.designsystem.components.KpiCard
import uz.etalon.crm.core.designsystem.components.KpiMoneyCard
import uz.etalon.crm.core.designsystem.components.NavySheet
import uz.etalon.crm.core.designsystem.components.OrderRow
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.RecentOrder
import uz.etalon.crm.core.model.TrendDirection
import uz.etalon.crm.core.model.owesNothing
import uz.etalon.crm.core.ui.format.formatAddressLine
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatLongDate
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatPercent
import uz.etalon.crm.core.ui.format.formatScheduleDate
import java.math.RoundingMode
import java.time.Instant

/**
 * §3.1 stacks Home's blocks 14 dp apart — between `EtalonSpace.md` and `.lg`, and the one gap on
 * this screen the 4-pt grid does not name. Named once here rather than inlined at five call sites.
 */
private val SECTION_GAP = 14.dp

/** The wordmark's own gap to the brand block; 10 dp, off the prototype, is not on the grid either. */
private val BRAND_GAP = 10.dp

/** The sparkline draws half a year — six bars is what fits a 210 dp card without crowding. */
private const val SPARKLINE_MONTHS = 6

/** The count pill hugs its digits: half of `EtalonSpace.xs`, so the pill stays a pill rather than
 *  growing into a chip. Below the 4-pt grid, hence named here rather than tokenised. */
private val PILL_PAD_V = 2.dp

/** The recent card insets its rows a touch less than `EtalonSpace.sm`: `OrderRow` carries padding
 *  of its own, and the full token pushed the avatars off the capture's left edge. */
private val RECENT_ROW_INSET = 6.dp

/**
 * A top-level nav-pill destination (Destination.HOME), so — like `OrdersListRoute` and
 * `ConfirmQueueRoute` — it carries no back arrow. The app bar's avatar is the door to the account
 * sheet the shell owns (ruling R3); the bell is this screen's own outbox sheet.
 */
@Composable
fun HomeRoute(
    me: Me,
    onOpenOrder: (String) -> Unit,
    onOpenOrders: () -> Unit,
    onOpenAccount: () -> Unit,
    vm: HiltHomeViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    var showOutbox by remember { mutableStateOf(false) }
    HomeScreen(
        s = s, me = me, now = Instant.now(), onRefresh = vm::refresh,
        onOpenOrder = onOpenOrder, onOpenOrders = onOpenOrders, onOpenAccount = onOpenAccount,
        onOpenOutbox = { showOutbox = true },
    )
    if (showOutbox) OutboxSheet(pending = s.pendingUploads, onDismiss = { showOutbox = false })
}

/**
 * `2b-home.png`, top to bottom: the brand row, «Бошқарув» over the date line, the KPI row, the
 * navy «Бугунги етказиш» sheet and the white «Сўнгги буюртмалар» card.
 *
 * [now] is a parameter rather than an `Instant.now()` inside, so the date line and the relative
 * schedule dates are deterministic under test.
 *
 * The nav pill is not drawn here — the shell draws it over this screen — so the list keeps
 * [EtalonSpace.underNav] of bottom padding for the last card to clear it.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    s: HomeUiState,
    me: Me,
    now: Instant,
    onRefresh: () -> Unit,
    onOpenOrder: (String) -> Unit,
    onOpenOrders: () -> Unit,
    onOpenAccount: () -> Unit,
    onOpenOutbox: () -> Unit,
) {
    PullToRefreshBox(
        isRefreshing = s.loading,
        onRefresh = onRefresh,
        // The `Scaffold` that used to wrap this screen is gone with the navigation suite, and with
        // it the window insets it applied: without this the brand row is drawn under the clock and
        // the avatar under the battery icon. Measured on the emulator, not guessed — the
        // Robolectric frame has no system bars to collide with.
        modifier = Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding(),
    ) {
        LazyColumn(
            Modifier.fillMaxSize(),
            contentPadding = PaddingValues(top = EtalonSpace.sm, bottom = EtalonSpace.underNav),
            verticalArrangement = Arrangement.spacedBy(SECTION_GAP),
        ) {
            item { AppBarRow(me, s.pendingUploads > 0, onOpenOutbox, onOpenAccount) }
            item { TitleBlock(now) }
            // First of the data blocks, as on every other list in this app: a failed refresh must
            // never leave a stale figure above the reason it is stale.
            s.error?.let { e ->
                item { ErrorBanner(e, onRetry = onRefresh, modifier = Modifier.padding(horizontal = EtalonSpace.headerMargin)) }
            }
            s.tiles?.let { t -> item { KpiRow(t) } }
            item { TodaySheet(s, onOpenOrder) }
            // Withheld, not empty: an operator without dashboard access would otherwise read
            // «Ҳали буюртма йўқ» under a sheet that has just told them they may not look — the
            // same false "there is nothing here" the today sheet is careful to avoid. They get no
            // recent card at all.
            if (!s.showNoAccessState) {
                item { RecentSection(s.recent, s.showRecentEmpty, now, onOpenOrder, onOpenOrders) }
            }
        }
    }
}

@Composable
private fun AppBarRow(me: Me, hasPending: Boolean, onOpenOutbox: () -> Unit, onOpenAccount: () -> Unit) = Row(
    Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.headerMargin),
    verticalAlignment = Alignment.CenterVertically,
) {
    Box(
        Modifier.size(34.dp).clip(EtalonShapes.md)
            .background(Brush.linearGradient(listOf(EtalonColors.indigo, EtalonColors.indigoTint))),
    )
    Spacer(Modifier.width(BRAND_GAP))
    Column {
        Text(
            stringResource(R.string.home_brand),
            style = EtalonType.titleSm.copy(fontWeight = FontWeight.W800, fontSize = 14.sp),
            color = EtalonColors.ink,
        )
        Text(stringResource(R.string.home_tagline), style = EtalonType.meta, color = EtalonColors.ink2)
    }
    Spacer(Modifier.weight(1f))
    // A rounded square, not a circle: `2b-home.png` draws the bell in a 36 dp `md` box and keeps
    // the pill shape for the avatar beside it, so the two do not read as a pair of buttons.
    EtalonIconButton(
        EtalonIcons.Bell, stringResource(R.string.home_bell), onOpenOutbox,
        badge = hasPending, size = 36.dp, shape = EtalonShapes.md,
    )
    Spacer(Modifier.width(EtalonSpace.sm))
    Avatar(
        me.name,
        Modifier
            .clickable(role = Role.Button, onClickLabel = stringResource(R.string.home_account)) { onOpenAccount() }
            .minimumInteractiveComponentSize(),
        size = 36.dp,
    )
}

@Composable
private fun TitleBlock(now: Instant) = Column(Modifier.padding(horizontal = EtalonSpace.headerMargin)) {
    Text(stringResource(R.string.home_title), style = EtalonType.displayTitle, color = EtalonColors.ink)
    Text(
        "${formatLongDate(now)} · ${stringResource(R.string.home_subtitle_suffix)}",
        style = EtalonType.body,
        color = EtalonColors.ink2,
    )
}

/**
 * Ruling R2, card for card: **Қарздорлик** (red, no sparkline — the server has no receivables
 * series and the card must not decorate with an unrelated one), **Ойлик тушум** (green, the
 * server's calendar month with its trend and twelve-month series), **Бугунги етказиш** (indigo,
 * today's m² and count). The row scrolls, so the third card peeks at the right edge exactly as it
 * does in the capture.
 */
@Composable
private fun KpiRow(t: HomeTiles) {
    val bars = sparkline(t.collectedByMonth)
    // A plain scrolling Row, not a LazyRow: three cards is not a list worth virtualising, and
    // `height(IntrinsicSize.Max)` is what lets the two sparkline-less cards match the tall one's
    // height instead of ending short of it. A LazyRow cannot measure across its items, and R2
    // forbids giving the receivables card a decorative series to even the row up.
    Row(
        Modifier.fillMaxWidth().horizontalScroll(rememberScrollState())
            .padding(horizontal = EtalonSpace.cardMargin)
            .height(IntrinsicSize.Max),
        horizontalArrangement = Arrangement.spacedBy(EtalonSpace.md),
    ) {
        KpiMoneyCard(
            stringResource(R.string.home_kpi_receivables), t.receivables,
            accent = KpiAccent.RED, icon = EtalonIcons.CircleAlert,
            footnote = stringResource(R.string.home_kpi_receivables_note, t.receivableOrders),
            footnotePositive = false,
            modifier = Modifier.fillMaxHeight(),
        )
        KpiMoneyCard(
            stringResource(R.string.home_kpi_collected), t.collectedThisMonth,
            accent = KpiAccent.GREEN, icon = EtalonIcons.TrendingUp,
            // FLAT (and a direction this client does not know) makes no claim: no arrow, no
            // percentage, and `footnotePositive = null` so the line is neutral ink rather than
            // green. An unchanged month drawn as «↑ 0,0 %» in green is a rise that did not happen.
            footnote = t.collectedTrend?.let { trend ->
                when (trend.direction) {
                    TrendDirection.UP -> stringResource(R.string.home_kpi_collected_up, formatPercent(trend.deltaPct, 1))
                    TrendDirection.DOWN -> stringResource(R.string.home_kpi_collected_down, formatPercent(trend.deltaPct, 1))
                    TrendDirection.FLAT, TrendDirection.UNKNOWN -> stringResource(R.string.home_kpi_collected_flat)
                }
            },
            footnotePositive = when (t.collectedTrend?.direction) {
                TrendDirection.UP -> true
                TrendDirection.DOWN -> false
                else -> null
            },
            bars = bars,
            currentBar = bars.lastIndex,
            modifier = Modifier.fillMaxHeight(),
        )
        KpiCard(
            stringResource(R.string.home_kpi_today), formatArea(t.todayArea),
            accent = KpiAccent.INDIGO, icon = EtalonIcons.Package,
            footnote = stringResource(R.string.home_kpi_today_note, t.todayCount),
            modifier = Modifier.fillMaxHeight(),
        )
    }
}

/**
 * The last six months as fractions of the tallest of them — bar geometry, never an amount, which
 * is why this is the one place a [Money] is allowed to become a `Float` (design doc D8). The
 * division carries four decimals and rounds half-up before it crosses; a flat six months (every
 * month zero) has no denominator and draws no sparkline at all rather than six full-height bars.
 */
private fun sparkline(series: List<Money>): List<Float> {
    val tail = series.takeLast(SPARKLINE_MONTHS)
    val max = tail.maxOfOrNull { it.amount } ?: return emptyList()
    if (max.signum() <= 0) return emptyList()
    return tail.map { it.amount.divide(max, 4, RoundingMode.HALF_UP).toFloat() }
}

@Composable
private fun TodaySheet(s: HomeUiState, onOpenOrder: (String) -> Unit) = NavySheet(
    title = stringResource(R.string.home_kpi_today),
    modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin),
    // No pill until a permitted fetch is actually possible: «0» is a count, and a count is a
    // claim about how many deliveries there are — false while the permissions are still being
    // resolved, and exactly what an operator without the permission has just been told they
    // cannot see.
    trailing = if (s.permissionsResolved && s.hasDashboardAccess) ({ CountPill(s.today.size) }) else null,
    fillsToBottom = false,
) {
    // `debtLabel` is a plain lambda the row calls while it composes, so its wording is read out
    // of the resources here, ahead of it, rather than inside it.
    val paidLabel = stringResource(R.string.home_paid)
    val debtTemplate = stringResource(R.string.home_debt)
    // "No orders today" and "cannot check today's orders" are different facts and must never
    // share a string: an empty sheet beside a withheld permission reads as "nothing scheduled"
    // when the truth is "not allowed to see".
    when {
        s.showNoAccessState -> SheetNote(stringResource(R.string.home_today_no_access))
        s.showEmptyState -> SheetNote(stringResource(R.string.home_today_empty))
        else -> s.today.forEach { d ->
            // A canceled order owes nothing, so it carries neither «қолди …» nor «тўланган».
            // The rule itself lives at `OrderStatus.owesNothing` (core:model), which the order
            // detail reads too — all three screens must agree about the same order.
            val canceled = d.status.owesNothing
            OrderRow(
                clientName = d.clientName,
                // No tag on these rows: everything on this sheet is scheduled for today, so the
                // status adds no information the row does not already carry (`2b-home.png`).
                status = null,
                metaLine = listOfNotNull(formatAddressLine(d.clientAddress), formatArea(d.area)).joinToString(" · "),
                total = d.totalPrice,
                debt = if (canceled) null else d.remaining,
                paidLabel = if (canceled) null else paidLabel,
                debtLabel = { debtTemplate.format(formatMoney(it)) },
                onDark = true,
                onClick = { onOpenOrder(d.orderId) },
            )
        }
    }
}

@Composable
private fun SheetNote(text: String) = Text(
    text,
    style = EtalonType.body,
    color = EtalonColors.onDarkMuted,
    modifier = Modifier.padding(EtalonSpace.sm),
)

@Composable
private fun CountPill(n: Int) = Text(
    "$n",
    style = EtalonType.tag,
    color = EtalonColors.onDark,
    modifier = Modifier.clip(EtalonShapes.pill).background(EtalonColors.navy2)
        .padding(horizontal = EtalonSpace.sm, vertical = PILL_PAD_V),
)

@Composable
private fun RecentSection(
    recent: List<RecentOrder>,
    showEmpty: Boolean,
    now: Instant,
    onOpenOrder: (String) -> Unit,
    onOpenOrders: () -> Unit,
) {
    // Nothing to say yet: the first load has not settled, so neither the rows nor the "no orders"
    // line would be true. An empty card with a header is not a neutral placeholder — it is a claim.
    if (recent.isEmpty() && !showEmpty) return
    val paidLabel = stringResource(R.string.home_paid)
    val debtTemplate = stringResource(R.string.home_debt)
    Column(verticalArrangement = Arrangement.spacedBy(EtalonSpace.sm)) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.headerMargin),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(stringResource(R.string.home_recent), style = EtalonType.sectionTitle, color = EtalonColors.ink)
            Text(
                stringResource(R.string.home_recent_all),
                style = EtalonType.label,
                color = EtalonColors.indigo,
                modifier = Modifier.minimumInteractiveComponentSize()
                    .clickable(role = Role.Button) { onOpenOrders() },
            )
        }
        Column(
            Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.cardMargin)
                .clip(EtalonShapes.xl).background(EtalonColors.surface)
                .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
                .padding(horizontal = RECENT_ROW_INSET, vertical = EtalonSpace.xs),
        ) {
            if (recent.isEmpty()) {
                Text(
                    stringResource(R.string.home_recent_empty),
                    style = EtalonType.body,
                    color = EtalonColors.ink3,
                    modifier = Modifier.padding(EtalonSpace.md),
                )
            } else {
                recent.take(4).forEach { r ->
                    // Same rule as the today sheet above: `OrderStatus.owesNothing` (core:model).
                    val canceled = r.status.owesNothing
                    OrderRow(
                        clientName = r.clientName,
                        status = r.status,
                        metaLine = formatScheduleDate(r.scheduledAt, now),
                        total = r.totalPrice,
                        debt = if (canceled) null else r.remaining,
                        paidLabel = if (canceled) null else paidLabel,
                        debtLabel = { debtTemplate.format(formatMoney(it)) },
                        onDark = false,
                        onClick = { onOpenOrder(r.orderId) },
                    )
                }
            }
        }
    }
}
