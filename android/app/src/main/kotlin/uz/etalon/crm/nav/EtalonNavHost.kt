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
                val selected = current == target || (d == Destination.ORDERS && current is OrderDetail)
                item(
                    selected = selected,
                    // Add first, then trim: clear-then-add would leave the stack momentarily
                    // empty, which NavDisplay cannot render.
                    onClick = {
                        backStack.add(target)
                        while (backStack.size > 1) backStack.removeAt(0)
                    },
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
        entryProvider = entryProvider {
            entry<Login> { LoginRoute(onLoggedIn = onLoggedIn, hint = hint) }
        },
    )
}
