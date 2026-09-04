package uz.etalon.crm.feature.auth

import app.cash.turbine.test
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Role
import uz.etalon.crm.core.network.ApiException

@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    private class FakeLogin(val outcome: Result<Me>) : LoginUseCase { var calls = 0; override suspend fun invoke(n: String, p: String) = outcome.also { calls++ } }
    private val me = Me("u1", "Азиз", Role.SALES, setOf("order.view"), mustChangePassword = false)

    @Test fun `submit is auto-triggered on the 4th digit and reports done`() = runTest {
        val login = FakeLogin(Result.success(me))
        val vm = LoginViewModel(login, initialLoginName = "Азиз")
        vm.state.test {
            awaitItem()
            "1234".forEach { vm.pressDigit(it) }
            advanceUntilIdle()
            val last = expectMostRecentItem()
            assertEquals(me, last.done)
            assertEquals(1, login.calls)
        }
    }
    @Test fun `a wrong PIN shows the Uzbek error and clears the pin`() = runTest {
        val vm = LoginViewModel(FakeLogin(Result.failure(ApiException(401, "Логин ёки PIN нотўғри · Invalid credentials"))), "Азиз")
        "1234".forEach { vm.pressDigit(it) }
        advanceUntilIdle()
        assertEquals("Логин ёки PIN нотўғри", vm.state.value.error)
        assertEquals("", vm.state.value.pin)
    }
    @Test fun `submit requires a login name`() = runTest {
        val login = FakeLogin(Result.success(me))
        val vm = LoginViewModel(login, "")
        "1234".forEach { vm.pressDigit(it) }
        advanceUntilIdle()
        assertEquals(0, login.calls)
        assertNotNull(vm.state.value.error)
    }
}
