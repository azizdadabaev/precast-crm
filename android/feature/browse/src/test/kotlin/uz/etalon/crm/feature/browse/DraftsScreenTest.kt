package uz.etalon.crm.feature.browse

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasText
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
import uz.etalon.crm.core.model.DraftLine
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.Resource
import java.math.BigDecimal
import java.time.Instant

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class DraftsScreenTest {
    @get:Rule val rule = createComposeRule()

    private fun draft(
        id: String = "p1",
        client: String? = "Yusupov & Sons",
        orderNumber: String? = null,
        orderId: String? = null,
    ) = DraftLine(
        id = id,
        name = null,
        draftNumber = 12,
        status = if (orderNumber == null) "DRAFT" else "ORDERED",
        aiGenerated = false,
        updatedAt = Instant.parse("2026-09-14T06:00:00Z"),
        clientName = client,
        clientPhone = "998901112233",
        clientAddress = "Бухоро",
        rooms = 3,
        area = BigDecimal("78.70"),
        subtotal = Money.parse("13350000.00"),
        orderNumber = orderNumber,
        orderId = orderId,
    )

    @Composable
    private fun Host(content: @Composable () -> Unit) =
        CompositionLocalProvider(LocalNavPillInset provides 0.dp) { EtalonTheme { content() } }

    private fun show(rows: List<DraftLine>, query: String = "") = rule.setContent {
        Host {
            DraftsScreen(
                state = Resource.Success(rows),
                query = query,
                draftsOnly = true,
                onQueryChange = {},
                onDraftsOnlyChange = {},
                onRetry = {},
                onOpenOrder = {},
            )
        }
    }

    /**
     * The whole point of the «Барчаси» tab: a project that became an order says which order, so an
     * operator scanning the list can tell what still needs placing from what already went out. A
     * row that wore «Лойиҳа» either way would make the two indistinguishable.
     */
    @Test fun `an ordered project wears its order number, a draft wears the draft tag`() {
        show(listOf(draft(id = "p1"), draft(id = "p2", orderNumber = "2026-09-0003", orderId = "o3")))
        rule.onNodeWithText("2026-09-0003").assertExists()
        rule.onAllNodes(hasText("Лойиҳа")).assertCountEquals(1)
    }

    /** A project quoted before anyone made a client record still has to say who it is for. */
    @Test fun `a project with no client record says so rather than showing a blank row`() {
        show(listOf(draft(client = null)))
        rule.onNodeWithText("Мижоз кўрсатилмаган").assertExists()
    }

    /** «No drafts yet» tells a new operator where to start. */
    @Test fun `an empty list says where to start`() {
        show(emptyList())
        rule.onNodeWithText("Ҳозирча лойиҳалар йўқ — ҳисоб-китобни бошланг.").assertExists()
    }

    /** After a search that same sentence would be a lie — there ARE drafts, just none matching —
     *  so the term is echoed back instead. */
    @Test fun `an empty search echoes the term rather than claiming there are none`() {
        show(emptyList(), query = "Rustam")
        rule.onNodeWithText("«Rustam» бўйича лойиҳа топилмади.").assertExists()
    }
}
