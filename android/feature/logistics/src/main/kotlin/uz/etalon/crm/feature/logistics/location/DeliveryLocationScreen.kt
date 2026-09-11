package uz.etalon.crm.feature.logistics.location

import android.Manifest
import android.app.Activity
import android.content.ContextWrapper
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.DangerButton
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.feature.capture.isPermanentlyDenied
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

@OptIn(ExperimentalMaterial3Api::class)
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
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

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

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.location_title)) },
                navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } },
            )
        },
        bottomBar = {
            // The bar clears the shell's floating nav pill itself, in every navigation mode.
            StickyActionBar {
                PrimaryButton(
                    text = stringResource(R.string.logistics_action_save), onClick = onSave,
                    enabled = s.canSave, loading = s.busy,
                )
            }
        },
    ) { pad ->
        // Mirrors OrderDetailScreen's own single-order fetch: the spinner shows only while there is
        // no cache yet to render underneath it (s.isLoading), never once any pin (or its absence) is
        // actually known.
        PullToRefreshBox(isRefreshing = s.isLoading, onRefresh = onRefresh, modifier = Modifier.padding(pad)) {
            Column(
                Modifier.padding(16.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                // The order-detail fetch this screen seeds its pin from — any failure (401/403/422/
                // 500, not only offline), with a retry, the same way ShipmentsScreen/DriversScreen
                // surface their own resource error. Independent of this, the rest of the screen
                // still works: device location, link resolution and manual entry need no order data.
                val resourceError = s.resourceError
                if (resourceError != null) ErrorBanner(resourceError, onRetry = onRefresh)
                // Static, like DispatchScreen's own offline banner: online-only actions (save,
                // clear, resolve) must read as blocked the instant connectivity is lost, not only
                // after a failed tap.
                if (s.isOffline) ErrorBanner(stringResource(R.string.offline_action_blocked))
                val error = s.error
                if (error != null) ErrorBanner(error)

                when {
                    s.hasPin -> Text(formatPinForDisplay(s.lat!!, s.lng!!), style = EtalonType.monoDisplay)
                    s.showEmptyState -> Text(stringResource(R.string.location_none), style = EtalonType.monoDisplay)
                    // Loading, or the fetch failed: saying "no pin" here would be a lie about what
                    // is merely unknown — the banner above already explains the real state.
                }

                PrimaryButton(
                    text = stringResource(R.string.location_my_position),
                    enabled = !permanentlyDenied && !s.busy,
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
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                } else if (approximateOnly) {
                    // The button works, but the operator should know the pin a truck will navigate
                    // to is only as good as an approximate fix — and that they can fix it by hand.
                    Text(
                        stringResource(R.string.location_approximate_only),
                        style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }

                OutlinedTextField(
                    value = s.linkInput, onValueChange = onLinkInputChange,
                    label = { Text(stringResource(R.string.location_paste_link)) },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )
                SecondaryButton(
                    text = stringResource(R.string.location_resolve), onClick = onResolveLink,
                    enabled = s.linkInput.isNotBlank() && !s.busy && !s.isOffline, loading = s.busy,
                )

                OutlinedTextField(
                    value = s.manualInput, onValueChange = onManualInputChange,
                    label = { Text(stringResource(R.string.location_manual)) },
                    // Both accepted forms shown explicitly: the pin above is rendered comma-decimal
                    // (see formatPinForDisplay), and operators on an Uzbek keyboard type commas as
                    // decimal points too — an operator copying either style back in must not be
                    // rejected for guessing the "wrong" one.
                    supportingText = { Text(stringResource(R.string.location_manual_hint)) },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { onApplyManualInput() }),
                )

                OutlinedTextField(
                    value = s.label, onValueChange = onLabelChange,
                    label = { Text(stringResource(R.string.location_label)) },
                    singleLine = true, modifier = Modifier.fillMaxWidth(),
                )

                SecondaryButton(
                    text = stringResource(R.string.logistics_action_navigate), leading = Icons.Filled.Navigation,
                    enabled = s.hasPin,
                    onClick = { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:${s.lat},${s.lng}?q=${s.lat},${s.lng}"))) },
                )

                DangerButton(
                    text = stringResource(R.string.action_clear_location), onClick = onClear,
                    enabled = s.canClear, loading = s.busy,
                )
            }
        }
    }
}

private tailrec fun android.content.Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}
