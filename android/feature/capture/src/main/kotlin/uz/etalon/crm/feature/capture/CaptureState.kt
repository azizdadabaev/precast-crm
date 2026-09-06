package uz.etalon.crm.feature.capture

enum class CaptureMode { CAMERA, PICKER_ONLY }

/** The screen must always offer a way forward: without a camera or its
 *  permission it becomes a picker instead of a dead end. */
fun captureModeFor(cameraGranted: Boolean, cameraAvailable: Boolean): CaptureMode =
    if (cameraGranted && cameraAvailable) CaptureMode.CAMERA else CaptureMode.PICKER_ONLY
