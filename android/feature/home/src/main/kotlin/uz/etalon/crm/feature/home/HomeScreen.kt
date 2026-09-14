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
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
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

/**
 * §3.1 stacks Home's blocks 14 dp apart — between `EtalonSpace.md` and `.lg`, and the one gap on
 * this screen the 4-pt grid does not name. Named once here rather than inlined at five call sites.
 */
private val SECTION_GAP = 14.dp

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
    )
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
 * receivables hero, the financial rail for the current month, and the operational 2×2.
 *
 * [now] is a parameter rather than an `Instant.now()` inside, so the date line is deterministic
 * under test.
 *
 * The nav pill is not drawn here — the shell draws it over this screen — so the list keeps
 * [navPillContentPadding] at the bottom for the last card to clear it.
 *
 * [onOpenOrder] and [onOpenOrders] belong to §2.6–§2.7, the half of the screen that is not built
 * yet; they stay on the signature because the shell already wires them and the next slice draws
 * the cards that use them.
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
            s.dash?.let { d ->
                item { ReceivablesHero(d) }
                item {
                    Section(stringResource(R.string.home_kicker_financial)) { FinancialRail(d) }
                }
                item {
                    Section(stringResource(R.string.home_kicker_ops)) {
                        OperationalGrid(s, d, now, onOpenClients, onOpenCalendarToday)
                    }
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
