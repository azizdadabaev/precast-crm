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

    /** Nothing is waiting to send AND nothing was refused: the sheet says so, which is the only
     *  thing it has to say. */
    @Test fun `an idle outbox says there is nothing unsent`() {
        rule.setContent {
            EtalonTheme { OutboxSheet(pending = 0, rejected = emptyList(), onDiscard = {}, onDismiss = {}) }
        }
        rule.onNodeWithText(NOTHING_UNSENT).assertIsDisplayed()
    }

    /**
     * Nothing waiting to send, but orders the server REFUSED. «Юборилмаган маълумот йўқ» over a
     * list of orders that failed to send reads as a contradiction — technically true (the queue is
     * empty) and exactly the opposite of what the operator is looking at.
     */
    @Test fun `nothing unsent is not claimed above a list of refusals`() {
        rule.setContent {
            EtalonTheme { OutboxSheet(pending = 0, rejected = rows, onDiscard = {}, onDismiss = {}) }
        }
        rule.onNodeWithText(NOTHING_UNSENT).assertDoesNotExist()
        rule.onNodeWithText("Рад этилган буюртмалар").assertIsDisplayed()
    }

    /** A pending count is a second fact, not a contradiction — it stays above the refusals. */
    @Test fun `a pending count stays even when refusals are listed`() {
        rule.setContent {
            EtalonTheme { OutboxSheet(pending = 2, rejected = rows, onDiscard = {}, onDismiss = {}) }
        }
        rule.onNodeWithText(NOTHING_UNSENT).assertDoesNotExist()
        rule.onNodeWithText("Рад этилган буюртмалар").assertIsDisplayed()
    }

    /** «Ёпиш» is the only way out of the sheet, so a long list of refusals must never be able to
     *  push it off the bottom edge — the list scrolls inside its own band instead. */
    @Test fun `a dozen refusals cannot push Ёпиш off the screen`() {
        val many = (1..12).map { RejectedOrder(id = "row-$it", clientName = "Мижоз $it", message = "Сана нотўғри") }
        rule.setContent {
            EtalonTheme { OutboxSheet(pending = 0, rejected = many, onDiscard = {}, onDismiss = {}) }
        }
        rule.onNodeWithText("Ёпиш").assertIsDisplayed()
    }

    private companion object {
        const val NOTHING_UNSENT = "Юборилмаган маълумот йўқ"
    }
}
