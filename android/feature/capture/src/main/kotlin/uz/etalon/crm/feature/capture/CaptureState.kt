package uz.etalon.crm.feature.capture

enum class CaptureMode { CAMERA, PICKER_ONLY }

/** The screen must always offer a way forward: without a camera or its
 *  permission it becomes a picker instead of a dead end. */
fun captureModeFor(cameraGranted: Boolean, cameraAvailable: Boolean): CaptureMode =
    if (cameraGranted && cameraAvailable) CaptureMode.CAMERA else CaptureMode.PICKER_ONLY

/**
 * Whether re-prompting for the camera permission is pointless: after a completed
 * request comes back denied, the system requires showing a rationale before it
 * will show the dialog again. Once [shouldShowRationale] comes back `false` for a
 * denial that followed a real [requested] attempt, the user chose "don't ask
 * again" (or a device policy blocks it) rather than simply never having been
 * asked yet — re-prompting would show nothing, so the picker is the only way
 * forward and the operator should be told why.
 */
fun isPermanentlyDenied(granted: Boolean, requested: Boolean, shouldShowRationale: Boolean): Boolean =
    !granted && requested && !shouldShowRationale
