package uz.etalon.crm.nav

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.navigation3.rememberViewModelStoreNavEntryDecorator
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.runtime.NavEntryDecorator
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import androidx.navigation3.ui.NavDisplay
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import uz.etalon.crm.core.designsystem.components.BottomNav
import uz.etalon.crm.core.designsystem.components.BottomNavItem
import uz.etalon.crm.core.designsystem.components.BottomNavScrim
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.components.navPillInsetOf
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.OrdersView
import uz.etalon.crm.core.ui.format.TASHKENT
import uz.etalon.crm.feature.auth.ChangePinRoute
import uz.etalon.crm.feature.auth.LoginRoute
import uz.etalon.crm.feature.calculator.CalculatorRoute
import uz.etalon.crm.feature.browse.DraftsRoute
import uz.etalon.crm.feature.clients.detail.ClientDetailRoute
import uz.etalon.crm.feature.clients.list.ClientsRoute
import uz.etalon.crm.feature.home.HomeRoute
import uz.etalon.crm.feature.logistics.delivery.DeliveryProofRoute
import uz.etalon.crm.feature.logistics.dispatch.DispatchRoute
import uz.etalon.crm.feature.logistics.drivers.DriversRoute
import uz.etalon.crm.feature.logistics.loadtruck.LoadTruckRoute
import uz.etalon.crm.feature.logistics.location.DeliveryLocationRoute
import uz.etalon.crm.feature.logistics.shipments.ShipmentLoadRoute
import uz.etalon.crm.feature.logistics.shipments.ShipmentsRoute
import uz.etalon.crm.feature.orders.detail.OrderDetailRoute
import uz.etalon.crm.feature.orders.list.OrdersListRoute
import uz.etalon.crm.feature.orders.list.OrdersOpenDayStore
import uz.etalon.crm.feature.orders.list.PrefsOrdersViewStore
import uz.etalon.crm.feature.payments.discrepancies.DiscrepanciesRoute
import uz.etalon.crm.feature.payments.queue.ConfirmQueueRoute
import uz.etalon.crm.feature.payments.record.RecordPaymentRoute
import uz.etalon.crm.shell.AccountSheet
import uz.etalon.crm.shell.AccountViewModel
import uz.etalon.crm.shell.Destination
import uz.etalon.crm.shell.NoAccessScreen
import uz.etalon.crm.shell.AppDrawer
import uz.etalon.crm.shell.drawerDestinationsFor
import uz.etalon.crm.shell.destinationsFor
import java.time.LocalDate
import javax.inject.Inject

/**
 * The shell's one door into the DI graph, for design §4's two hand-offs into the Orders tab.
 *
 * The repo's idiom is to reach the graph through a Hilt ViewModel rather than stand up an
 * `@EntryPoint` (see `DeliveryProofRoute`'s note), and `SignedInShell` already does exactly this
 * for `AccountViewModel`. Both stores are `:feature:orders`' own: the view store is the persisted
 * Рўйхат/Жадвал switch, and the open-day store is ruling R6's one-shot.
 */
@HiltViewModel
class HandoffViewModel @Inject constructor(
    private val viewStore: PrefsOrdersViewStore,
    private val openDayStore: OrdersOpenDayStore,
) : ViewModel() {
    /** «Бугунги етказишлар» → the calendar on today's day sheet. Today in Tashkent, not on the
     *  phone: the factory's day is what the grid is drawn in. */
    fun openCalendarOnToday() = openDayStore.set(LocalDate.now(TASHKENT))

    /** «Барчаси →» → the orders tab in its Рўйхат view. Suspends until the preference is written,
     *  so the ViewModel that reads it on start cannot read the previous value. */
    suspend fun showOrdersList() = viewStore.set(OrdersView.LIST)
}

private fun Destination.icon(): Int = when (this) {
    Destination.HOME -> EtalonIcons.House
    Destination.ORDERS -> EtalonIcons.FileText
    Destination.CALCULATOR -> EtalonIcons.Calculator
    Destination.PAYMENTS -> EtalonIcons.Wallet
    Destination.DRAFTS -> EtalonIcons.Save
}

/**
 * Add first, then trim: clear-then-add would leave the stack momentarily empty, which
 * NavDisplay cannot render.
 *
 * Re-tapping the cell that is already lit is a no-op. Adding the same key again replaces the
 * entry — and with it the `ViewModelStore` the entry decorator holds — so Orders would lose the
 * query, the chip and the scroll position the operator had just set, on a tap that asked for
 * nothing. This is a whole-screen test: `backStack.lastOrNull()`, not `tabFor`, because a stack
 * route *under* the same tab (an order detail with «Буюртма» lit) is a different screen and
 * tapping the cell must still take the operator back to the list.
 */
internal fun switchTab(backStack: NavBackStack<NavKey>, target: NavKey) {
    if (backStack.lastOrNull() == target) return
    backStack.add(target)
    while (backStack.size > 1) backStack.removeAt(0)
}

/**
 * Pops [key] only while it is still the screen on top — the pop for a callback that can arrive
 * late.
 *
 * The three camera-first routes hold ruling R5's result grid on screen for a fixed dwell before
 * calling `onDone`, and `NavDisplay` keeps an outgoing entry composed for the whole of its exit
 * transition. So a driver who taps back during the dwell pops his own entry, the waiting effect
 * then resumes inside a screen that is already leaving, and an unconditional `removeLastOrNull()`
 * would pop a SECOND entry: he asked for the order detail and would land on the orders list, or one
 * screen past the shipments list. Comparing identity first makes the late callback a no-op — and
 * does the same for any future delayed pop — while an ordinary back press is unaffected, because
 * then this key IS the top.
 *
 * `PopIfTopTest` drives both orders: the dwell alone, and back during the dwell.
 */
internal fun popIfTop(backStack: NavBackStack<NavKey>, key: NavKey) {
    if (backStack.lastOrNull() == key) backStack.removeLastOrNull()
}

/** NavDisplay's default is the saveable-state decorator alone, which leaves every entry resolving
 *  `hiltViewModel()` against the Activity's ViewModelStore. That means one shared `OrderDetailViewModel`
 *  for every `OrderDetail(id)` — the assisted `creationCallback` runs only for the first id — and an
 *  `OrdersListViewModel` that outlives sign-out with a cache nothing refills. Adding the ViewModelStore
 *  decorator gives each back-stack entry its own store, cleared when the entry (or the whole display)
 *  goes away. */
@Composable
private fun rememberEntryDecorators(): List<NavEntryDecorator<NavKey>> {
    val saveableState = rememberSaveableStateHolderNavEntryDecorator<NavKey>()
    val viewModelStore = rememberViewModelStoreNavEntryDecorator<NavKey>()
    return remember(saveableState, viewModelStore) { listOf(saveableState, viewModelStore) }
}

/**
 * Signed-in shell: the floating navy nav pill (§4, D3) over the Nav3 display. The pill draws
 * *above* the content rather than beside it — every screen pads its own last row clear of it with
 * [LocalNavPillInset], which this shell provides, and the [BottomNavScrim] fades whatever scrolls
 * under it. The ≥ 600 dp rail is gone with `NavigationSuiteScaffold` (R8: phones only).
 *
 * The lit cell is the *tab the current route belongs to* ([tabFor]), not the route itself, so an
 * order detail keeps «Буюртма» lit and the account sheet's three screens keep «Бош» lit. A route
 * belonging to no cell leaves `selected` at -1, which lights nothing.
 *
 * The one screen that gets **no pill at all** is a forced PIN change. `MainActivity` makes
 * `ChangePin(forced = true)` the start key for an operator whose password the server has expired,
 * and that screen is a gate: it has no back arrow and `onDone` signs them out. A bar there would
 * light «Бош» — [tabFor] maps every ChangePin to Home, which is right for the voluntary one
 * reached from the account sheet — and, worse, every cell would still be tappable, walking the
 * operator around an app whose token dies the moment they finish. The voluntary ChangePin keeps
 * its pill.
 */
@Composable
fun SignedInShell(
    me: Me,
    backStack: NavBackStack<NavKey>,
    onSignOut: () -> Unit,
    onPinChanged: () -> Unit,
) {
    val handoff: HandoffViewModel = hiltViewModel()
    val scope = rememberCoroutineScope()
    val destinations = destinationsFor(me)
    val current = backStack.lastOrNull()
    val selected = destinations.indexOf(current?.let(::tabFor))
    val locked = current != null && hidesNav(current)
    var showAccount by remember { mutableStateOf(false) }
    var showDrawer by remember { mutableStateOf(false) }
    val drawerEntries = drawerDestinationsFor(me)
    val labels = destinations.map { stringResource(it.shortLabelRes) }
    val descriptions = destinations.map { stringResource(it.labelRes) }
    val items = remember(destinations, labels) {
        destinations.mapIndexed { i, d -> BottomNavItem(d.icon(), labels[i], descriptions[i]) }
    }

    Box(Modifier.fillMaxSize().background(EtalonColors.page)) {
        // One place decides how much room the pill needs, for every screen under it and for every
        // navigation mode: the system inset plus the pill's own band. `locked` provides 0 instead,
        // because a forced PIN change gets no pill and must not keep a band of empty page for one.
        CompositionLocalProvider(LocalNavPillInset provides if (locked) 0.dp else navPillInsetOf()) {
            NavDisplay(
                backStack = backStack,
                onBack = { backStack.removeLastOrNull() },
                entryDecorators = rememberEntryDecorators(),
                // Some keys legitimately have no entry: they are registered per permission (below), so
                // a back stack restored for an operator who has since lost driver.view, dispatch.create
                // or payment.view would land on nothing, and crashing them out of the app is worse than
                // an Uzbek notice. `gatingPermission` is the one list of those keys — shared with the
                // guards below so the two cannot drift. Every OTHER unregistered key, and any gated key
                // whose permission this operator DOES hold, is a wiring mistake and must still fail
                // loudly here rather than be swallowed as a silent "no access".
                entryProvider = entryProvider(
                    fallback = { key ->
                        if (me.canOpen(key)) error("No NavEntry registered for $key")
                        NavEntry(key) { NoAccessScreen() }
                    },
                ) {
                    // Home needs no permission at all — the «Бугун» column is for everyone; only its
                    // tiles are gated, and HomeViewModel handles that itself (dashboard.viewBasic
                    // or dashboard.view gates the one endpoint that carries both the tiles and
                    // today's deliveries — see HomeViewModel's KDoc).
                    entry<Home> {
                        HomeRoute(
                            me = me,
                            onOpenOrder = { backStack.add(OrderDetail(it)) },
                            onOpenOrders = { switchTab(backStack, Orders) },
                            onOpenAccount = { showAccount = true },
                            onOpenMenu = { showDrawer = true },
                            // Design §4's three dashboard hand-offs. Two of them speak to the
                            // Orders tab through a store before switching to it, because the tab
                            // has no route arguments: the ViewModel reads both on start.
                            onOpenClients = { switchTab(backStack, Clients) },
                            onOpenCalendarToday = {
                                handoff.openCalendarOnToday()
                                switchTab(backStack, Orders)
                            },
                            // The persisted view is a DataStore write, and the Orders ViewModel
                            // reads it in its own `init` — so the switch waits for the write
                            // rather than racing it. The calendar hand-off above needs no such
                            // care: its store is in memory and its write has already landed.
                            onOpenOrdersList = {
                                scope.launch {
                                    handoff.showOrdersList()
                                    switchTab(backStack, Orders)
                                }
                            },
                            // Where a rejected queued order reopens (ruling I3). Gated exactly as
                            // the orders list's «+ Янги» is: without calculator.use that tab does
                            // not exist, so the sheet does not offer the action at all.
                            onOpenCalculator = if (me.can(PERM_CALCULATOR_USE)) ({ switchTab(backStack, Calculator) }) else null,
                        )
                    }
                    entry<Orders> {
                        OrdersListRoute(
                            onOpenOrder = { backStack.add(OrderDetail(it)) },
                            // «+ Янги» hands over to the calculator, which is where a new order is
                            // quoted and placed. Without calculator.use that tab does not exist, so
                            // the button is not drawn at all rather than drawn and dead.
                            onNewOrder = if (me.can(PERM_CALCULATOR_USE)) ({ switchTab(backStack, Calculator) }) else null,
                            // Жадвал's export button. Drawn only for the operator the server
                            // would actually let build the workbook (R4) — the slot is simply
                            // empty for everyone else.
                            canExport = me.can(PERM_ORDER_EXPORT_BACKUP),
                        )
                    }
                    entry<OrderDetail> { k ->
                        OrderDetailRoute(
                            orderId = k.id,
                            me = me,
                            onBack = { backStack.removeLastOrNull() },
                            onLoadTruck = { backStack.add(LoadTruck(k.id, extra = false)) },
                            onAddPhoto = { backStack.add(LoadTruck(k.id, extra = true)) },
                            onDeliveryProof = { backStack.add(DeliveryProof(k.id)) },
                            onOpenShipments = { backStack.add(Shipments(k.id)) },
                            onOpenLocation = { backStack.add(DeliveryLocation(k.id)) },
                            onRecordPayment = { backStack.add(RecordPayment(k.id)) },
                        )
                    }
                    // The three camera-first routes pop through `popIfTop` rather than straight
                    // through `removeLastOrNull()`: their `onDone` arrives after ruling R5's dwell,
                    // which back can beat. See `popIfTop`.
                    entry<LoadTruck> { k ->
                        LoadTruckRoute(
                            orderId = k.orderId, extraPhoto = k.extra,
                            onDone = { popIfTop(backStack, k) }, onCancel = { popIfTop(backStack, k) },
                        )
                    }
                    // Registered only for an operator who may quote — the Drivers pattern: without
                    // calculator.use the route does not exist, so no restored back stack can open it
                    // either.
                    if (me.can(PERM_CALCULATOR_USE)) {
                        entry<Calculator> { CalculatorRoute(onOpenOrder = { backStack.add(OrderDetail(it)) }) }
                    }
                    // Registered only for an operator who may read the client list, the Drivers
                    // pattern: without client.view the route does not exist, so no restored back
                    // stack or deep link can open it either.
                    if (me.can(PERM_ORDER_VIEW)) {
                        entry<Drafts> { DraftsRoute(onOpenOrder = { backStack.add(OrderDetail(it)) }) }
                    }
                    if (me.can(PERM_CLIENT_VIEW)) {
                        entry<Clients> { ClientsRoute(onOpenClient = { backStack.add(ClientDetail(it)) }) }
                        entry<ClientDetail> { k ->
                            ClientDetailRoute(
                                clientId = k.id,
                                onBack = { backStack.removeLastOrNull() },
                                onOpenOrder = { backStack.add(OrderDetail(it)) },
                            )
                        }
                    }
                    // Every shipment and dispatch route is wrapped in withPermission("dispatch.create")
                    // server-side, and ROLE_TEMPLATES.SALES — the largest operator role — holds
                    // order.edit without it. Registered per permission for the same reason Drivers is:
                    // without it these screens do not exist, so no restored back stack can open them
                    // and walk the operator into a 403 that becomes a permanently failed upload.
                    if (me.can(PERM_DISPATCH_CREATE)) {
                        entry<Shipments> { k ->
                            ShipmentsRoute(
                                orderId = k.orderId,
                                onLoadShipment = { backStack.add(ShipmentLoad(k.orderId, it)) },
                                onDispatch = { backStack.add(Dispatch(k.orderId, it)) },
                                onBack = { backStack.removeLastOrNull() },
                            )
                        }
                        entry<ShipmentLoad> { k ->
                            ShipmentLoadRoute(
                                orderId = k.orderId, shipmentId = k.shipmentId,
                                onDone = { popIfTop(backStack, k) }, onCancel = { popIfTop(backStack, k) },
                            )
                        }
                        entry<Dispatch> { k ->
                            DispatchRoute(
                                orderId = k.orderId, shipmentId = k.shipmentId,
                                onDone = { popIfTop(backStack, k) }, onCancel = { popIfTop(backStack, k) },
                            )
                        }
                    }
                    entry<DeliveryProof> { k ->
                        DeliveryProofRoute(
                            orderId = k.orderId,
                            onDone = { popIfTop(backStack, k) }, onCancel = { popIfTop(backStack, k) },
                        )
                    }
                    entry<DeliveryLocation> { k ->
                        DeliveryLocationRoute(
                            orderId = k.orderId,
                            onDone = { backStack.removeLastOrNull() }, onBack = { backStack.removeLastOrNull() },
                        )
                    }
                    // Registered only for an operator who may read the roster: without the permission
                    // the route does not exist, so no deep link or restored stack can open it.
                    if (me.can(PERM_DRIVER_VIEW)) {
                        entry<Drivers> { DriversRoute(onBack = { backStack.removeLastOrNull() }) }
                    }
                    // The payments tab IS the confirmation queue. Approve and reject inside it need
                    // payment.confirm on top of this, which ConfirmQueueViewModel checks for itself —
                    // an ACCOUNTANT holds payment.view alone and reads the queue without acting on it.
                    if (me.can(PERM_PAYMENT_VIEW)) {
                        entry<Payments> {
                            ConfirmQueueRoute(
                                onOpenOrder = { backStack.add(OrderDetail(it)) },
                                // Ruling R9's second door into the discrepancies list, beside the
                                // Home avatar sheet's. Null without the permission — the
                                // `Discrepancies` entry below is not registered then either, so a
                                // pill that opened it would walk into a route that does not exist.
                                onOpenDiscrepancies =
                                    if (me.can(PERM_DISCREPANCY_VIEW)) ({ backStack.add(Discrepancies) }) else null,
                            )
                        }
                    }
                    if (me.can(PERM_DISCREPANCY_VIEW)) {
                        entry<Discrepancies> {
                            DiscrepanciesRoute(
                                onOpenOrder = { backStack.add(OrderDetail(it)) },
                                onBack = { backStack.removeLastOrNull() },
                            )
                        }
                    }
                    // A DRIVER holds payment.record and neither payment.view nor order.edit: collecting
                    // cash on site is their job, so this route is gated on its own permission rather
                    // than riding along with the queue's.
                    if (me.can(PERM_PAYMENT_RECORD)) {
                        entry<RecordPayment> { k ->
                            RecordPaymentRoute(
                                orderId = k.orderId,
                                onDone = { backStack.removeLastOrNull() }, onCancel = { backStack.removeLastOrNull() },
                            )
                        }
                    }
                    // The server bumps tokenVersion on a PIN change, so the current token is dead the
                    // moment this succeeds. Sign out deliberately instead of walking back into the app
                    // and hitting a silent 401.
                    entry<ChangePin> { k ->
                        ChangePinRoute(
                            forced = k.forced,
                            onDone = onPinChanged,
                            // Only the voluntary change has an arrow; the forced one draws none.
                            onBack = { backStack.removeLastOrNull() },
                        )
                    }
                },
            )
        }
        // Above the pill and below the account sheet: the drawer covers the bar it replaces the
        // fifth cell of, and a tap on the scrim is the way out.
        if (!locked) {
            AppDrawer(
                open = showDrawer,
                me = me,
                entries = drawerEntries,
                onDismiss = { showDrawer = false },
                onSelect = { entry ->
                    showDrawer = false
                    switchTab(backStack, entry.key())
                },
            )
        }
        if (!locked) {
            Box(Modifier.align(Alignment.BottomCenter).fillMaxWidth(), contentAlignment = Alignment.BottomCenter) {
                BottomNavScrim()
                BottomNav(items = items, selectedIndex = selected, onSelect = { i -> switchTab(backStack, destinations[i].key()) })
            }
        }
    }
    if (showAccount) {
        val vm: AccountViewModel = hiltViewModel()
        val pending by vm.pendingUploads.collectAsStateWithLifecycle()
        AccountSheet(
            me = me,
            pendingUploads = pending,
            onDrivers = { showAccount = false; backStack.add(Drivers) },
            onDiscrepancies = { showAccount = false; backStack.add(Discrepancies) },
            onChangePin = { showAccount = false; backStack.add(ChangePin(forced = false)) },
            onSignOut = { showAccount = false; onSignOut() },
            onDismiss = { showAccount = false },
        )
    }
}

/** [hintRes] is an optional info line on the login screen, e.g. after a PIN change. */
@Composable
fun SignedOutShell(backStack: NavBackStack<NavKey>, hintRes: Int?, onLoggedIn: (Me) -> Unit) {
    val hint = hintRes?.let { stringResource(it) }
    NavDisplay(
        backStack = backStack,
        onBack = { backStack.removeLastOrNull() },
        entryDecorators = rememberEntryDecorators(),
        entryProvider = entryProvider {
            entry<Login> { LoginRoute(onLoggedIn = onLoggedIn, hint = hint) }
        },
    )
}
