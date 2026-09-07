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
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.OutboxKind
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.PendingUpload
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.Role
import uz.etalon.crm.feature.orders.detail.OrderDetailScreen
import java.math.BigDecimal
import java.time.Instant

/**
 * The sticky action bar itself (`NextStepBar` in OrderDetailScreen.kt) is `private`, so — exactly
 * like [OrderCardScreenshotTest] shoots the real `OrderCard` rather than a fragment of it — these
 * tests render the whole (stateless) `OrderDetailScreen`, which is enough to capture the bar at
 * the bottom of the frame in both of its forms.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class OrderDetailScreenshotTest {
    @get:Rule val rule = createComposeRule()

    /** ROLE_TEMPLATES.SALES, which holds payment.record too — so these frames also capture the
     *  record-payment door on the payments card. */
    private val editor = Me("u1", "Оператор", Role.SALES, setOf("order.view", "order.edit", "payment.record"), false)

    private fun order(status: OrderStatus) = OrderDetail(
        summary = OrderSummary(
            id = "o1", orderNumber = "2026-09-0042", status = status,
            paymentState = PaymentState.PARTIALLY_PAID,
            totalPrice = Money.parse("48000000.00"), confirmedPaid = Money.parse("20000000.00"),
            totalArea = BigDecimal("310.500"), totalBlocks = 620, totalBeams = 44,
            scheduledAt = Instant.parse("2026-09-10T00:00:00Z"), placedAt = Instant.parse("2026-09-01T00:00:00Z"),
            client = ClientRef("c1", "Каримов Шерзод Абдуллаевич", "998901112233", "Тошкент, Чилонзор"),
        ),
        notes = null,
        deliveryLat = null, deliveryLng = null, deliveryLocationUrl = null, deliveryLocationLabel = null,
        discountAmount = Money.ZERO, deliveryCost = Money.ZERO, otherCost = Money.ZERO,
        roomsSubtotal = Money.ZERO, writeOffAmount = Money.ZERO,
        rooms = emptyList(), payments = emptyList(), shipments = emptyList(),
        loadedPhotos = emptyList(), deliveryProofUrl = null, events = emptyList(), dispatch = null,
        fetchedAt = Instant.parse("2026-09-04T00:00:00Z"),
    )

    private fun shoot(name: String, dark: Boolean, pending: List<PendingUpload> = emptyList()) {
        rule.setContent {
            EtalonTheme(darkTheme = dark) {
                OrderDetailScreen(
                    r = Resource.Success(order(OrderStatus.PLACED)), me = editor, pending = pending, actionError = null,
                    onBack = {}, onRefresh = {}, onLoadTruck = {}, onAddPhoto = {}, onDeliveryProof = {},
                    onOpenShipments = {}, onOpenLocation = {}, onRecordPayment = {},
                    onDeletePhoto = {}, onRetryUpload = {}, onCancelUpload = {},
                )
            }
        }
        rule.onRoot().captureRoboImage("screenshots/order_detail_bar_$name.png")
    }

    // ── LoadTruck form: nothing queued, the bar offers the next action ──────────

    @Test @Config(qualifiers = "w411dp-h891dp") fun loadTruckLight() = shoot("load_truck_light", false)
    @Test @Config(qualifiers = "w411dp-h891dp") fun loadTruckDark() = shoot("load_truck_dark", true)
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun loadTruckLargeFont() = shoot("load_truck_font13", false)

    // ── Blocked form: a photo is still on its way, so the bar is disabled ───────

    private val pendingUpload = listOf(PendingUpload(id = "p1", kind = OutboxKind.LOAD_TRUCK, orderId = "o1", shipmentId = null, failed = false, attempts = 0, error = null))

    @Test @Config(qualifiers = "w411dp-h891dp") fun blockedLight() = shoot("blocked_light", false, pendingUpload)
    @Test @Config(qualifiers = "w411dp-h891dp") fun blockedDark() = shoot("blocked_dark", true, pendingUpload)
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun blockedLargeFont() = shoot("blocked_font13", false, pendingUpload)
}
