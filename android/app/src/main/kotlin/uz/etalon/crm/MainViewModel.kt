package uz.etalon.crm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.DeviceRepository
import uz.etalon.crm.core.data.SessionRepository
import uz.etalon.crm.core.model.Bootstrap
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.push.PushRegistrar
import javax.inject.Inject

sealed interface AppState {
    data object Booting : AppState

    /** [hintRes] is an optional Uzbek info line for the login screen, e.g. after a PIN change. */
    data class SignedOut(val hintRes: Int? = null) : AppState
    data class SignedIn(val me: Me) : AppState
}

/** Seams so the ViewModel is testable without Hilt, matching the :feature:auth use-case pattern. */
interface SessionGateway {
    val isLoggedIn: Flow<Boolean>
    val lastMe: Flow<Me?>
    suspend fun bootstrap(): Result<Bootstrap>
    suspend fun signOut()
}

fun interface DeviceGateway { suspend fun unregisterCurrent() }
fun interface PushGateway { suspend fun registerIfPossible() }

open class MainViewModel(
    private val session: SessionGateway,
    private val devices: DeviceGateway,
    private val push: PushGateway,
) : ViewModel() {
    private val _state = MutableStateFlow<AppState>(AppState.Booting)
    val state: StateFlow<AppState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            if (session.isLoggedIn.first()) {
                session.bootstrap()
                    .onSuccess { onSignedIn(it.me) }
                    .onFailure {
                        // A 401 has already cleared the token; the collector below handles it.
                        // Anything else (timeout, no network) must not evict a signed-in user, so
                        // fall back to the identity persisted at the last login/bootstrap.
                        val cached = if (session.isLoggedIn.first()) session.lastMe.first() else null
                        if (cached != null) onSignedIn(cached) else _state.value = AppState.SignedOut()
                    }
            } else {
                _state.value = AppState.SignedOut()
            }
            // AuthInterceptor clears the token on a 401 -> drop to the PIN screen from anywhere.
            session.isLoggedIn.collect { loggedIn ->
                if (loggedIn) return@collect
                // Clearing the token is not enough: without signOut() the Room tables and the
                // in-memory order cache survive, and the next user to sign in on this device
                // would see the previous user's orders. Device unregistration is deliberately
                // skipped — it needs a live token; the server prunes dead ones.
                session.signOut()
                // Never clobber a SignedOut that already carries a hint.
                if (_state.value !is AppState.SignedOut) _state.value = AppState.SignedOut()
            }
        }
    }

    fun onSignedIn(me: Me) {
        _state.value = AppState.SignedIn(me)
        viewModelScope.launch { push.registerIfPossible() }
    }

    fun signOut() {
        viewModelScope.launch {
            devices.unregisterCurrent()
            session.signOut()
            _state.value = AppState.SignedOut()
        }
    }

    /** A successful PIN change revokes the current token server-side, so the session is over. */
    fun onPinChanged() {
        viewModelScope.launch {
            session.signOut()
            _state.value = AppState.SignedOut(hintRes = R.string.login_after_pin_change)
        }
    }
}

private class SessionRepositoryGateway(private val repo: SessionRepository) : SessionGateway {
    override val isLoggedIn: Flow<Boolean> get() = repo.isLoggedIn
    override val lastMe: Flow<Me?> get() = repo.lastMe
    override suspend fun bootstrap(): Result<Bootstrap> = repo.bootstrap()
    override suspend fun signOut() = repo.signOut()
}

@HiltViewModel
class HiltMainViewModel @Inject constructor(
    session: SessionRepository,
    devices: DeviceRepository,
    push: PushRegistrar,
) : MainViewModel(
    SessionRepositoryGateway(session),
    DeviceGateway { devices.unregisterCurrent() },
    PushGateway { push.registerIfPossible() },
)
