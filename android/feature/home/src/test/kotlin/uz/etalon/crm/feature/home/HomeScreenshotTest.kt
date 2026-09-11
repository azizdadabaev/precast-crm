package uz.etalon.crm.feature.home

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
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.RecentOrder
import uz.etalon.crm.core.model.Role
import uz.etalon.crm.core.model.TodayDelivery
import uz.etalon.crm.core.model.Trend
import uz.etalon.crm.core.model.TrendDirection
import java.math.BigDecimal
import java.time.Instant

/**
 * `2b-home.png` reproduced with the data the server actually sends (rulings R1 and R2), so the
 * reviewer can lay the two images side by side: brand row, «Бошқарув» over its date line, the KPI
 * row with the third card peeking, the navy «Бугунги етказиш» sheet with its count pill, and the
 * white «Сўнгги буюртмалар» card.
 *
 * **The nav pill is not in these frames.** `HomeScreen` is stateless and knows nothing about the
 * shell that draws the pill over it; what the baseline shows instead is the
 * [uz.etalon.crm.core.designsystem.theme.EtalonSpace.underNav] of bottom padding the screen keeps
 * for it. The pill's own picture is `ds_bottom_nav_light.png`.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class HomeScreenshotTest {
    @get:Rule val rule = createComposeRule()

    /** Wednesday 9 September 2026 in Tashkent (UTC+5) — «Чоршанба, 9 сентябрь». */
    private val now = Instant.parse("2026-09-08T19:30:00Z")

    private val owner = Me("u1", "Азиз Раҳимов", Role.OWNER, setOf("dashboard.view", "order.view"), false)

    private val today = listOf(
        TodayDelivery(
            orderId = "o1", orderNumber = "2026-09-0004", clientName = "Tashkent Tower LLC",
            clientAddress = "Тошкент, Юнусобод", area = BigDecimal("108.20"),
            status = OrderStatus.IN_PRODUCTION,
            totalPrice = Money.parse("18420000.00"), remaining = Money.parse("18420000.00"),
        ),
        TodayDelivery(
            orderId = "o2", orderNumber = "2026-09-0003", clientName = "Yusupov & Sons",
            clientAddress = "Бухоро, Эски шаҳар", area = BigDecimal("78.70"),
            status = OrderStatus.DISPATCHED,
            totalPrice = Money.parse("13350000.00"), remaining = Money.parse("7350000.00"),
        ),
        TodayDelivery(
            orderId = "o3", orderNumber = "2026-09-0002", clientName = "BuildPro Group",
            clientAddress = "Тошкент, Мирзо-Улуғбек", area = BigDecimal("42.60"),
            status = OrderStatus.DISPATCHED,
            totalPrice = Money.parse("7340840.00"), remaining = Money.parse("4340840.00"),
        ),
        // Canceled, with its whole total still unpaid: the row must draw neither «қолди 18 000 000»
        // nor «тўланган» (`OrderStatus.owesNothing`). Without one in the fixture that branch was
        // written but never photographed.
        TodayDelivery(
            orderId = "o4", orderNumber = "2026-09-0001", clientName = "Navoi Build",
            clientAddress = "Навоий, Шимолий", area = BigDecimal("18.00"),
            status = OrderStatus.CANCELED,
            totalPrice = Money.parse("3003520.00"), remaining = Money.parse("3003520.00"),
        ),
    )

    private val recent = listOf(
        RecentOrder(
            orderId = "o5", orderNumber = "2026-09-0005", clientName = "Fergana Dom",
            status = OrderStatus.PLACED, scheduledAt = Instant.parse("2026-09-04T06:00:00Z"),
            totalPrice = Money.parse("6210000.00"), remaining = Money.parse("6210000.00"),
        ),
        RecentOrder(
            orderId = "o1", orderNumber = "2026-09-0004", clientName = "Tashkent Tower LLC",
            status = OrderStatus.IN_PRODUCTION, scheduledAt = Instant.parse("2026-09-02T06:00:00Z"),
            totalPrice = Money.parse("18420000.00"), remaining = Money.parse("18420000.00"),
        ),
        // The recent card's own CANCELED branch — the card draws only its first four rows, so the
        // canceled one has to be inside them to reach the baseline. It takes the slot Yusupov &
        // Sons held, which the today sheet above still shows.
        RecentOrder(
            orderId = "o4", orderNumber = "2026-09-0001", clientName = "Navoi Build",
            status = OrderStatus.CANCELED, scheduledAt = Instant.parse("2026-09-01T06:00:00Z"),
            totalPrice = Money.parse("3003520.00"), remaining = Money.parse("3003520.00"),
        ),
        RecentOrder(
            orderId = "o6", orderNumber = "2026-08-0001", clientName = "Karimov LLC",
            status = OrderStatus.DELIVERED, scheduledAt = Instant.parse("2026-08-28T06:00:00Z"),
            totalPrice = Money.parse("4162500.00"), remaining = Money.ZERO,
        ),
    )

    /** Twelve months, the current one the highest — the shape the sparkline's current bar needs. */
    private val collectedByMonth = listOf(
        "5400000", "6100000", "4800000", "7200000", "6600000", "8100000",
        "7400000", "9200000", "8700000", "10400000", "11900000", "13500000",
    ).map(Money::parse)

    private fun tiles() = HomeTiles(
        todayCount = today.size,
        todayArea = BigDecimal("247.50"), // 108,2 + 78,7 + 42,6 + 18,0 — the sum of `today`
        openDiscrepancies = 1,
        openDiscrepancyTotal = Money.parse("120000.00"),
        receivables = Money.parse("53268760.00"),
        receivableOrders = 6,
        collectedThisMonth = Money.parse("13500000.00"),
        collectedTrend = Trend(BigDecimal("8.2"), TrendDirection.UP),
        collectedByMonth = collectedByMonth,
    )

    private fun loaded() = HomeUiState(
        loading = false, error = null, today = today, recent = recent, pendingUploads = 2,
        permissionsResolved = true, hasDashboardAccess = true, tiles = tiles(),
    )

    private fun empty() = HomeUiState(
        loading = false, error = null, today = emptyList(), recent = emptyList(), pendingUploads = 0,
        permissionsResolved = true, hasDashboardAccess = true,
        tiles = tiles().copy(todayCount = 0, todayArea = BigDecimal.ZERO),
    )

    /** A DRIVER: no dashboard permission at all, so the tiles are absent — not zeroed — and the
     *  sheet says «кўриш ҳуқуқингиз йўқ» rather than «буюртма йўқ». */
    private fun noAccess() = HomeUiState(
        loading = false, error = null, permissionsResolved = true, hasDashboardAccess = false, tiles = null,
    )

    private fun shoot(name: String, state: HomeUiState) {
        rule.setContent {
            EtalonTheme {
                HomeScreen(
                    s = state, me = owner, now = now, onRefresh = {},
                    onOpenOrder = {}, onOpenOrders = {}, onOpenAccount = {}, onOpenOutbox = {},
                )
            }
        }
        rule.onRoot().captureRoboImage("screenshots/$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun light() = shoot("home_light", loaded())
    @Test @Config(qualifiers = "w411dp-h891dp") fun emptyLight() = shoot("home_empty_light", empty())
    @Test @Config(qualifiers = "w411dp-h891dp") fun noAccessLight() = shoot("home_no_access_light", noAccess())
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun largeFont() = shoot("home_font13", loaded())
}
