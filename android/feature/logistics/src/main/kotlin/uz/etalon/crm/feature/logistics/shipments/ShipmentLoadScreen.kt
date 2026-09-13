package uz.etalon.crm.feature.logistics.shipments

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.delay
import uz.etalon.crm.core.designsystem.components.CountStepper
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.LoadListCard
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.ui.format.formatCountBare
import uz.etalon.crm.core.ui.format.formatOrderNo
import uz.etalon.crm.feature.capture.PhotoCapture
import uz.etalon.crm.feature.logistics.LogisticsHeader
import uz.etalon.crm.feature.logistics.MarkLoadedButton
import uz.etalon.crm.feature.logistics.PhotoReviewCard
import uz.etalon.crm.feature.logistics.R
import uz.etalon.crm.feature.logistics.RESULT_DWELL_MS
import uz.etalon.crm.feature.logistics.ResultTileGrid

/**
 * `imagePrep` is not a parameter here: as in every logistics screen (see
 * [uz.etalon.crm.feature.logistics.loadtruck.LoadTruckRoute]), [uz.etalon.crm.feature.capture.PhotoCapture]
 * takes it in rather than injecting it itself so `:feature:capture` stays Hilt-free, and this
 * route gets it from [HiltShipmentLoadViewModel]'s own Hilt-injected `imagePrep` property.
 */
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
    // Ruling R5: the counts that were queued are shown, not flashed, before the route pops.
    LaunchedEffect(s.done) {
        if (s.done) {
            delay(RESULT_DWELL_MS)
            onDone()
        }
    }

    // Camera first, exactly like the single-photo screen: until a photo exists the viewfinder IS the screen.
    if (s.photo == null) {
        PhotoCapture(
            imagePrep = vm.imagePrep, onPhoto = vm::onPhoto, onCancel = onCancel,
            title = stringResource(R.string.shipment_load_title),
        )
        return
    }

    ShipmentLoadScreen(
        s = s,
        onBack = onCancel,
        onRetake = vm::retake,
        onSetBeam = vm::setBeam,
        onSetBlocks = vm::setBlocks,
        onSubmit = vm::submit,
    )
}

/**
 * §5.2's row for the shipment-load screen — the load-truck screen with the list made countable
 * (ruling R7): the same «Юклаш рўйхати» card, but every row is a [CountStepper] bound to what this
 * truck may still take. The allowance is the ceiling the server would enforce anyway, so a stepper
 * that stops is a 422 that never happens.
 */
@Composable
fun ShipmentLoadScreen(
    s: ShipmentLoadUiState,
    onBack: () -> Unit,
    onRetake: () -> Unit,
    onSetBeam: (String, Int) -> Unit,
    onSetBlocks: (Int) -> Unit,
    onSubmit: () -> Unit,
) {
    var barHeightPx by remember { mutableIntStateOf(0) }
    val barHeight = with(LocalDensity.current) { barHeightPx.toDp() }
    val photo = s.photo
    val settling = s.submitting || s.done

    Box(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding()) {
        Column(Modifier.fillMaxSize()) {
            LogisticsHeader(
                title = stringResource(R.string.shipment_load_title),
                meta = s.order?.let { "${formatOrderNo(it.summary.orderNumber)} · ${it.summary.client.name}" },
                onBack = onBack,
            )
            Column(
                Modifier.fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = EtalonSpace.cardMargin)
                    .padding(top = EtalonSpace.sm, bottom = maxOf(barHeight, LocalNavPillInset.current)),
                verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
            ) {
                s.error?.let { ErrorBanner(it) }
                LoadListCard {
                    Column(verticalArrangement = Arrangement.spacedBy(EtalonSpace.sm)) {
                        // Sorted by the length itself, not by the key's text: «10.00» sorts before
                        // «4.00» as a string, and a loader reading the list against the beams in
                        // front of him must find them in the order the yard stacks them.
                        s.allowance.beams.entries.sortedBy { it.key.toDoubleOrNull() ?: 0.0 }
                            .forEach { (lengthKey, max) ->
                                CountStepper(
                                    label = stringResource(R.string.beam_length_label, lengthKey.replace('.', ',')),
                                    value = s.beams[lengthKey] ?: 0,
                                    onChange = { onSetBeam(lengthKey, it) },
                                    max = max,
                                )
                            }
                    }
                    HorizontalDivider(
                        Modifier.fillMaxWidth().padding(vertical = EtalonSpace.sm),
                        thickness = EtalonSpace.hairline,
                        color = EtalonColors.surfaceBorder,
                    )
                    CountStepper(
                        label = stringResource(R.string.blocks_label),
                        value = s.blocks,
                        onChange = onSetBlocks,
                        max = s.allowance.blocks,
                    )
                }
                if (photo != null) PhotoReviewCard(photo, onRetake)
            }
        }

        Box(Modifier.align(Alignment.BottomCenter).onSizeChanged { barHeightPx = it.height }) {
            StickyActionBar {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(EtalonSpace.md)) {
                    // Ruling R5: what this truck is taking, as it goes into the queue.
                    if (settling) {
                        ResultTileGrid(
                            listOf(
                                stringResource(R.string.logistics_tile_beams) to
                                    formatCountBare(s.beams.values.sum()),
                                stringResource(R.string.logistics_tile_blocks) to formatCountBare(s.blocks),
                                stringResource(R.string.logistics_tile_photo) to "1",
                                stringResource(R.string.logistics_tile_state) to
                                    stringResource(R.string.logistics_tile_queued),
                            ),
                        )
                    }
                    MarkLoadedButton(loading = s.submitting, onClick = onSubmit)
                }
            }
        }
    }
}
