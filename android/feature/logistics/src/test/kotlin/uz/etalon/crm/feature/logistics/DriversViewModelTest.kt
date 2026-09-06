package uz.etalon.crm.feature.logistics

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.Driver
import uz.etalon.crm.feature.logistics.drivers.DriverCreateUseCase
import uz.etalon.crm.feature.logistics.drivers.DriverSetActiveUseCase
import uz.etalon.crm.feature.logistics.drivers.DriversListUseCase
import uz.etalon.crm.feature.logistics.drivers.DriversViewModel
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class DriversViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    private fun driver(id: String, name: String, active: Boolean) =
        Driver(id, name, "998901112233", null, active, activeDispatchCount = 0, discrepancyCount30d = 0, lastDispatchAt = null)

    @Test fun `the list loads and filters to active only`() = runTest {
        val active = driver("d1", "Актив", true)
        val inactive = driver("d2", "Ноактив", false)
        val vm = DriversViewModel(
            list = DriversListUseCase { activeOnly -> Result.success(if (activeOnly) listOf(active) else listOf(active, inactive)) },
            create = DriverCreateUseCase { _, _, _ -> Result.success(active) },
            setActive = DriverSetActiveUseCase { _, _ -> Result.success(active) },
        )
        advanceUntilIdle()
        assertEquals(2, vm.state.value.drivers.size)
        assertFalse(vm.state.value.activeOnly)

        vm.setActiveOnly(true)
        advanceUntilIdle()
        assertEquals(listOf(active), vm.state.value.drivers)
        assertTrue(vm.state.value.activeOnly)
    }

    @Test fun `creating a driver with a blank name is refused before the network is touched`() = runTest {
        var calls = 0
        val vm = DriversViewModel(
            list = DriversListUseCase { Result.success(emptyList()) },
            create = DriverCreateUseCase { _, _, _ -> calls++; Result.success(driver("d1", "x", true)) },
            setActive = DriverSetActiveUseCase { _, _ -> Result.success(driver("d1", "x", true)) },
        )
        advanceUntilIdle()

        vm.create("   ", "998901112233", null)
        advanceUntilIdle()

        assertEquals(0, calls)
        assertNotNull(vm.state.value.error)
    }

    @Test fun `setActive false moves a driver out of the active filter`() = runTest {
        var currentlyActive = true
        val vm = DriversViewModel(
            list = DriversListUseCase { activeOnly ->
                val rows = if (currentlyActive) listOf(driver("d1", "Ҳайдовчи", true)) else emptyList()
                Result.success(if (activeOnly) rows else listOf(driver("d1", "Ҳайдовчи", currentlyActive)))
            },
            create = DriverCreateUseCase { _, _, _ -> Result.success(driver("d1", "Ҳайдовчи", true)) },
            setActive = DriverSetActiveUseCase { id, active -> currentlyActive = active; Result.success(driver(id, "Ҳайдовчи", active)) },
        )
        vm.setActiveOnly(true)
        advanceUntilIdle()
        assertEquals(1, vm.state.value.drivers.size)

        vm.setActive("d1", false)
        advanceUntilIdle()

        assertTrue(vm.state.value.drivers.isEmpty())
    }

    @Test fun `an API failure surfaces AppError message and keeps the previous list`() = runTest {
        val existing = listOf(driver("d1", "Ҳайдовчи", true))
        var shouldFail = false
        val vm = DriversViewModel(
            list = DriversListUseCase { if (shouldFail) Result.failure(IOException("тармоқ йўқ")) else Result.success(existing) },
            create = DriverCreateUseCase { _, _, _ -> Result.success(existing[0]) },
            setActive = DriverSetActiveUseCase { _, _ -> Result.success(existing[0]) },
        )
        advanceUntilIdle()
        assertEquals(existing, vm.state.value.drivers)

        shouldFail = true
        vm.refresh()
        advanceUntilIdle()

        assertEquals(existing, vm.state.value.drivers)
        assertNotNull(vm.state.value.error)
    }
}
