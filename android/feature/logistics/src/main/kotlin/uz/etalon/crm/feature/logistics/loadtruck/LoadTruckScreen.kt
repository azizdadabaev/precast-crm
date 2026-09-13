package uz.etalon.crm.feature.logistics.loadtruck

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
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
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.LoadListCard
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.model.loadList
import uz.etalon.crm.core.model.totalBlocks
import uz.etalon.crm.core.model.weightKg
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
 * `imagePrep` is not a parameter here: [uz.etalon.crm.feature.capture.PhotoCapture] takes it in
 * rather than injecting it itself so `:feature:capture` stays Hilt-free, and this route gets it
 * from [HiltLoadTruckViewModel]'s own Hilt-injected `imagePrep` property instead of standing up
 * an `@EntryPoint` just to reach the graph. Every logistics screen in this slice follows the
 * same rule: the `@HiltViewModel` holds `ImagePrep`, the route forwards `vm.imagePrep`.
 *
 * @param extraPhoto attaching another photo to an order that is already loaded, rather than the
 *   load itself. The camera and the queue are the same; the wording is not, and the load list is
 *   not drawn — nothing is going on a lorry, a picture is merely being filed.
 */
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
    // Ruling R5: the result grid is shown, not flashed. The pop waits the dwell out so the driver
    // reads what was queued; `done` is terminal in the ViewModel, so this cannot fire twice.
    LaunchedEffect(s.done) {
        if (s.done) {
            delay(RESULT_DWELL_MS)
            onDone()
        }
    }

    // Camera first: until a photo exists the viewfinder IS the screen.
    if (s.photo == null) {
        PhotoCapture(
            imagePrep = vm.imagePrep, onPhoto = vm::onPhoto, onCancel = onCancel,
            title = stringResource(if (extraPhoto) R.string.add_photo_title else R.string.load_truck_title),
        )
        return
    }

    LoadTruckScreen(s = s, extraPhoto = extraPhoto, onBack = onCancel, onRetake = vm::retake, onSubmit = vm::submit)
}

/**
 * §5.2's row for the load-truck screen: camera-first, the flow untouched, everything around it in
 * the design system. Top to bottom — the header row, «Юклаш рўйхати» (ruling R7: the loader reads
 * what goes on the truck on the same screen he photographs it), the photo he just took with the
 * one control that undoes it, and the sticky bar carrying «Юкланди» (ruling R12).
 *
 * The shell draws its floating nav pill over this screen and gives it no `Scaffold`, so the root is
 * a plain `Box`, exactly as `RecordPaymentScreen`'s is: it pads the status bar itself, the bar is
 * bottom-aligned inside it, and the scrolling column reserves what the bar actually measures —
 * which grows by a tile grid the moment the load is submitted.
 */
@Composable
fun LoadTruckScreen(
    s: LoadTruckUiState,
    extraPhoto: Boolean,
    onBack: () -> Unit,
    onRetake: () -> Unit,
    onSubmit: () -> Unit,
) {
    var barHeightPx by remember { mutableIntStateOf(0) }
    val barHeight = with(LocalDensity.current) { barHeightPx.toDp() }
    val order = s.order
    val photo = s.photo
    // Queued or sent, the driver's next move is the same, and this screen never learns which:
    // the outbox owns the row from here. The summary says what it knows.
    val settling = s.submitting || s.done

    Box(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding()) {
        Column(Modifier.fillMaxSize()) {
            LogisticsHeader(
                title = stringResource(if (extraPhoto) R.string.add_photo_title else R.string.load_truck_title),
                meta = order?.let { "${formatOrderNo(it.summary.orderNumber)} · ${it.summary.client.name}" },
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
                // Ruling R7. Not in `extraPhoto` mode: that order is already loaded, and a load
                // list there would read as a job still to do.
                if (!extraPhoto && order != null && order.rooms.isNotEmpty()) {
                    LoadListCard(order.loadList, order.totalBlocks, order.weightKg)
                }
                if (photo != null) PhotoReviewCard(photo, onRetake)
            }
        }

        Box(Modifier.align(Alignment.BottomCenter).onSizeChanged { barHeightPx = it.height }) {
            StickyActionBar {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(EtalonSpace.md)) {
                    if (settling) ResultTileGrid(resultCells(s, extraPhoto))
                    // Dead once the row is queued: the bar stays on screen for the dwell, and a
                    // second tap would hand the outbox a photo file it has already moved away.
                    if (extraPhoto) {
                        PrimaryButton(
                            text = stringResource(R.string.action_attach),
                            onClick = onSubmit,
                            enabled = !s.done,
                            loading = s.submitting,
                        )
                    } else {
                        MarkLoadedButton(loading = s.submitting, enabled = !s.done, onClick = onSubmit)
                    }
                }
            }
        }
    }
}

/**
 * Ruling R5's four figures. In `extraPhoto` mode the beam and block counts are left out: nothing
 * was counted, one picture was filed, and printing the order's totals there would claim a load
 * this tap did not make.
 */
@Composable
private fun resultCells(s: LoadTruckUiState, extraPhoto: Boolean): List<Pair<String, String>> {
    val order = s.order
    val photo = stringResource(R.string.logistics_tile_photo) to "1"
    val state = stringResource(R.string.logistics_tile_state) to stringResource(R.string.logistics_tile_queued)
    if (extraPhoto || order == null) return listOf(photo, state)
    return listOf(
        stringResource(R.string.logistics_tile_beams) to formatCountBare(order.loadList.sumOf { it.beams }),
        stringResource(R.string.logistics_tile_blocks) to formatCountBare(order.totalBlocks),
        photo,
        state,
    )
}
