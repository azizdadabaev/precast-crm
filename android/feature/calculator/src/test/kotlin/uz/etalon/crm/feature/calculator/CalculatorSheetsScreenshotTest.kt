package uz.etalon.crm.feature.calculator

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.hasScrollAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextInput
import com.github.takahirom.roborazzi.captureScreenRoboImage
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flowOf
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.calc.SlabRow
import uz.etalon.crm.core.calc.autoPickedRate
import uz.etalon.crm.core.calc.beamSchedule
import uz.etalon.crm.core.calc.computeOrderTotals
import uz.etalon.crm.core.calc.projectTotals
import uz.etalon.crm.core.calc.recomputeRow
import uz.etalon.crm.core.data.ClientsRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.SessionPricing
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.CapacityMonth
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.Pricing
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.testing.CalendarFixtures
import uz.etalon.crm.core.testing.FakeEtalonApi
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatCountBare
import uz.etalon.crm.core.ui.format.formatMoney
import uz.etalon.crm.core.ui.regions.ParsedAddress
import java.math.BigDecimal
import java.time.LocalDate
import java.time.YearMonth

/** §7's first fixture — «Зал» 5,2 × 7,1, whose beam length puts the engine in the 180 000 bracket. */
private const val AUTO_PRICE = 180_000.0
/** The tier the frame chooses over it: a mark-up, and the direction the second tile must show. */
private const val CHOSEN_PRICE = 230_000.0

/** The capture's own customer and the costs agreed with them. */
private const val CLIENT_NAME = "Karimov LLC"
private const val CLIENT_PHONE = "935554466"
private const val DISCOUNT_PERCENT = 5.0
private const val DELIVERY = 300_000.0

/**
 * The percentage that lands the discount on an exact half: the three fixtures with «Зал» overridden
 * to [CHOSEN_PRICE] come to 15 456 460, and 2,5 % of that is 386 411,50. Rounded on its own that
 * line would print one UZS more than the column's own arithmetic allows — see [rollupLines].
 */
private const val HALF_DISCOUNT_PERCENT = 2.5
private const val HALF_SUBTOTAL = 15_456_460L
private const val HALF_DISCOUNT = 386_411L
private const val HALF_TOTAL = 15_370_049L

/** The figures above as the sheet writes them — U+202F groups and all — built rather than spelt,
 *  so no separator can be mistyped into a test that then passes for the wrong reason. */
private fun uzs(whole: Long): String = formatMoney(Money(BigDecimal.valueOf(whole)))

/** A fixed day, never `LocalDate.now()`: a baseline that re-dates itself every morning fails
 *  `verifyRoborazziDebug` on a frame nobody has touched. A delivery day the factory has nothing
 *  on yet, in the shared September — «мавжуд» beside the field, which is the answer the seller
 *  is asking for. */
private val SCHEDULED = LocalDate.of(2026, 9, 20)

/** «Бугун» in the grid, and the floor under it — the same 12 September every calendar baseline
 *  in the app is recorded against ([CalendarFixtures.TODAY]). */
private val TODAY = CalendarFixtures.TODAY

/** The date row's own value, and the content description of the day cell that carries it. */
private val SCHEDULED_TEXT = "20 сен 2026"

/** «Бугун» as the row and the cell both write it — the fixture's 12 September, 685 м² over a
 *  600 м² ceiling, which is the one day in reach that earns the longest tag. */
private val TODAY_TEXT = "12 сен 2026"

/** A bare date in the same month, for the two frames with no figures behind them. */
private const val EIGHTEENTH_TEXT = "18 сен 2026"

/** The grid's title, its failure banner and its retry, and the two tiers the frames show. */
private const val GRID_TITLE = "Етказиб бериш кунини танланг"
private const val GRID_ERROR = "Кун сиғими маълумоти олинмади"
private const val RETRY = "Қайта уриниш"
private const val OFFLINE = "Интернет алоқаси йўқ"
private const val AVAILABLE_TAG = "мавжуд"
private const val OVERBOOKED_TAG = "тўлиб кетган"

/** «Навбатга қўйиш», the offline half of the action pair. */
private const val QUEUE = "Навбатга қўйиш"

private class SheetsInertSessionPricing : SessionPricing {
    override val pricing: StateFlow<Pricing?> = MutableStateFlow(null)
}

/** The shared September behind the date grid — one month for every module (`CalendarFixtures`),
 *  so this picker and Жадвал photograph the same figures. Any other month is left in flight: the
 *  frames never page, and a month invented here would be a second fixture.
 *
 *  [outcome] is what the month arrives as, so the same fixture photographs R17's two failure
 *  states: a month still in flight, and one that never came. */
private class FixtureCapacity(
    private val outcome: Resource<CapacityMonth> = Resource.Success(CalendarFixtures.september),
) : CapacitySource {
    override fun observe(month: YearMonth): Flow<Resource<CapacityMonth>> = flowOf(
        if (month == CalendarFixtures.MONTH) outcome else Resource.Loading(null),
    )
    override suspend fun refresh(month: YearMonth) = Result.success(Unit)
}

/**
 * The three modal sheets §3.4 gives the calculator: «Тарифни танланг» (RateSheet), the navy
 * «Нархни ўзгартириш» confirmation (RateConfirm) and «Буюртмани расмийлаштириш» (PlaceOrderSheet,
 * carrying D10's relocated discount, delivery and other cost).
 *
 * Whole-screen captures, not `onRoot()`: each is a `ModalBottomSheet` living in a window of its
 * own, and the scrim behind it is part of what §3.4 specifies.
 *
 * Light only (D6). Every figure is the engine's — the rooms are recomputed here and rolled up by
 * `computeOrderTotals`, exactly as `CalculatorViewModel.withTotals` does it.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class CalculatorSheetsScreenshotTest {
    @get:Rule val rule = createComposeRule()

    private fun zal(): SlabRow = recomputeRow(SlabRow(id = "zal", name = "Зал", innerWidth = 5.2, innerLength = 7.1))

    /** The §7 fixtures as a placeable quote: three priced rooms, the full client, and D10's two
     *  agreed costs. Built the way `withTotals` builds it — PERCENT mode passes 0 as the amount. */
    private fun placeableState(
        queueOffered: Boolean = false,
        percent: Double = DISCOUNT_PERCENT,
        rows: List<SlabRow> = listOf(
            zal(),
            recomputeRow(SlabRow(id = "r2", name = "Хона 1", innerWidth = 4.0, innerLength = 6.0)),
            recomputeRow(SlabRow(id = "r3", name = "Ошхона", innerWidth = 3.6, innerLength = 4.5)),
        ),
    ): CalculatorUiState {
        return CalculatorUiState(
            rows = rows,
            drafts = rows.associate { it.id to draftOf(it) },
            discountMode = DiscountMode.PERCENT,
            discountPercent = percent,
            deliveryCost = DELIVERY,
            totals = projectTotals(rows, percent, 0.0),
            orderTotals = computeOrderTotals(rows, percent, 0.0, DELIVERY, 0.0),
            schedule = beamSchedule(rows),
            canWrite = true,
            clientName = CLIENT_NAME,
            clientPhoneDigits = CLIENT_PHONE,
            clientAddress = ParsedAddress("Самарқанд", "Регистон", "Мирзо кўчаси, 14"),
            clientFormOpen = false,
            queueOffered = queueOffered,
        )
    }

    /** The sheet edits the three money fields THROUGH the ViewModel, so it needs one; these frames
     *  photograph a state that is already typed, so nothing here is ever called. */
    private fun vm(capacity: CapacitySource = FixtureCapacity()) = CalculatorViewModel(
        session = SheetsInertSessionPricing(),
        permissions = PermissionGate { true },
        clients = ClientsRepository(object : FakeEtalonApi() {}, PermissionGate { true }),
        capacity = capacity,
    )

    /**
     * The place-order sheet as the app itself mounts it: the fixture quote, plus the two fields
     * the sheet's own actions change on the ViewModel — the open date grid and the months it has
     * loaded. Everything else on screen is the static quote these frames are about.
     */
    private fun liveSheet(
        s: CalculatorUiState,
        vm: CalculatorViewModel,
        initialScheduledAt: LocalDate = SCHEDULED,
    ) = screen {
        val live by vm.state.collectAsState()
        PlaceOrderSheet(
            state = s.copy(dateGrid = live.dateGrid, capacityMonths = live.capacityMonths),
            vm = vm, onDismiss = {}, onPlace = { _, _ -> }, onQueue = { _, _ -> },
            initialScheduledAt = initialScheduledAt, today = TODAY,
        )
    }

    private fun screen(content: @androidx.compose.runtime.Composable () -> Unit) {
        rule.setContent {
            EtalonTheme {
                Box(Modifier.fillMaxSize().background(EtalonColors.page)) { content() }
            }
        }
        rule.waitForIdle()
    }

    /** «Тарифни танланг»: «Авто» selected over the room's own 180 000, and the catalogue tier that
     *  equals it carrying the «авто» mini tag — the row that looks like an override and is not. */
    @Test fun rateSheetLight() {
        val row = zal()
        assertEquals("the tagged tier is the engine's own pick", AUTO_PRICE, autoPickedRate(row), 0.0)
        screen { RateSheet(row = row, onDismiss = {}, onPick = {}) }
        captureScreenRoboImage("screenshots/rate_sheet_light.png")
    }

    /** The navy confirmation for 230 000 against an auto 180 000 — «↑ устама», with the mandatory
     *  reason typed so «Тасдиқлаш» is live and the counter reads a real figure (D5). */
    @Test fun rateConfirmLight() {
        screen { RateConfirm(row = zal(), price = CHOSEN_PRICE, onDismiss = {}, onConfirm = {}) }
        rule.onNodeWithContentDescription("Сабаб (мажбурий)").performTextInput("Йирик буюртма")
        rule.waitForIdle()
        captureScreenRoboImage("screenshots/rate_confirm_light.png")
    }

    /**
     * «Буюртмани расмийлаштириш» with everything filled in: the client, a date, D10's 5 % discount
     * and 300 000 delivery, and the roll-up they produce.
     *
     * The date is re-picked THROUGH the grid rather than merely seeded, because that is the only
     * way the app itself produces the tier tag §7 puts beside the field: the row opens the grid,
     * the day is tapped, the grid closes and the month it loaded stays in hand. The frame moved
     * from its phase-2 baseline by exactly that tag.
     */
    @Test fun placeOrderLight() {
        liveSheet(placeableState(), vm())
        rule.onNodeWithText(SCHEDULED_TEXT).performClick()
        rule.waitForIdle()
        rule.onNodeWithContentDescription(SCHEDULED_TEXT).performClick()
        rule.waitForIdle()
        // Picked, the grid gone, and the day's load named beside the date.
        rule.onNodeWithText(GRID_TITLE).assertDoesNotExist()
        rule.onNodeWithText(AVAILABLE_TAG).assertExists()
        // The two relocated figures are on the sheet, and the roll-up is the engine's.
        rule.onNodeWithText("Чегирма 5%").assertExists()
        rule.onNodeWithText("Етказиш").assertExists()
        captureScreenRoboImage("screenshots/place_order_light.png")
    }

    /**
     * §7: the date row opens the SAME capacity grid Жадвал draws, read-only, over the place-order
     * sheet — the shared September, «Бугун» on the 12th, the picked 20th navy, and every day
     * before today faded to 35 % and inert. One tap picks a day and closes it; «Бекор қилиш»
     * leaves the date alone.
     */
    @Test fun placeOrderDateGridLight() {
        liveSheet(placeableState(), vm())
        rule.onNodeWithText(SCHEDULED_TEXT).performClick()
        rule.waitForIdle()
        rule.onNodeWithText(GRID_TITLE).assertExists()
        // The month's own summary, straight off the fixture: 66 буюртма · 4 552 м². Built with
        // the app's own formatters — the group separator is U+202F, which cannot be typed here.
        assertEquals("the fixture's September", 66, CalendarFixtures.september.totalOrders)
        val summary = "${formatCountBare(CalendarFixtures.september.totalOrders)} буюртма · " +
            formatArea(CalendarFixtures.september.totalArea)
        rule.onNodeWithText(summary).assertExists()
        captureScreenRoboImage("screenshots/place_order_date_grid_light.png")
    }

    /**
     * **R17 at the screen.** The month never came: a banner with «Қайта уриниш» over a grid that
     * still works. Every in-range day is a bare date and every one of them is still tappable —
     * this is the ONLY way to name a delivery date, and without one the order can be neither
     * placed nor queued, which offline is the one thing that has to keep working.
     */
    @Test fun placeOrderDateGridErrorLight() {
        liveSheet(placeableState(), vm(FixtureCapacity(Resource.Error(null, AppError.Network(OFFLINE)))))
        rule.onNodeWithText(SCHEDULED_TEXT).performClick()
        rule.waitForIdle()
        rule.onNodeWithText(GRID_ERROR).assertExists()
        rule.onNodeWithText(RETRY).assertExists()
        captureScreenRoboImage("screenshots/place_order_date_grid_error_light.png")

        // And the date is still pickable, with no tier invented for it.
        rule.onNodeWithContentDescription(EIGHTEENTH_TEXT).performClick()
        rule.waitForIdle()
        rule.onNodeWithText(GRID_ERROR).assertDoesNotExist()
        rule.onNodeWithText(EIGHTEENTH_TEXT).assertExists()
        rule.onNodeWithText(AVAILABLE_TAG).assertDoesNotExist()
    }

    /** The same rule while the month is still in flight: dates, not a skeleton — a skeleton has
     *  nothing to tap, and an in-flight month must not be one more moment without a date. */
    @Test fun placeOrderDateGridLoadingLight() {
        liveSheet(placeableState(), vm(FixtureCapacity(Resource.Loading(null))))
        rule.onNodeWithText(SCHEDULED_TEXT).performClick()
        rule.waitForIdle()
        rule.onNodeWithText(GRID_TITLE).assertExists()
        rule.onNodeWithContentDescription(EIGHTEENTH_TEXT).assertHasClickAction()
        captureScreenRoboImage("screenshots/place_order_date_grid_loading_light.png")
    }

    /**
     * The date row at font scale 1,3 carrying the LONGEST tag there is — «тўлиб кетган», the
     * fixture's own 12 September (685 м² over a 600 м² ceiling), which is also «Бугун» and so the
     * earliest day the picker offers. The date is the half that ellipsises if the row runs out:
     * a tag clipped down the middle would be unreadable, where «12 сен 20…» is not.
     */
    @Test @Config(sdk = [36], qualifiers = "w411dp-h891dp", fontScale = 1.3f)
    fun placeOrderFont13() {
        liveSheet(placeableState(), vm(), initialScheduledAt = TODAY)
        rule.onNodeWithText(TODAY_TEXT).performClick()
        rule.waitForIdle()
        rule.onNodeWithContentDescription(TODAY_TEXT, substring = true).performClick()
        rule.waitForIdle()
        rule.onNodeWithText(OVERBOOKED_TAG).assertExists()
        captureScreenRoboImage("screenshots/place_order_font13.png")
    }

    /**
     * The same sheet after a placement died on the network: «Навбатга қўйиш» appears under the
     * primary action, and only then (a server refusal is not queueable).
     *
     * Scrolled to the foot, unlike [placeOrderLight]: the form plus the roll-up is taller than a
     * 411 × 891 phone, so the two actions are exactly what the other frame cannot show.
     */
    @Test fun placeOrderQueueLight() {
        val s = placeableState(queueOffered = true)
        screen {
            PlaceOrderSheet(
                state = s, vm = vm(), onDismiss = {}, onPlace = { _, _ -> }, onQueue = { _, _ -> },
                initialScheduledAt = SCHEDULED,
            )
        }
        rule.onNode(hasScrollAction()).performScrollToNode(hasText(QUEUE))
        rule.waitForIdle()
        rule.onNodeWithText(QUEUE).assertExists()
        captureScreenRoboImage("screenshots/place_order_queue_light.png")
    }

    /**
     * The roll-up on a discount that lands on an exact half — «Зал» at the 230 000 tier, 2,5 % off
     * and 300 000 delivery. The four printed lines must ADD UP: before [rollupLines] the discount
     * rounded to «386 412» on its own while «Жами» came from 15 370 048,50, and a customer adding
     * the column got a UZS less than the bottom line.
     *
     * Asserted before it is photographed, so the baseline can never be re-recorded around a column
     * that has quietly stopped summing.
     */
    @Test fun placeOrderHalfDiscountLight() {
        val overridden = zal().let {
            recomputeRow(it.copy(m2PriceOverride = true, m2PriceOverrideValue = CHOSEN_PRICE, m2PriceReason = "Йирик буюртма"))
        }
        val s = placeableState(
            percent = HALF_DISCOUNT_PERCENT,
            rows = listOf(
                overridden,
                recomputeRow(SlabRow(id = "r2", name = "Хона 1", innerWidth = 4.0, innerLength = 6.0)),
                recomputeRow(SlabRow(id = "r3", name = "Ошхона", innerWidth = 3.6, innerLength = 4.5)),
            ),
        )
        assertEquals(
            "the column adds up",
            HALF_TOTAL,
            HALF_SUBTOTAL - HALF_DISCOUNT + DELIVERY.toLong(),
        )
        screen {
            PlaceOrderSheet(
                state = s, vm = vm(), onDismiss = {}, onPlace = { _, _ -> }, onQueue = { _, _ -> },
                initialScheduledAt = SCHEDULED,
            )
        }
        rule.onNode(hasScrollAction()).performScrollToNode(hasText(uzs(HALF_TOTAL)))
        rule.waitForIdle()
        rule.onNodeWithText(uzs(HALF_SUBTOTAL)).assertExists()
        // `calc_place_minus` is «−%1$s»: U+2212 MINUS SIGN (not a hyphen) straight against the
        // figure, no space between.
        rule.onNodeWithText("−${uzs(HALF_DISCOUNT)}").assertExists()
        rule.onNodeWithText(uzs(HALF_TOTAL)).assertExists()
        captureScreenRoboImage("screenshots/place_order_half_discount_light.png")
    }
}
