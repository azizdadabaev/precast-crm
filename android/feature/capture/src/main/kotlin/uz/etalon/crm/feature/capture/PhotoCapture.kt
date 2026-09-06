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
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.image.ImagePrep
import uz.etalon.crm.core.image.PreparedImage
import java.io.File
import java.util.UUID
import java.util.concurrent.Executor
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

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
    val hasCamera = remember { context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        granted = isGranted
        if (!isGranted) {
            val activity = context.findActivity()
            // After a first denial the system requires showing a rationale before asking
            // again; once that flips back to false the user chose "don't ask again" (or a
            // policy blocks it) and re-prompting would just show nothing — offer the picker.
            permanentlyDenied = activity != null && !ActivityCompat.shouldShowRequestPermissionRationale(activity, Manifest.permission.CAMERA)
        } else {
            permanentlyDenied = false
        }
    }

    LaunchedEffect(Unit) {
        if (!granted && hasCamera) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    // The permission can be revoked from system settings while the app is backgrounded;
    // re-check on every resume instead of trusting the value captured at first composition.
    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            if (event == Lifecycle.Event.ON_RESUME) {
                granted = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
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

    // Bound to this composable's lifetime (via DisposableEffect), not just to the
    // Activity's: binding only through bindToLifecycle(lifecycleOwner, ...) would leave
    // the camera session alive after this screen is popped, blocking every capture after
    // it until the Activity itself is destroyed.
    DisposableEffect(lifecycleOwner, mode) {
        if (mode != CaptureMode.CAMERA) return@DisposableEffect onDispose {}
        val providerFuture = ProcessCameraProvider.getInstance(context)
        var boundProvider: ProcessCameraProvider? = null
        providerFuture.addListener({
            boundProvider = runCatching {
                providerFuture.get().also { provider ->
                    val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
                    provider.unbindAll()
                    provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, imageCapture)
                }
            }.onFailure { error = context.getString(R.string.capture_failed) }.getOrNull()
        }, ContextCompat.getMainExecutor(context))
        onDispose { boundProvider?.unbindAll() }
    }

    Scaffold(
        bottomBar = {
            Column(Modifier.navigationBarsPadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
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
            IconButton(onClick = onCancel, modifier = Modifier.align(Alignment.TopStart).padding(12.dp)) {
                Icon(Icons.Default.Close, contentDescription = stringResource(R.string.action_close_capture), tint = Color.White)
            }
        }
    }
}

private tailrec fun android.content.Context.findActivity(): Activity? = when (this) {
    is Activity -> this
    is ContextWrapper -> baseContext.findActivity()
    else -> null
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
