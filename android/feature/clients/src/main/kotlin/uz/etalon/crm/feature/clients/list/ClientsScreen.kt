package uz.etalon.crm.feature.clients.list

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.components.NoticeBanner
import uz.etalon.crm.core.designsystem.components.OrderRow
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SearchField
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.ClientSummary
import uz.etalon.crm.core.ui.format.formatAddressLine
import uz.etalon.crm.core.ui.format.formatCountBare
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatPhone
import uz.etalon.crm.feature.clients.R
import uz.etalon.crm.feature.clients.edit.ClientEditSheet

/** The card's own inset around the rows: with [EtalonSpace.rowPadH] inside every row it puts the
 *  avatar 14 dp from the card's edge, the same figure home's recent-orders card keeps. */
private val ROW_INSET = 6.dp

/**
 * Finding a customer, by the number they called from or by their name.
 *
 * A top-level destination like `OrdersListRoute` and `ConfirmQueueRoute`, so it carries no back
 * arrow: the navigation pill already says «Мижоз».
 */
@Composable
fun ClientsRoute(
    onOpenClient: (String) -> Unit,
    vm: HiltClientsViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    ClientsScreen(
        s = s,
        onQuery = vm::setQuery,
        onRefresh = vm::refresh,
        onOpenClient = onOpenClient,
    )
}

/**
 * `2b-clients.png`, top to bottom: «Мижозлар» over «N мижоз · жами айланма бўйича», the search
 * field (ruling R4 — the capture draws none, but phone-first lookup is this screen's whole job),
 * and one white `xl` card of [OrderRow]s ordered by the money each customer has booked, biggest
 * first. The figure on the right of a row is that lifetime total and the line under it is «N
 * буюртма» — a client row has no debt and no paid state, so the row's second line is the count.
 *
 * **The phone in the meta line is not a link.** The whole row opens the client, and dialling lives
 * on the detail behind it (`Dial.kt`), where the number is the screen's subject rather than one
 * word of a row: a tappable phone inside a tappable row is two targets a thumb cannot tell apart,
 * and the one it hits by accident places a call.
 *
 * The shell draws its floating nav pill over this screen and gives it no `Scaffold`, so the root
 * is a plain `Box`: it pads the status bar itself, the sticky bar is bottom-aligned inside it, and
 * the list reserves exactly what that bar covers — measured, not assumed.
 *
 * @param barVisible whether the «Мижоз қўшиш» bar is drawn at all (ruling R13). It steps aside for
 *   the keyboard: the app draws edge to edge, the root's [imePadding] is what shortens the screen,
 *   and a bottom-aligned bar would otherwise sit on the search field's suggestions while a phone
 *   is being typed. Defaulted from the window and passed in only by the tests — Robolectric
 *   reports the ime inset as absent whatever is focused.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun ClientsScreen(
    s: ClientsUiState,
    onQuery: (String) -> Unit,
    onRefresh: () -> Unit,
    onOpenClient: (String) -> Unit,
    barVisible: Boolean = !WindowInsets.isImeVisible,
) {
    var adding by remember { mutableStateOf(false) }
    // What the bar actually covers, read back from its own layout: the scrim, the button and the
    // nav-pill band the bar adds beneath itself. Zero while the bar is hidden, which is when the
    // list falls back to the pill's own clearance.
    var barHeightPx by remember { mutableIntStateOf(0) }
    val barHeight = with(LocalDensity.current) { barHeightPx.toDp() }

    Box(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding().imePadding()) {
        Column(Modifier.fillMaxSize()) {
            Column(
                Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.headerMargin, vertical = EtalonSpace.md),
            ) {
                Text(stringResource(R.string.clients_title), style = EtalonType.displayTitle, color = EtalonColors.ink)
                // `s.total` is what the server says MATCHED, not how many rows arrived — the same
                // figure `showTruncatedNotice` compares the loaded page against.
                Text(
                    stringResource(R.string.clients_subtitle, formatCountBare(s.total)),
                    style = EtalonType.meta,
                    color = EtalonColors.ink2,
                )
            }
            // R4: the field sits under the subtitle exactly as it does on Orders. No spacer above
            // it — D7's 48 dp slot around the 40 dp pill already draws the capture's gap.
            SearchField(
                s.query, onQuery, stringResource(R.string.clients_search_hint),
                Modifier.padding(horizontal = EtalonSpace.headerMargin),
                onClear = { onQuery("") },
            )
            Spacer(Modifier.height(EtalonSpace.sm))
            s.error?.let {
                ErrorBanner(
                    it, onRetry = onRefresh,
                    modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin)
                        .padding(bottom = EtalonSpace.sm),
                )
            }
            PullToRefreshBox(isRefreshing = s.loading, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(
                        start = EtalonSpace.cardMargin,
                        end = EtalonSpace.cardMargin,
                        top = EtalonSpace.xs,
                        // The floating nav pill is drawn over this screen, so the last row has to
                        // scroll clear of it — and clear of the sticky bar when there is one. The
                        // bar already carries the pill's band inside its own height, so the two
                        // are a maximum and never a sum: adding them left ~120 dp of empty page
                        // above «Мижоз қўшиш».
                        bottom = maxOf(barHeight, LocalNavPillInset.current),
                    ),
                    verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
                ) {
                    // Never beside an error banner and never while loading: an empty client list
                    // there reads as "not in the CRM" when the truth is "couldn't check", and an
                    // operator who believes that adds a second row for a customer who has one.
                    if (s.showEmptyState) item { EmptyState(stringResource(R.string.clients_empty)) }
                    // One card, not one card per row — `2b-clients.png` draws a single sheet with
                    // the rows stacked inside it. It is one lazy item because the screen fetches
                    // one bounded page (`CLIENTS_PAGE_SIZE`), so the card can never grow past a
                    // page's worth of rows.
                    if (s.items.isNotEmpty()) item(key = "card") { ClientCard(s.items, onOpenClient) }
                    // Only that one page is fetched, so the end of this list is not necessarily
                    // the end of the customers. Said at the bottom, which is exactly where an
                    // operator who has not found their customer would otherwise conclude the
                    // customer is not in the CRM.
                    if (s.showTruncatedNotice) {
                        item {
                            NoticeBanner(
                                stringResource(
                                    R.string.clients_truncated,
                                    formatCountBare(s.total),
                                    formatCountBare(s.items.size),
                                ),
                            )
                        }
                    }
                }
            }
        }
        Box(Modifier.align(Alignment.BottomCenter).onSizeChanged { barHeightPx = it.height }) {
            // Offered only once `client.create` is known to be held: a button that appears and
            // then vanishes is worse than one that arrives a frame late. Disabled while offline
            // because POST /api/clients is not `withIdempotency`-wrapped and may not be queued.
            if (s.showAddAction && barVisible) {
                StickyActionBar {
                    PrimaryButton(
                        text = stringResource(R.string.clients_action_add),
                        onClick = { adding = true },
                        enabled = !s.isOffline,
                    )
                }
            }
        }
    }

    if (adding) {
        ClientEditSheet(
            client = null,
            isOffline = s.isOffline,
            onDismiss = { adding = false },
            onSaved = { id ->
                adding = false
                // Still no «қўшилди» toast: opening the client is the honest confirmation,
                // because it shows what is actually stored. A dedup hit never reaches here
                // unannounced — the sheet says so first and the operator taps through
                // deliberately. The list behind it is stale either way.
                onRefresh()
                onOpenClient(id)
            },
        )
    }
}

/**
 * The white sheet of §3.6. Every row is the design system's [OrderRow] in its light variant, which
 * already draws the avatar, the name, the meta line and the amount; what a client row states under
 * its amount is how many orders it has, so it fills the row's `trailing` slot — the slot arrives
 * styled `tagPanel` in `ink3`, so the count is passed as a bare `Text`.
 *
 * Two rows may legitimately carry the same name — the same customer name belongs to two different
 * businesses often enough — which is why the phone is on the row beside it.
 */
@Composable
private fun ClientCard(items: List<ClientSummary>, onOpenClient: (String) -> Unit) = Column(
    Modifier.fillMaxWidth()
        .clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .padding(horizontal = ROW_INSET, vertical = EtalonSpace.xs),
) {
    items.forEach { c ->
        OrderRow(
            clientName = c.name,
            status = null,
            // An address is optional and `formatAddressLine` says so with null, so the separator
            // is only drawn when there is something on both sides of it.
            metaLine = listOfNotNull(formatPhone(c.phone).ifBlank { null }, formatAddressLine(c.address))
                .joinToString(" · "),
            total = c.totalBooked,
            // A client is not an order: nothing here is owed or settled, so neither of the row's
            // money lines applies and the slot below the figure is the order count instead.
            debt = null,
            paidLabel = null,
            debtLabel = { formatMoney(it) },
            onDark = false,
            onClick = { onOpenClient(c.id) },
            trailing = { Text(stringResource(R.string.client_order_count, formatCountBare(c.orderCount))) },
        )
    }
}
