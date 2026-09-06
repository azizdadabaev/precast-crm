package uz.etalon.crm.feature.capture

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class CaptureStateTest {
    @Test fun `the viewfinder is used when the permission is granted and a camera exists`() {
        assertEquals(CaptureMode.CAMERA, captureModeFor(cameraGranted = true, cameraAvailable = true))
    }
    @Test fun `a denied permission falls back to the picker rather than a dead screen`() {
        assertEquals(CaptureMode.PICKER_ONLY, captureModeFor(cameraGranted = false, cameraAvailable = true))
    }
    @Test fun `a device without a camera falls back to the picker`() {
        assertEquals(CaptureMode.PICKER_ONLY, captureModeFor(cameraGranted = true, cameraAvailable = false))
    }
}
