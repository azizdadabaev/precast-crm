package uz.etalon.crm

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.Bootstrap
import uz.etalon.crm.core.model.CapacityThresholds
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Pricing
import uz.etalon.crm.core.model.Role

@OptIn(ExperimentalCoroutinesApi::class)
class MainViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    private val me = Me("u1", "Азиз", Role.SALES, setOf("order.view"), mustChangePassword = false)
    private fun bootstrapOf(m: Me) = Bootstrap(m, Pricing(emptyList(), emptyList(), 0L), CapacityThresholds(1, 2, 3), "0.1.0")

    private class FakeSession(
        loggedIn: Boolean,
        private val outcome: Result<Bootstrap>,
        persisted: Me? = null,
        /** A 401: the interceptor clears the token before bootstrap() returns. */
        private val clearsTokenOnFailure: Boolean = false,
    ) : SessionGateway {
        val loggedInState = MutableStateFlow(loggedIn)
        val lastMeState = MutableStateFlow(persisted)
        var signOutCalls = 0

        override val isLoggedIn: Flow<Boolean> get() = loggedInState
        override val lastMe: Flow<Me?> get() = lastMeState
        override suspend fun bootstrap(): Result<Bootstrap> {
            if (outcome.isFailure && clearsTokenOnFailure) loggedInState.value = false
            return outcome
        }
        override suspend fun signOut() {
            signOutCalls++
            loggedInState.value = false
            lastMeState.value = null
        }
    }

    private class FakeDevices : DeviceGateway { var calls = 0; override suspend fun unregisterCurrent() { calls++ } }
    private class FakePush : PushGateway { var calls = 0; override suspend fun registerIfPossible() { calls++ } }

    @Test
    fun `a successful bootstrap signs the user in and registers for push`() = runTest {
        val session = FakeSession(loggedIn = true, outcome = Result.success(bootstrapOf(me)))
        val push = FakePush()
        val vm = MainViewModel(session, FakeDevices(), push)
        advanceUntilIdle()
        assertEquals(AppState.SignedIn(me), vm.state.value)
        assertEquals(1, push.calls)
        assertEquals(0, session.signOutCalls)
    }

    @Test
    fun `an offline bootstrap falls back to the persisted user instead of forcing a re-login`() = runTest {
        val session = FakeSession(
            loggedIn = true,
            outcome = Result.failure(java.io.IOException("timeout")),
            persisted = me,
        )
        val vm = MainViewModel(session, FakeDevices(), FakePush())
        advanceUntilIdle()
        assertEquals(AppState.SignedIn(me), vm.state.value)
        assertEquals(0, session.signOutCalls)
    }

    @Test
    fun `a 401 wipes the local session before showing the PIN screen`() = runTest {
        val session = FakeSession(
            loggedIn = true,
            outcome = Result.failure(IllegalStateException("401")),
            persisted = me,
            clearsTokenOnFailure = true,
        )
        val devices = FakeDevices()
        val vm = MainViewModel(session, devices, FakePush())
        advanceUntilIdle()
        assertEquals(AppState.SignedOut(), vm.state.value)
        // signOut() is what wipes Room and the order cache; without it user B sees user A's orders.
        assertTrue(session.signOutCalls >= 1, "signOut() must run on the 401 path")
        // Unregistering the device needs a live token, so it is skipped here.
        assertEquals(0, devices.calls)
    }

    @Test
    fun `a PIN change signs out with the login hint`() = runTest {
        val session = FakeSession(loggedIn = true, outcome = Result.success(bootstrapOf(me)))
        val vm = MainViewModel(session, FakeDevices(), FakePush())
        advanceUntilIdle()
        vm.onPinChanged()
        advanceUntilIdle()
        assertEquals(AppState.SignedOut(R.string.login_after_pin_change), vm.state.value)
        assertTrue(session.signOutCalls >= 1)
    }

    @Test
    fun `a cold start with no token goes straight to the PIN screen`() = runTest {
        val session = FakeSession(loggedIn = false, outcome = Result.failure(IllegalStateException("never called")))
        val vm = MainViewModel(session, FakeDevices(), FakePush())
        advanceUntilIdle()
        val s = vm.state.value
        assertEquals(AppState.SignedOut(), s)
        assertNull((s as AppState.SignedOut).hintRes)
    }
}
