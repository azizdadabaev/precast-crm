package uz.etalon.crm.feature.capture

import android.Manifest
import android.app.Activity
import android.content.ContextWrapper
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.awaitCancellation
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.image.ImagePrep
import uz.etalon.crm.core.image.PreparedImage
import java.io.File
import java.util.UUID
import java.util.concurrent.Executor
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException
import uz.etalon.crm.core.designsystem.R as DesignSystemR

/**
 * Camera-first photo capture. The caller receives an already-prepared JPEG, so
 * no screen has to know about EXIF, scaling or the server's 8 MB cap.
 *
 * [imagePrep] is passed in rather than injected: this module stays free of Hilt,
 * so every logistics `@HiltViewModel` injects [ImagePrep] itself and its route
 * forwards it here.
 */
@Composable
fun PhotoCapture(
    imagePrep: ImagePrep,
    onPhoto: (PreparedImage) -> Unit,
    onCancel: () -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()

    var granted by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    var permanentlyDenied by remember { mutableStateOf(false) }
    // Whether a request has actually completed at least once this composition — needed to
    // tell "never asked yet" apart from "asked and permanently denied": both can present
    // shouldShowRationale == false, and only isPermanentlyDenied's `requested` flag
    // disambiguates them.
    var requestedOnce by remember { mutableStateOf(false) }
    val hasCamera = remember { context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun currentShouldShowRationale(): Boolean {
        val activity = context.findActivity()
        return activity != null && ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.CAMERA)
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        granted = isGranted
        requestedOnce = true
        permanentlyDenied = isPermanentlyDenied(granted = isGranted, requested = true, shouldShowRationale = currentShouldShowRationale())
    }

    LaunchedEffect(Unit) {
        if (!granted && hasCamera) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    // The permission can be revoked from system settings while the app is backgrounded;
    // re-check on every resume instead of trusting the value captured at first composition,
    // and re-derive permanentlyDenied the same way so a stale "camera unavailable" message
    // doesn't linger when the real problem is now a (possibly permanent) denial.
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                val nowGranted = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
                granted = nowGranted
                permanentlyDenied = isPermanentlyDenied(granted = nowGranted, requested = requestedOnce, shouldShowRationale = currentShouldShowRationale())
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
    }

    val pickerLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            busy = true
            try {
                imagePrep.prepare(uri)
                    .onSuccess { onPhoto(it) }
                    .onFailure { error = context.getString(R.string.capture_failed) }
            } finally {
                busy = false
            }
        }
    }

    val imageCapture = remember { ImageCapture.Builder().build() }
    val previewView = remember { PreviewView(context) }
    val mode = captureModeFor(granted, hasCamera)

    // Bound to this composable's lifetime, not just to the Activity's: binding only through
    // bindToLifecycle(lifecycleOwner, ...) would leave the camera session alive after this
    // screen is popped (this is a single-Activity app), blocking every capture after it until
    // the Activity itself is destroyed.
    //
    // The provider is awaited *inside* this LaunchedEffect's own coroutine rather than via a
    // listener callback plus a "did it bind" flag: ProcessCameraProvider.getInstance(...)'s
    // future always defers its listener by at least one main-loop turn (even when already
    // resolved), so a flag set from inside that listener can lose a race with disposal — the
    // effect can already be gone by the time the listener fires and binds a session nothing
    // will ever unbind. Suspending on the future means cancellation (dispose, or `mode`
    // changing) stops execution at the suspension point and the bind simply never happens;
    // if cancellation instead lands after a successful bind, the `finally` block still runs
    // synchronously to unbind before the coroutine dies.
    LaunchedEffect(lifecycleOwner, mode) {
        if (mode != CaptureMode.CAMERA) return@LaunchedEffect
        val provider = try {
            context.awaitCameraProvider()
        } catch (e: CancellationException) {
            throw e
        } catch (t: Throwable) {
            error = context.getString(R.string.capture_failed)
            return@LaunchedEffect
        }
        try {
            val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
            runCatching {
                provider.unbindAll()
                provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, imageCapture)
            }.onFailure { error = context.getString(R.string.capture_failed) }
            awaitCancellation()
        } finally {
            provider.unbindAll()
        }
    }

    Scaffold(
        bottomBar = {
            // `underNav` instead of the bare navigation-bar inset: the shell's floating nav pill is
            // drawn over this screen too, and it covered the lower half of the shutter — the one
            // control every load, delivery proof and receipt starts with.
            Column(
                Modifier.padding(bottom = EtalonSpace.underNav).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                error?.let { ErrorBanner(message = it) }
                if (mode == CaptureMode.CAMERA) {
                    PrimaryButton(
                        text = stringResource(R.string.capture_take),
                        loading = busy,
                        modifier = Modifier.heightIn(min = 64.dp),
                        onClick = {
                            scope.launch {
                                busy = true
                                try {
                                    val file = imageCapture.takePhotoTo(context.cacheDir, ContextCompat.getMainExecutor(context))
                                    val prepared = imagePrep.prepare(file).getOrThrow()
                                    // The camera writes a full-resolution frame — several MB on a
                                    // modern sensor — and only the prepared copy is ever cleaned
                                    // up. Drop the original now that it has been read: keeping it
                                    // fills the cache a photo at a time for no reader. On failure
                                    // it is deliberately left, so the cache eviction that owns
                                    // this directory can still take it while nothing depends on
                                    // its being gone.
                                    file.delete()
                                    onPhoto(prepared)
                                } catch (e: CancellationException) {
                                    throw e
                                } catch (t: Throwable) {
                                    error = context.getString(R.string.capture_failed)
                                } finally {
                                    busy = false
                                }
                            }
                        },
                    )
                }
                SecondaryButton(
                    text = stringResource(R.string.capture_from_gallery),
                    leading = Icons.Default.PhotoLibrary,
                    enabled = !busy,
                    onClick = { pickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                )
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            if (mode == CaptureMode.CAMERA) {
                AndroidView(modifier = Modifier.fillMaxSize(), factory = { previewView })
            } else {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = stringResource(if (permanentlyDenied) R.string.capture_permission_denied else R.string.capture_no_camera),
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(24.dp),
                        textAlign = TextAlign.Center,
                    )
                }
            }
            // TopEnd to match Lightbox's close button placement.
            IconButton(onClick = onCancel, modifier = Modifier.align(Alignment.TopEnd).padding(12.dp)) {
                Icon(Icons.Default.Close, contentDescription = stringResource(DesignSystemR.string.action_close), tint = Color.White)
            }
        }
    }
}

private tailrec fun android.content.Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
}

/** Suspends until CameraX's provider future resolves, cancellably: if the caller is
 *  cancelled first (composable disposed, `mode` changed) the coroutine never resumes
 *  past this point, so the bind that would follow never happens. */
private suspend fun android.content.Context.awaitCameraProvider(): ProcessCameraProvider =
    suspendCancellableCoroutine { cont ->
        val future = ProcessCameraProvider.getInstance(this)
        cont.invokeOnCancellation { future.cancel(true) }
        future.addListener(
            { if (cont.isActive) cont.resume(future.get()) },
            ContextCompat.getMainExecutor(this),
        )
    }

/** Bridges CameraX's callback API into a suspending call. Uses a cancellable
 *  continuation so a cancelled caller (screen left mid-shot) doesn't leak it,
 *  and resumes with the real exception on failure instead of throwing from
 *  CameraX's own callback thread. */
private suspend fun ImageCapture.takePhotoTo(dir: File, executor: Executor): File =
    suspendCancellableCoroutine { cont ->
        val file = File(dir, "capture-${UUID.randomUUID()}.jpg")
        val options = ImageCapture.OutputFileOptions.Builder(file).build()
        takePicture(options, executor, object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(output: ImageCapture.OutputFileResults) { cont.resume(file) }
            override fun onError(exception: ImageCaptureException) { cont.resumeWithException(exception) }
        })
    }
