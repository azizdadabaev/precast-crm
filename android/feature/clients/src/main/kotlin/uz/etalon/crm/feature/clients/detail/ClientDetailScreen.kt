package uz.etalon.crm.feature.clients.detail

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.DetailPanel
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonIconButton
import uz.etalon.crm.core.designsystem.components.NoticeBanner
import uz.etalon.crm.core.designsystem.components.OrderRow
import uz.etalon.crm.core.designsystem.components.PanelTotal
import uz.etalon.crm.core.designsystem.components.navPillContentPadding
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.ClientDetail
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.ui.format.formatAddressLine
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatCount
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.format.formatOrderNo
import uz.etalon.crm.core.ui.format.formatPhone
import uz.etalon.crm.core.ui.format.formatScheduleDate
import uz.etalon.crm.feature.clients.R
import uz.etalon.crm.feature.clients.dial
import uz.etalon.crm.feature.clients.edit.ClientEditSheet
import java.time.Instant

/** The card's own inset around its rows — the same 6 dp Home's recent-orders card and the clients
 *  list keep, which puts an avatar 14 dp from the card's edge. */
private val ROW_INSET = 6.dp

/** A section title sits one [EtalonSpace.xs] inside the card below it, the relationship Home draws
 *  between «Сўнгги буюртмалар» and its card (headerMargin 20 over cardMargin 16). */
private val TITLE_INSET = EtalonSpace.xs

@Composable
fun ClientDetailRoute(
    clientId: String,
    onBack: () -> Unit,
    onOpenOrder: (String) -> Unit,
    vm: HiltClientDetailViewModel = hiltViewModel<HiltClientDetailViewModel, HiltClientDetailViewModel.Factory>(
        creationCallback = { it.create(clientId) },
    ),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    ClientDetailScreen(
        s = s,
        // Read here rather than inside the screen so a frame can pin the day it is drawn on —
        // `formatScheduleDate` drops the year only for the CURRENT one. `remember`ed so a
        // recomposition (a refresh, the edit sheet opening) cannot silently redate the rows
        // mid-screen; the route is rebuilt on every visit, which is often enough.
        now = remember { Instant.now() },
        onBack = onBack,
        onRefresh = vm::refresh,
        onOpenOrder = onOpenOrder,
    )
}

/**
 * One customer, ruling R5: the order detail's navy [DetailPanel] with the client in it — «Мижоз»
 * over the name, the phone where an order panel carries its client (tap the header's phone button
 * to dial it), the address under it, and the footer counting what they have booked. No status tag,
 * because a client has no lifecycle; no tiles, because a client has no rooms; no «Қарз», because
 * `GET /api/clients/{id}` carries no remaining and a receivable figure must never be invented.
 *
 * The panel's own header carries the edit pencil (the panel's `actions` slot). It appears only
 * once `client.edit` is KNOWN to be held — a button that appears and then vanishes is worse than
 * one that arrives a frame late — and is disabled while offline, with the reason said out loud
 * beneath the panel: `PATCH /api/clients/{id}` is not `withIdempotency`-wrapped, so an edit made
 * offline could not be queued and would simply be lost.
 *
 * The shell draws its floating nav pill over this screen and gives it no `Scaffold`, so the root
 * pads the status bar itself and the list reserves the pill's band at the bottom. No `imePadding`
 * (ruling R13): this screen has no text field — the fields are in [ClientEditSheet], which is a
 * `ModalBottomSheet` and pads itself for the keyboard.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ClientDetailScreen(
    s: ClientDetailUiState,
    now: Instant,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onOpenOrder: (String) -> Unit,
) {
    val ctx = LocalContext.current
    val client = s.client
    var editing by remember { mutableStateOf(false) }

    Box(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding()) {
        PullToRefreshBox(isRefreshing = s.loading, onRefresh = onRefresh, modifier = Modifier.fillMaxSize()) {
            LazyColumn(
                modifier = Modifier.fillMaxSize(),
                contentPadding = navPillContentPadding(
                    start = EtalonSpace.cardMargin,
                    end = EtalonSpace.cardMargin,
                    top = EtalonSpace.sm,
                ),
                verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
            ) {
                val error = s.error
                if (error != null) item { ErrorBanner(error, onRetry = onRefresh) }
                if (client == null) return@LazyColumn

                item {
                    Panel(
                        client = client,
                        showEdit = s.showEditAction,
                        editEnabled = !s.isOffline,
                        onBack = onBack,
                        onCall = { dial(ctx, client.phone) },
                        onEdit = { editing = true },
                    )
                }
                // §5.1a: an action that is merely blocked right now is disabled WITH a reason. The
                // greyed pencil above is the "not now"; this is the sentence that teaches.
                if (s.showEditAction && s.isOffline) {
                    item { NoticeBanner(stringResource(R.string.client_edit_offline)) }
                }
                val notes = client.notes?.takeIf { it.isNotBlank() }
                if (notes != null) item { NotesCard(notes) }
                item { OrdersCard(client, s.showNoOrders, now, onOpenOrder) }
            }
        }
    }

    if (editing && client != null) {
        ClientEditSheet(
            client = client,
            isOffline = s.isOffline,
            onDismiss = { editing = false },
            onSaved = {
                editing = false
                // Re-read rather than patching the screen from what was sent: PATCH answers with
                // the stored row, and the server normalises the phone on the way in.
                onRefresh()
            },
        )
    }
}

/**
 * The hero. The `clientName` slot carries the PHONE — on an order panel that slot is who the order
 * is for, and here the name is already the headline, so the one fact the slot can still add is the
 * number an operator calls. The avatar keeps the client's own initials and colour (`avatarName`),
 * so the circle is the one the clients list drew for this row a tap ago; a phone has no letters to
 * make initials from.
 *
 * The footer is two columns, not three: «Буюртмалар» and «Жами», both of them the SERVER's
 * aggregates over every order this client has. Never a fold over [ClientDetail.orders]: the route
 * caps that list at the 20 most recent, so a local sum would quietly disagree with the same
 * client's row in the list — the figure an operator saw one tap ago. The fold is kept only as the
 * fallback for a server too old to send them, where a truncated figure beats no figure at all.
 */
@Composable
private fun Panel(
    client: ClientDetail,
    showEdit: Boolean,
    editEnabled: Boolean,
    onBack: () -> Unit,
    onCall: () -> Unit,
    onEdit: () -> Unit,
) = DetailPanel(
    caption = stringResource(R.string.client_detail_caption),
    headline = client.name,
    clientName = formatPhone(client.phone),
    addressLine = formatAddressLine(client.address),
    tiles = {},
    totals = {
        PanelTotal(
            stringResource(R.string.client_orders_section),
            formatCount(client.orderCount ?: client.orders.size),
            modifier = Modifier.weight(1f),
        )
        PanelTotal(
            stringResource(R.string.client_total_label),
            formatMoney(client.totalBooked ?: client.orders.fold(Money.ZERO) { acc, o -> acc + o.totalPrice }),
            modifier = Modifier.weight(1f),
        )
    },
    onBack = onBack,
    // A client has no date of their own. The panel draws nothing for a blank label, and the two
    // header buttons keep the row's height, so the space simply closes up.
    dateLabel = "",
    onCall = onCall,
    actions = if (showEdit) {
        {
            EtalonIconButton(
                EtalonIcons.Pencil,
                stringResource(R.string.client_action_edit),
                onEdit,
                onDark = true,
                enabled = editEnabled,
            )
        }
    } else {
        null
    },
    avatarName = client.name,
)

/** What somebody wrote about this customer. Prose, so it wraps rather than ellipsizing — a note
 *  cut at one line is a note nobody can act on. */
@Composable
private fun NotesCard(notes: String) = Column(
    Modifier.fillMaxWidth().clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.cardPadV),
    verticalArrangement = Arrangement.spacedBy(EtalonSpace.sm),
) {
    Text(stringResource(R.string.client_notes_label), style = EtalonType.sectionTitle, color = EtalonColors.ink)
    Text(notes, style = EtalonType.body, color = EtalonColors.ink2)
}

/**
 * Everything this customer has ordered, as the design system's light [OrderRow] — the same row the
 * clients list and Home draw, so an order reads the same wherever it appears. `debt = null,
 * paidLabel = null` (R5): `GET /api/clients/{id}` sends no `remaining` per line, and a «тўланган»
 * printed without one would be a claim about money nobody checked.
 *
 * @param showNoOrders the ViewModel's own rule: this client LOADED and has never ordered anything,
 *   which is not the same state as "we could not read them" — that one shows the banner above and
 *   never this line.
 */
@Composable
private fun OrdersCard(
    client: ClientDetail,
    showNoOrders: Boolean,
    now: Instant,
    onOpenOrder: (String) -> Unit,
) = Column(
    verticalArrangement = Arrangement.spacedBy(EtalonSpace.sm),
) {
    Text(
        stringResource(R.string.client_orders_section),
        style = EtalonType.sectionTitle,
        color = EtalonColors.ink,
        modifier = Modifier.padding(horizontal = TITLE_INSET),
    )
    Column(
        Modifier.fillMaxWidth().clip(EtalonShapes.xl).background(EtalonColors.surface)
            .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
            .padding(horizontal = ROW_INSET, vertical = EtalonSpace.xs),
    ) {
        if (showNoOrders) {
            Text(
                stringResource(R.string.client_no_orders),
                style = EtalonType.body,
                color = EtalonColors.ink3,
                modifier = Modifier.padding(EtalonSpace.md),
            )
        } else {
            client.orders.forEach { line ->
                OrderRow(
                    // Under a client's OWN panel every row belongs to the same customer, so the
                    // name and its avatar would be the same four times over and tell an operator
                    // nothing. The row leads with the one thing that differs — the order number —
                    // and the avatar goes with it (`showAvatar = false`), since a circle of the
                    // client's initials repeated down the card distinguishes no row from any other.
                    clientName = formatOrderNo(line.orderNumber),
                    status = line.status,
                    // «20 сен · 81,99 м²» — the date and the size, which is what tells two orders
                    // for one customer apart once the number has moved up to the title. The area
                    // is written exactly as the orders tab writes it (`formatArea`), so the same
                    // order reads the same in both lists.
                    metaLine = "${formatScheduleDate(line.scheduledAt, now)} · ${formatArea(line.totalArea)}",
                    total = line.totalPrice,
                    debt = null,
                    paidLabel = null,
                    debtLabel = { formatMoney(it) },
                    onDark = false,
                    onClick = { onOpenOrder(line.id) },
                    showAvatar = false,
                )
            }
        }
    }
}
