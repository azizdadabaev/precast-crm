package uz.etalon.crm.feature.logistics

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.feature.logistics.loadtruck.LoadTruckUseCase
import uz.etalon.crm.feature.logistics.loadtruck.LoadTruckViewModel
import java.io.File

@OptIn(ExperimentalCoroutinesApi::class)
class LoadTruckViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    private val photo = PreparedImage(File("/tmp/x.jpg"), 1280, 853, 100)

    @Test fun `submitting without a photo is impossible`() = runTest {
        var calls = 0
        val vm = LoadTruckViewModel("o1", LoadTruckUseCase { _, _ -> calls++; Result.success("ob1") })
        vm.submit()
        advanceUntilIdle()
        assertEquals(0, calls)
        assertNotNull(vm.state.value.error)
    }

    @Test fun `a captured photo is queued and the screen reports done`() = runTest {
        val vm = LoadTruckViewModel("o1", LoadTruckUseCase { id, p ->
            assertEquals("o1", id); assertEquals(photo, p); Result.success("ob1")
        })
        vm.onPhoto(photo)
        vm.submit()
        advanceUntilIdle()
        assertTrue(vm.state.value.done)
        assertFalse(vm.state.value.submitting)
    }

    @Test fun `a failure keeps the photo so the operator can retry without re-shooting`() = runTest {
        val vm = LoadTruckViewModel("o1", LoadTruckUseCase { _, _ -> Result.failure(IllegalStateException("диск тўлди")) })
        vm.onPhoto(photo)
        vm.submit()
        advanceUntilIdle()
        assertFalse(vm.state.value.done)
        assertEquals(photo, vm.state.value.photo)
        assertNotNull(vm.state.value.error)
    }

    @Test fun `retaking clears the previous photo`() = runTest {
        val vm = LoadTruckViewModel("o1", LoadTruckUseCase { _, _ -> Result.success("ob1") })
        vm.onPhoto(photo)
        vm.retake()
        assertNull(vm.state.value.photo)
    }
}
