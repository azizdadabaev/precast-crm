package uz.etalon.crm.nav

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Factory
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.ViewInAr
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.runtime.remember
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.viewmodel.navigation3.rememberViewModelStoreNavEntryDecorator
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.runtime.NavEntryDecorator
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import androidx.navigation3.ui.NavDisplay
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.feature.auth.ChangePinRoute
import uz.etalon.crm.feature.auth.LoginRoute
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
import uz.etalon.crm.feature.payments.discrepancies.DiscrepanciesRoute
import uz.etalon.crm.feature.payments.queue.ConfirmQueueRoute
import uz.etalon.crm.feature.payments.record.RecordPaymentRoute
import uz.etalon.crm.shell.ComingSoonScreen
import uz.etalon.crm.shell.Destination
import uz.etalon.crm.shell.MoreRoute
import uz.etalon.crm.shell.NoAccessScreen
import uz.etalon.crm.shell.destinationsFor

private fun Destination.icon(): ImageVector = when (this) {
    Destination.HOME -> Icons.Default.Home
    Destination.ORDERS -> Icons.Default.Inventory2
    Destination.CALCULATOR -> Icons.Default.Calculate
    Destination.INBOX -> Icons.Default.ChatBubble
    Destination.PAYMENTS -> Icons.Default.AccountBalanceWallet
    Destination.CLIENTS -> Icons.Default.People
    Destination.PRODUCTION -> Icons.Default.Factory
    Destination.GAZOBLOK -> Icons.Default.ViewInAr
    Destination.MORE -> Icons.Default.MoreHoriz
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

/** Signed-in shell: navigation suite (bottom bar on phones, rail at >= 600 dp) + Nav3 display. */
@Composable
fun SignedInShell(
    me: Me,
    backStack: NavBackStack<NavKey>,
    onSignOut: () -> Unit,
    onPinChanged: () -> Unit,
) {
    val destinations = destinationsFor(me)
    val current = backStack.lastOrNull()
    NavigationSuiteScaffold(
        navigationSuiteItems = {
            destinations.forEach { d ->
                val target = d.key()
                val selected = current == target ||
                    (d == Destination.ORDERS && current is OrderDetail) ||
                    (d == Destination.CLIENTS && current is ClientDetail)
                item(
                    selected = selected,
                    // Add first, then trim: clear-then-add would leave the stack momentarily
                    // empty, which NavDisplay cannot render.
                    onClick = {
                        backStack.add(target)
                        while (backStack.size > 1) backStack.removeAt(0)
                    },
                    icon = { Icon(d.icon(), contentDescription = stringResource(d.labelRes)) },
                    label = { Text(stringResource(d.shortLabelRes), maxLines = 1) },
                )
            }
        },
    ) {
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
                entry<Home> { HomeRoute(onOpenOrder = { backStack.add(OrderDetail(it)) }) }
                entry<Orders> { OrdersListRoute(onOpenOrder = { backStack.add(OrderDetail(it)) }) }
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
                entry<LoadTruck> { k ->
                    LoadTruckRoute(
                        orderId = k.orderId, extraPhoto = k.extra,
                        onDone = { backStack.removeLastOrNull() }, onCancel = { backStack.removeLastOrNull() },
                    )
                }
                // Registered only for an operator who may read the client list, the Drivers
                // pattern: without client.view the route does not exist, so no restored back
                // stack or deep link can open it either.
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
                            onDone = { backStack.removeLastOrNull() }, onCancel = { backStack.removeLastOrNull() },
                        )
                    }
                    entry<Dispatch> { k ->
                        DispatchRoute(
                            orderId = k.orderId, shipmentId = k.shipmentId,
                            onDone = { backStack.removeLastOrNull() }, onCancel = { backStack.removeLastOrNull() },
                        )
                    }
                }
                entry<DeliveryProof> { k ->
                    DeliveryProofRoute(
                        orderId = k.orderId,
                        onDone = { backStack.removeLastOrNull() }, onCancel = { backStack.removeLastOrNull() },
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
                    entry<Payments> { ConfirmQueueRoute(onOpenOrder = { backStack.add(OrderDetail(it)) }) }
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
                entry<More> {
                    MoreRoute(
                        me = me,
                        onOpen = { d -> backStack.add(d.key()) },
                        onOpenDrivers = { backStack.add(Drivers) },
                        onOpenDiscrepancies = { backStack.add(Discrepancies) },
                        onChangePin = { backStack.add(ChangePin(forced = false)) },
                        onSignOut = onSignOut,
                    )
                }
                // The server bumps tokenVersion on a PIN change, so the current token is dead the
                // moment this succeeds. Sign out deliberately instead of walking back into the app
                // and hitting a silent 401.
                entry<ChangePin> { k -> ChangePinRoute(forced = k.forced, onDone = onPinChanged) }
                entry<ComingSoon> { k -> ComingSoonScreen(k.labelRes) }
            },
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
