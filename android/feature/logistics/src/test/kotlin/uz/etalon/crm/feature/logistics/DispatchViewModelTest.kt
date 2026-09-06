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
        vm.submit() // enters submitting=true synchronously, then suspends on the coroutine
        vm.submit() // a second tap before the first has resolved must not call the API twice
        advanceUntilIdle()

        assertEquals(1, calls)
        assertTrue(vm.state.value.done)
    }

    @Test fun `a Conflict error is shown verbatim and done stays false`() = runTest {
        val message = "Бу буюртма учун жўнатма аллақачон мавжуд"
        val vm = DispatchViewModel(
            shipmentId = null, drivers = noDrivers,
            createDispatch = CreateDispatchUseCase { _, _, _ -> Result.failure(ApiException(409, message)) },
            dispatchShipment = neverDispatchesShipment,
        )
        advanceUntilIdle()
        vm.submit()
        advanceUntilIdle()

        assertEquals(message, vm.state.value.error)
        assertFalse(vm.state.value.done)
    }
}
