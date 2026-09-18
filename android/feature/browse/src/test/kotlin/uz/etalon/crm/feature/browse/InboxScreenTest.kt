package uz.etalon.crm.feature.browse

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.Conversation
import uz.etalon.crm.core.model.Resource
import java.time.Instant

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class InboxScreenTest {
    @get:Rule val rule = createComposeRule()

    private fun chat(name: String = "Rustam", snippet: String = "Salom", unread: Boolean = false) =
        Conversation(
            id = name,
            channel = "TELEGRAM",
            displayName = name,
            username = null,
            lastMessageAt = Instant.parse("2026-09-14T06:00:00Z"),
            lastSnippet = snippet,
            unread = unread,
        )

    @Composable
    private fun Host(content: @Composable () -> Unit) =
        CompositionLocalProvider(LocalNavPillInset provides 0.dp) { EtalonTheme { content() } }

    private fun show(state: Resource<List<Conversation>>, query: String = "") = rule.setContent {
        Host { InboxScreen(state = state, query = query, onQueryChange = {}, onRetry = {}) }
    }

    /**
     * The inbox sits behind a password gate as well as `inbox.access`. An owner who holds the
     * permission must not be told they lack it, and must be able to get past the gate HERE — the
     * screen used to point at the web CRM, which is no help to somebody holding only a phone.
     */
    @Test fun `a locked inbox asks for the password instead of pointing at the web`() {
        show(Resource.Error(null, AppError.Network("Хабарлар қулфланган · Inbox locked — enter password")))
        rule.onNodeWithText("Хабарлар қулфланган").assertExists()
        rule.onNodeWithText("Парол").assertExists()
        rule.onNodeWithText("Очиш").assertExists()
    }

    /** Any OTHER failure is a real one and keeps saying what it was. */
    @Test fun `an ordinary failure is not mistaken for the lock`() {
        show(Resource.Error(null, AppError.Network("Тармоқ хатоси")))
        rule.onNodeWithText("Тармоқ хатоси").assertExists()
        rule.onNodeWithText("Очиш").assertDoesNotExist()
    }

    /** A chat whose last message was a photo or a voice note has no text; the row must not show a
     *  blank second line, which reads as a broken row rather than a wordless message. */
    @Test fun `a blank snippet shows the placeholder the web uses`() {
        show(Resource.Success(listOf(chat(snippet = ""))))
        rule.onNodeWithText("Хабар").assertExists()
    }

    @Test fun `search filters the list that is already in hand`() {
        show(Resource.Success(listOf(chat("Rustam"), chat("Dilshod"))), query = "dil")
        rule.onNodeWithText("Dilshod").assertExists()
        rule.onNodeWithText("Rustam").assertDoesNotExist()
    }
}
