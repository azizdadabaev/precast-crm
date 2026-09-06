package uz.etalon.crm.feature.logistics

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.*
import uz.etalon.crm.feature.logistics.location.DeliveryLocationViewModel
import uz.etalon.crm.feature.logistics.location.DeviceLocation
import uz.etalon.crm.feature.logistics.location.RefreshOrderUseCase
import uz.etalon.crm.feature.logistics.location.ResolveMapLinkUseCase
import uz.etalon.crm.feature.logistics.location.SetDeliveryLocationUseCase
import uz.etalon.crm.feature.logistics.location.formatPinForDisplay
import uz.etalon.crm.feature.logistics.location.parseCoordinatePair
import java.math.BigDecimal
import java.time.Instant

class DeliveryLocationParseTest {
    @Test fun `accepts a comma separated pair with or without spaces`() {
        assertEquals(41.311 to 69.279, parseCoordinatePair("41.311, 69.279")!!.let { it.lat to it.lng })
        assertEquals(41.311 to 69.279, parseCoordinatePair("41.311,69.279")!!.let { it.lat to it.lng })
    }
    @Test fun `accepts a decimal comma, which is what the Uzbek keyboard produces`() {
        // "41,311 69,279" — comma is the decimal separator, space is the pair separator.
        assertEquals(41.311 to 69.279, parseCoordinatePair("41,311 69,279")!!.let { it.lat to it.lng })
    }
    @Test fun `rejects out of range values`() {
        assertNull(parseCoordinatePair("91.0, 10.0"))
        assertNull(parseCoordinatePair("10.0, 181.0"))
    }
    @Test fun `rejects anything that is not a pair`() {
        assertNull(parseCoordinatePair(""))
        assertNull(parseCoordinatePair("41.311"))
        assertNull(parseCoordinatePair("https://maps.app.goo.gl/x"))
    }
    @Test fun `rejects a bare decimal-comma number as an ambiguous pair`() {
        // A single comma with no space could be "41.69" (comma-decimal) or "41, 69" (a pair) —
        // the parser must never guess, so this is rejected outright.
        assertNull(parseCoordinatePair("41,69"))
    }
    @Test fun `the pin this screen displays round-trips through its own parser`() {
        // formatPinForDisplay renders comma-decimal numbers joined by a comma separator — the
        // exact form COMMA_DECIMAL_PAIR exists to accept, so a pin can be copied out and typed
        // straight back in. This is the case a reviewer caught missing: without that pattern,
        // this assertion fails because the parser only accepted dot-decimal comma-pairs.
        val displayed = formatPinForDisplay(41.311, 69.279)
        val parsed = parseCoordinatePair(displayed)
        assertEquals(41.311, parsed?.lat)
        assertEquals(69.279, parsed?.lng)
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class DeliveryLocationViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    /** Fills every `OrderDetail`/`OrderSummary` field the location screen does not touch with a
     *  neutral value, the same way ShipmentsUiStateTest's own `detail()` helper does. */
    private fun fakeOrderDetail(lat: Double? = null, lng: Double? = null, label: String? = null) = OrderDetail(
        summary = OrderSummary(
            id = "o1", orderNumber = "ORD-1", status = OrderStatus.PLACED, paymentState = PaymentState.AWAITING_PAYMENT,
            totalPrice = Money.ZERO, confirmedPaid = Money.ZERO, totalArea = BigDecimal.ZERO, totalBlocks = 0, totalBeams = 0,
            scheduledAt = Instant.EPOCH, placedAt = Instant.EPOCH, client = ClientRef("c1", "Клиент", "998901112233", null),
        ),
        notes = null,
        deliveryLat = lat, deliveryLng = lng, deliveryLocationUrl = null, deliveryLocationLabel = label,
        discountAmount = Money.ZERO, deliveryCost = Money.ZERO, otherCost = Money.ZERO, roomsSubtotal = Money.ZERO,
        writeOffAmount = Money.ZERO,
        rooms = emptyList(), payments = emptyList(), shipments = emptyList(), loadedPhotos = emptyList(),
        deliveryProofUrl = null, events = emptyList(), dispatch = null, fetchedAt = Instant.EPOCH,
    )

    private fun vm(
        deviceLocation: DeviceLocation = DeviceLocation { Result.success(LatLng(0.0, 0.0)) },
        resolveLink: ResolveMapLinkUseCase = ResolveMapLinkUseCase { Result.success(LatLng(0.0, 0.0)) },
        setLocation: SetDeliveryLocationUseCase = SetDeliveryLocationUseCase { _, _, _, _ -> Result.success(Unit) },
        refreshOrder: RefreshOrderUseCase = RefreshOrderUseCase {},
    ) = DeliveryLocationViewModel(deviceLocation, resolveLink, setLocation, refreshOrder)

    @Test fun `use my location writes the returned pair into state`() = runTest {
        val vm = vm(deviceLocation = DeviceLocation { Result.success(LatLng(41.311, 69.279)) })
        vm.useMyLocation()
        advanceUntilIdle()
        assertEquals(41.311, vm.state.value.lat)
        assertEquals(69.279, vm.state.value.lng)
    }

    @Test fun `a device-location failure (permission denied) surfaces its message and sets no pin`() = runTest {
        val vm = vm(deviceLocation = DeviceLocation { Result.failure(IllegalStateException("Жойни аниқлаш учун рухсат керак")) })
        vm.useMyLocation()
        advanceUntilIdle()

        assertFalse(vm.state.value.hasPin)
        assertEquals("Жойни аниқлаш учун рухсат керак", vm.state.value.error)
    }

    @Test fun `a pasted link is sent to resolveMapLink and its result becomes the pin`() = runTest {
        var sentUrl: String? = null
        val vm = vm(resolveLink = ResolveMapLinkUseCase { url -> sentUrl = url; Result.success(LatLng(41.0, 69.0)) })
        vm.onLinkInputChange("https://maps.app.goo.gl/x")
        vm.resolveLink()
        advanceUntilIdle()
        assertEquals("https://maps.app.goo.gl/x", sentUrl)
        assertEquals(41.0, vm.state.value.lat)
        assertEquals(69.0, vm.state.value.lng)
    }

    @Test fun `a resolver failure shows the server's Uzbek message and leaves the previous pin alone`() = runTest {
        val vm = vm(
            deviceLocation = DeviceLocation { Result.success(LatLng(1.0, 2.0)) },
            resolveLink = ResolveMapLinkUseCase { Result.failure(IllegalStateException("Ҳавола топилмади")) },
        )
        vm.useMyLocation()
        advanceUntilIdle()

        vm.onLinkInputChange("https://maps.app.goo.gl/bad")
        vm.resolveLink()
        advanceUntilIdle()

        assertEquals(1.0, vm.state.value.lat)
        assertEquals(2.0, vm.state.value.lng)
        assertEquals("Ҳавола топилмади", vm.state.value.error)
    }

    @Test fun `saving calls setDeliveryLocation with the current pin`() = runTest {
        var captured: List<Any?>? = null
        val vm = vm(
            deviceLocation = DeviceLocation { Result.success(LatLng(41.311, 69.279)) },
            setLocation = SetDeliveryLocationUseCase { lat, lng, url, label -> captured = listOf(lat, lng, url, label); Result.success(Unit) },
        )
        vm.useMyLocation()
        advanceUntilIdle()
        vm.onLabelChange("кўк дарвоза")
        vm.save()
        advanceUntilIdle()

        assertEquals(listOf(41.311, 69.279, null, "кўк дарвоза"), captured)
        assertTrue(vm.state.value.saved)
    }

    @Test fun `clearing calls setDeliveryLocation with nulls`() = runTest {
        var captured: List<Any?>? = null
        val vm = vm(
            deviceLocation = DeviceLocation { Result.success(LatLng(41.311, 69.279)) },
            setLocation = SetDeliveryLocationUseCase { lat, lng, url, label -> captured = listOf(lat, lng, url, label); Result.success(Unit) },
        )
        vm.useMyLocation()
        advanceUntilIdle()
        vm.clear()
        advanceUntilIdle()

        assertEquals(listOf(null, null, null, null), captured)
        assertFalse(vm.state.value.hasPin)
        assertTrue(vm.state.value.saved)
    }

    @Test fun `a malformed manual entry is rejected with an Uzbek message and no pin is set`() = runTest {
        val vm = vm()
        vm.onManualInputChange("not coordinates")
        vm.applyManualInput()

        assertFalse(vm.state.value.hasPin)
        assertNotNull(vm.state.value.error)
    }

    @Test fun `a valid manual entry becomes the pin`() = runTest {
        val vm = vm()
        vm.onManualInputChange("41.311, 69.279")
        vm.applyManualInput()

        assertEquals(41.311, vm.state.value.lat)
        assertEquals(69.279, vm.state.value.lng)
        assertNull(vm.state.value.error)
    }

    @Test fun `save is blocked while the order stream last reported no network`() = runTest {
        var calls = 0
        val vm = vm(
            deviceLocation = DeviceLocation { Result.success(LatLng(41.0, 69.0)) },
            setLocation = SetDeliveryLocationUseCase { _, _, _, _ -> calls++; Result.success(Unit) },
        )
        vm.useMyLocation()
        advanceUntilIdle()
        vm.onOrderResource(Resource.Error<OrderDetail>(null, AppError.Network("Интернет йўқ")))

        vm.save()
        advanceUntilIdle()

        assertEquals(0, calls)
        assertNotNull(vm.state.value.error)
        assertTrue(vm.state.value.hasPin) // the pin itself is untouched, only the write is blocked
    }

    @Test fun `clear is blocked while offline the same way save is`() = runTest {
        var calls = 0
        val vm = vm(
            deviceLocation = DeviceLocation { Result.success(LatLng(41.0, 69.0)) },
            setLocation = SetDeliveryLocationUseCase { _, _, _, _ -> calls++; Result.success(Unit) },
        )
        vm.useMyLocation()
        advanceUntilIdle()
        vm.onOrderResource(Resource.Error<OrderDetail>(null, AppError.Network("Интернет йўқ")))

        vm.clear()
        advanceUntilIdle()

        assertEquals(0, calls)
        assertTrue(vm.state.value.hasPin)
    }

    @Test fun `a reconnect clears the offline signal so save can go through again`() = runTest {
        var calls = 0
        val vm = vm(
            deviceLocation = DeviceLocation { Result.success(LatLng(41.0, 69.0)) },
            setLocation = SetDeliveryLocationUseCase { _, _, _, _ -> calls++; Result.success(Unit) },
        )
        vm.useMyLocation()
        advanceUntilIdle()
        vm.onOrderResource(Resource.Error<OrderDetail>(null, AppError.Network("Интернет йўқ")))
        vm.save()
        advanceUntilIdle()
        assertEquals(0, calls)

        vm.onOrderResource(Resource.Success(fakeOrderDetail()))
        vm.save()
        advanceUntilIdle()
        assertEquals(1, calls)
    }

    @Test fun `resolveLink is blocked while offline, the same way save and clear are`() = runTest {
        var calls = 0
        val vm = vm(resolveLink = ResolveMapLinkUseCase { calls++; Result.success(LatLng(1.0, 2.0)) })
        vm.onOrderResource(Resource.Error<OrderDetail>(null, AppError.Network("Интернет йўқ")))

        vm.onLinkInputChange("https://maps.app.goo.gl/x")
        vm.resolveLink()
        advanceUntilIdle()

        assertEquals(0, calls)
        assertFalse(vm.state.value.hasPin)
        assertNotNull(vm.state.value.error)
    }

    @Test fun `refresh runs once on construction, and again on demand`() = runTest {
        var calls = 0
        val vm = vm(refreshOrder = RefreshOrderUseCase { calls++ })
        advanceUntilIdle()
        assertEquals(1, calls)

        vm.refresh()
        advanceUntilIdle()
        assertEquals(2, calls)
    }

    @Test fun `the screen reads as loading, not empty, before the order stream's first tick`() = runTest {
        val vm = vm()
        assertTrue(vm.state.value.isLoading)
        assertFalse(vm.state.value.showEmptyState)
    }

    @Test fun `a fetch failure keeps its own message and a retry, and never reads as empty`() = runTest {
        val vm = vm()
        vm.onOrderResource(Resource.Error<OrderDetail>(null, AppError.Server("сервер хатоси", 500)))

        assertFalse(vm.state.value.isLoading)
        assertFalse(vm.state.value.showEmptyState)
        assertEquals("сервер хатоси", vm.state.value.resourceError)
        assertFalse(vm.state.value.isOffline) // a 500 is not the same fact as "no network"
    }

    @Test fun `empty reads as empty only once the fetch has actually succeeded with no pin`() = runTest {
        val vm = vm()
        vm.onOrderResource(Resource.Success(fakeOrderDetail()))

        assertFalse(vm.state.value.isLoading)
        assertNull(vm.state.value.resourceError)
        assertTrue(vm.state.value.showEmptyState)
    }

    @Test fun `save guards against double submission`() = runTest {
        var calls = 0
        val vm = vm(
            deviceLocation = DeviceLocation { Result.success(LatLng(1.0, 2.0)) },
            setLocation = SetDeliveryLocationUseCase { _, _, _, _ -> calls++; Result.success(Unit) },
        )
        vm.useMyLocation()
        advanceUntilIdle()

        vm.save()
        vm.save() // fired while the first save's coroutine hasn't resumed yet — busy is already true
        advanceUntilIdle()

        assertEquals(1, calls)
    }

    @Test fun `the order stream seeds the pin until the operator's first edit, never after`() = runTest {
        val vm = vm()
        vm.onOrderResource(Resource.Success(fakeOrderDetail(lat = 41.5, lng = 69.5, label = "омбор")))
        assertEquals(41.5, vm.state.value.lat)
        assertEquals(69.5, vm.state.value.lng)
        assertEquals("омбор", vm.state.value.label)

        // A further edit must survive a later tick of the same stream.
        vm.onLabelChange("янги белги")
        vm.onOrderResource(Resource.Success(fakeOrderDetail(lat = 10.0, lng = 20.0, label = "бошқа")))
        assertEquals(41.5, vm.state.value.lat)
        assertEquals("янги белги", vm.state.value.label)
    }
}
