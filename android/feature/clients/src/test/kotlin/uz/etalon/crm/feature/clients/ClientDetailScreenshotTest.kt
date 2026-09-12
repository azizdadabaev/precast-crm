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
import uz.etalon.crm.core.model.ClientDetail
import uz.etalon.crm.core.model.ClientOrderLine
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.feature.clients.detail.ClientDetailScreen
import uz.etalon.crm.feature.clients.detail.ClientDetailUiState
import java.time.Instant

/** What `SignedInShell` provides into [LocalNavPillInset] at Robolectric's 0 dp system navigation
 *  inset: the pill's 84 dp band alone, so a frame carries the clearance a real phone shows. */
private val SHELL_NAV_PILL_INSET = 84.dp

/** The day these frames are drawn on. Pinned, because `formatScheduleDate` drops the year only
 *  for the CURRENT one — with `Instant.now()` the baselines would move on 1 January. */
private val NOW: Instant = Instant.parse("2026-09-12T09:00:00Z")

private fun at(iso: String) = Instant.parse(iso)

/**
 * Ruling R5 made visible: the order detail's navy panel carrying a CLIENT — «Мижоз» over the name,
 * the phone where an order panel carries its client, the address under it, no status tag, no
 * tiles, and a footer of «Буюртмалар» and «Жами» (no «Қарз» — the client API carries no
 * remaining). The pencil in the header is the panel's new `actions` slot.
 *
 * Below it the state this screen exists for: what the customer has ordered, as the same light
 * `OrderRow` the clients list and Home draw.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class ClientDetailScreenshotTest {
    @get:Rule val rule = createComposeRule()

    /** `2b-clients.png`'s own third row, opened: two orders, a note, a Bukhara address. */
    private val client = ClientDetail(
        id = "c3",
        name = "Yusupov & Sons",
        phone = "998909876543",
        address = "Бухоро вилояти, Когон тумани, Мустақиллик кўчаси 4",
        notes = "Тўловни ҳар ойнинг 10-санасида қилади. Омборга кириш эшиги орқа томондан.",
        orders = listOf(
            ClientOrderLine(
                id = "o1", orderNumber = "2026-09-0003", status = OrderStatus.DISPATCHED,
                totalPrice = Money.parse("13350000.00"), scheduledAt = at("2026-09-18T04:00:00Z"),
            ),
            ClientOrderLine(
                id = "o2", orderNumber = "2026-08-0041", status = OrderStatus.DELIVERED,
                totalPrice = Money.parse("2851580.00"), scheduledAt = at("2026-08-27T04:00:00Z"),
            ),
        ),
    )

    private fun loaded() = ClientDetailUiState(
        client = client, loading = false,
        canEdit = true, permissionsResolved = true,
    )

    private fun shoot(name: String, s: ClientDetailUiState) {
        rule.setContent { EtalonTheme { Detail(s) } }
        rule.onRoot().captureRoboImage("screenshots/$name.png")
    }

    @Composable
    private fun Detail(s: ClientDetailUiState) = CompositionLocalProvider(
        LocalNavPillInset provides SHELL_NAV_PILL_INSET,
    ) {
        ClientDetailScreen(s = s, now = NOW, onBack = {}, onRefresh = {}, onOpenOrder = {})
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun light() = shoot("client_detail_light", loaded())

    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f)
    fun largeFont() = shoot("client_detail_font13", loaded())
}
