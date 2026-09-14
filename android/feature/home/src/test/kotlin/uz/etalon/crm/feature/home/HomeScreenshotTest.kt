package uz.etalon.crm.feature.home

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertIsDisplayed
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
import uz.etalon.crm.core.model.AllTimeMoney
import uz.etalon.crm.core.model.Aov
import uz.etalon.crm.core.model.LoadedVolume
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.MonthBooked
import uz.etalon.crm.core.model.MonthOrders
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.PeriodMoney
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
 * Design §2's dashboard, top half: the app-bar chrome over today's date, the navy receivables
 * hero, the financial rail and the operational 2×2 — drawn with the data the server actually
 * sends, so the reviewer can lay the frame beside the web dashboard and compare figure for figure.
 *
 * §2.5–§2.7 (the payment donut, the top clients and the recent orders) are not built yet and are
 * therefore not in these frames.
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
        // Two of the four are already out of the yard, so §2.4's segment bar is neither empty nor
        // full — the two states the bar's own arithmetic is most likely to confuse.
        TodayDelivery(
            orderId = "o2", orderNumber = "2026-09-0003", clientName = "Yusupov & Sons",
            clientAddress = "Бухоро, Эски шаҳар", area = BigDecimal("78.70"),
            status = OrderStatus.DISPATCHED,
            totalPrice = Money.parse("13350000.00"), remaining = Money.parse("7350000.00"),
        ),
        TodayDelivery(
            orderId = "o3", orderNumber = "2026-09-0002", clientName = "BuildPro Group",
            clientAddress = "Тошкент, Мирзо-Улуғбек", area = BigDecimal("42.60"),
            status = OrderStatus.DELIVERED,
            totalPrice = Money.parse("7340840.00"), remaining = Money.parse("4340840.00"),
        ),
        TodayDelivery(
            orderId = "o4", orderNumber = "2026-09-0001", clientName = "Navoi Build",
            clientAddress = "Навоий, Шимолий", area = BigDecimal("18.00"),
            status = OrderStatus.CANCELED,
            totalPrice = Money.parse("3003520.00"), remaining = Money.parse("3003520.00"),
        ),
    )

    /** Twelve months of bookings and their order counts, the current one the highest — the shape
     *  the rail's three sparklines and the AOV division are drawn from. */
    private val bookedByMonth = listOf(
        "104000000", "121000000", "96000000", "142000000", "133000000", "158000000",
        "147000000", "176000000", "168000000", "191000000", "208000000", "184200000",
    ).mapIndexed { i, v -> MonthBooked("2026-%02d".format(i + 1), Money.parse(v)) }

    private val ordersByMonth = listOf(9, 11, 8, 13, 12, 15, 13, 16, 14, 17, 18, 12)
        .mapIndexed { i, n -> MonthOrders("2026-%02d".format(i + 1), n) }

    private val collectedByMonth = listOf(
        "5400000", "6100000", "4800000", "7200000", "6600000", "8100000",
        "7400000", "9200000", "8700000", "10400000", "11900000", "13500000",
    ).map { Money.parse(it).amount }

    private fun dashboard() = HomeDashboard(
        receivables = Money.parse("53268760.00"),
        receivableOrders = 6,
        paidOrders = 317,
        partialOrders = 13,
        awaitingOrders = 23,
        booked = PeriodMoney(
            total = Money.parse("184200000.00"), count = 12,
            trend = Trend(BigDecimal("8"), TrendDirection.UP, TrendPolarity.POSITIVE),
        ),
        bookedAllTime = AllTimeMoney(total = Money.parse("1284000000.00"), count = 512),
        bookedSeries = bookedByMonth.takeLast(8).map { it.booked.amount },
        collected = PeriodMoney(
            total = Money.parse("13500000.00"), count = 9,
            // A month down on the last one, so the frame carries the red colouring of a positive
            // metric that fell as well as the green of one that rose.
            trend = Trend(BigDecimal("12"), TrendDirection.DOWN, TrendPolarity.POSITIVE),
        ),
        collectedAllTime = AllTimeMoney(total = Money.parse("1176400000.00"), count = 431),
        collectedSeries = collectedByMonth.takeLast(8),
        aov = Aov(
            thisMonth = Money.parse("15350000.00"), allTime = Money.parse("2507812.00"),
            trend = Trend(BigDecimal("4"), TrendDirection.UP, TrendPolarity.POSITIVE),
        ),
        // The real division, not a hand-written series: the frame shows what the screen computes.
        aovSeries = aovSeries(bookedByMonth, ordersByMonth),
        activeCustomers = 42,
        todayArea = BigDecimal("247.50"), // 108,2 + 78,7 + 42,6 + 18,0 — the sum of `today`
        openDiscrepancies = 1,
        openDiscrepancyTotal = Money.parse("120000.00"),
        loadedThisMonth = LoadedVolume(
            monthKey = "2026-09", blocks = 1180, beamCount = 96,
            beamMeters = BigDecimal("512.4"), area = BigDecimal("318.60"), orderCount = 11,
        ),
        currentMonthKey = "2026-09",
    )

    private fun loaded() = HomeUiState(
        loading = false, error = null, today = today, pendingUploads = 2,
        permissionsResolved = true, hasDashboardAccess = true, dash = dashboard(),
    )

    /**
     * §6's empty month, which is a different picture from a screen that has not loaded: every
     * figure is a real zero, no card carries a delta badge (there is nothing to compare to), the
     * sparklines fall back to their stubs and the loaded card says «Бу ой юк йўқ» rather than
     * «0 блок».
     */
    private fun emptyMonth() = HomeUiState(
        loading = false, error = null, today = emptyList(), pendingUploads = 0,
        permissionsResolved = true, hasDashboardAccess = true,
        dash = HomeDashboard(
            receivables = Money.ZERO, receivableOrders = 0,
            paidOrders = 0, partialOrders = 0, awaitingOrders = 0,
            booked = PeriodMoney(Money.ZERO, 0, null),
            bookedAllTime = AllTimeMoney(Money.ZERO, 0),
            bookedSeries = List(8) { BigDecimal.ZERO },
            collected = PeriodMoney(Money.ZERO, 0, null),
            collectedAllTime = AllTimeMoney(Money.ZERO, 0),
            collectedSeries = List(8) { BigDecimal.ZERO },
            aov = Aov(Money.ZERO, Money.ZERO, null),
            aovSeries = List(8) { BigDecimal.ZERO },
            activeCustomers = 0,
            todayArea = BigDecimal.ZERO,
            openDiscrepancies = 0,
            openDiscrepancyTotal = Money.ZERO,
            loadedThisMonth = null,
            currentMonthKey = "2026-09",
        ),
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

    /** A DRIVER: no dashboard permission at all, so §2.2–§2.7 are absent — not zeroed — and one
     *  card says why. The chrome stays: the bell and the avatar are local reads. */
    private fun noAccess() = HomeUiState(
        loading = false, error = null, permissionsResolved = true, hasDashboardAccess = false, dash = null,
    )

    private fun shoot(name: String, state: HomeUiState) {
        rule.setContent {
            EtalonTheme {
                HomeScreen(
                    s = state, me = owner, now = now, onRefresh = {},
                    onOpenOrder = {}, onOpenOrders = {}, onOpenAccount = {}, onOpenOutbox = {},
                    onOpenClients = {}, onOpenCalendarToday = {},
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
                        onOpenClients = {}, onOpenCalendarToday = {},
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
                        onOpenClients = {}, onOpenCalendarToday = {},
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
                        onOpenClients = {}, onOpenCalendarToday = {},
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

    @Test @Config(qualifiers = "w411dp-h891dp") fun light() = shoot("home_light", loaded())

    /** §6's empty month, and the assertion that it does not read as a month that traded nothing:
     *  the loaded card says so in words instead of printing a zero. */
    @Test @Config(qualifiers = "w411dp-h891dp") fun emptyMonthLight() {
        shoot("home_empty_month_light", emptyMonth())
        rule.onNodeWithText("Бу ой юк йўқ").assertExists()
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun noAccessLight() {
        shoot("home_no_access_light", noAccess())
        rule.onNodeWithText("Бу саҳифага рухсат йўқ — фақат ADMIN ва OWNER кира олади.").assertExists()
    }

    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun largeFont() = shoot("home_font13", loaded())

    /** The narrowest phone the app supports: the grid's two columns and the hero's three cells all
     *  come out of one 360 dp width. */
    @Test @Config(qualifiers = "w360dp-h800dp") fun narrowLight() = shoot("home_w360", loaded())
}
