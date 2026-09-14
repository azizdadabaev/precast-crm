package uz.etalon.crm.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.repeatOnLifecycle
import kotlinx.coroutines.delay
import uz.etalon.crm.core.designsystem.components.Avatar
import uz.etalon.crm.core.designsystem.components.BrandMark
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonIconButton
import uz.etalon.crm.core.designsystem.components.navPillContentPadding
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.ui.format.formatLongDate
import java.time.Instant
import kotlin.time.Duration.Companion.seconds

/**
 * §3.1 stacks Home's blocks 14 dp apart — between `EtalonSpace.md` and `.lg`, and the one gap on
 * this screen the 4-pt grid does not name. Named once here rather than inlined at five call sites.
 */
private val SECTION_GAP = 14.dp

/**
 * Design §3's auto-refresh, the web's own `refetchInterval`. It runs only while the tab is RESUMED
 * (see [HomeRoute]): a phone in a pocket must not keep asking the server for a dashboard nobody is
 * reading, and an operator who comes back to the tab an hour later must not read an hour-old one.
 */
private val REFRESH_EVERY = 60.seconds

/** The scrolling column, tagged so a screenshot test can scroll it to §2.5–§2.7 without guessing
 *  which of the screen's scrollables (the financial rail is the other) it has hold of. */
internal const val HOME_LIST_TAG = "home_list"

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
    /** §4: the «Фаол мижозлар» card is a door to the clients tab. */
    onOpenClients: () -> Unit,
    /** §4: «Бугунги етказишлар» opens the orders calendar on today, whose day sheet lists exactly
     *  the rows this screen used to draw itself (ruling R2). */
    onOpenCalendarToday: () -> Unit,
    /** §4: «Барчаси →» opens the orders tab in its Рўйхат view. */
    onOpenOrdersList: () -> Unit,
    /** Ruling I3: where «Калькуляторда очиш» goes once the refused order is back in the draft.
     *  Null for an operator without `calculator.use` — that tab does not exist for them, so the
     *  action is not offered at all (the same rule as «+ Янги» on the orders list). */
    onOpenCalculator: (() -> Unit)? = null,
    vm: HiltHomeViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    var showOutbox by remember { mutableStateOf(false) }
    HomeScreen(
        s = s, me = me, now = Instant.now(), onRefresh = vm::refresh,
        onOpenOrder = onOpenOrder, onOpenOrders = onOpenOrders, onOpenAccount = onOpenAccount,
        onOpenOutbox = { showOutbox = true },
        onOpenClients = onOpenClients, onOpenCalendarToday = onOpenCalendarToday,
        onOpenOrdersList = onOpenOrdersList,
        onSelectMonth = vm::selectMonth,
    )
    // §3's 60 s auto-refresh. `repeatOnLifecycle(RESUMED)` rather than a bare `LaunchedEffect`,
    // because a `LaunchedEffect` survives the screen going to the background: Home stays composed
    // behind the account sheet, behind another tab's entry and behind the launcher, and a plain
    // loop would keep polling through all three. `refresh()` is itself a no-op without dashboard
    // access, so an operator who may not read the payload never asks for it on a timer either.
    val lifecycleOwner = LocalLifecycleOwner.current
    LaunchedEffect(lifecycleOwner) {
        lifecycleOwner.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (true) {
                delay(REFRESH_EVERY)
                vm.refresh()
            }
        }
    }
    // The draft is written before the flag is set, so by the time the calculator opens its own
    // `observeDraft` already has the restored quote to show.
    LaunchedEffect(s.reopenedInCalculator) {
        if (s.reopenedInCalculator) {
            vm.consumeReopen()
            showOutbox = false
            onOpenCalculator?.invoke()
        }
    }
    if (showOutbox) {
        OutboxSheet(
            pending = s.pendingUploads,
            rejected = s.rejectedOrders,
            onDiscard = vm::discardRejectedOrder,
            onDismiss = {
                showOutbox = false
                vm.dismissReopenError()
            },
            onReopen = if (onOpenCalculator != null) vm::reopenRejectedOrder else null,
            reopenError = s.reopenError,
        )
    }
}

/**
 * The dashboard (design §2), top to bottom: the app-bar chrome over today's date, the navy
 * receivables hero, the financial rail for the selected month, the twelve-month chart that selects
 * it, the operational 2×2, and the four cards under them.
 *
 * [now] is a parameter rather than an `Instant.now()` inside, so the date line is deterministic
 * under test.
 *
 * The nav pill is not drawn here — the shell draws it over this screen — so the list keeps
 * [navPillContentPadding] at the bottom for the last card to clear it.
 *
 * [onOpenOrders] is the app bar's own door to the orders tab and is left on the signature for the
 * shell that already wires it; §2.7's «Барчаси →» is [onOpenOrdersList], which asks for the Рўйхат
 * view specifically.
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
    onOpenClients: () -> Unit,
    onOpenCalendarToday: () -> Unit,
    onOpenOrdersList: () -> Unit,
    /** §2.3b: a column of the twelve-month chart was tapped. The index is into the payload's own
     *  month series; the ViewModel clamps it and decides what tapping the picked month again
     *  means. */
    onSelectMonth: (Int) -> Unit,
) {
    PullToRefreshBox(
        // Only a REFRESH spins: the first load has the skeleton, and a spinner over it read as two
        // loading states at once.
        isRefreshing = s.loading && s.dash != null,
        onRefresh = onRefresh,
        // The `Scaffold` that used to wrap this screen is gone with the navigation suite, and with
        // it the window insets it applied: without this the brand row is drawn under the clock and
        // the avatar under the battery icon. Measured on the emulator, not guessed — the
        // Robolectric frame has no system bars to collide with.
        modifier = Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding(),
    ) {
        LazyColumn(
            Modifier.fillMaxSize().testTag(HOME_LIST_TAG),
            contentPadding = navPillContentPadding(top = EtalonSpace.sm),
            verticalArrangement = Arrangement.spacedBy(SECTION_GAP),
        ) {
            item { AppBarRow(me, now, s.outboxBadge > 0, onOpenOutbox, onOpenAccount) }
            // First of the data blocks, as on every other list in this app: a failed refresh must
            // never leave a stale figure above the reason it is stale.
            s.error?.let { e ->
                item { ErrorBanner(e, onRetry = onRefresh, modifier = Modifier.padding(horizontal = EtalonSpace.headerMargin)) }
            }
            // §2.8. Withheld, not empty: an operator without dashboard access reading a screen of
            // zeros would believe the business had a month with no orders in it. They get the one
            // card that says why, and keep the chrome — the bell and the account sheet are local
            // reads that need no permission.
            if (s.showNoAccessState) {
                item { NoAccessCard() }
            }
            // §3's first load, and only the first: nothing has arrived yet, so there is no figure
            // to keep. A later refresh — failed or in flight — leaves the payload below standing.
            if (s.loading && s.dash == null) {
                item { DashboardSkeleton() }
            }
            s.dash?.let { d ->
                item { ReceivablesHero(d) }
                item {
                    // §2.3b: the kicker names the month the rail is scoped to — the current one
                    // until the operator picks another in the chart below.
                    val kicker = if (d.isCurrentMonth) {
                        stringResource(R.string.home_kicker_financial)
                    } else {
                        stringResource(
                            R.string.home_kicker_financial_month,
                            fullMonth(d.monthKey, now).uppercase(),
                        )
                    }
                    Section(kicker) { FinancialRail(d, now) }
                }
                item { MonthlyChartCard(d, onSelectMonth) }
                item {
                    Section(stringResource(R.string.home_kicker_ops)) {
                        OperationalGrid(s, d, now, onOpenClients, onOpenCalendarToday)
                    }
                }
                item { PaymentDonutCard(d) }
                item { TopClientsCard(d) }
                item { RegionRankingCard(d) }
                item {
                    RecentOrdersCard(
                        recent = s.recent,
                        showEmpty = s.showRecentEmpty,
                        onOpenOrder = onOpenOrder,
                        onOpenOrdersList = onOpenOrdersList,
                    )
                }
            }
        }
    }
}

/** A kicker and the block it names, closer to each other than to whatever is above them. */
@Composable
private fun Section(kicker: String, content: @Composable () -> Unit) = Column(
    verticalArrangement = Arrangement.spacedBy(EtalonSpace.sm),
) {
    SectionKicker(kicker)
    content()
}

/**
 * §2.1's chrome, unchanged but for what sits under the wordmark: the long Uzbek date, which is
 * the only thing on the screen that says which day these figures are true of.
 */
@Composable
private fun AppBarRow(
    me: Me,
    now: Instant,
    hasPending: Boolean,
    onOpenOutbox: () -> Unit,
    onOpenAccount: () -> Unit,
) = Row(
    Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.headerMargin),
    verticalAlignment = Alignment.CenterVertically,
) {
    Column {
        BrandMark()
        Spacer(Modifier.height(EtalonSpace.xs))
        Text(formatLongDate(now), style = EtalonType.body, color = EtalonColors.ink2)
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
