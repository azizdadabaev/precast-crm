package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.designsystem.theme.EtalonType

/** The variable axis either applies or the whole app silently renders at weight 400. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class FontWeightTest {
    @get:Rule val rule = createComposeRule()

    @Test fun `800 is measurably wider than 400 at the same size`() {
        rule.setContent {
            EtalonTheme {
                Column {
                    Text("Буюртмалар", style = EtalonType.meta, modifier = androidx.compose.ui.Modifier.testTag("w400"))
                    Text("Буюртмалар", style = EtalonType.meta.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.W800), modifier = androidx.compose.ui.Modifier.testTag("w800"))
                }
            }
        }
        val light = rule.onNodeWithTag("w400").fetchSemanticsNode().size.width
        val heavy = rule.onNodeWithTag("w800").fetchSemanticsNode().size.width
        assertTrue("weight axis did not apply: $light vs $heavy", heavy > light)
    }
}
