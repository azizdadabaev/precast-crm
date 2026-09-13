package uz.etalon.crm.feature.orders

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
import uz.etalon.crm.core.model.ClientRef
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderFacets
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.OrdersView
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.tierFor
import uz.etalon.crm.core.testing.CalendarFixtures
import uz.etalon.crm.feature.orders.list.DaySheetState
import uz.etalon.crm.feature.orders.list.OrdersListScreen
import uz.etalon.crm.feature.orders.list.OrdersListUiState
import uz.etalon.crm.feature.orders.list.groupByMonth
import java.math.BigDecimal
import java.time.Instant

/** The shell's own band (`NavPill.NAV_PILL_BAND`), which is internal to the design system —
 *  restated here because a frame that does not reserve it is a frame of a screen nobody sees. */
private val NAV_PILL_BAND = 84.dp

/**
 * `2b-orders.png` reproduced row for row, so the reviewer can lay the two images side by side:
 * «Буюртмалар» over its count-and-area line with the «+ Янги» pill, the search field and its filter
 * square, the chips with their facet counts, and the navy sheet — «Рўйхат», the
 * Барчаси/Қарз/Тўланган switch, «Сентябрь 2026 … 49 483 340» and the rows beneath it.
 *
 * Nothing here reads the clock: every `scheduledAt` is a fixed instant and the month groups are
 * built by the production [groupByMonth], so a baseline recorded in March is the one recorded in
 * September.
 *
 * **The nav pill is not in these frames, but its band is reserved.** `OrdersListScreen` is
 * stateless and knows nothing about the shell that draws the pill over it; it reads the clearance
 * out of `LocalNavPillInset`, which the frames provide so the Жадвал view's day sheet is
 * photographed with the room it will really have. On the Рўйхат frames it changes nothing — the
 * rows already run past the viewport, so the bottom `contentPadding` is below the frame's edge.
 * The clearance arithmetic itself is `NavPillTest`.
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

    /** Newest first (ruling R5), which is the order the server's `sort=desc` returns. The canceled
     *  row is not in `2b-orders.png` — live data has them, and it is the row that proves two rules
     *  at once: it carries no «қолди …»/«тўланган» line, and «Сентябрь 2026» still sums to the
     *  capture's 49 483 340 with it on screen. */
    private val rows = listOf(
        row("o6", "2026-09-0006", "Navoi Build", OrderStatus.CANCELED, "24.03", "4773400.00", "0.00", "2026-09-21T06:00:00Z"),
        row("o5", "2026-09-0005", "Fergana Dom", OrderStatus.PLACED, "36.50", "6210000.00", "0.00", "2026-09-18T06:00:00Z"),
        row("o4", "2026-09-0004", "Tashkent Tower LLC", OrderStatus.IN_PRODUCTION, "108.20", "18420000.00", "0.00", "2026-09-15T06:00:00Z"),
        row("o3", "2026-09-0003", "Yusupov & Sons", OrderStatus.DISPATCHED, "78.70", "13350000.00", "6000000.00", "2026-09-11T06:00:00Z"),
        row("o2", "2026-09-0002", "BuildPro Group", OrderStatus.DISPATCHED, "42.60", "7340840.00", "3000000.00", "2026-09-07T06:00:00Z"),
        row("o1", "2026-09-0001", "Karimov LLC", OrderStatus.DELIVERED, "26.90", "4162500.00", "4162500.00", "2026-09-02T06:00:00Z"),
        row("j1", "2026-07-0001", "Rahimov Construction", OrderStatus.DELIVERED, "206.00", "29000000.00", "14500000.00", "2026-07-24T06:00:00Z"),
        row("n1", "2026-06-0002", "Andijon Stroy", OrderStatus.DELIVERED, "31.40", "4947920.00", "4947920.00", "2026-06-19T06:00:00Z"),
    )

    /** The facets describe all ten orders the filter matches, not the eight loaded — which is why
     *  «Барчаси 10» sits over a list of eight and `hasMore` is true. Every chip's count is here,
     *  LOADED's zero included, so the chips add up to «Барчаси» and so do the two segments. */
    private val facets = OrderFacets(
        byStatus = mapOf(
            OrderStatus.PLACED to 1,
            OrderStatus.IN_PRODUCTION to 1,
            OrderStatus.LOADED to 0,
            OrderStatus.DISPATCHED to 2,
            OrderStatus.DELIVERED to 5,
            OrderStatus.CANCELED to 1,
        ),
        debt = 7,
        paid = 3,
        total = 10,
        totalArea = BigDecimal("587.23"),
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

    /** Рўйхат with the day filter on: the dismissible «12 сен ×» under the status chips (§3). */
    private fun dayFiltered() = loaded().copy(day = CalendarFixtures.SELECTED)

    /**
     * Жадвал as a planner opens it on the acceptance's own month: September 2026 with 12 September
     * selected and its five orders in the navy sheet below the grid, and the export button in the
     * header because this operator holds `order.exportBackup`.
     */
    private fun calendar() = OrdersListUiState(
        view = OrdersView.CALENDAR,
        cursorMonth = CalendarFixtures.MONTH,
        day = CalendarFixtures.SELECTED,
        capacity = Resource.Success(CalendarFixtures.september),
        daySheet = daySheet(),
        canExport = true,
        facets = facets,
        hasCache = true,
    )

    private fun daySheet(): DaySheetState {
        val t = CalendarFixtures.THRESHOLDS
        val day = CalendarFixtures.day(12)
        return DaySheetState(
            day = CalendarFixtures.SELECTED,
            capacity = day,
            tier = tierFor(day.totalArea, t),
            heavy = t.heavy,
            orders = Resource.Success(dayOrders),
            moneyTotal = dayOrders.fold(Money.ZERO) { acc, o -> acc + o.totalPrice },
        )
    }

    /** 210,00 + 168,50 + 142,00 + 96,50 + 68,00 = 685,00 м² — the 12 September cell's own figure,
     *  split five ways, so the grid and the sheet under it agree. */
    private val dayOrders = listOf(
        row("d1", "2026-09-0021", "Tashkent Tower LLC", OrderStatus.IN_PRODUCTION, "210.00", "35700000.00", "35700000.00", "2026-09-12T06:00:00Z"),
        row("d2", "2026-09-0022", "Fergana Dom", OrderStatus.PLACED, "168.50", "28645000.00", "10000000.00", "2026-09-12T06:00:00Z"),
        row("d3", "2026-09-0023", "Yusupov & Sons", OrderStatus.LOADED, "142.00", "24140000.00", "0.00", "2026-09-12T06:00:00Z"),
        row("d4", "2026-09-0024", "Navoi Build", OrderStatus.DISPATCHED, "96.50", "16405000.00", "16405000.00", "2026-09-12T06:00:00Z"),
        row("d5", "2026-09-0025", "Karimov LLC", OrderStatus.DELIVERED, "68.00", "11560000.00", "5000000.00", "2026-09-12T06:00:00Z"),
    )

    private fun shoot(name: String, state: OrdersListUiState) {
        rule.setContent {
            EtalonTheme {
                // The shell's pill band, which the screen only ever sees through this local. The
                // list frames are unaffected (their rows run past the viewport), but the calendar's
                // day sheet ends above the fold and has to be seen to clear it.
                CompositionLocalProvider(LocalNavPillInset provides NAV_PILL_BAND) {
                    OrdersListScreen(
                        s = state, today = CalendarFixtures.TODAY,
                        onQuery = {}, onStatus = {}, onPayment = {}, onDay = {}, onView = {},
                        onPrevMonth = {}, onNextMonth = {}, onRefreshCalendar = {},
                        onExport = {}, onExportConsumed = {}, onDismissExportError = {},
                        onRefresh = {}, onLoadMore = {}, onOpen = {}, onNewOrder = {},
                    )
                }
            }
        }
        rule.onRoot().captureRoboImage("screenshots/$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun light() = shoot("orders_list_light", loaded())
    @Test @Config(qualifiers = "w411dp-h891dp") fun emptyLight() = shoot("orders_list_empty_light", empty())
    @Test @Config(qualifiers = "w411dp-h891dp") fun errorLight() = shoot("orders_list_error_light", failed())
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun largeFont() = shoot("orders_list_font13", loaded())
    @Test @Config(qualifiers = "w411dp-h891dp") fun dayChipLight() = shoot("orders_day_chip_light", dayFiltered())
    @Test @Config(qualifiers = "w411dp-h891dp") fun calendarLight() = shoot("orders_calendar_light", calendar())
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f)
    fun calendarLargeFont() = shoot("orders_calendar_font13", calendar())
}
