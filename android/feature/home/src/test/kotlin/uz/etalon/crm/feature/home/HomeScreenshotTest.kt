package uz.etalon.crm.feature.home

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import com.github.takahirom.roborazzi.captureScreenRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.data.RejectedOrder
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.RecentOrder
import uz.etalon.crm.core.model.Role
import uz.etalon.crm.core.model.TodayDelivery
import uz.etalon.crm.core.model.Trend
import uz.etalon.crm.core.model.TrendDirection
import uz.etalon.crm.core.model.TrendPolarity
import java.math.BigDecimal
import java.time.Instant

/** What `SignedInShell` provides into [LocalNavPillInset] at Robolectric's 0 dp system navigation
 *  inset: the pill's 84 dp band alone, so this frame carries the clearance a real phone shows. */
private val SHELL_NAV_PILL_INSET = 84.dp

/**
 * `2b-home.png` reproduced with the data the server actually sends (rulings R1 and R2), so the
 * reviewer can lay the two images side by side: brand row, «Бошқарув» over its date line, the KPI
 * row with the third card peeking, the navy «Бугунги етказиш» sheet with its count pill, and the
 * white «Сўнгги буюртмалар» card.
 *
 * **The nav pill is not in these frames, and neither is its band.** `HomeScreen` is stateless and
 * knows nothing about the shell that draws the pill over it; the clearance it keeps for the pill
 * is bottom `contentPadding` on a list whose content already runs past the viewport, so it is
 * below the frame's edge and photographs as nothing at all. The pill's own picture is
 * `ds_bottom_nav_light.png`; the clearance arithmetic is `NavPillTest`.
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
            clientPhone = "998901112233", clientAddress = "Фарғона, Марказ",
            status = OrderStatus.PLACED, scheduledAt = Instant.parse("2026-09-04T06:00:00Z"),
            totalPrice = Money.parse("6210000.00"), remaining = Money.parse("6210000.00"),
            totalArea = BigDecimal("36.50"), paymentState = PaymentState.AWAITING_PAYMENT,
        ),
        RecentOrder(
            orderId = "o1", orderNumber = "2026-09-0004", clientName = "Tashkent Tower LLC",
            clientPhone = "998901234567", clientAddress = "Тошкент, Юнусобод",
            status = OrderStatus.IN_PRODUCTION, scheduledAt = Instant.parse("2026-09-02T06:00:00Z"),
            totalPrice = Money.parse("18420000.00"), remaining = Money.parse("18420000.00"),
            totalArea = BigDecimal("108.20"), paymentState = PaymentState.PARTIALLY_PAID,
        ),
        // The recent card's own CANCELED branch — the card draws only its first four rows, so the
        // canceled one has to be inside them to reach the baseline. It takes the slot Yusupov &
        // Sons held, which the today sheet above still shows.
        RecentOrder(
            orderId = "o4", orderNumber = "2026-09-0001", clientName = "Navoi Build",
            clientPhone = "998930011223", clientAddress = "Навоий, Шимолий",
            status = OrderStatus.CANCELED, scheduledAt = Instant.parse("2026-09-01T06:00:00Z"),
            totalPrice = Money.parse("3003520.00"), remaining = Money.parse("3003520.00"),
            totalArea = BigDecimal("18.00"), paymentState = PaymentState.AWAITING_PAYMENT,
        ),
        RecentOrder(
            orderId = "o6", orderNumber = "2026-08-0001", clientName = "Karimov LLC",
            clientPhone = "998935554466", clientAddress = "Самарқанд, Регистон",
            status = OrderStatus.DELIVERED, scheduledAt = Instant.parse("2026-08-28T06:00:00Z"),
            totalPrice = Money.parse("4162500.00"), remaining = Money.ZERO,
            totalArea = BigDecimal("26.90"), paymentState = PaymentState.FULLY_PAID,
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
        collectedTrend = Trend(BigDecimal("8.2"), TrendDirection.UP, TrendPolarity.POSITIVE),
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

    /** One upload still queued and one order the server refused: what the bell badges, and what
     *  the sheet has to explain. The message is the server's own Uzbek half, as the outbox stored
     *  it — «Karimov LLC» has no client record with that phone. */
    private fun rejectedState() = loaded().copy(
        pendingUploads = 1,
        rejectedOrders = listOf(
            RejectedOrder(id = "row-1", clientName = "Karimov LLC", message = "Мижоз топилмади"),
        ),
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

    /**
     * D10 / R6: the bell's sheet, with one upload still queued and one order the server refused
     * outright. A whole-screen capture rather than `onRoot()` — the sheet is a `ModalBottomSheet`
     * in a window of its own, and the scrim over Home is part of what the frame has to show.
     *
     * [LocalNavPillInset] is provided the way `SignedInShell` provides it (Robolectric reports no
     * system navigation bar, so the shell's band is its whole 84 dp), matching every other feature
     * module's screenshot test.
     */
    @Test @Config(qualifiers = "w411dp-h891dp") fun outboxRejectedLight() {
        rule.setContent {
            EtalonTheme {
                CompositionLocalProvider(LocalNavPillInset provides SHELL_NAV_PILL_INSET) {
                    HomeScreen(
                        s = rejectedState(), me = owner, now = now, onRefresh = {},
                        onOpenOrder = {}, onOpenOrders = {}, onOpenAccount = {}, onOpenOutbox = {},
                    )
                    OutboxSheet(
                        pending = rejectedState().pendingUploads,
                        rejected = rejectedState().rejectedOrders,
                        onDiscard = {},
                        onDismiss = {},
                        // Ruling I3's pair of actions, as an operator who may quote sees them.
                        onReopen = {},
                    )
                }
            }
        }
        rule.waitForIdle()
        captureScreenRoboImage("screenshots/home_outbox_rejected_light.png")
    }

    /**
     * The same sheet after a bad week offline: nothing left waiting to send, and a dozen orders the
     * server refused. Two rules are visible in this one frame, and both are asserted rather than
     * left to the eye:
     *
     * - «Юборилмаган маълумот йўқ» is NOT printed. It would be true — the queue is empty — and read
     *   as the opposite of the twelve failures listed under it.
     * - «Ёпиш» is still on screen. It is the only way out of the sheet, so the list scrolls inside
     *   its own band (`REJECTED_LIST_MAX`) instead of pushing the button off the bottom edge.
     */
    @Test @Config(qualifiers = "w411dp-h891dp") fun outboxManyRejectedLight() {
        val many = (1..12).map {
            RejectedOrder(id = "row-$it", clientName = "Мижоз $it", message = "Сана нотўғри")
        }
        rule.setContent {
            EtalonTheme {
                CompositionLocalProvider(LocalNavPillInset provides SHELL_NAV_PILL_INSET) {
                    HomeScreen(
                        s = loaded().copy(pendingUploads = 0, rejectedOrders = many),
                        me = owner, now = now, onRefresh = {},
                        onOpenOrder = {}, onOpenOrders = {}, onOpenAccount = {}, onOpenOutbox = {},
                    )
                    OutboxSheet(pending = 0, rejected = many, onDiscard = {}, onDismiss = {}, onReopen = {})
                }
            }
        }
        rule.waitForIdle()
        rule.onNodeWithText("Юборилмаган маълумот йўқ").assertDoesNotExist()
        rule.onNodeWithText("Ёпиш").assertIsDisplayed()
        captureScreenRoboImage("screenshots/home_outbox_many_rejected_light.png")
    }

    /**
     * Ruling I3's confirmation, the one thing «Тушунарли» now goes through. It is the shared
     * `ConfirmSheet` drawn with no figure — the first time that component has been asked a question
     * that is not about money — so the arrangement is recorded rather than assumed: the question in
     * the hero's own place, the customer under it, «Бекор қилиш» beside «Ўчириш».
     */
    @Test @Config(qualifiers = "w411dp-h891dp") fun outboxDiscardConfirmLight() {
        rule.setContent {
            EtalonTheme {
                CompositionLocalProvider(LocalNavPillInset provides SHELL_NAV_PILL_INSET) {
                    HomeScreen(
                        s = rejectedState(), me = owner, now = now, onRefresh = {},
                        onOpenOrder = {}, onOpenOrders = {}, onOpenAccount = {}, onOpenOutbox = {},
                    )
                    OutboxSheet(
                        pending = 0,
                        rejected = rejectedState().rejectedOrders,
                        onDiscard = {},
                        onDismiss = {},
                        onReopen = {},
                    )
                }
            }
        }
        rule.onNodeWithText("Тушунарли").performClick()
        rule.waitForIdle()
        rule.onNodeWithText("Ҳисоб-китоб ўчирилади").assertIsDisplayed()
        captureScreenRoboImage("screenshots/home_outbox_discard_confirm_light.png")
    }

    /**
     * The third state of the trend footnote, which no frame drew: an unchanged month.
     *
     * FLAT makes no claim — no arrow, no percentage, and neutral ink rather than green. Folding it
     * into "up" is the defect `TrendDirection` is three-valued to prevent: it drew «↑ 0,0 %» in
     * green at a month that had not risen. An UNKNOWN direction reads the same way, which is the
     * honest answer to a word this client does not know.
     */
    @Test @Config(qualifiers = "w411dp-h891dp") fun anUnchangedMonthClaimsNothing() {
        val flat = loaded().copy(
            tiles = tiles().copy(collectedTrend = Trend(BigDecimal.ZERO, TrendDirection.FLAT, TrendPolarity.POSITIVE)),
        )
        shoot("home_trend_flat_light", flat)
        rule.onNodeWithText("ўтган ойга нисбатан ўзгаришсиз").assertExists()
        rule.onNode(hasText("↑", substring = true)).assertDoesNotExist()
        rule.onNode(hasText("↓", substring = true)).assertDoesNotExist()
    }

    /** …and a direction the server invents after this client shipped falls into the same line,
     *  rather than a raw word or a guessed arrow. */
    @Test @Config(qualifiers = "w411dp-h891dp") fun anUnknownDirectionReadsAsUnchanged() {
        val unknown = loaded().copy(
            tiles = tiles().copy(collectedTrend = Trend(BigDecimal("8.2"), TrendDirection.UNKNOWN, TrendPolarity.POSITIVE)),
        )
        rule.setContent {
            EtalonTheme {
                HomeScreen(
                    s = unknown, me = owner, now = now, onRefresh = {},
                    onOpenOrder = {}, onOpenOrders = {}, onOpenAccount = {}, onOpenOutbox = {},
                )
            }
        }
        rule.onNodeWithText("ўтган ойга нисбатан ўзгаришсиз").assertExists()
        // The trend's own two claims, neither of which an unknown direction may make. («8,2» itself
        // is not the assertion: a room's «108,2 м²» carries those digits for a different reason.)
        rule.onNode(hasText("↑ 8,2%", substring = true)).assertDoesNotExist()
        rule.onNode(hasText("↓ 8,2%", substring = true)).assertDoesNotExist()
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun light() = shoot("home_light", loaded())
    @Test @Config(qualifiers = "w411dp-h891dp") fun emptyLight() = shoot("home_empty_light", empty())
    @Test @Config(qualifiers = "w411dp-h891dp") fun noAccessLight() = shoot("home_no_access_light", noAccess())
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun largeFont() = shoot("home_font13", loaded())
}
