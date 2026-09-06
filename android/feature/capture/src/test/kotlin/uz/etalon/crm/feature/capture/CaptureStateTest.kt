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

    @Test fun `a first-time request is not treated as a permanent denial`() {
        assertEquals(false, isPermanentlyDenied(granted = false, requested = false, shouldShowRationale = false))
    }
    @Test fun `a plain denial that still offers a rationale is not permanent`() {
        assertEquals(false, isPermanentlyDenied(granted = false, requested = true, shouldShowRationale = true))
    }
    @Test fun `a denial with no rationale left to show is permanent`() {
        assertEquals(true, isPermanentlyDenied(granted = false, requested = true, shouldShowRationale = false))
    }
    @Test fun `a permission revoked while backgrounded is re-derived, not assumed permanent`() {
        // The resume re-check sees granted flip to false for a permission that was already
        // requested earlier in the session; the OS still offers a rationale, so this reads
        // as an ordinary re-ask rather than a permanent denial.
        assertEquals(false, isPermanentlyDenied(granted = false, requested = true, shouldShowRationale = true))
    }
}
