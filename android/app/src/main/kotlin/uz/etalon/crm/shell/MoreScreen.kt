package uz.etalon.crm.shell

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.etalon.crm.R
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.SectionLabel
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Role

/** Uzbek label for a role; the enum constant itself is an English identifier and must not reach the UI. */
fun roleLabel(role: Role): Int = when (role) {
    Role.OWNER -> R.string.role_owner
    Role.ADMIN -> R.string.role_admin
    Role.SALES -> R.string.role_sales
    Role.INVENTORY -> R.string.role_inventory
    Role.DRIVER -> R.string.role_driver
    Role.ACCOUNTANT -> R.string.role_accountant
    Role.CUSTOM -> R.string.role_custom
    Role.UNKNOWN -> R.string.role_unknown
}

@Composable
fun MoreScreen(me: Me, onChangePin: () -> Unit, onSignOut: () -> Unit) {
    Column(
        Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(me.name, style = MaterialTheme.typography.headlineMedium)
        SectionLabel(stringResource(roleLabel(me.role)))
        OutlinedButton(onClick = onChangePin, modifier = Modifier.fillMaxWidth().height(48.dp)) {
            Text(stringResource(R.string.more_change_pin))
        }
        Spacer(Modifier.weight(1f))
        TextButton(onClick = onSignOut, modifier = Modifier.fillMaxWidth().height(48.dp)) {
            Text(stringResource(R.string.more_sign_out))
        }
    }
}

@Composable
fun ComingSoonScreen(labelRes: Int) {
    Column(Modifier.fillMaxSize()) {
        Text(
            stringResource(labelRes),
            style = MaterialTheme.typography.headlineMedium,
            modifier = Modifier.padding(24.dp),
        )
        EmptyState(stringResource(R.string.coming_soon))
    }
}
