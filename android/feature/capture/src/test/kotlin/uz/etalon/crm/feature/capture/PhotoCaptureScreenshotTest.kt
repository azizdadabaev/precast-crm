package uz.etalon.crm.feature.capture

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonTheme

/** What `SignedInShell` provides into [LocalNavPillInset] at Robolectric's 0 dp system navigation
 *  inset: the pill's 84 dp band alone, so a frame carries the clearance a real phone shows. */
private val SHELL_NAV_PILL_INSET = 84.dp

/** The title a caller passes — the viewfinder IS the load screen until a photo exists. */
private const val TITLE = "Юк машинасига юклаш"

/**
 * The viewfinder's chrome in the three states the camera decides between. The camera itself is
 * not in any of them: CameraX's `PreviewView` cannot render under Robolectric, so the preview is
 * a flat `page`-coloured box in the slot the real one fills — which is exactly the part of the
 * frame the reviewer is not being asked about. What the frames pin is everything around it: the
 * close button and the title, the preview's `xl` corners and hairline, the shutter's size and
 * ring against D7, and which control the bar offers when there is no camera to shoot with.
 *
 * [PhotoCaptureChrome] is composed directly rather than [PhotoCapture]: the permission states
 * below are reached through the system permission dialog, and a test that drove that would be
 * photographing Robolectric's stand-in for it rather than this screen.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class PhotoCaptureScreenshotTest {
    @get:Rule val rule = createComposeRule()

    @Composable
    private fun Chrome(
        mode: CaptureMode,
        hasCamera: Boolean = true,
        permanentlyDenied: Boolean = false,
        error: String? = null,
    ) {
        CompositionLocalProvider(LocalNavPillInset provides SHELL_NAV_PILL_INSET) {
            PhotoCaptureChrome(
                title = TITLE,
                mode = mode,
                hasCamera = hasCamera,
                permanentlyDenied = permanentlyDenied,
                busy = false,
                error = error,
                onCancel = {},
                onAskPermission = {},
                onGallery = {},
                onShutter = {},
                viewfinder = { modifier -> PreviewPlaceholder(modifier) },
            )
        }
    }

    private fun shoot(name: String, content: @Composable () -> Unit) {
        rule.setContent { EtalonTheme { content() } }
        rule.onRoot().captureRoboImage("screenshots/capture_$name.png")
    }

    /** The state a driver opens: the whole middle is the viewfinder, and the shutter is the
     *  biggest thing on the screen. */
    @Test @Config(qualifiers = "w411dp-h891dp") fun previewLight() =
        shoot("preview_light") { Chrome(CaptureMode.CAMERA) }

    /** Denied once, and the system will still ask again — so the bar offers «Рухсат бериш» and
     *  the gallery keeps the job moving either way. */
    @Test @Config(qualifiers = "w411dp-h891dp") fun deniedLight() =
        shoot("denied_light") { Chrome(CaptureMode.PICKER_ONLY) }

    /** «Don't ask again», or a device with no camera at all: the notice sends the operator to
     *  Settings and no button pretends re-asking would work. */
    @Test @Config(qualifiers = "w411dp-h891dp") fun blockedLight() =
        shoot("blocked_light") { Chrome(CaptureMode.PICKER_ONLY, permanentlyDenied = true) }

    /** 1.3 with the failure banner up — the longest this screen ever gets. */
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun largeFont() =
        shoot("font13") { Chrome(CaptureMode.CAMERA, error = "Расмни ўқиб бўлмади. Қайта уриниб кўринг.") }
}

/** The preview's stand-in: the page colour, so the slot the camera fills is visible as a shape
 *  without pretending a photograph was taken. */
@Composable
private fun PreviewPlaceholder(modifier: Modifier) =
    Box(modifier.fillMaxSize().background(EtalonColors.page))
