package uz.etalon.crm.feature.logistics

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.network.ApiException
import java.io.IOException
import uz.etalon.crm.feature.logistics.dispatch.CreateDispatchUseCase
import uz.etalon.crm.feature.logistics.dispatch.DispatchDriversUseCase
import uz.etalon.crm.feature.logistics.dispatch.DispatchShipmentUseCase
import uz.etalon.crm.feature.logistics.dispatch.DispatchViewModel

@OptIn(ExperimentalCoroutinesApi::class)
class DispatchViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    private val noDrivers = DispatchDriversUseCase { Result.success(emptyList()) }
    private val neverCreates = CreateDispatchUseCase { _, _, _ -> fail("createDispatch must not be called for a shipment dispatch") }
    private val neverDispatchesShipment = DispatchShipmentUseCase { _, _, _, _ -> fail("dispatchShipment must not be called for a whole-order dispatch") }

    @Test fun `whole-order dispatch sends the entered amount as expectedCollection`() = runTest {
        var captured: Money? = null
        val vm = DispatchViewModel(
            shipmentId = null, drivers = noDrivers,
            createDispatch = CreateDispatchUseCase { _, _, expectedCollection -> captured = expectedCollection; Result.success(Unit) },
            dispatchShipment = neverDispatchesShipment,
        )
        advanceUntilIdle()
        vm.setAmountDigits("500000")
        vm.submit()
        advanceUntilIdle()

        assertEquals(Money.parse("500000"), captured)
        assertTrue(vm.state.value.done)
    }

    @Test fun `shipment dispatch sends driverWillCollectCash false and a null cashToCollect when the switch is off`() = runTest {
        var capturedWillCollect: Boolean? = null
        var capturedCash: Money? = null
        val vm = DispatchViewModel(
            shipmentId = "s1", drivers = noDrivers, createDispatch = neverCreates,
            dispatchShipment = DispatchShipmentUseCase { _, _, willCollect, cash ->
                capturedWillCollect = willCollect; capturedCash = cash; Result.success(Unit)
            },
        )
        advanceUntilIdle()
        // Typed but never sent: the switch, not the typed digits, decides whether cash travels.
        vm.setAmountDigits("300000")
        vm.submit()
        advanceUntilIdle()

        assertEquals(false, capturedWillCollect)
        assertNull(capturedCash)
    }

    @Test fun `shipment dispatch sends the amount when the switch is on`() = runTest {
        var capturedWillCollect: Boolean? = null
        var capturedCash: Money? = null
        val vm = DispatchViewModel(
            shipmentId = "s1", drivers = noDrivers, createDispatch = neverCreates,
            dispatchShipment = DispatchShipmentUseCase { _, _, willCollect, cash ->
                capturedWillCollect = willCollect; capturedCash = cash; Result.success(Unit)
            },
        )
        advanceUntilIdle()
        vm.setWillCollectCash(true)
        vm.setAmountDigits("750000")
        vm.submit()
        advanceUntilIdle()

        assertEquals(true, capturedWillCollect)
        assertEquals(Money.parse("750000"), capturedCash)
    }

    @Test fun `submitting twice while the first call is in flight only calls the API once`() = runTest {
        var calls = 0
        val vm = DispatchViewModel(
            shipmentId = null, drivers = noDrivers,
            createDispatch = CreateDispatchUseCase { _, _, _ -> calls++; Result.success(Unit) },
            dispatchShipment = neverDispatchesShipment,
        )
        advanceUntilIdle()
        vm.setAmountDigits("500000") // a whole-order dispatch with no amount is refused before the network — see below
        vm.submit() // enters submitting=true synchronously, then suspends on the coroutine
        vm.submit() // a second tap before the first has resolved must not call the API twice
        advanceUntilIdle()

        assertEquals(1, calls)
        assertTrue(vm.state.value.done)
    }

    @Test fun `a Conflict error is shown verbatim and done stays false`() = runTest {
        // The exact bilingual string POST /api/orders/[id]/dispatch returns on a second dispatch
        // (see route.ts: order.dispatch is @unique, so a re-submit hits this 409, not a retryable
        // failure). ErrorMapper's uzbekMessage splits on " · " and keeps only the Uzbek half.
        val serverMessage = "Бу буюртма учун жўнатма аллақачон мавжуд · This order already has a dispatch"
        val vm = DispatchViewModel(
            shipmentId = null, drivers = noDrivers,
            createDispatch = CreateDispatchUseCase { _, _, _ -> Result.failure(ApiException(409, serverMessage)) },
            dispatchShipment = neverDispatchesShipment,
        )
        advanceUntilIdle()
        vm.setAmountDigits("500000")
        vm.submit()
        advanceUntilIdle()

        assertEquals("Бу буюртма учун жўнатма аллақачон мавжуд", vm.state.value.error)
        assertFalse(vm.state.value.done)
    }

    @Test fun `a whole-order dispatch with no amount is refused before the network, and the button stays blocked`() = runTest {
        val vm = DispatchViewModel(
            shipmentId = null, drivers = noDrivers,
            createDispatch = neverCreates,
            dispatchShipment = neverDispatchesShipment,
        )
        advanceUntilIdle()
        vm.submit()
        advanceUntilIdle()

        assertNotNull(vm.state.value.error)
        assertFalse(vm.state.value.done)
        assertFalse(vm.state.value.submitting)
    }

    @Test fun `a per-shipment dispatch with no cash is legitimate and is never refused for a zero amount`() = runTest {
        var calls = 0
        val vm = DispatchViewModel(
            shipmentId = "s1", drivers = noDrivers, createDispatch = neverCreates,
            dispatchShipment = DispatchShipmentUseCase { _, _, _, _ -> calls++; Result.success(Unit) },
        )
        advanceUntilIdle()
        // willCollectCash stays off, amountDigits stays empty — this must still dispatch.
        vm.submit()
        advanceUntilIdle()

        assertEquals(1, calls)
        assertTrue(vm.state.value.done)
    }

    @Test fun `a non-network driver-fetch failure keeps its own message and does not report offline`() = runTest {
        val vm = DispatchViewModel(
            shipmentId = null,
            drivers = DispatchDriversUseCase { Result.failure(ApiException(403, "Рухсат йўқ · Forbidden")) },
            createDispatch = neverCreates, dispatchShipment = neverDispatchesShipment,
        )
        advanceUntilIdle()

        assertEquals("Рухсат йўқ", vm.state.value.driversErrorMessage)
        assertFalse(vm.state.value.isOffline)
    }

    @Test fun `a network driver-fetch failure reports offline and blocks submission`() = runTest {
        val vm = DispatchViewModel(
            shipmentId = null,
            drivers = DispatchDriversUseCase { Result.failure(IOException("тармоқ йўқ")) },
            createDispatch = neverCreates, dispatchShipment = neverDispatchesShipment,
        )
        advanceUntilIdle()

        assertTrue(vm.state.value.isOffline)
        assertNotNull(vm.state.value.driversErrorMessage)
    }

    /** The guard belongs in the ViewModel, not only on the disabled button: the button is not a
     *  seam a test can reach, and neither dispatch route is idempotent, so a submit that got
     *  through offline would be sent and fail rather than be refused. */
    @Test fun `submitting while offline is refused before any dispatch call`() = runTest {
        var calls = 0
        val vm = DispatchViewModel(
            shipmentId = null,
            drivers = DispatchDriversUseCase { Result.failure(IOException("тармоқ йўқ")) },
            createDispatch = CreateDispatchUseCase { _, _, _ -> calls++; Result.success(Unit) },
            dispatchShipment = neverDispatchesShipment,
        )
        advanceUntilIdle()
        vm.setAmountDigits("1500000")

        vm.submit()
        advanceUntilIdle()

        assertEquals(0, calls, "nothing may reach the network while offline")
        assertFalse(vm.state.value.done)
        assertEquals("Интернет йўқ — бу амал онлайн бажарилади", vm.state.value.error)
    }

    @Test fun `refreshDrivers retries the driver fetch and clears a previous failure`() = runTest {
        var shouldFail = true
        val vm = DispatchViewModel(
            shipmentId = null,
            drivers = DispatchDriversUseCase { if (shouldFail) Result.failure(IOException("тармоқ йўқ")) else Result.success(emptyList()) },
            createDispatch = neverCreates, dispatchShipment = neverDispatchesShipment,
        )
        advanceUntilIdle()
        assertTrue(vm.state.value.isOffline)

        shouldFail = false
        vm.refreshDrivers()
        advanceUntilIdle()

        assertFalse(vm.state.value.isOffline)
        assertNull(vm.state.value.driversErrorMessage)
    }
}
