package uz.etalon.crm.feature.logistics.loadtruck

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.feature.capture.PhotoCapture
import uz.etalon.crm.feature.logistics.R

/**
 * `imagePrep` is not a parameter here: [uz.etalon.crm.feature.capture.PhotoCapture] takes it in
 * rather than injecting it itself so `:feature:capture` stays Hilt-free, and this route gets it
 * from [HiltLoadTruckViewModel]'s own Hilt-injected `imagePrep` property instead of standing up
 * an `@EntryPoint` just to reach the graph. Every logistics screen in this slice follows the
 * same rule: the `@HiltViewModel` holds `ImagePrep`, the route forwards `vm.imagePrep`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LoadTruckRoute(
    orderId: String,
    extraPhoto: Boolean,
    onDone: () -> Unit,
    onCancel: () -> Unit,
    vm: HiltLoadTruckViewModel = hiltViewModel<HiltLoadTruckViewModel, HiltLoadTruckViewModel.Factory>(
        creationCallback = { it.create(orderId, extraPhoto) },
    ),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(s.done) { if (s.done) onDone() }

    // Camera first: until a photo exists the viewfinder IS the screen.
    if (s.photo == null) {
        PhotoCapture(imagePrep = vm.imagePrep, onPhoto = vm::onPhoto, onCancel = onCancel)
        return
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text(stringResource(if (extraPhoto) R.string.add_photo_title else R.string.load_truck_title)) }) },
        bottomBar = {
            // Lifted clear of the shell's floating nav pill, which is drawn over this screen.
            Box(Modifier.padding(bottom = EtalonSpace.underNav)) {
                StickyActionBar {
                    SecondaryButton(stringResource(R.string.action_retake), onClick = vm::retake, modifier = Modifier.weight(1f))
                    PrimaryButton(
                        text = stringResource(if (extraPhoto) R.string.action_attach else R.string.action_mark_loaded),
                        onClick = vm::submit, loading = s.submitting, modifier = Modifier.weight(1f),
                    )
                }
            }
        },
    ) { pad ->
        Column(Modifier.padding(pad).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (s.error != null) ErrorBanner(s.error!!)
            AsyncImage(
                model = s.photo!!.file, contentDescription = null, contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxWidth().weight(1f),
            )
            Text(stringResource(R.string.upload_queued_hint), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
