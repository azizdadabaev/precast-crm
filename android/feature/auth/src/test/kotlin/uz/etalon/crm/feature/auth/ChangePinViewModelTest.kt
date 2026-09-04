package uz.etalon.crm.feature.auth

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.network.ApiException

@OptIn(ExperimentalCoroutinesApi::class)
class ChangePinViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    private class FakeChangePin(val outcome: Result<Unit>) : ChangePinUseCase {
        var calls = 0
        var lastCurrent: String? = null
        override suspend fun invoke(current: String, next: String) = outcome.also { calls++; lastCurrent = current }
    }

    @Test fun `a wrong current PIN shows the server's Uzbek error`() = runTest {
        val vm = ChangePinViewModel(FakeChangePin(Result.failure(ApiException(401, "Жорий PIN нотўғри · Current PIN is wrong"))))
        vm.setCurrent("1111"); vm.setNext("2222"); vm.setConfirm("2222")
        vm.submit(forced = false)
        advanceUntilIdle()
        assertEquals("Жорий PIN нотўғри", vm.state.value.error)
    }

    @Test fun `the forced flow sends an empty current PIN and reports done`() = runTest {
        val changePin = FakeChangePin(Result.success(Unit))
        val vm = ChangePinViewModel(changePin)
        vm.setNext("2222"); vm.setConfirm("2222")
        vm.submit(forced = true)
        advanceUntilIdle()
        assertEquals("", changePin.lastCurrent)
        assertEquals(1, changePin.calls)
        assertTrue(vm.state.value.done)
    }

    @Test fun `a mismatched confirm PIN is rejected before the use case is called`() = runTest {
        val changePin = FakeChangePin(Result.success(Unit))
        val vm = ChangePinViewModel(changePin)
        vm.setCurrent("1111"); vm.setNext("2222"); vm.setConfirm("3333")
        vm.submit(forced = false)
        advanceUntilIdle()
        assertEquals(0, changePin.calls)
        assertEquals("PIN лар мос эмас", vm.state.value.error)
    }
}
