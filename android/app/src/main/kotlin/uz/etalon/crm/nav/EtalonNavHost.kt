package uz.etalon.crm.nav

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.Calculate
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Factory
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.filled.ViewInAr
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.ui.NavDisplay
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.feature.auth.ChangePinRoute
import uz.etalon.crm.feature.auth.LoginRoute
import uz.etalon.crm.feature.orders.detail.OrderDetailRoute
import uz.etalon.crm.feature.orders.list.OrdersListRoute
import uz.etalon.crm.shell.ComingSoonScreen
import uz.etalon.crm.shell.Destination
import uz.etalon.crm.shell.MoreScreen
import uz.etalon.crm.shell.destinationsFor

private fun Destination.icon(): ImageVector = when (this) {
    Destination.HOME -> Icons.Default.Home
    Destination.ORDERS -> Icons.Default.Inventory2
    Destination.CALCULATOR -> Icons.Default.Calculate
    Destination.INBOX -> Icons.Default.ChatBubble
    Destination.PAYMENTS -> Icons.Default.AccountBalanceWallet
    Destination.PRODUCTION -> Icons.Default.Factory
    Destination.GAZOBLOK -> Icons.Default.ViewInAr
    Destination.MORE -> Icons.Default.MoreHoriz
}

private fun Destination.key(): Key = when (this) {
    Destination.ORDERS -> Orders
    Destination.MORE -> More
    else -> ComingSoon(labelRes)
}

/** Signed-in shell: navigation suite (bottom bar on phones, rail at >= 600 dp) + Nav3 display. */
@Composable
fun SignedInShell(me: Me, backStack: NavBackStack<NavKey>, onSignOut: () -> Unit) {
    val destinations = destinationsFor(me)
    val current = backStack.lastOrNull()
    NavigationSuiteScaffold(
        navigationSuiteItems = {
            destinations.forEach { d ->
                val target = d.key()
                val selected = current == target || (d == Destination.ORDERS && current is OrderDetail)
                item(
                    selected = selected,
                    onClick = { backStack.clear(); backStack.add(target) },
                    icon = { Icon(d.icon(), null) },
                    label = { Text(stringResource(d.labelRes)) },
                )
            }
        },
    ) {
        NavDisplay(
            backStack = backStack,
            onBack = { backStack.removeLastOrNull() },
            entryProvider = entryProvider {
                entry<Orders> { OrdersListRoute(onOpenOrder = { backStack.add(OrderDetail(it)) }) }
                entry<OrderDetail> { k -> OrderDetailRoute(orderId = k.id, onBack = { backStack.removeLastOrNull() }) }
                entry<More> { MoreScreen(me, onChangePin = { backStack.add(ChangePin(forced = false)) }, onSignOut = onSignOut) }
                entry<ChangePin> { k ->
                    // A forced change is the start key, so popping it would empty the stack.
                    ChangePinRoute(
                        forced = k.forced,
                        onDone = {
                            backStack.removeLastOrNull()
                            if (backStack.isEmpty()) backStack.add(Orders)
                        },
                    )
                }
                entry<ComingSoon> { k -> ComingSoonScreen(k.labelRes) }
            },
        )
    }
}

@Composable
fun SignedOutShell(backStack: NavBackStack<NavKey>, onLoggedIn: (Me) -> Unit) {
    NavDisplay(
        backStack = backStack,
        onBack = { backStack.removeLastOrNull() },
        entryProvider = entryProvider {
            entry<Login> { LoginRoute(onLoggedIn = onLoggedIn) }
        },
    )
}
