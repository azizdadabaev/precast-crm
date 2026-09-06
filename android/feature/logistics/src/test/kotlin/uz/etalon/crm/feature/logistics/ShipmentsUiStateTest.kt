package uz.etalon.crm.feature.logistics

import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.*
import uz.etalon.crm.feature.logistics.shipments.ShipmentsUiState
import java.math.BigDecimal
import java.time.Instant

class ShipmentsUiStateTest {

    /** Fills every `OrderDetail`/`OrderSummary` field the online-only-action gating does not
     *  touch with a neutral value, so each case only has to spell out the order status. */
    private fun detail(status: OrderStatus) = OrderDetail(
        summary = OrderSummary(
            id = "o1", orderNumber = "ORD-1", status = status, paymentState = PaymentState.AWAITING_PAYMENT,
            totalPrice = Money.ZERO, confirmedPaid = Money.ZERO, totalArea = BigDecimal.ZERO, totalBlocks = 0, totalBeams = 0,
            scheduledAt = Instant.EPOCH, placedAt = Instant.EPOCH, client = ClientRef("c1", "Клиент", "998901112233", null),
        ),
        notes = null,
        deliveryLat = null, deliveryLng = null, deliveryLocationUrl = null, deliveryLocationLabel = null,
        discountAmount = Money.ZERO, deliveryCost = Money.ZERO, otherCost = Money.ZERO, roomsSubtotal = Money.ZERO,
        writeOffAmount = Money.ZERO,
        rooms = emptyList(), payments = emptyList(), shipments = emptyList(), loadedPhotos = emptyList(),
        deliveryProofUrl = null, events = emptyList(), dispatch = null, fetchedAt = Instant.EPOCH,
    )

    @Test fun `add is offered only while the order is in an accepting status`() {
        assertTrue(ShipmentsUiState(Resource.Success(detail(OrderStatus.PLACED))).canAddShipment)
        assertTrue(ShipmentsUiState(Resource.Success(detail(OrderStatus.IN_PRODUCTION))).canAddShipment)
        assertTrue(ShipmentsUiState(Resource.Success(detail(OrderStatus.DISPATCHED))).canAddShipment)
        assertFalse(ShipmentsUiState(Resource.Success(detail(OrderStatus.DELIVERED))).canAddShipment)
        assertFalse(ShipmentsUiState(Resource.Success(detail(OrderStatus.CANCELED))).canAddShipment)
        assertFalse(ShipmentsUiState(Resource.Success(detail(OrderStatus.DRAFT))).canAddShipment)
    }

    @Test fun `add is refused while an action is already in flight`() {
        assertFalse(ShipmentsUiState(Resource.Success(detail(OrderStatus.PLACED)), busy = true).canAddShipment)
    }

    @Test fun `add is refused with no order loaded yet`() {
        assertFalse(ShipmentsUiState(Resource.Loading(null)).canAddShipment)
    }

    @Test fun `a network error is the only thing that marks the screen offline`() {
        assertTrue(ShipmentsUiState(Resource.Error(null, AppError.Network("Интернет йўқ"))).isOffline)
        assertFalse(ShipmentsUiState(Resource.Error(null, AppError.Server("хато", 500))).isOffline)
        assertFalse(ShipmentsUiState(Resource.Loading(null)).isOffline)
        assertFalse(ShipmentsUiState(Resource.Success(detail(OrderStatus.PLACED))).isOffline)
    }

    @Test fun `add is refused while offline even in an accepting status`() {
        assertFalse(ShipmentsUiState(Resource.Error(detail(OrderStatus.PLACED), AppError.Network("Интернет йўқ"))).canAddShipment)
    }
}
