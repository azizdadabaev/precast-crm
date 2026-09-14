package uz.etalon.crm.feature.logistics.location

import android.Manifest
import android.app.Activity
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonTextField
import uz.etalon.crm.core.designsystem.components.FormCard
import uz.etalon.crm.core.designsystem.components.FormField
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.components.TonalButton
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.ui.format.formatOrderNo
import uz.etalon.crm.feature.capture.isPermanentlyDenied
import uz.etalon.crm.feature.logistics.LogisticsCard
import uz.etalon.crm.feature.logistics.LogisticsHeader
import uz.etalon.crm.feature.logistics.R

@Composable
fun DeliveryLocationRoute(
    orderId: String,
    onDone: () -> Unit,
    onBack: () -> Unit,
    vm: HiltDeliveryLocationViewModel = hiltViewModel<HiltDeliveryLocationViewModel, HiltDeliveryLocationViewModel.Factory>(
        creationCallback = { it.create(orderId) },
    ),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(s.saved) { if (s.saved) onDone() }
    DeliveryLocationScreen(
        s = s,
        onBack = onBack,
        onRefresh = vm::refresh,
        onUseMyLocation = vm::useMyLocation,
        onLinkInputChange = vm::onLinkInputChange,
        onResolveLink = vm::resolveLink,
        onManualInputChange = vm::onManualInputChange,
        onApplyManualInput = vm::applyManualInput,
        onLabelChange = vm::onLabelChange,
        onSave = vm::save,
        onClear = vm::clear,
    )
}

/**
 * §5.2's row for this screen: «DeliveryLocation: map unchanged; controls restyled» — and ruling R8
 * as corrected, which is that there never WAS a map here. Top to bottom: the header, one white `xl`
 * card holding the pin the order actually carries (the coordinates, the operator's own label, and
 * the way out to a real map app), one [FormCard] holding the three ways to set a pin, «Менинг
 * жойим», and a sticky bar with «Тозалаш» beside «Сақлаш».
 *
 * The pin card states its absence in the same place it would state a pin — «Жой белгиланмаган»
 * inside the card, never a second empty state somewhere else, and never while the order fetch is
 * still out: "no pin" and "don't know yet" must not read the same to a driver about to set one.
 *
 * The shell draws its floating nav pill over this screen and gives it no `Scaffold`, so the screen
 * pads the status bar itself and the bar is bottom-aligned inside a plain `Box`.
 *
 * @param barVisible whether the sticky bar is drawn at all (ruling R13). It steps aside for the
 *   keyboard — the label and the two coordinate fields are typed down the form, and a
 *   bottom-aligned bar would otherwise land on top of them. Defaulted from the window and passed in
 *   only by the tests, since Robolectric reports the ime inset as absent whatever is focused.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun DeliveryLocationScreen(
    s: DeliveryLocationUiState,
    onBack: () -> Unit,
    onRefresh: () -> Unit,
    onUseMyLocation: () -> Unit,
    onLinkInputChange: (String) -> Unit,
    onResolveLink: () -> Unit,
    onManualInputChange: (String) -> Unit,
    onApplyManualInput: () -> Unit,
    onLabelChange: (String) -> Unit,
    onSave: () -> Unit,
    onClear: () -> Unit,
    barVisible: Boolean = !WindowInsets.isImeVisible,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    var barHeightPx by remember { mutableIntStateOf(0) }
    val barHeight = with(LocalDensity.current) { barHeightPx.toDp() }

    fun holds(permission: String) =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    // Fine OR coarse, the same rule AndroidDeviceLocation applies. The screen used to check fine
    // only, so an operator who tapped "Approximate" on the system dialog granted coarse, was never
    // seen as granted, was re-asked until the system stopped showing the dialog, and then had the
    // button permanently disabled — while the implementation underneath would have worked.
    //
    // Accepting coarse is the deliberate choice. It is less accurate than a delivery pin deserves,
    // but the operator is standing at the address, sees the coordinates before tapping Save, and
    // can correct them by hand or by pasting a map link. Refusing it would buy no better fix —
    // Android gives an app no way to escalate from Approximate except sending the operator into
    // system settings — and would leave the button dead for a permission they did grant.
    fun locationGranted() =
        holds(Manifest.permission.ACCESS_FINE_LOCATION) || holds(Manifest.permission.ACCESS_COARSE_LOCATION)

    var granted by remember { mutableStateOf(locationGranted()) }
    var approximateOnly by remember { mutableStateOf(locationGranted() && !holds(Manifest.permission.ACCESS_FINE_LOCATION)) }
    var requestedOnce by remember { mutableStateOf(false) }
    var permanentlyDenied by remember { mutableStateOf(false) }

    /** Asked about the coarse permission: it is the weaker of the two and the one this screen will
     *  settle for, so if the system will not even offer that dialog there is nothing left to ask. */
    fun currentShouldShowRationale(): Boolean {
        val activity = context.findActivity()
        return activity != null && ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.ACCESS_COARSE_LOCATION)
    }

    // Both permissions in one request, so Android 12+ shows the Precise/Approximate choice rather
    // than a fine-only prompt whose "Approximate" answer reads back as a flat denial.
    val permissionLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { results ->
        val isGranted = results.values.any { it }
        granted = isGranted
        approximateOnly = isGranted && results[Manifest.permission.ACCESS_FINE_LOCATION] != true
        requestedOnce = true
        permanentlyDenied = isPermanentlyDenied(granted = isGranted, requested = true, shouldShowRationale = currentShouldShowRationale())
        if (isGranted) onUseMyLocation()
    }

    // The permission can be revoked from system settings while this screen is backgrounded, or
    // granted from there after a first denial — re-check on every resume, exactly like
    // feature:capture's PhotoCapture does for the camera permission.
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                val nowGranted = locationGranted()
                granted = nowGranted
                approximateOnly = nowGranted && !holds(Manifest.permission.ACCESS_FINE_LOCATION)
                permanentlyDenied = isPermanentlyDenied(granted = nowGranted, requested = requestedOnce, shouldShowRationale = currentShouldShowRationale())
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    // `imePadding` on the root, not on the column: the bar is bottom-aligned inside this box rather
    // than laid out under the column, so padding the column alone would leave the bar behind the
    // keyboard.
    Box(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding().imePadding()) {
        Column(Modifier.fillMaxSize()) {
            LogisticsHeader(
                title = stringResource(R.string.location_title),
                meta = s.orderResource.dataOrNull?.let {
                    "${formatOrderNo(it.summary.orderNumber)} · ${it.summary.client.name}"
                },
                onBack = onBack,
            )
            Column(
                Modifier.fillMaxSize()
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = EtalonSpace.cardMargin)
                    .padding(top = EtalonSpace.sm, bottom = maxOf(barHeight, LocalNavPillInset.current)),
                verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
            ) {
                // The order-detail fetch this screen seeds its pin from — any failure (401/403/422/
                // 500, not only offline), with a retry, the same way ShipmentsScreen/DriversScreen
                // surface their own resource error. Independent of this, the rest of the screen
                // still works: device location, link resolution and manual entry need no order data.
                s.resourceError?.let { ErrorBanner(it, onRetry = onRefresh) }
                // Static, like DispatchScreen's own offline banner: online-only actions (save,
                // clear, resolve) must read as blocked the instant connectivity is lost, not only
                // after a failed tap.
                if (s.isOffline) ErrorBanner(stringResource(R.string.offline_action_blocked))
                s.error?.let { ErrorBanner(it) }

                PinCard(s, onOpenMap = { openOnMap(context, s.lat, s.lng) })

                FormCard {
                    FormField(stringResource(R.string.location_paste_link)) {
                        FieldWithAction(
                            action = stringResource(R.string.location_resolve),
                            onAction = onResolveLink,
                            // Resolving calls the server, so it is the one of the three that
                            // connectivity applies to; `busy` is the other term, because the
                            // ViewModel drops the tap while another request is in flight.
                            actionEnabled = s.linkInput.isNotBlank() && !s.isOffline && !s.busy,
                        ) { modifier ->
                            EtalonTextField(
                                value = s.linkInput,
                                onValueChange = onLinkInputChange,
                                modifier = modifier,
                            )
                        }
                    }
                    FormField(stringResource(R.string.location_manual)) {
                        Column(verticalArrangement = Arrangement.spacedBy(EtalonSpace.xs)) {
                            FieldWithAction(
                                action = stringResource(R.string.location_apply),
                                onAction = onApplyManualInput,
                                // Parsed on the device — nothing is sent until «Сақлаш», so
                                // neither connectivity nor a request in flight is a term here.
                                actionEnabled = s.manualInput.isNotBlank(),
                            ) { modifier ->
                                EtalonTextField(
                                    value = s.manualInput,
                                    onValueChange = onManualInputChange,
                                    modifier = modifier,
                                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                                    keyboardActions = KeyboardActions(onDone = { onApplyManualInput() }),
                                )
                            }
                            // Both accepted forms shown explicitly: the pin above is rendered
                            // comma-decimal (see formatPinForDisplay), and operators on an Uzbek
                            // keyboard type commas as decimal points too — an operator copying
                            // either style back in must not be rejected for guessing the "wrong"
                            // one.
                            Text(
                                stringResource(R.string.location_manual_hint),
                                style = EtalonType.meta,
                                color = EtalonColors.ink3,
                            )
                        }
                    }
                    FormField(stringResource(R.string.location_label), divider = false) {
                        EtalonTextField(
                            value = s.label,
                            onValueChange = onLabelChange,
                            modifier = Modifier.fillMaxWidth(),
                            placeholder = stringResource(R.string.location_label_hint),
                        )
                    }
                }

                SecondaryButton(
                    text = stringResource(R.string.location_my_position),
                    leadingIcon = EtalonIcons.MapPin,
                    // Only the real blocker. `loading` already takes the click away — the buttons
                    // are `enabled && !loading` — so `&& !s.busy` here just painted the disabled
                    // skin over a fix that is already running.
                    enabled = !permanentlyDenied,
                    loading = s.busy,
                    onClick = {
                        if (granted) onUseMyLocation()
                        else permissionLauncher.launch(
                            arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION),
                        )
                    },
                )
                if (permanentlyDenied) {
                    Text(
                        stringResource(R.string.location_permission_needed),
                        style = EtalonType.meta, color = EtalonColors.ink2,
                    )
                } else if (approximateOnly) {
                    // The button works, but the operator should know the pin a truck will navigate
                    // to is only as good as an approximate fix — and that they can fix it by hand.
                    Text(
                        stringResource(R.string.location_approximate_only),
                        style = EtalonType.meta, color = EtalonColors.ink2,
                    )
                }
            }
        }

        // Always composed so the box measures zero while the bar is away — that zero is what «the
        // keyboard does not have to fight the bar for the label field» means in layout terms.
        Box(Modifier.align(Alignment.BottomCenter).onSizeChanged { barHeightPx = it.height }) {
            if (barVisible) {
                StickyActionBar {
                    // Clearing wipes all four server-side columns at once and is not queueable, so
                    // it carries the same `canClear` the ViewModel checks; the spinner stays on the
                    // save side, which is the one the operator is waiting on.
                    SecondaryButton(
                        text = stringResource(R.string.action_clear_location), onClick = onClear,
                        modifier = Modifier.weight(1f), enabled = s.canClear,
                    )
                    PrimaryButton(
                        text = stringResource(R.string.logistics_action_save), onClick = onSave,
                        modifier = Modifier.weight(1f), enabled = s.canSave, loading = s.busy,
                    )
                }
            }
        }
    }
}

/**
 * The pin the order actually carries: the coordinates in the system's tabular figures, the
 * operator's own label under them, and the way out to a real map app.
 *
 * There is no map tile here and there never was (ruling R8 as corrected) — the app ships no map
 * dependency, and «Харитада очиш» hands the coordinates to whatever the phone has installed.
 */
@Composable
private fun PinCard(s: DeliveryLocationUiState, onOpenMap: () -> Unit) =
    LogisticsCard(stringResource(R.string.location_pin_title)) {
        val lat = s.lat
        val lng = s.lng
        when {
            lat != null && lng != null -> {
                Text(formatPinForDisplay(lat, lng), style = EtalonType.titleSm, color = EtalonColors.ink)
                val label = s.label.trim()
                if (label.isNotEmpty()) {
                    Spacer(Modifier.height(EtalonSpace.xs))
                    Text(
                        label,
                        style = EtalonType.meta, color = EtalonColors.ink2,
                        maxLines = 1, overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            // Loading, or the fetch failed: saying "no pin" here would be a lie about what is
            // merely unknown — the banner above already explains the real state, so the card shows
            // the action alone rather than a sentence that is not true yet.
            s.showEmptyState -> Text(
                stringResource(R.string.location_none),
                style = EtalonType.body, color = EtalonColors.ink3,
            )
        }
        Spacer(Modifier.height(EtalonSpace.md))
        TonalButton(
            text = stringResource(R.string.location_open_map),
            onClick = onOpenMap,
            enabled = s.hasPin,
            leadingIcon = EtalonIcons.MapPin,
        )
    }

/**
 * A [FormField] slot whose value is typed and then acted on: the field takes the width that is
 * left and the tonal pill sits at the end of the row, so «Топиш» and «Қўллаш» are beside the thing
 * they act on rather than under it.
 */
@Composable
private fun FieldWithAction(
    action: String,
    onAction: () -> Unit,
    actionEnabled: Boolean,
    field: @Composable (Modifier) -> Unit,
) = Row(
    Modifier.fillMaxWidth(),
    horizontalArrangement = Arrangement.spacedBy(EtalonSpace.sm),
    verticalAlignment = Alignment.CenterVertically,
) {
    field(Modifier.weight(1f))
    TonalButton(text = action, onClick = onAction, enabled = actionEnabled)
}

/**
 * Hands the pin to whatever map app the phone has, through the `geo:` intent this screen has always
 * used. Guarded: a device with no map app at all — an AOSP emulator image, a bare warehouse tablet
 * — throws straight out of the tap handler and takes the screen down with it, which is the same
 * reason the dialer calls are guarded.
 */
private fun openOnMap(context: android.content.Context, lat: Double?, lng: Double?) {
    if (lat == null || lng == null) return
    runCatching {
        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:$lat,$lng?q=$lat,$lng")))
    }
}

private tailrec fun android.content.Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
