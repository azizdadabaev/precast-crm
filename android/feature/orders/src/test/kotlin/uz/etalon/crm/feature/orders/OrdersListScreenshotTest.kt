package uz.etalon.crm.feature.orders

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.ClientRef
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderFacets
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.feature.orders.list.OrdersListScreen
import uz.etalon.crm.feature.orders.list.OrdersListUiState
import uz.etalon.crm.feature.orders.list.groupByMonth
import java.math.BigDecimal
import java.time.Instant

/**
 * `2b-orders.png` reproduced row for row, so the reviewer can lay the two images side by side:
 * «Буюртмалар» over «9 буюртма · 563,2 м²» with the «+ Янги» pill, the search field and its filter
 * square, the chips with their facet counts, and the navy sheet — «Рўйхат», the
 * Барчаси/Қарз/Тўланган switch, «Сентябрь 2026 … 49 483 340» and the rows beneath it.
 *
 * Nothing here reads the clock: every `scheduledAt` is a fixed instant and the month groups are
 * built by the production [groupByMonth], so a baseline recorded in March is the one recorded in
 * September.
 *
 * **The nav pill is not in these frames.** `OrdersListScreen` is stateless and knows nothing about
 * the shell that draws the pill over it; what the baseline shows instead is the
 * [uz.etalon.crm.core.designsystem.theme.EtalonSpace.underNav] of list padding kept for it.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class OrdersListScreenshotTest {
    @get:Rule val rule = createComposeRule()

    private fun row(
        id: String,
        number: String,
        client: String,
        status: OrderStatus,
        area: String,
        total: String,
        paid: String,
        scheduled: String,
    ) = OrderSummary(
        id = id,
        orderNumber = number,
        status = status,
        // Compared, not equated: `Money` wraps BigDecimal, whose `equals` counts the scale, so
        // "0.00" is not equal to `Money.ZERO`.
        paymentState = Money.parse(paid).let { p ->
            when {
                p.isZero -> PaymentState.AWAITING_PAYMENT
                p >= Money.parse(total) -> PaymentState.FULLY_PAID
                else -> PaymentState.PARTIALLY_PAID
            }
        },
        totalPrice = Money.parse(total),
        confirmedPaid = Money.parse(paid),
        totalArea = BigDecimal(area),
        totalBlocks = 0,
        totalBeams = 0,
        scheduledAt = Instant.parse(scheduled),
        placedAt = Instant.parse(scheduled),
        client = ClientRef("c-$id", client, "998901112233", null),
    )

    /** Newest first (ruling R5), which is the order the server's `sort=desc` returns. */
    private val rows = listOf(
        row("o5", "2026-09-0005", "Fergana Dom", OrderStatus.PLACED, "36.50", "6210000.00", "0.00", "2026-09-18T06:00:00Z"),
        row("o4", "2026-09-0004", "Tashkent Tower LLC", OrderStatus.IN_PRODUCTION, "108.20", "18420000.00", "0.00", "2026-09-15T06:00:00Z"),
        row("o3", "2026-09-0003", "Yusupov & Sons", OrderStatus.DISPATCHED, "78.70", "13350000.00", "6000000.00", "2026-09-11T06:00:00Z"),
        row("o2", "2026-09-0002", "BuildPro Group", OrderStatus.DISPATCHED, "42.60", "7340840.00", "3000000.00", "2026-09-07T06:00:00Z"),
        row("o1", "2026-09-0001", "Karimov LLC", OrderStatus.DELIVERED, "26.90", "4162500.00", "4162500.00", "2026-09-02T06:00:00Z"),
        row("j1", "2026-07-0001", "Rahimov Construction", OrderStatus.DELIVERED, "206.00", "29000000.00", "14500000.00", "2026-07-24T06:00:00Z"),
        row("n1", "2026-06-0002", "Andijon Stroy", OrderStatus.DELIVERED, "31.40", "4947920.00", "4947920.00", "2026-06-19T06:00:00Z"),
    )

    /** The facets describe all nine orders the filter matches, not the seven loaded — which is
     *  why «Барчаси 9» sits over a list of seven and `hasMore` is true. */
    private val facets = OrderFacets(
        byStatus = mapOf(
            OrderStatus.PLACED to 1,
            OrderStatus.IN_PRODUCTION to 1,
            OrderStatus.DISPATCHED to 2,
            OrderStatus.DELIVERED to 5,
        ),
        debt = 6,
        paid = 3,
        total = 9,
        totalArea = BigDecimal("563.20"),
    )

    private fun loaded() = OrdersListUiState(
        groups = groupByMonth(rows), facets = facets, hasMore = true, hasCache = true,
    )

    /** A filter that matched nothing: the facets are real and zero, so the header reads
     *  «0 буюртма · 0 м²» over «Буюртма топилмади.» rather than over a blank sheet. */
    private fun empty() = OrdersListUiState(
        query = "Иброҳимов",
        facets = OrderFacets(byStatus = emptyMap(), debt = 0, paid = 0, total = 0, totalArea = BigDecimal.ZERO),
        hasCache = true,
    )

    /** A failed refresh over a cache: the banner states the failure and the rows it could not
     *  replace stay on screen (they are the last thing the server did say). */
    private fun failed() = loaded().copy(error = "Интернет алоқаси йўқ")

    private fun shoot(name: String, state: OrdersListUiState) {
        rule.setContent {
            EtalonTheme {
                OrdersListScreen(
                    s = state, onQuery = {}, onStatus = {}, onPayment = {}, onDay = {},
                    onRefresh = {}, onLoadMore = {}, onOpen = {}, onNewOrder = {},
                )
            }
        }
        rule.onRoot().captureRoboImage("screenshots/$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun light() = shoot("orders_list_light", loaded())
    @Test @Config(qualifiers = "w411dp-h891dp") fun emptyLight() = shoot("orders_list_empty_light", empty())
    @Test @Config(qualifiers = "w411dp-h891dp") fun errorLight() = shoot("orders_list_error_light", failed())
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun largeFont() = shoot("orders_list_font13", loaded())
}
