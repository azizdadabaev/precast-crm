package uz.etalon.crm.feature.logistics.delivery

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.MoneyText
import uz.etalon.crm.core.designsystem.components.NumericKeypadSheet
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.feature.capture.PhotoCapture
import uz.etalon.crm.feature.logistics.R

/**
 * `imagePrep` is not a parameter here, exactly like every logistics screen in this slice (see
 * [uz.etalon.crm.feature.logistics.loadtruck.LoadTruckRoute]): the route gets it from
 * [HiltDeliveryProofViewModel]'s own Hilt-injected `imagePrep` property instead of standing up
 * an `@EntryPoint` just to reach the graph.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeliveryProofRoute(
    orderId: String,
    onDone: () -> Unit,
    onCancel: () -> Unit,
    vm: HiltDeliveryProofViewModel = hiltViewModel<HiltDeliveryProofViewModel, HiltDeliveryProofViewModel.Factory>(
        creationCallback = { it.create(orderId) },
    ),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(s.done) { if (s.done) onDone() }

    // Camera first: until a photo exists the viewfinder IS the screen.
    if (s.photo == null) {
        PhotoCapture(imagePrep = vm.imagePrep, onPhoto = vm::onPhoto, onCancel = onCancel)
        return
    }

    var showKeypad by remember { mutableStateOf(false) }

    Scaffold(
        topBar = { TopAppBar(title = { Text(stringResource(R.string.delivery_proof_title)) }) },
        bottomBar = {
            StickyActionBar {
                SecondaryButton(stringResource(R.string.action_retake), onClick = vm::retake, modifier = Modifier.weight(1f))
                PrimaryButton(
                    text = stringResource(R.string.action_mark_delivered), onClick = vm::submit,
                    loading = s.submitting, modifier = Modifier.weight(1f),
                )
            }
        },
    ) { pad ->
        Column(
            Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            if (s.error != null) ErrorBanner(s.error!!)
            AsyncImage(
                model = s.photo!!.file, contentDescription = null, contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxWidth().height(180.dp),
            )

            Column(
                Modifier.fillMaxWidth()
                    .clickable(enabled = !s.noCashCollected) { showKeypad = true }
                    .alpha(if (s.noCashCollected) 0.4f else 1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    stringResource(R.string.delivery_cash_label), style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                MoneyText(s.amount, style = EtalonType.monoDisplay)
                Text(
                    stringResource(R.string.delivery_expected, formatMoney(s.expected)),
                    style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                // Suppressed while "no cash collected" is on: the amount is forced to zero then,
                // so both would otherwise read as "short by the full expected amount" right next
                // to a switch saying nothing was collected — a contradiction, not a warning.
                if (!s.noCashCollected && !s.shortfall.isZero) {
                    Text(
                        stringResource(R.string.delivery_shortfall, formatMoney(s.shortfall)),
                        style = MaterialTheme.typography.bodyMedium, color = LocalEtalonColors.current.danger,
                    )
                }
                // The fat-finger direction: an extra digit collects too much, not too little.
                // Informational, like the shortfall line above it — never blocks submission.
                if (!s.noCashCollected && !s.overCollected.isZero) {
                    Text(
                        stringResource(R.string.delivery_overcollected, formatMoney(s.overCollected)),
                        style = MaterialTheme.typography.bodyMedium, color = LocalEtalonColors.current.danger,
                    )
                }
            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.delivery_no_cash))
                Switch(checked = s.noCashCollected, onCheckedChange = vm::setNoCashCollected)
            }
            if (s.noCashCollected) {
                OutlinedTextField(
                    value = s.note, onValueChange = vm::setNote,
                    label = { Text(stringResource(R.string.delivery_no_cash_note)) },
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.delivery_driver_returned))
                Switch(checked = s.driverReturned, onCheckedChange = vm::setDriverReturned)
            }

            Text(
                stringResource(R.string.upload_queued_hint), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }

    if (showKeypad) {
        NumericKeypadSheet(
            title = stringResource(R.string.delivery_cash_label),
            initial = s.amountDigits.ifEmpty { s.expected.roundedWhole().toPlainString() },
            suffix = "UZS",
            // Cash physically has no kopeks: whole UZS only, so the number this screen shows is
            // always exactly the number that goes on the wire — no comma-to-dot conversion to trust.
            allowDecimal = false,
            onConfirm = { vm.setAmountDigits(it); showKeypad = false },
            onDismiss = { showKeypad = false },
        )
    }
}
