package uz.etalon.crm.feature.logistics.shipments

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import uz.etalon.crm.core.designsystem.components.CountStepper
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.feature.capture.PhotoCapture
import uz.etalon.crm.feature.logistics.R

/**
 * `imagePrep` is not a parameter here: as in every logistics screen (see
 * [uz.etalon.crm.feature.logistics.loadtruck.LoadTruckRoute]), [uz.etalon.crm.feature.capture.PhotoCapture]
 * takes it in rather than injecting it itself so `:feature:capture` stays Hilt-free, and this
 * route gets it from [HiltShipmentLoadViewModel]'s own Hilt-injected `imagePrep` property.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ShipmentLoadRoute(
    orderId: String,
    shipmentId: String,
    onDone: () -> Unit,
    onCancel: () -> Unit,
    vm: HiltShipmentLoadViewModel = hiltViewModel<HiltShipmentLoadViewModel, HiltShipmentLoadViewModel.Factory>(
        creationCallback = { it.create(orderId, shipmentId) },
    ),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(s.done) { if (s.done) onDone() }

    // Camera first, exactly like the single-photo screen: until a photo exists the viewfinder IS the screen.
    if (s.photo == null) {
        PhotoCapture(imagePrep = vm.imagePrep, onPhoto = vm::onPhoto, onCancel = onCancel)
        return
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text(stringResource(R.string.shipment_load_title)) }) },
        bottomBar = {
            // The bar clears the shell's floating nav pill itself, in every navigation mode.
            StickyActionBar {
                SecondaryButton(stringResource(R.string.action_retake), onClick = vm::retake, modifier = Modifier.weight(1f))
                PrimaryButton(
                    text = stringResource(R.string.action_mark_loaded), onClick = vm::submit,
                    loading = s.submitting, modifier = Modifier.weight(1f),
                )
            }
        },
    ) { pad ->
        Column(
            Modifier.padding(pad).padding(16.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (s.error != null) ErrorBanner(s.error!!)
            AsyncImage(
                model = s.photo!!.file, contentDescription = null, contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxWidth().height(180.dp),
            )
            s.allowance.beams.entries.sortedBy { it.key.toDoubleOrNull() ?: 0.0 }.forEach { (lengthKey, max) ->
                CountStepper(
                    label = stringResource(R.string.beam_length_label, lengthKey.replace('.', ',')),
                    value = s.beams[lengthKey] ?: 0,
                    onChange = { vm.setBeam(lengthKey, it) },
                    max = max,
                )
            }
            CountStepper(
                label = stringResource(R.string.blocks_label), value = s.blocks,
                onChange = vm::setBlocks, max = s.allowance.blocks,
            )
            Text(
                stringResource(R.string.upload_queued_hint), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
    }
}
