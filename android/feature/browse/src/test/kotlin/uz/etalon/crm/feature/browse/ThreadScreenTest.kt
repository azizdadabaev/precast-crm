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
import uz.etalon.crm.core.model.ChatMessage
import uz.etalon.crm.core.model.MessageKind
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.Thread
import java.time.Instant

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class ThreadScreenTest {
    @get:Rule val rule = createComposeRule()

    private fun msg(
        id: String = "m1",
        outbound: Boolean = false,
        text: String? = null,
        kind: MessageKind = MessageKind.TEXT,
        mediaUrl: String? = null,
        lat: Double? = null,
        lng: Double? = null,
        mediaMissing: Boolean = false,
        failed: Boolean = false,
    ) = ChatMessage(
        id = id,
        outbound = outbound,
        text = text,
        kind = kind,
        mediaUrl = mediaUrl,
        mediaName = null,
        lat = lat,
        lng = lng,
        locationTitle = null,
        durationSec = null,
        mediaMissing = mediaMissing,
        failed = failed,
        createdAt = Instant.parse("2026-09-18T06:00:00Z"),
    )

    @Composable
    private fun Host(content: @Composable () -> Unit) =
        CompositionLocalProvider(LocalNavPillInset provides 0.dp) { EtalonTheme { content() } }

    private fun show(messages: List<ChatMessage>, projectCount: Int = 0) = rule.setContent {
        Host {
            ThreadScreen(
                state = Resource.Success(Thread("c1", "Rustam", "rustam", messages)),
                draft = "",
                sending = false,
                error = null,
                projectCount = projectCount,
                onDraftChange = {},
                onSendText = {},
                onSendPhoto = { _, _ -> },
                onSendLocation = {},
                onSendFirstProject = {},
                onOpenOrder = {},
                onDismissError = {},
                onBack = {},
            )
        }
    }

    /**
     * A location's coordinates arrive only inside `mediaMeta`, and the server sends LOCATION
     * messages with no media path at all. A bubble that assumed a path would render nothing and
     * the conversation would appear to skip a turn.
     */
    @Test fun `a location renders from its coordinates, not from a media path`() {
        show(listOf(msg(kind = MessageKind.LOCATION, lat = 41.31, lng = 69.24)))
        rule.onNodeWithText("41.31, 69.24").assertExists()
    }

    /**
     * Media the server could not fetch from Telegram — too large, or the download failed. Saying
     * so is the point: a bubble that drew a broken frame would look like the app's fault.
     */
    @Test fun `media the server could not fetch says so`() {
        show(listOf(msg(kind = MessageKind.IMAGE, mediaMissing = true)))
        rule.onNodeWithText("Медиа юкланмади").assertExists()
    }

    /** A kind this app draws no bubble for still occupies its turn, rather than vanishing. */
    @Test fun `an unsupported kind still occupies its place in the thread`() {
        show(listOf(msg(kind = MessageKind.UNSUPPORTED)))
        rule.onNodeWithText("Қўллаб-қувватланмайди").assertExists()
    }

    /** A send that failed must be visible as failed, or it reads as delivered. */
    @Test fun `a failed outbound message is marked`() {
        show(listOf(msg(outbound = true, text = "Salom", failed = true)))
        rule.onNodeWithText("юборилмади").assertExists()
    }

    /** «Хулосани юбориш» only exists where there is a quote to send. */
    @Test fun `the quote button is absent on a chat with no linked project`() {
        show(listOf(msg(text = "Salom")))
        rule.onNodeWithText("Хулосани юбориш").assertDoesNotExist()
    }
}
