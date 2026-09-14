package uz.etalon.crm.feature.logistics

import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.longClick
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performTouchInput
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
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

private const val ADD = "Жўнатма қўшиш"

/** The LOADED row's own offer. Never inside a clickable row (only a PENDING row is), so it is one
 *  stable node however the rest of the screen is behaving. */
private const val DISPATCH_ROW = "Жўнатиш"

/** The long-press question. Its presence IS "the sheet is open". */
private const val DELETE_SHEET = "Жўнатмани ўчириш"

private val NOW: Instant = Instant.parse("2026-09-04T00:00:00Z")

/**
 * What the list offers and what it withholds — the two things a screenshot cannot state.
 *
 * The bar half is a regression guard. `canAddShipment` carries `!busy`, and mounting the bar on it
 * meant the bar left the screen for the length of every add, delete and deliver: the button's own
 * spinner could never be seen, and the list's `contentPadding` lost the bar's 88 dp and got it back,
 * so the rows jumped down and up again on every tap. The bar now exists on `canCreateShipment` —
 * the standing fact — and is merely disabled while a request runs.
 *
 * The long-press half pins the kept delete rule at the affordance, not only in the ViewModel: only
 * a truck nothing has been put on may go, so only such a row answers a long press at all.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class ShipmentsRowActionsTest {
    @get:Rule val rule = createComposeRule()

    @Test fun `a request in flight leaves the add bar exactly where it was`() {
        var busy by mutableStateOf(false)
        rule.setContent { EtalonTheme { Screen(state(busy = busy)) } }

        val before = rule.onNodeWithText(ADD).getUnclippedBoundsInRoot()
        rule.onNodeWithText(ADD).assertIsEnabled()

        busy = true
        rule.waitForIdle()

        // Still on screen — with its spinner — and it has not moved by so much as a dp, which is
        // the same statement as "the list below it did not jump".
        rule.onNodeWithText(ADD).assertIsDisplayed()
        assertEquals(before, rule.onNodeWithText(ADD).getUnclippedBoundsInRoot())
        rule.onNodeWithText(ADD).assertIsNotEnabled()
    }

    /** `runAction` returns early while another request is in flight and writes no banner, so a row
     *  offer that stayed live during one would swallow the tap in silence. */
    @Test fun `a request in flight disables the row offers rather than swallowing them`() {
        var busy by mutableStateOf(false)
        rule.setContent { EtalonTheme { Screen(state(busy = busy)) } }

        rule.onNode(hasText(DISPATCH_ROW) and hasClickAction()).assertIsEnabled()

        busy = true
        rule.waitForIdle()

        rule.onNode(hasText(DISPATCH_ROW) and hasClickAction()).assertIsNotEnabled()
    }

    @Test fun `long-pressing a truck nothing has been put on offers to delete it`() {
        rule.setContent { EtalonTheme { Screen(state()) } }

        rule.onNodeWithText(shipmentLabel(1)).performTouchInput { longClick() }
        rule.waitForIdle()

        rule.onNodeWithText(DELETE_SHEET).assertIsDisplayed()
    }

    /** A lorry that has left cannot be un-sent, so its row must not answer the gesture at all —
     *  the rule is hidden, not merely refused after the fact. */
    @Test fun `long-pressing a dispatched truck offers nothing`() {
        val deleted = mutableListOf<String>()
        rule.setContent { EtalonTheme { Screen(state(), onDelete = { deleted += it }) } }

        rule.onNodeWithText(shipmentLabel(3)).performTouchInput { longClick() }
        rule.waitForIdle()

        rule.onNodeWithText(DELETE_SHEET).assertDoesNotExist()
        assertEquals(emptyList<String>(), deleted)
    }

    @androidx.compose.runtime.Composable
    private fun Screen(s: ShipmentsUiState, onDelete: (String) -> Unit = {}) = ShipmentsScreen(
        s = s, now = NOW, onLoadShipment = {}, onDispatch = {}, onBack = {}, onAdd = {},
        onDelete = onDelete, onDeliver = {}, onRefresh = {},
    )

    private fun shipmentLabel(n: Int) = "Жўнатма $n"

    private fun state(busy: Boolean = false) =
        ShipmentsUiState(resource = Resource.Success(order()), busy = busy)

    /** PLACED, so the order still takes trucks and the bar exists at all. One truck in each of the
     *  three states that still offer something. */
    private fun order() = OrderDetail(
        summary = OrderSummary(
            id = "o1", orderNumber = "2026-09-0042", status = OrderStatus.PLACED,
            paymentState = PaymentState.PARTIALLY_PAID,
            totalPrice = Money.ZERO, confirmedPaid = Money.ZERO,
            totalArea = BigDecimal.ZERO, totalBlocks = 0, totalBeams = 0,
            scheduledAt = Instant.EPOCH, placedAt = Instant.EPOCH,
            client = ClientRef("c1", "Каримов Шерзод", "998901112233", null),
        ),
        notes = null,
        deliveryLat = null, deliveryLng = null, deliveryLocationUrl = null, deliveryLocationLabel = null,
        discountAmount = Money.ZERO, deliveryCost = Money.ZERO, otherCost = Money.ZERO,
        roomsSubtotal = Money.ZERO, writeOffAmount = Money.ZERO,
        rooms = emptyList(), payments = emptyList(),
        shipments = listOf(
            shipment("s1", 1, ShipmentStatus.PENDING),
            shipment("s2", 2, ShipmentStatus.LOADED),
            shipment("s3", 3, ShipmentStatus.DISPATCHED),
        ),
        loadedPhotos = emptyList(), deliveryProofUrl = null, events = emptyList(), dispatch = null,
        fetchedAt = Instant.EPOCH,
    )

    private fun shipment(id: String, number: Int, status: ShipmentStatus) = ShipmentLine(
        id = id, number = number, status = status, loadedBlocks = null, loadedPhotoUrl = null,
        driverName = null, truckIdentifier = null,
    )
}
