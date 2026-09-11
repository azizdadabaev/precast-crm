package uz.etalon.crm.core.designsystem

import android.graphics.Insets
import android.view.View
import android.view.WindowInsets
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.height
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.components.navPillInsetOf
import uz.etalon.crm.core.designsystem.theme.EtalonTheme

/**
 * The clearance the whole app hangs off. The flat 100 dp this replaces was ~20 dp short under
 * three-button navigation, and that shortfall is only visible if the navigation inset is part of
 * the sum — so these tests read the sum under a **faked** inset rather than under Robolectric's
 * own, which is always 0.
 *
 * **How the inset is faked:** Compose's `WindowInsets.navigationBars` is backed by the
 * `OnApplyWindowInsetsListener` that `AndroidComposeView` installs, so dispatching a platform
 * `WindowInsets` straight at that view (`LocalView.current`) drives the production read path — not
 * a stand-in for it. No test-only overload of [navPillInsetOf] exists, and none should: the
 * arithmetic and the source of its input are the thing under test together.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class NavPillTest {
    @get:Rule val rule = createComposeRule()

    private fun navPillInsetUnder(navigationBar: Dp): Dp {
        var measured = Dp.Unspecified
        lateinit var view: View
        var px = 0
        rule.setContent {
            view = LocalView.current
            px = with(LocalDensity.current) { navigationBar.roundToPx() }
            measured = navPillInsetOf()
        }
        // After the first composition, never during it: Compose installs the listener this dispatch
        // drives from the `DisposableEffect` behind `WindowInsets.navigationBars`, and an insets
        // dispatch from an effect declared above that read lands before the listener exists.
        rule.runOnIdle {
            view.dispatchApplyWindowInsets(
                WindowInsets.Builder()
                    .setInsets(WindowInsets.Type.navigationBars(), Insets.of(0, 0, 0, px))
                    .build(),
            )
        }
        rule.waitForIdle()
        return measured
    }

    @Test fun `gesture navigation inset plus the pill band`() {
        assertEquals(108.dp, navPillInsetUnder(24.dp))
    }

    @Test fun `three-button navigation inset plus the pill band`() {
        assertEquals(132.dp, navPillInsetUnder(48.dp))
    }

    /** A screen composed outside the shell — a preview, a screenshot test, a signed-out route —
     *  reserves nothing, because no pill is drawn over it. */
    @Test fun `the local defaults to zero`() {
        var measured = Dp.Unspecified
        rule.setContent { measured = LocalNavPillInset.current }
        rule.waitForIdle()
        assertEquals(0.dp, measured)
    }

    /** The bar's own clearance: its button must end at least the provided inset above the window's
     *  bottom edge, which is what puts it over the pill instead of behind it. */
    @Test fun `the sticky bar clears the provided inset`() {
        rule.setContent {
            EtalonTheme {
                CompositionLocalProvider(LocalNavPillInset provides 132.dp) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.BottomCenter) {
                        StickyActionBar {
                            PrimaryButton("Сақлаш", onClick = {}, modifier = Modifier.testTag("action"))
                        }
                    }
                }
            }
        }
        val windowBottom = rule.onRoot().getUnclippedBoundsInRoot().height
        val buttonBottom = rule.onNodeWithTag("action").getUnclippedBoundsInRoot().bottom
        assertTrue(
            "button bottom $buttonBottom is not 132 dp clear of the window bottom $windowBottom",
            windowBottom - buttonBottom >= 132.dp,
        )
    }
}
