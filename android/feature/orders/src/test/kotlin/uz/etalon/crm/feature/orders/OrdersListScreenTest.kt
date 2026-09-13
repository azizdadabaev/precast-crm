package uz.etalon.crm.feature.orders

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipe
import androidx.compose.ui.test.swipeLeft
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.calendar.GRID_TEST_TAG
import uz.etalon.crm.core.designsystem.components.LocalNavPillInset
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.ClientRef
import uz.etalon.crm.core.model.Money
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
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

/**
 * What the Orders tab's two views do, as opposed to what they look like — the half
 * `OrdersListScreenshotTest` cannot photograph.
 *
 * The swipe trio is the reason this file exists at all. The month grid answers a horizontal drag
 * and the page under it answers a vertical one, and the two gestures start identically; Task 4's
 * card could only be tested in isolation, where there is no list to compete with it. Here the grid
 * is where it really lives — inside the calendar's scrolling column — so a drag that the list took
 * over can be seen not to page the month as well.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class OrdersListScreenTest {
    @get:Rule val rule = createComposeRule()

    private fun order(id: String, area: String, total: String) = OrderSummary(
        id = id,
        orderNumber = "2026-09-00$id",
        status = OrderStatus.PLACED,
        paymentState = PaymentState.AWAITING_PAYMENT,
        totalPrice = Money.parse(total),
        confirmedPaid = Money.ZERO,
        totalArea = BigDecimal(area),
        totalBlocks = 0,
        totalBeams = 0,
        scheduledAt = Instant.parse("2026-09-12T06:00:00Z"),
        placedAt = Instant.parse("2026-09-01T06:00:00Z"),
        client = ClientRef("c-$id", "Tashkent Tower LLC", "998901112233", null),
    )

    private fun sheet(): DaySheetState {
        val t = CalendarFixtures.THRESHOLDS
        val day = CalendarFixtures.day(12)
        val rows = listOf(order("1", "210.00", "35700000.00"), order("2", "475.00", "80750000.00"))
        return DaySheetState(
            day = CalendarFixtures.SELECTED,
            capacity = day,
            tier = tierFor(day.totalArea, t),
            heavy = t.heavy,
            orders = Resource.Success(rows),
            moneyTotal = rows.fold(Money.ZERO) { acc, o -> acc + o.totalPrice },
        )
    }

    private fun calendar(day: LocalDate? = CalendarFixtures.SELECTED) = OrdersListUiState(
        view = OrdersView.CALENDAR,
        cursorMonth = CalendarFixtures.MONTH,
        day = day,
        capacity = Resource.Success(CalendarFixtures.september),
        daySheet = if (day == null) null else sheet(),
        canExport = true,
    )

    /** Every callback the screen can fire, counted. */
    private class Spy {
        var prev = 0
        var next = 0
        val days = mutableListOf<LocalDate?>()
        val views = mutableListOf<OrdersView>()
    }

    /** [state] is a lambda so a test can change it after the screen is up. */
    private fun show(spy: Spy = Spy(), state: () -> OrdersListUiState): Spy {
        rule.setContent {
            EtalonTheme {
                CompositionLocalProvider(LocalNavPillInset provides 84.dp) {
                    OrdersListScreen(
                        s = state(), today = CalendarFixtures.TODAY,
                        onQuery = {}, onStatus = {}, onPayment = {},
                        onDay = { spy.days += it },
                        onView = { spy.views += it },
                        onPrevMonth = { spy.prev++ }, onNextMonth = { spy.next++ },
                        onRefreshCalendar = {}, onExport = {}, onExportConsumed = {},
                        onDismissExportError = {},
                        onRefresh = {}, onLoadMore = {}, onOpen = {}, onNewOrder = {},
                    )
                }
            }
        }
        return spy
    }

    // ── The swipe trio ───────────────────────────────────────────────────────────────────────

    /** A flick to the left is the next month, once — not once per pointer event, and not twice
     *  because the gesture also ended past the threshold in the other direction. */
    @Test fun `a horizontal swipe over the grid pages the month exactly once`() {
        val spy = show { calendar() }
        rule.onNodeWithTag(GRID_TEST_TAG).performTouchInput { swipeLeft() }
        rule.waitForIdle()
        assertEquals(1, spy.next)
        assertEquals(0, spy.prev)
    }

    /**
     * The same finger, moved down the page instead: the calendar's own column scrolls and the
     * month does not move. A planner reading the last week of a month at font scale 1,3 scrolls
     * over the grid constantly, and a month change under that finger loses their place.
     */
    @Test fun `a vertical swipe over the grid scrolls the page and does not page the month`() {
        val spy = show { calendar() }
        val before = rule.onNodeWithTag(GRID_TEST_TAG).getUnclippedBoundsInRoot().top
        rule.onNodeWithTag(GRID_TEST_TAG).performTouchInput { swipeUp() }
        rule.waitForIdle()
        assertEquals(0, spy.next)
        assertEquals(0, spy.prev)
        val after = rule.onNodeWithTag(GRID_TEST_TAG).getUnclippedBoundsInRoot().top
        assertTrue("the grid did not scroll: $before -> $after", after < before)
    }

    /**
     * The awkward one: a drag that is mostly down but drifts sideways. Whichever gesture claims
     * it, the other must not also act — the list scrolling *and* the month changing is the
     * failure the drag-cancel guard exists for (`onDragStopped` fires on a cancelled drag too,
     * which is what the grid used to page on).
     */
    @Test fun `a diagonal drag does not both scroll and page`() {
        val spy = show { calendar() }
        val before = rule.onNodeWithTag(GRID_TEST_TAG).getUnclippedBoundsInRoot().top
        rule.onNodeWithTag(GRID_TEST_TAG).performTouchInput {
            val start = center
            swipe(start, Offset(start.x - 150f, start.y - 300f), durationMillis = 200)
        }
        rule.waitForIdle()
        val after = rule.onNodeWithTag(GRID_TEST_TAG).getUnclippedBoundsInRoot().top
        val scrolled = after < before
        val paged = spy.next + spy.prev > 0
        assertTrue("the drag both scrolled the page and paged the month", !(scrolled && paged))
    }

    // ── The rest of the tab ──────────────────────────────────────────────────────────────────

    /**
     * The acceptance's «no layout jump», repeated where it actually matters. Task 4 proved the card
     * does not change size when a day is selected; this proves the sheet growing *under* it inside
     * the calendar's scrolling column does not push it either. The grid is measured rather than
     * the card, because the grid is inside the card and carries the only tag in the tree.
     */
    @Test fun `the day sheet grows under the grid without moving it`() {
        var state by mutableStateOf(calendar(day = null))
        show { state }
        val before = rule.onNodeWithTag(GRID_TEST_TAG).getUnclippedBoundsInRoot()
        state = calendar()
        rule.waitForIdle()
        assertEquals(before, rule.onNodeWithTag(GRID_TEST_TAG).getUnclippedBoundsInRoot())
    }

    /** §3: the day chip clears the shared filter. The × is the affordance; the pill is the target. */
    @Test fun `the day chip clears the day filter`() {
        val spy = show { OrdersListUiState(day = CalendarFixtures.SELECTED) }
        rule.onNodeWithContentDescription("12 сен кун фильтрини олиб ташлаш").performClick()
        assertEquals(listOf<LocalDate?>(null), spy.days)
    }

    /** §5: the export button exists only for an operator the server would let export. */
    @Test fun `the export button is drawn only with the permission`() {
        show { calendar() }
        rule.onNodeWithContentDescription("Excel захираси").assertIsDisplayed()
    }

    @Test fun `without the permission the header action slot is empty`() {
        show { calendar().copy(canExport = false) }
        rule.onNodeWithContentDescription("Excel захираси").assertDoesNotExist()
        // And «+ Янги» does not creep in to fill it: that button belongs to Рўйхат.
        rule.onNodeWithText("Янги").assertDoesNotExist()
    }

    /** The switch reports the view the operator asked for; keeping the filters across it is the
     *  ViewModel's job (`OrdersListViewModelTest`), which is where it is proven. */
    @Test fun `the switch asks for the other view`() {
        val spy = show { OrdersListUiState() }
        rule.onNodeWithText("Жадвал").performClick()
        assertEquals(listOf(OrdersView.CALENDAR), spy.views)
    }
}
