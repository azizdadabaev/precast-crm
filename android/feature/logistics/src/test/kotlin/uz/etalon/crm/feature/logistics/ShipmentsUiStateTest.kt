package uz.etalon.crm.feature.logistics

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
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

    @Test fun `the empty state never shows beside an error, even with no cached shipments`() {
        assertFalse(ShipmentsUiState(Resource.Error(null, AppError.Network("Интернет йўқ"))).showEmptyState)
        assertFalse(ShipmentsUiState(Resource.Error(null, AppError.Server("хато", 500))).showEmptyState)
        // Cached data survives the error, so still no false "no trucks" once real rows exist.
        assertFalse(ShipmentsUiState(Resource.Error(detail(OrderStatus.PLACED), AppError.Network("Интернет йўқ"))).showEmptyState)
    }

    @Test fun `the empty state shows once loaded cleanly with nothing in it`() {
        assertTrue(ShipmentsUiState(Resource.Success(detail(OrderStatus.PLACED))).showEmptyState)
        assertFalse(ShipmentsUiState(Resource.Loading(null)).showEmptyState)
    }

    private fun upload(shipmentId: String, failed: Boolean = false) = PendingUpload(
        id = "q-$shipmentId", kind = OutboxKind.LOAD_SHIPMENT, orderId = "o1", shipmentId = shipmentId,
        failed = failed, attempts = 0, error = if (failed) "Жўнатма аллақачон LOADED ҳолатида" else null,
    )

    /** A truck whose load is queued offline still comes back PENDING from the server, so only the
     *  outbox can tell it apart from one that was never loaded. */
    @Test fun `only the trucks with a queued load are marked`() {
        val s = ShipmentsUiState(
            Resource.Success(detail(OrderStatus.PLACED)),
            pendingUploads = listOf(upload("s1"), upload("s3")),
        )
        assertTrue(s.hasQueuedLoad("s1"))
        assertTrue(s.hasQueuedLoad("s3"))
        assertFalse(s.hasQueuedLoad("s2"))
    }

    @Test fun `with an empty outbox no truck is marked`() {
        val s = ShipmentsUiState(Resource.Success(detail(OrderStatus.PLACED)))
        assertFalse(s.hasQueuedLoad("s1"))
        assertFalse(s.hasFailedLoad("s1"))
        assertFalse(s.hasUnsentLoad("s1"))
    }

    /**
     * The two stories a single screen used to tell at once: the action bar read «Юборилмади» while
     * the truck's own button, keyed off the mere presence of a row, still read «Юборилмоқда…». A
     * rejected load is not on its way anywhere, so it must not claim to be — but it still blocks,
     * because the way out is the banner's retry or cancel, not a second copy of the same load.
     */
    @Test fun `a rejected load is distinguished from one still on its way`() {
        val s = ShipmentsUiState(
            Resource.Success(detail(OrderStatus.PLACED)),
            pendingUploads = listOf(upload("s1", failed = true), upload("s2")),
        )
        assertTrue(s.hasFailedLoad("s1"))
        assertFalse(s.hasQueuedLoad("s1"))
        assertTrue(s.hasUnsentLoad("s1"), "a rejected row still blocks a second load")

        assertTrue(s.hasQueuedLoad("s2"))
        assertFalse(s.hasFailedLoad("s2"))
        assertTrue(s.hasUnsentLoad("s2"))
    }

    /** What the banner acts on, and what it counts: only rows still on their way are "sending". */
    @Test fun `the banner picks the rejected row and counts only the unfinished ones`() {
        val s = ShipmentsUiState(
            Resource.Success(detail(OrderStatus.PLACED)),
            pendingUploads = listOf(upload("s2"), upload("s1", failed = true), upload("s3")),
        )
        assertEquals("q-s1", s.firstFailedUpload?.id)
        assertEquals(2, s.unfinishedUploads)
    }

    @Test fun `with nothing rejected the banner has no row to act on`() {
        val s = ShipmentsUiState(Resource.Success(detail(OrderStatus.PLACED)), pendingUploads = listOf(upload("s1")))
        assertNull(s.firstFailedUpload)
        assertEquals(1, s.unfinishedUploads)
    }
}
