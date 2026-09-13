package uz.etalon.crm.feature.orders

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.Modifier
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
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.CapacityDay
import uz.etalon.crm.core.model.ClientRef
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.tierFor
import uz.etalon.crm.core.testing.CalendarFixtures
import uz.etalon.crm.feature.orders.calendar.DaySheet
import uz.etalon.crm.feature.orders.list.DaySheetState
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

/**
 * The navy day sheet (design §4.5) on the acceptance's own day: 12 September 2026, 685 м² against
 * a 600 м² ceiling — «тўлиб кетган» — with the five orders that make it up, their blocks, and the
 * money they come to. The empty frame is the other half of the sheet's job: a day with room, and
 * the wording that says how much of it is left.
 *
 * Nothing reads the clock; the title is built from the state's own [LocalDate].
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class DaySheetScreenshotTest {
    @get:Rule val rule = createComposeRule()

    private fun order(
        id: String,
        number: String,
        client: String,
        status: OrderStatus,
        area: String,
        total: String,
        paid: String,
    ) = OrderSummary(
        id = id,
        orderNumber = number,
        status = status,
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
        scheduledAt = Instant.parse("2026-09-12T05:00:00Z"),
        placedAt = Instant.parse("2026-09-01T05:00:00Z"),
        client = ClientRef("c-$id", client, "998901112233", null),
    )

    /** 210,00 + 168,50 + 142,00 + 96,50 + 68,00 = 685,00 м² — the cell's own figure, split five
     *  ways, so the sheet's hero and its rows agree. */
    private val orders = listOf(
        order("1", "2026-09-0021", "Tashkent Tower LLC", OrderStatus.IN_PRODUCTION, "210.00", "35700000.00", "35700000.00"),
        order("2", "2026-09-0022", "Fergana Dom", OrderStatus.PLACED, "168.50", "28645000.00", "10000000.00"),
        order("3", "2026-09-0023", "Yusupov & Sons", OrderStatus.LOADED, "142.00", "24140000.00", "0.00"),
        order("4", "2026-09-0024", "Navoi Build", OrderStatus.DISPATCHED, "96.50", "16405000.00", "16405000.00"),
        order("5", "2026-09-0025", "Karimov LLC", OrderStatus.DELIVERED, "68.00", "11560000.00", "5000000.00"),
    )

    private fun state(
        day: LocalDate,
        capacity: CapacityDay,
        rows: Resource<List<OrderSummary>>,
    ): DaySheetState {
        val t = CalendarFixtures.THRESHOLDS
        val loaded = rows.dataOrNull.orEmpty()
        return DaySheetState(
            day = day,
            capacity = capacity,
            tier = tierFor(capacity.totalArea, t),
            heavy = t.heavy,
            orders = rows,
            moneyTotal = loaded.fold(Money.ZERO) { acc, o -> acc + o.totalPrice },
        )
    }

    @Test fun daySheetLight() {
        shoot(
            "day_sheet_light",
            state(CalendarFixtures.SELECTED, CalendarFixtures.day(12), Resource.Success(orders)),
        )
    }

    /** A day with room: «Бу кунга буюртма йўқ. Сиғим бўш — 600 м²», and the tag reads «мавжуд». */
    @Test fun daySheetEmptyLight() {
        val day = LocalDate.of(2026, 9, 20)
        shoot(
            "day_sheet_empty_light",
            state(day, CapacityDay(day, BigDecimal.ZERO, 0, 0), Resource.Success(emptyList())),
        )
    }

    private fun shoot(name: String, s: DaySheetState) {
        rule.setContent {
            EtalonTheme {
                Column(
                    Modifier.fillMaxWidth().background(EtalonColors.page).padding(vertical = 16.dp),
                ) {
                    DaySheet(
                        state = s,
                        onOpenOrder = {},
                        modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin),
                    )
                }
            }
        }
        rule.onRoot().captureRoboImage("screenshots/$name.png")
    }
}
