package uz.etalon.crm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.DeviceRepository
import uz.etalon.crm.core.data.SessionRepository
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.push.PushRegistrar
import javax.inject.Inject

sealed interface AppState {
    data object Booting : AppState
    data object SignedOut : AppState
    data class SignedIn(val me: Me) : AppState
}

@HiltViewModel
class MainViewModel @Inject constructor(
    private val session: SessionRepository,
    private val devices: DeviceRepository,
    private val push: PushRegistrar,
) : ViewModel() {
    private val _state = MutableStateFlow<AppState>(AppState.Booting)
    val state: StateFlow<AppState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            if (session.isLoggedIn.first()) {
                session.bootstrap().onSuccess { onSignedIn(it.me) }.onFailure { _state.value = AppState.SignedOut }
            } else {
                _state.value = AppState.SignedOut
            }
            // AuthInterceptor clears the token on a 401 -> drop to the PIN screen from anywhere.
            session.isLoggedIn.collect { if (!it) _state.value = AppState.SignedOut }
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
            _state.value = AppState.SignedOut
        }
    }
}
