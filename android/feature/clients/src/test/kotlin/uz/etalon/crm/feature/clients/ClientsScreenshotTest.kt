package uz.etalon.crm.feature.clients

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
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
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.ClientSummary
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.feature.clients.list.ClientsScreen
import uz.etalon.crm.feature.clients.list.ClientsUiState

/** What `SignedInShell` provides into [LocalNavPillInset] at Robolectric's 0 dp system navigation
 *  inset: the pill's 84 dp band alone, so a frame carries the clearance a real phone shows. */
private val SHELL_NAV_PILL_INSET = 84.dp

/**
 * `2b-clients.png` reproduced row for row, so the reviewer can lay the two images side by side:
 * «Мижозлар» over «8 мижоз · жами айланма бўйича», then the white card — Rahimov Construction's
 * 29 000 000 down to Navoi Build's 2 779 354, each with its avatar, its phone and district, and
 * «N буюртма» under the figure.
 *
 * Two things are in these frames that the capture does not draw, both of them rulings rather than
 * inventions: the search field (R4 — phone-first lookup is this screen's job) and the «Мижоз
 * қўшиш» bar (R4 again, for an operator holding `client.create`; an operator without it gets no
 * bar at all, which is the `showAddAction` rule `ClientsViewModelTest` pins).
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class ClientsScreenshotTest {
    @get:Rule val rule = createComposeRule()

    private fun client(
        id: String,
        name: String,
        phone: String,
        address: String?,
        orders: Int,
        total: String,
    ) = ClientSummary(
        id = id, name = name, phone = phone, address = address,
        orderCount = orders, totalBooked = Money.parse(total),
    )

    /** The capture's eight rows, in the capture's order — which is the server's
     *  `sortBy=totalBooked&sortDir=desc` and never a local sort. */
    private val rows = listOf(
        client("c1", "Rahimov Construction", "998902239888", "Андижон, Балиқчи тумани, Марказий 12", 1, "29000000"),
        client("c2", "Tashkent Tower LLC", "998901112233", "Тошкент, Юнусобод тумани, Юнусобод 12-7", 1, "18420000"),
        client("c3", "Yusupov & Sons", "998909876543", "Бухоро, Эски шаҳар, Мустақиллик 4", 2, "16201580"),
        client("c4", "BuildPro Group", "998771234567", "Тошкент, Мирзо Улуғбек тумани, Буюк ипак йўли 21", 1, "7340840"),
        client("c5", "Fergana Dom", "998917001020", "Фарғона, Марказ", 1, "6210000"),
        client("c6", "Andijon Stroy", "998934445566", "Андижон, Бобур шоҳ кўчаси 7", 1, "4947920"),
        client("c7", "Karimov LLC", "998935554466", "Самарқанд, Регистон кўчаси 9", 1, "4162500"),
        client("c8", "Navoi Build", "998930011223", "Навоий, Марказ", 1, "2779354"),
    )

    /** An operator holding `client.create`, so the sticky bar is in the frame and the list keeps
     *  its clearance — the state the owner opens the tab in. */
    private fun loaded() = ClientsUiState(
        items = rows, total = rows.size, loading = false,
        canCreate = true, permissionsResolved = true,
    )

    /** A search that matched nothing: the header says «0 мижоз», and «Мижоз топилмади» is the
     *  answer — which the state only allows once the fetch has actually settled. */
    private fun empty() = ClientsUiState(
        query = "Иброҳимов", items = emptyList(), total = 0, loading = false,
        canCreate = true, permissionsResolved = true,
    )

    /** One bounded page of a much larger result: the notice under the card is what stops an
     *  operator concluding their customer is not in the CRM. */
    private fun truncated() = loaded().copy(total = 312)

    private fun shoot(name: String, s: ClientsUiState) {
        rule.setContent { EtalonTheme { Clients(s) } }
        rule.onRoot().captureRoboImage("screenshots/$name.png")
    }

    @Composable
    private fun Clients(s: ClientsUiState) = CompositionLocalProvider(
        LocalNavPillInset provides SHELL_NAV_PILL_INSET,
    ) {
        ClientsScreen(
            s = s, onQuery = {}, onRefresh = {}, onOpenClient = {},
            // Robolectric reports the ime inset as absent whatever is focused, so the bar's own
            // seam is the only way a frame can say which side of ruling R13 it is on. Every frame
            // here is the keyboard-down one the operator opens the tab to.
            barVisible = true,
        )
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun light() = shoot("clients_light", loaded())
    @Test @Config(qualifiers = "w411dp-h891dp") fun emptyLight() = shoot("clients_empty_light", empty())
    @Test @Config(qualifiers = "w411dp-h891dp") fun truncatedLight() = shoot("clients_truncated_light", truncated())
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun largeFont() = shoot("clients_font13", loaded())
}
