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
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
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
import uz.etalon.crm.core.designsystem.components.EtalonIconButton
import uz.etalon.crm.core.designsystem.components.NoticeBanner
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.etalonRipple
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
 *
 * [title] is the caller's own screen title («Юк расми», «Етказиш исботи», «Чек расми»): the
 * viewfinder IS that screen until a photo exists, so it says which job it belongs to rather than
 * a generic «Камера». Restyled in phase 5 Task 1 — the whole state machine below (permission,
 * bind, shutter, picker, `onPhoto`) is untouched (R3); only the chrome around it changed, and the
 * review-and-retake step stays where it has always been, on the calling screen.
 */
@Composable
fun PhotoCapture(
    imagePrep: ImagePrep,
    onPhoto: (PreparedImage) -> Unit,
    onCancel: () -> Unit,
    title: String,
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

    PhotoCaptureChrome(
        title = title,
        mode = mode,
        hasCamera = hasCamera,
        permanentlyDenied = permanentlyDenied,
        busy = busy,
        error = error,
        onCancel = onCancel,
        onAskPermission = { permissionLauncher.launch(Manifest.permission.CAMERA) },
        onGallery = { pickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
        onShutter = {
            scope.launch {
                busy = true
                try {
                    val file = imageCapture.takePhotoTo(context.cacheDir, ContextCompat.getMainExecutor(context))
                    val prepared = imagePrep.prepare(file).getOrThrow()
                    // The camera writes a full-resolution frame — several MB on a modern sensor —
                    // and only the prepared copy is ever cleaned up. Drop the original now that it
                    // has been read: keeping it fills the cache a photo at a time for no reader.
                    // On failure it is deliberately left, so the cache eviction that owns this
                    // directory can still take it while nothing depends on its being gone.
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
        viewfinder = { modifier -> AndroidView(modifier = modifier, factory = { previewView }) },
    )
}

/** The shutter (§5.2): bigger than any other control on any screen, because it is the one thing
 *  a driver taps with a truck idling behind him. 72 dp against D7's 48 dp floor. */
private val SHUTTER = 72.dp

/** The white ring inside the disc, and how far in from its edge it sits — a camera shutter's own
 *  shape rather than a plain indigo circle, which on the page would read as a button that lost
 *  its label. */
private val SHUTTER_RING = 3.dp
private val SHUTTER_RING_INSET = 5.dp

/**
 * The viewfinder's chrome, with no camera in it: a title row, the preview surface, the bar.
 * Separated from [PhotoCapture] so the screenshot test can compose the three states the camera
 * itself decides between — a live preview, a denial that can still be re-asked, and one that
 * cannot — none of which a Robolectric test can reach through the real permission machinery.
 *
 * @param viewfinder the preview, passed in: production hands over CameraX's `PreviewView`, the
 *   test a flat box. Nothing else about the camera crosses this boundary.
 */
@Composable
internal fun PhotoCaptureChrome(
    title: String,
    mode: CaptureMode,
    hasCamera: Boolean,
    permanentlyDenied: Boolean,
    busy: Boolean,
    error: String?,
    onCancel: () -> Unit,
    onAskPermission: () -> Unit,
    onGallery: () -> Unit,
    onShutter: () -> Unit,
    viewfinder: @Composable (Modifier) -> Unit,
) = Column(
    Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding(),
) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.headerMargin, vertical = EtalonSpace.md),
        horizontalArrangement = Arrangement.spacedBy(EtalonSpace.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        EtalonIconButton(
            icon = EtalonIcons.X,
            contentDescription = stringResource(DesignSystemR.string.action_close),
            onClick = onCancel,
            shape = EtalonShapes.md,
        )
        Text(
            title,
            style = EtalonType.headline,
            color = EtalonColors.ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f),
        )
    }

    Column(
        Modifier.weight(1f).fillMaxWidth().padding(horizontal = EtalonSpace.cardMargin),
        verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
    ) {
        error?.let { ErrorBanner(message = it) }
        if (mode == CaptureMode.CAMERA) {
            viewfinder(
                Modifier.weight(1f).fillMaxWidth()
                    .clip(EtalonShapes.xl)
                    .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl),
            )
        } else {
            Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = Alignment.Center) {
                NoticeBanner(
                    stringResource(
                        when {
                            !hasCamera -> R.string.capture_no_camera
                            permanentlyDenied -> R.string.capture_permission_denied
                            else -> R.string.capture_permission_needed
                        },
                    ),
                )
            }
        }
    }

    StickyActionBar {
        Column(
            Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            when {
                mode == CaptureMode.CAMERA -> Shutter(busy = busy, onClick = onShutter)
                // Re-asking is only offered where the system would actually show the dialog: after
                // «don't ask again», or on a device with no camera at all, the button would do
                // nothing at all and the notice above already says where to go instead.
                hasCamera && !permanentlyDenied -> SecondaryButton(
                    text = stringResource(R.string.capture_grant_permission),
                    onClick = onAskPermission,
                )
            }
            SecondaryButton(
                text = stringResource(R.string.capture_from_gallery),
                leadingIcon = EtalonIcons.Images,
                enabled = !busy,
                onClick = onGallery,
            )
        }
    }
}

@Composable
private fun Shutter(busy: Boolean, onClick: () -> Unit) {
    val interaction = remember { MutableInteractionSource() }
    val label = stringResource(R.string.capture_shutter)
    Box(
        Modifier.size(SHUTTER)
            .clip(EtalonShapes.pill)
            .background(if (busy) EtalonColors.indigoPressed else EtalonColors.indigo)
            .clickable(
                enabled = !busy, role = Role.Button, indication = etalonRipple(onDark = true),
                interactionSource = interaction, onClick = onClick,
            )
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        if (busy) {
            CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp, color = EtalonColors.onDark)
        } else {
            Box(
                Modifier.size(SHUTTER - SHUTTER_RING_INSET * 2)
                    .border(SHUTTER_RING, EtalonColors.onDark, EtalonShapes.pill),
            )
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
