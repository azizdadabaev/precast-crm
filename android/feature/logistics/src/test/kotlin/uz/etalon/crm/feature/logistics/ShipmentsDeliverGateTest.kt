package uz.etalon.crm.feature.logistics

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.ClientRef
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.PaymentState
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.ShipmentLine
import uz.etalon.crm.core.model.ShipmentStatus
import uz.etalon.crm.feature.logistics.shipments.ShipmentsScreen
import uz.etalon.crm.feature.logistics.shipments.ShipmentsUiState
import java.math.BigDecimal
import java.time.Instant

/** `action_deliver_shipment` — the DISPATCHED row's own offer. The fixture holds no DELIVERED
 *  truck, whose short status tag carries the very same word. */
private const val DELIVER = "Етказилди"
private const val GATE_CONFIRM = "Тасдиқлаш"

/** «Бекор қилиш» exists ONLY on the navy gate, so its presence IS "the gate is open". */
private const val GATE_DISMISS = "Бекор қилиш"

private val NOW: Instant = Instant.parse("2026-09-04T00:00:00Z")

/**
 * Signing for a lorry is the one action on the shipments list that writes to the server directly:
 * `deliverShipment` is not idempotent and may never be queued, and it is what closes a truck out.
 * So it stands behind the same navy gate the delivery proof and the record-payment summary do, and
 * under the same rule `DeliveryProofGateTest` and `RecordGateTest` pin — the gate is a
 * CONFIRMATION, so it only opens on a call `ShipmentsViewModel.runAction` would actually make.
 *
 * A tap it would refuse goes straight to `deliverShipment`, whose own offline guard writes the
 * Uzbek sentence into the screen's banner. Asking the operator to agree on the navy panel first
 * and only then telling him there is no signal is the failure this pins shut.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class ShipmentsDeliverGateTest {
    @get:Rule val rule = createComposeRule()

    @Test fun `an offline list never opens the gate`() {
        val delivered = mutableListOf<String>()
        show(offline()) { delivered += it }

        rule.onNodeWithText(DELIVER).performClick()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertDoesNotExist()
        // The tap is not swallowed: the ViewModel refuses it and writes «Интернет йўқ …» into the
        // screen's own banner.
        assertEquals(1, delivered.size)
    }

    /**
     * A call already in flight is the other refusal `runAction` makes — it returns on `busy` before
     * it does anything, so a gate opened there would take the operator's agreement and then write
     * nothing at all.
     *
     * Unlike the offline case, this one is NOT allowed to fall through to `deliverShipment`:
     * `runAction` writes no banner on the `busy` path, so a tap that reached it would vanish in
     * silence. The button is disabled instead — `ShipmentsRowActionsTest` pins that — and the tap
     * therefore never leaves the screen.
     */
    @Test fun `a busy list never opens the gate`() {
        val delivered = mutableListOf<String>()
        show(ready().copy(busy = true)) { delivered += it }

        rule.onNodeWithText(DELIVER).performClick()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertDoesNotExist()
        assertEquals(emptyList<String>(), delivered)
    }

    @Test fun `a reachable list opens the gate instead of delivering`() {
        val delivered = mutableListOf<String>()
        show(ready()) { delivered += it }

        rule.onNodeWithText(DELIVER).performClick()
        rule.waitForIdle()

        rule.onNodeWithText(GATE_DISMISS).assertIsDisplayed()
        // Nothing is written by opening the gate — the delivery is the tap INSIDE it.
        assertEquals(0, delivered.size)
    }

    @Test fun `confirming the gate delivers that truck once`() {
        val delivered = mutableListOf<String>()
        show(ready()) { delivered += it }

        rule.onNodeWithText(DELIVER).performClick()
        rule.waitForIdle()

        val confirm = rule.onAllNodesWithText(GATE_CONFIRM)
        confirm.assertCountEquals(1)
        confirm[0].performClick()
        rule.waitForIdle()

        // The truck the row belongs to, not merely "a" truck: a list of four lorries must sign for
        // the one that was tapped.
        assertEquals(listOf("s2"), delivered)
        rule.onNodeWithText(GATE_DISMISS).assertDoesNotExist()
    }

    private fun show(s: ShipmentsUiState, onDeliver: (String) -> Unit) {
        rule.setContent {
            EtalonTheme {
                ShipmentsScreen(
                    s = s, now = NOW, onLoadShipment = {}, onDispatch = {}, onBack = {}, onAdd = {},
                    onDelete = {}, onDeliver = onDeliver, onRefresh = {},
                )
            }
        }
    }

    private fun ready() = ShipmentsUiState(resource = Resource.Success(order()))

    /** The screen's only offline signal is a refresh that failed for lack of a network — the same
     *  shape `ShipmentsUiState.isOffline` reads, with the cached order still on screen. */
    private fun offline() = ShipmentsUiState(
        resource = Resource.Error(order(), AppError.Network("Интернет йўқ")),
    )

    private fun order() = OrderDetail(
        summary = OrderSummary(
            id = "o1", orderNumber = "2026-09-0042", status = OrderStatus.DISPATCHED,
            paymentState = PaymentState.PARTIALLY_PAID,
            totalPrice = Money.parse("48000000.00"), confirmedPaid = Money.parse("20000000.00"),
            totalArea = BigDecimal("310.500"), totalBlocks = 620, totalBeams = 44,
            scheduledAt = Instant.parse("2026-09-10T00:00:00Z"), placedAt = Instant.parse("2026-09-01T00:00:00Z"),
            client = ClientRef("c1", "Каримов Шерзод", "998901112233", null),
        ),
        notes = null,
        deliveryLat = null, deliveryLng = null, deliveryLocationUrl = null, deliveryLocationLabel = null,
        discountAmount = Money.ZERO, deliveryCost = Money.ZERO, otherCost = Money.ZERO,
        roomsSubtotal = Money.ZERO, writeOffAmount = Money.ZERO,
        rooms = emptyList(), payments = emptyList(),
        shipments = listOf(
            ShipmentLine(
                id = "s1", number = 1, status = ShipmentStatus.PENDING, loadedBlocks = null,
                loadedPhotoUrl = null, driverName = null, truckIdentifier = null,
            ),
            ShipmentLine(
                id = "s2", number = 2, status = ShipmentStatus.DISPATCHED,
                loadedBeams = mapOf("6.00" to 3), loadedBlocks = 15, loadedPhotoUrl = null,
                loadedAt = Instant.parse("2026-09-03T05:00:00Z"),
                driverName = "Дилшод Раҳимов", truckIdentifier = "01 A 123 BC",
            ),
        ),
        loadedPhotos = emptyList(), deliveryProofUrl = null, events = emptyList(), dispatch = null,
        fetchedAt = Instant.parse("2026-09-04T00:00:00Z"),
    )
}
