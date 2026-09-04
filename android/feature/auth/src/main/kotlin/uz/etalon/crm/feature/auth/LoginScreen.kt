package uz.etalon.crm.feature.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.SectionLabel
import uz.etalon.crm.core.model.Me

/** [hint] is an already-resolved info line (e.g. "sign in with your new PIN" after a PIN change). */
@Composable
fun LoginRoute(onLoggedIn: (Me) -> Unit, hint: String? = null, vm: HiltLoginViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(state.done) { state.done?.let(onLoggedIn) }
    LoginScreen(state, vm::setLoginName, vm::pressDigit, vm::backspace, hint)
}

@Composable
fun LoginScreen(state: LoginUiState, onLoginName: (String) -> Unit, onDigit: (Char) -> Unit, onBackspace: () -> Unit, hint: String? = null) {
    Scaffold { pad ->
        Column(Modifier.padding(pad).padding(24.dp).fillMaxSize(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Spacer(Modifier.weight(0.6f))
            Text(stringResource(R.string.login_title), style = MaterialTheme.typography.headlineMedium)
            Text(stringResource(R.string.login_subtitle), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (hint != null) Text(hint, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
            OutlinedTextField(value = state.loginName, onValueChange = onLoginName, label = { Text(stringResource(R.string.login_name)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            SectionLabel(stringResource(R.string.login_pin))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally)) {
                repeat(4) { i -> Text(if (i < state.pin.length) "●" else "○", style = MaterialTheme.typography.headlineMedium) }
            }
            if (state.error != null) ErrorBanner(state.error)
            if (state.isSubmitting) LinearProgressIndicator(Modifier.fillMaxWidth())
            Spacer(Modifier.weight(1f))
            PinPad(onDigit, onBackspace, enabled = !state.isSubmitting)
        }
    }
}
