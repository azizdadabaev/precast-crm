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
import uz.etalon.crm.core.model.DispatchInfo
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderEventLine
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.OutboxKind
import uz.etalon.crm.core.model.PaymentLine
import uz.etalon.crm.core.model.PaymentMethod
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.PaymentStatus
import uz.etalon.crm.core.model.PendingUpload
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.Role
import uz.etalon.crm.core.model.RoomLine
import uz.etalon.crm.core.model.ShipmentLine
import uz.etalon.crm.core.model.ShipmentStatus
import uz.etalon.crm.feature.orders.detail.OrderDetailScreen
import java.math.BigDecimal
import java.time.Instant

/**
 * `2b-order-detail.png` reproduced element for element, so the reviewer can lay the two images
 * side by side: the navy panel with the back circle, «30 авг 2026» and the phone circle; the
 * indigo card «Буюртма / № 09‑0003 / Жўнатилган»; the avatar with «Yusupov & Sons» over its
 * address; the three room tiles; Майдон / Жами / Қолди; the «Тўлов ҳолати» card at 45 %; and the
 * «Етказиш» card over the sticky «Етказилди» + «Тўлов қайд қилиш».
 *
 * Nothing here reads the clock: every instant is fixed, so a baseline recorded in March is the one
 * recorded in September.
 *
 * **The nav pill is not in these frames.** `OrderDetailScreen` is stateless and knows nothing about
 * the shell that draws the pill over it; what the baselines show instead is the
 * [uz.etalon.crm.core.designsystem.theme.EtalonSpace.underNav] band the sticky bar is lifted by.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class OrderDetailScreenshotTest {
    @get:Rule val rule = createComposeRule()

    /** ROLE_TEMPLATES.SALES: `order.edit` and `payment.record`, and deliberately NOT
     *  `dispatch.create` — the largest operator role, and the one the capture's bar belongs to. */
    private val me = Me(
        "u1", "Оператор", Role.SALES,
        setOf("order.view", "order.edit", "payment.record"), false,
    )

    private fun room(name: String, w: String, l: String, area: String, subtotal: String) = RoomLine(
        name = name, innerWidth = BigDecimal(w), innerLength = BigDecimal(l), pattern = "Г-Б",
        beamLength = BigDecimal("6.00"), beamCount = 12, totalBlocks = 96,
        billedArea = BigDecimal(area), subtotal = Money.parse(subtotal),
    )

    private val rooms = listOf(
        room("Зал", "5.80", "6.40", "37.10", "6293000.00"),
        room("Хона 1", "4.40", "5.20", "22.90", "3884500.00"),
        room("Хона 2", "4.00", "4.80", "19.20", "3172500.00"),
    )

    private val payment = PaymentLine(
        id = "p1", amount = Money.parse("6000000.00"), method = PaymentMethod.CASH,
        status = PaymentStatus.CONFIRMED, recordedAt = Instant.parse("2026-09-02T09:20:00Z"),
        recordedByName = "Оператор", receiptUrls = emptyList(),
    )

    private val shipment = ShipmentLine(
        id = "s1", number = 1, status = ShipmentStatus.DISPATCHED, loadedBlocks = 96,
        loadedPhotoUrl = null, dispatchedAt = Instant.parse("2026-09-03T05:00:00Z"),
        driverName = "Азиз", truckIdentifier = "01A777AA",
    )

    private val events = listOf(
        OrderEventLine("e1", "DISPATCHED", "Жўнатилди", "Азиз", Instant.parse("2026-09-03T05:00:00Z")),
        OrderEventLine("e2", "PAYMENT", "Тўлов қайд қилинди", "Оператор", Instant.parse("2026-09-02T09:20:00Z")),
    )

    /**
     * The capture's order: 78,7 м² over three rooms, 13 350 000 total, 6 000 000 confirmed
     * (45 %), DISPATCHED on 3 September with Азиз at the wheel.
     *
     * @param shipments deliberately empty by default. With a shipment on the order `nextStepFor`
     *   sends a `dispatch.create` holder to the shipment list and a SALES operator nowhere at all,
     *   and the bar would then read «Жўнатмалар» or vanish — the capture's bar is «Етказилди», the
     *   whole-order delivery proof, which is the step an unsplit order is on. The shipments card
     *   is exercised by [blockedLight] instead.
     */
    private fun order(
        status: OrderStatus = OrderStatus.DISPATCHED,
        paid: String = "6000000.00",
        payments: List<PaymentLine> = listOf(payment),
        shipments: List<ShipmentLine> = emptyList(),
    ) = OrderDetail(
        summary = OrderSummary(
            id = "o3", orderNumber = "2026-09-0003", status = status,
            paymentState = when {
                Money.parse(paid).isZero -> PaymentState.AWAITING_PAYMENT
                Money.parse(paid) >= Money.parse("13350000.00") -> PaymentState.FULLY_PAID
                else -> PaymentState.PARTIALLY_PAID
            },
            totalPrice = Money.parse("13350000.00"), confirmedPaid = Money.parse(paid),
            totalArea = BigDecimal("78.70"), totalBlocks = 288, totalBeams = 36,
            scheduledAt = Instant.parse("2026-08-30T06:00:00Z"),
            placedAt = Instant.parse("2026-08-30T06:00:00Z"),
            client = ClientRef("c3", "Yusupov & Sons", "998901112233", "Бухоро, Эски шаҳар, Хўжа Нуробод кўч. 7"),
        ),
        notes = null,
        deliveryLat = null, deliveryLng = null, deliveryLocationUrl = null, deliveryLocationLabel = null,
        discountAmount = Money.ZERO, deliveryCost = Money.ZERO, otherCost = Money.ZERO,
        roomsSubtotal = Money.parse("13350000.00"), writeOffAmount = Money.ZERO,
        rooms = rooms, payments = payments, shipments = shipments,
        loadedPhotos = emptyList(), deliveryProofUrl = null, events = events,
        dispatch = if (status == OrderStatus.DISPATCHED || status == OrderStatus.DELIVERED) {
            DispatchInfo(
                id = "d1", driverName = "Азиз", truckIdentifier = "01A777AA",
                expectedCollection = Money.ZERO,
                dispatchedAt = Instant.parse("2026-09-03T05:00:00Z"), returnedAt = null,
            )
        } else {
            null
        },
        fetchedAt = Instant.parse("2026-09-04T00:00:00Z"),
    )

    private fun shoot(name: String, o: OrderDetail, pending: List<PendingUpload> = emptyList()) {
        rule.setContent {
            EtalonTheme {
                OrderDetailScreen(
                    r = Resource.Success(o), me = me, pending = pending, actionError = null,
                    onBack = {}, onRefresh = {}, onLoadTruck = {}, onAddPhoto = {}, onDeliveryProof = {},
                    onOpenShipments = {}, onOpenLocation = {}, onRecordPayment = {},
                    onDeletePhoto = {}, onRetryUpload = {}, onCancelUpload = {},
                )
            }
        }
        rule.onRoot().captureRoboImage("screenshots/$name.png")
    }

    /** The capture itself. */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun dispatchedLight() = shoot("order_detail_dispatched_light", order())

    /** Nothing paid yet and nothing loaded: the bar's next step is «Юклаш», the progress card
     *  reads 0 % and the timeline is on its first column. */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun placedLight() = shoot(
        "order_detail_placed_light",
        order(status = OrderStatus.PLACED, paid = "0.00", payments = emptyList()),
    )

    /** Finished and settled: no bar at all (no next step, no debt to record against), the progress
     *  card green, «Қолди» green on the panel and all four timeline columns navy. */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun deliveredPaidLight() = shoot(
        "order_detail_delivered_paid_light",
        order(
            status = OrderStatus.DELIVERED, paid = "13350000.00",
            payments = listOf(payment, payment.copy(id = "p2", amount = Money.parse("7350000.00"))),
            shipments = listOf(shipment.copy(status = ShipmentStatus.DELIVERED, deliveredAt = Instant.parse("2026-09-05T07:00:00Z"))),
        ),
    )

    /** A photo still in the outbox: the banner at the top, the bar's secondary disabled with
     *  «Юборилмоқда…», and the shipment row saying the same thing so nobody loads it twice. */
    @Test @Config(qualifiers = "w411dp-h891dp")
    fun blockedLight() = shoot(
        "order_detail_blocked_light",
        order(shipments = listOf(shipment)),
        listOf(
            PendingUpload(
                id = "q1", kind = OutboxKind.ADD_LOADED_PHOTO, orderId = "o3", shipmentId = "s1",
                failed = false, attempts = 0, error = null,
            ),
        ),
    )

    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f)
    fun largeFont() = shoot("order_detail_font13", order())
}
