package uz.etalon.crm.feature.auth

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.ErrorBanner

@Composable
fun ChangePinRoute(forced: Boolean, onDone: () -> Unit, vm: HiltChangePinViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(s.done) { if (s.done) onDone() }
    val pinField: @Composable (String, (String) -> Unit, Int) -> Unit = { v, on, label ->
        OutlinedTextField(v, on, label = { Text(stringResource(label)) }, singleLine = true, visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), modifier = Modifier.fillMaxWidth())
    }
    Scaffold { pad ->
        Column(Modifier.padding(pad).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(stringResource(R.string.change_pin_title), style = MaterialTheme.typography.headlineMedium)
            if (forced) Text(stringResource(R.string.change_pin_forced_hint), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (!forced) pinField(s.current, vm::setCurrent, R.string.change_pin_current)
            pinField(s.next, vm::setNext, R.string.change_pin_new)
            pinField(s.confirm, vm::setConfirm, R.string.change_pin_confirm)
            if (s.error != null) ErrorBanner(s.error!!)
            Button(onClick = { vm.submit(forced) }, enabled = !s.isSubmitting, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text(stringResource(R.string.action_save)) }
        }
    }
}
