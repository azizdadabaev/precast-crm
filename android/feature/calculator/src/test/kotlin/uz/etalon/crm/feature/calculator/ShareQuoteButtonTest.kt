package uz.etalon.crm.feature.calculator

import android.content.Context
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.test.core.app.ApplicationProvider
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.beamSchedule
import uz.etalon.crm.core.calc.computeOrderTotals
import uz.etalon.crm.core.calc.projectTotals
import uz.etalon.crm.core.calc.recomputeRow
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import java.io.File

/**
 * «Юбориш» when the PNG cannot be written. The capture runs inside a bare
 * `rememberCoroutineScope().launch`, which has nobody above it to catch anything: before this the
 * `IOException` propagated out of that launch and took the process down, with the button left
 * spinning on the way out. The operator's whole quote goes with it.
 *
 * The failure is reproduced the way `QuoteImageTest` reproduces it — the `quotes` directory's name
 * taken by a plain file, which is what a full or read-only cache partition amounts to here — so
 * this runs on every host, unlike anything that has to go through `FileProvider`.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class ShareQuoteButtonTest {
    @get:Rule val rule = createComposeRule()

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun state(): CalculatorUiState {
        val rows = listOf(recomputeRow(SlabRow(id = "r1", name = "Хона 1", innerWidth = 4.0, innerLength = 6.0)))
        return CalculatorUiState(
            rows = rows,
            totals = projectTotals(rows, 0.0, 0.0),
            orderTotals = computeOrderTotals(rows, 0.0, 0.0, 0.0, 0.0),
            schedule = beamSchedule(rows),
            canWrite = true,
        )
    }

    @Test
    @Config(qualifiers = "w411dp-h891dp")
    fun aFailedCaptureSaysSoInUzbekAndLetsTheOperatorTryAgain() {
        File(context.cacheDir, "quotes").apply { parentFile?.mkdirs() }.writeText("not a directory")

        rule.setContent { EtalonTheme(darkTheme = false) { ShareQuoteButton(state()) } }

        rule.onNodeWithText("Юбориш").performClick()
        rule.waitForIdle()

        rule.onNodeWithText("Расмни тайёрлаб бўлмади").assertExists()
        // `finally` put the spinner down — otherwise the button stays disabled for good and the
        // operator has no way to retry short of leaving the screen.
        rule.onNodeWithText("Юбориш").assertIsEnabled()
    }
}
