package uz.etalon.crm.feature.home

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import com.github.takahirom.roborazzi.captureScreenRoboImage
import org.junit.Assert.assertEquals
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
import uz.etalon.crm.core.model.HomeSummary
import uz.etalon.crm.core.model.LoadedVolume
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.MonthBooked
import uz.etalon.crm.core.model.MonthCollected
import uz.etalon.crm.core.model.MonthOrders
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.PeriodMoney
import uz.etalon.crm.core.model.RecentOrder
import uz.etalon.crm.core.model.RegionOrders
import uz.etalon.crm.core.model.Role
import uz.etalon.crm.core.model.TodayDelivery
import uz.etalon.crm.core.model.TopCustomer
import uz.etalon.crm.core.model.Trend
import uz.etalon.crm.core.model.TrendDirection
import uz.etalon.crm.core.model.TrendPolarity
import uz.etalon.crm.core.model.monthScope
import uz.etalon.crm.core.ui.format.formatOrderNo
import java.math.BigDecimal
import java.time.Instant

/** What `SignedInShell` provides into [LocalNavPillInset] at Robolectric's 0 dp system navigation
 *  inset: the pill's 84 dp band alone, so this frame carries the clearance a real phone shows. */
private val SHELL_NAV_PILL_INSET = 84.dp

/**
 * The index of «Сўнгги буюртмалар» in a loaded `HomeScreen`'s list — the app bar, the hero, the
 * rail's section, §2.3b's chart, the grid's section, then §2.5, §2.6, §2.6b and §2.7. Scrolling the
 * list to its last item is what puts the bottom half in the frame; a `performScrollToNode` on the
 * donut would not move at all, because the donut's header already peeks into the unscrolled
 * viewport.
 */
private const val LAST_ITEM = 8

/** The index of August in the fixture's twelve months — the month `home_month_selected_light`
 *  picks, chosen because it is neither the current month nor the first of the window, so both the
 *  scoping and the trend-against-its-own-predecessor are visible in one frame. */
private const val AUGUST = 7

/**
 * Design §2's dashboard — drawn with the data the server actually sends, so the reviewer can lay a
 * frame beside the web dashboard and compare figure for figure.
 *
 * One screen is two frames, because one 891 dp viewport does not hold it: `home_light` is the top
 * (app-bar chrome over today's date, the receivables hero, the financial rail, the operational 2×2)
 * and `home_bottom_light` is the same state scrolled to the end (§2.5's payment donut, §2.6's top
 * clients, §2.7's latest orders).
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

    private val collectedRows = listOf(
        "5400000", "6100000", "4800000", "7200000", "6600000", "8100000",
        "7400000", "9200000", "8700000", "10400000", "11900000", "13500000",
    ).mapIndexed { i, v -> MonthCollected("2026-%02d".format(i + 1), Money.parse(v), paymentCount = i + 3) }

    private val collectedByMonth = collectedRows.map { it.collected.amount }

    /** The twelve `YYYY-MM` keys the chart's columns are labelled from. */
    private val monthKeys = (1..12).map { "2026-%02d".format(it) }

    /** §2.6b: two provinces and «Бошқа», ranked as the server ranks them — enough for three
     *  visibly different bars and one label long enough to prove the ellipsis. */
    private val regions = listOf(
        RegionOrders("Tashkent viloyati", "Тошкент вилояти", orderCount = 27, clientCount = 12, booked = Money.parse("512400000.00")),
        RegionOrders("Samarqand viloyati", "Самарқанд вилояти", orderCount = 14, clientCount = 6, booked = Money.parse("268900000.00")),
        RegionOrders("Qashqadaryo viloyati", "Қашқадарё вилояти", orderCount = 9, clientCount = 4, booked = Money.parse("134200000.00")),
        RegionOrders("Other", "Бошқа", orderCount = 5, clientCount = 3, booked = Money.parse("41800000.00")),
    )

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
        // The real division, not a hand-written series: the frame shows what the port computes.
        aovSeries = monthScope(summary(), 11).aovSeries.map { it.amount },
        activeCustomers = 42,
        todayArea = BigDecimal("247.50"), // 108,2 + 78,7 + 42,6 + 18,0 — the sum of `today`
        openDiscrepancies = 1,
        openDiscrepancyTotal = Money.parse("120000.00"),
        loadedThisMonth = LoadedVolume(
            monthKey = "2026-09", blocks = 1180, beamCount = 96,
            beamMeters = BigDecimal("512.4"), area = BigDecimal("318.60"), orderCount = 11,
        ),
        monthKey = "2026-09",
        isCurrentMonth = true,
        monthOrders = 12,
        topCustomers = topCustomers,
        chartBooked = bookedByMonth.map { it.booked },
        chartCollected = collectedRows.map { it.collected },
        chartMonthKeys = monthKeys,
        selectedMonthIdx = 11,
        currentMonthIdx = 11,
        yearOrders = ordersByMonth.sumOf { it.count },
        ordersByRegion = regions,
    )

    /**
     * The same twelve months as a payload, so the August frame is drawn by the REAL
     * [uz.etalon.crm.core.model.monthScope] port rather than by a hand-written dashboard: the
     * figures, the trends and the sparkline windows in `home_month_selected_light` are what the
     * arithmetic actually produces for that month.
     */
    private fun summary() = HomeSummary(
        today = today, todayArea = BigDecimal("247.50"),
        openDiscrepancies = 1, openDiscrepancyTotal = Money.parse("120000.00"),
        receivables = Money.parse("53268760.00"), receivableOrders = 6, receivablesTrend = null,
        paidOrders = 317, partialOrders = 13, awaitingOrders = 23,
        recent = recent,
        booked = PeriodMoney(Money.parse("184200000.00"), 12, null),
        bookedAllTime = AllTimeMoney(Money.parse("1284000000.00"), 512),
        collected = PeriodMoney(Money.parse("13500000.00"), 14, null),
        collectedAllTime = AllTimeMoney(Money.parse("1176400000.00"), 431),
        collectedByMonth = collectedRows,
        aov = Aov(Money.parse("15350000.00"), Money.parse("2507812.00"), null),
        activeCustomers = 42,
        bookedByMonth = bookedByMonth, ordersByMonth = ordersByMonth,
        monthKeys = monthKeys, currentMonthIdx = 11, currentMonthKey = "2026-09",
        loadedVolumeByMonth = listOf(
            LoadedVolume("2026-08", 940, 74, BigDecimal("401.2"), BigDecimal("254.10"), 8),
            LoadedVolume(
                monthKey = "2026-09", blocks = 1180, beamCount = 96,
                beamMeters = BigDecimal("512.4"), area = BigDecimal("318.60"), orderCount = 11,
            ),
        ),
        loadedThisMonth = null,
        topCustomers = topCustomers,
        ordersByRegion = regions,
    )

    /** §2.6, already ranked as the ViewModel hands them over: five rows whose figures fall away
     *  steeply, so the indigo bars are visibly five different lengths, and one name long enough to
     *  prove the ellipsis rather than assume it. */
    private val topCustomers = listOf(
        TopCustomer("c1", "Tashkent Tower LLC", Money.parse("214800000.00"), 38),
        TopCustomer("c2", "BuildPro Group", Money.parse("168300000.00"), 29),
        TopCustomer("c3", "Самарқанд Қурилиш Инвест Холдинг", Money.parse("96400000.00"), 17),
        TopCustomer("c4", "Yusupov & Sons", Money.parse("51900000.00"), 12),
        TopCustomer("c5", "Navoi Build", Money.parse("12700000.00"), 4),
    )

    /** §2.7's four rows: a paid one, a part-paid one, one still awaiting, and one with no address
     *  at all — the elision §2.7 asks for, photographed rather than assumed. */
    private val recent = listOf(
        RecentOrder(
            orderId = "o1", orderNumber = "2026-09-0004", clientName = "Tashkent Tower LLC",
            clientPhone = "998901112233", clientAddress = "Тошкент, Юнусобод, Амир Темур 12",
            status = OrderStatus.IN_PRODUCTION, scheduledAt = Instant.parse("2026-09-08T06:00:00Z"),
            totalPrice = Money.parse("18420000.00"), remaining = Money.parse("18420000.00"),
            totalArea = BigDecimal("108.20"), paymentState = PaymentState.AWAITING_PAYMENT,
        ),
        RecentOrder(
            orderId = "o2", orderNumber = "2026-09-0003", clientName = "Yusupov & Sons",
            clientPhone = "998901112244", clientAddress = "Бухоро, Эски шаҳар",
            status = OrderStatus.DISPATCHED, scheduledAt = Instant.parse("2026-09-07T06:00:00Z"),
            totalPrice = Money.parse("13350000.00"), remaining = Money.parse("7350000.00"),
            totalArea = BigDecimal("78.70"), paymentState = PaymentState.PARTIALLY_PAID,
        ),
        RecentOrder(
            orderId = "o3", orderNumber = "2026-09-0002", clientName = "BuildPro Group",
            clientPhone = "998901112255", clientAddress = null,
            status = OrderStatus.DELIVERED, scheduledAt = Instant.parse("2026-09-06T06:00:00Z"),
            totalPrice = Money.parse("7340840.00"), remaining = Money.ZERO,
            totalArea = BigDecimal("42.60"), paymentState = PaymentState.FULLY_PAID,
        ),
        RecentOrder(
            orderId = "o4", orderNumber = "2026-09-0001", clientName = "Navoi Build",
            clientPhone = "998901112266", clientAddress = "Навоий, Шимолий",
            status = OrderStatus.PLACED, scheduledAt = Instant.parse("2026-09-05T06:00:00Z"),
            totalPrice = Money.parse("3003520.00"), remaining = Money.parse("3003520.00"),
            totalArea = BigDecimal("18.00"), paymentState = PaymentState.AWAITING_PAYMENT,
        ),
    )

    private fun loaded() = HomeUiState(
        loading = false, error = null, today = today, recent = recent, pendingUploads = 2,
        permissionsResolved = true, hasDashboardAccess = true, dash = dashboard(),
    )

    /** §3's first load: nothing has arrived yet, so the screen is the skeleton under real chrome. */
    private fun firstLoad() = HomeUiState(
        loading = true, error = null, permissionsResolved = true, hasDashboardAccess = true, dash = null,
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
            monthKey = "2026-09",
            isCurrentMonth = true,
            monthOrders = 0,
            topCustomers = emptyList(),
            chartBooked = List(12) { Money.ZERO },
            chartCollected = List(12) { Money.ZERO },
            chartMonthKeys = monthKeys,
            selectedMonthIdx = 11,
            currentMonthIdx = 11,
            yearOrders = 0,
            ordersByRegion = emptyList(),
        ),
    )

    /**
     * §2.3b with an earlier month picked: every scoped line names August and the figures are
     * August's, computed by the port. The receivables hero above them does not move — it is a
     * point-in-time balance and says so.
     */
    private fun monthSelected() = loaded().copy(dash = dashboard(summary(), AUGUST))

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
                    onOpenClients = {}, onOpenCalendarToday = {}, onOpenOrdersList = {}, onSelectMonth = {},
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
                        onOpenClients = {}, onOpenCalendarToday = {}, onOpenOrdersList = {}, onSelectMonth = {},
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
                        onOpenClients = {}, onOpenCalendarToday = {}, onOpenOrdersList = {}, onSelectMonth = {},
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
                        onOpenClients = {}, onOpenCalendarToday = {}, onOpenOrdersList = {}, onSelectMonth = {},
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

    /**
     * §2.5–§2.7, which are below the fold of `home_light`: the payment donut with its legend, the
     * five top clients with their bars, and the four latest orders.
     *
     * The list is scrolled by its own tag rather than by `hasScrollAction()` — the financial rail
     * is a scrollable too, and a frame that silently photographed the wrong one would look right.
     */
    @Test @Config(qualifiers = "w411dp-h891dp") fun bottomLight() {
        rule.setContent {
            EtalonTheme {
                HomeScreen(
                    s = loaded(), me = owner, now = now, onRefresh = {},
                    onOpenOrder = {}, onOpenOrders = {}, onOpenAccount = {}, onOpenOutbox = {},
                    onOpenClients = {}, onOpenCalendarToday = {}, onOpenOrdersList = {}, onSelectMonth = {},
                )
            }
        }
        rule.onNodeWithTag(HOME_LIST_TAG).performScrollToIndex(LAST_ITEM)
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("screenshots/home_bottom_light.png")
    }

    /** §3's first load, mirroring `DashboardSkeleton.tsx`: the hero block, two kickers, the rail,
     *  the 2×2 and the three bottom cards — the same blocks in the same order as the screen they
     *  stand in for, under the real app bar. */
    @Test @Config(qualifiers = "w411dp-h891dp") fun skeletonLight() {
        shoot("home_skeleton_light", firstLoad())
        // Not a figure in sight: a skeleton that leaked a zero would read as a loaded month.
        rule.onNodeWithText("Тўлов ҳолати").assertDoesNotExist()
        rule.onNodeWithText("Бу саҳифага рухсат йўқ — фақат ADMIN ва OWNER кира олади.").assertDoesNotExist()
    }

    /** §2.7's two hand-offs, which are the only taps on this half of the screen: the order number
     *  opens that order, and «Барчаси →» opens the list. Asserted rather than left to the frame —
     *  a link drawn indigo and wired to nothing photographs exactly like a working one. */
    @Test @Config(qualifiers = "w411dp-h891dp") fun recentRowTapsReachTheirDestinations() {
        val opened = mutableListOf<String>()
        val listOpened = mutableListOf<Unit>()
        rule.setContent {
            EtalonTheme {
                HomeScreen(
                    s = loaded(), me = owner, now = now, onRefresh = {},
                    onOpenOrder = { opened += it }, onOpenOrders = {}, onOpenAccount = {}, onOpenOutbox = {},
                    onOpenClients = {}, onOpenCalendarToday = {}, onOpenOrdersList = { listOpened += Unit },
                    onSelectMonth = {},
                )
            }
        }
        rule.onNodeWithTag(HOME_LIST_TAG).performScrollToNode(hasText("Сўнгги буюртмалар"))
        rule.waitForIdle()

        // «№ 09‑0003» — the second row's, so a tap that always reported the first would fail here.
        rule.onNodeWithText(formatOrderNo("2026-09-0003")).performClick()
        assertEquals(listOf("o2"), opened)
        assertEquals(emptyList<Unit>(), listOpened)

        rule.onNodeWithText("Барчаси →").performClick()
        assertEquals(listOf(Unit), listOpened)
        // The header's action is not the row's: it opened no order.
        assertEquals(listOf("o2"), opened)
    }

    /** §6's empty month, and the assertion that it does not read as a month that traded nothing:
     *  the loaded card says so in words instead of printing a zero. */
    @Test @Config(qualifiers = "w411dp-h891dp") fun emptyMonthLight() {
        shoot("home_empty_month_light", emptyMonth())
        rule.onNodeWithText("Бу ой юк йўқ").assertExists()
        // §2.6 and §2.7's own empty states are below this frame's fold, so they are asserted rather
        // than photographed: each is a sentence, not a zero, for the same reason the loaded card
        // above says so in words.
        rule.onNodeWithTag(HOME_LIST_TAG).performScrollToIndex(LAST_ITEM)
        rule.waitForIdle()
        rule.onNodeWithText("Ҳали тушум йўқ").assertExists()
        rule.onNodeWithText("Ҳали буюртма йўқ").assertExists()
        // §2.6b's own empty state, for the same reason: a province table with no rows says so.
        rule.onNodeWithText("Маълумот йўқ").assertExists()
    }

    /**
     * The parity walk's one finding (Task 6): a month whose loaded row EXISTS but counts nothing.
     * The server sends such a row for every month in the window, so this — not a missing row — is
     * what an unloaded month actually looks like on the wire. The web says «Бу ойда юклаш йўқ»
     * there (`OperationalKPIs.tsx:173`); the phone must not print «0 та буюртма · 0 та балка»,
     * which claims a month that was measured and traded nothing.
     */
    @Test @Config(qualifiers = "w411dp-h891dp") fun aLoadedRowOfZerosSaysNothingWasLoaded() {
        val zeroRow = loaded().let {
            it.copy(
                dash = it.dash!!.copy(
                    loadedThisMonth = LoadedVolume(
                        monthKey = "2026-09", blocks = 0, beamCount = 0,
                        beamMeters = BigDecimal.ZERO, area = BigDecimal.ZERO, orderCount = 0,
                    ),
                ),
            )
        }
        rule.setContent {
            EtalonTheme {
                HomeScreen(
                    s = zeroRow, me = owner, now = now, onRefresh = {},
                    onOpenOrder = {}, onOpenOrders = {}, onOpenAccount = {}, onOpenOutbox = {},
                    onOpenClients = {}, onOpenCalendarToday = {}, onOpenOrdersList = {}, onSelectMonth = {},
                )
            }
        }
        rule.onNodeWithTag(HOME_LIST_TAG).performScrollToNode(hasText("Юкланган ҳажм · сен"))
        rule.waitForIdle()
        rule.onNodeWithText("Бу ой юк йўқ").assertExists()
        rule.onNodeWithText("0 та буюртма · 0 та балка").assertDoesNotExist()
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun noAccessLight() {
        shoot("home_no_access_light", noAccess())
        rule.onNodeWithText("Бу саҳифага рухсат йўқ — фақат ADMIN ва OWNER кира олади.").assertExists()
    }

    /**
     * §2.3b with August picked in the chart: the kicker reads «МОЛИЯВИЙ ҲОЛАТ · АВГУСТ ОЙИ», the
     * rail's first lines «N та буюртма · авг ойи» / «N та тўлов · авг ойи», the loaded tile
     * «Юкланган ҳажм · авг», and the chart's own sub-line «авг ойи · 16 та буюртма». The
     * receivables hero above them is unchanged, with its «Ой бўйича бўлинмайди» line intact.
     *
     * The state is built by the real port ([monthSelected] → `dashboard(summary(), AUGUST)`), so
     * every figure in this frame is one the arithmetic produced rather than one typed in.
     */
    @Test @Config(qualifiers = "w411dp-h891dp") fun monthSelectedLight() {
        shoot("home_month_selected_light", monthSelected())
        rule.onNodeWithText("МОЛИЯВИЙ ҲОЛАТ · АВГУСТ ОЙИ").assertExists()
        rule.onNodeWithText("16 та буюртма · авг ойи").assertExists()
        // The hero does not follow the picker — it is a balance, not a month's total.
        rule.onNodeWithText("Ой бўйича бўлинмайди · бугунги қолдиқ").assertExists()
    }

    /** §2.6b, which is below the fold of both other frames: four provinces, each with its client
     *  count, its share bar and its booked sum, in the server's own ranking. */
    @Test @Config(qualifiers = "w411dp-h891dp") fun regionsLight() {
        rule.setContent {
            EtalonTheme {
                HomeScreen(
                    s = loaded(), me = owner, now = now, onRefresh = {},
                    onOpenOrder = {}, onOpenOrders = {}, onOpenAccount = {}, onOpenOutbox = {},
                    onOpenClients = {}, onOpenCalendarToday = {}, onOpenOrdersList = {}, onSelectMonth = {},
                )
            }
        }
        rule.onNodeWithTag(HOME_LIST_TAG).performScrollToNode(hasText("Ҳудудлар бўйича буюртмалар"))
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("screenshots/home_regions_light.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun largeFont() = shoot("home_font13", loaded())

    /**
     * The bottom half at font scale 1.3 — the one frame Task 4 left unphotographed and the one
     * Task 5's two new cards make worth having: the donut's centre, the top-client rows, the
     * region rows and the recent rows all hold long Cyrillic names at 13 sp without clipping, and
     * the names that cannot fit ellipsize rather than being cut mid-glyph.
     */
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun bottomLargeFont() {
        rule.setContent {
            EtalonTheme {
                HomeScreen(
                    s = loaded(), me = owner, now = now, onRefresh = {},
                    onOpenOrder = {}, onOpenOrders = {}, onOpenAccount = {}, onOpenOutbox = {},
                    onOpenClients = {}, onOpenCalendarToday = {}, onOpenOrdersList = {}, onSelectMonth = {},
                )
            }
        }
        rule.onNodeWithTag(HOME_LIST_TAG).performScrollToIndex(LAST_ITEM)
        rule.waitForIdle()
        rule.onRoot().captureRoboImage("screenshots/home_bottom_font13.png")
    }

    /** The narrowest phone the app supports: the grid's two columns and the hero's three cells all
     *  come out of one 360 dp width. */
    @Test @Config(qualifiers = "w360dp-h800dp") fun narrowLight() = shoot("home_w360", loaded())
}
