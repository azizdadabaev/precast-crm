package uz.etalon.crm.feature.home

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uz.etalon.crm.core.data.RejectedOrder
import uz.etalon.crm.core.designsystem.theme.EtalonTheme

/**
 * D10 / R6: the rejected rows the bell's sheet grew when the calculator's own banner was retired.
 * «Тушунарли» is the ONLY way a rejection leaves the list, so the id it discards is the one thing
 * about this sheet that can quietly break — discard the wrong row and the operator loses a refusal
 * they never read while the one they acknowledged stays on the list for ever.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class OutboxSheetTest {
    @get:Rule val rule = createComposeRule()

    private val rows = listOf(
        RejectedOrder(id = "row-1", clientName = "Karimov LLC", message = "Мижоз топилмади"),
        RejectedOrder(id = "row-2", clientName = "Navoi Build", message = "Сана нотўғри"),
    )

    @Test fun `Тушунарли discards the row it sits on`() {
        val discarded = mutableListOf<String>()
        rule.setContent {
            EtalonTheme {
                OutboxSheet(pending = 1, rejected = rows, onDiscard = { discarded += it }, onDismiss = {})
            }
        }

        rule.onNodeWithText("Рад этилган буюртмалар").assertIsDisplayed()
        rule.onNodeWithText("Мижоз топилмади").assertIsDisplayed()

        // The SECOND row's button: the first would pass even if every row discarded `rows[0].id`.
        rule.onAllNodesWithText("Тушунарли")[1].performClick()
        rule.waitForIdle()
        assertEquals(listOf("row-2"), discarded)
    }
}
