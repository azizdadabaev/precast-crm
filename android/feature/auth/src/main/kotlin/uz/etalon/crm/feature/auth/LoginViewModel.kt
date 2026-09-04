package uz.etalon.crm.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.SessionRepository
import uz.etalon.crm.core.datastore.SessionPrefs
import uz.etalon.crm.core.model.Me
import javax.inject.Inject

/** Seam so the ViewModel is testable without Hilt. */
fun interface LoginUseCase { suspend operator fun invoke(loginName: String, pin: String): Result<Me> }

data class LoginUiState(val loginName: String = "", val pin: String = "", val isSubmitting: Boolean = false, val error: String? = null, val done: Me? = null)

open class LoginViewModel(private val login: LoginUseCase, initialLoginName: String) : ViewModel() {
    private val _state = MutableStateFlow(LoginUiState(loginName = initialLoginName))
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    fun setLoginName(v: String) = _state.update { it.copy(loginName = v, error = null) }
    fun backspace() = _state.update { it.copy(pin = it.pin.dropLast(1), error = null) }
    fun pressDigit(d: Char) {
        if (!d.isDigit() || _state.value.isSubmitting) return
        val next = (_state.value.pin + d).take(4)
        _state.update { it.copy(pin = next, error = null) }
        if (next.length == 4) submit()
    }
    fun submit() {
        val s = _state.value
        if (s.loginName.isBlank()) { _state.update { it.copy(error = "Логин киритинг", pin = "") }; return }
        if (s.pin.length != 4) return
        _state.update { it.copy(isSubmitting = true) }
        viewModelScope.launch {
            login(s.loginName, s.pin).fold(
                onSuccess = { me -> _state.update { it.copy(isSubmitting = false, done = me) } },
                onFailure = { t -> _state.update { it.copy(isSubmitting = false, pin = "", error = t.credentialErrorMessage()) } },
            )
        }
    }
}

@HiltViewModel
class HiltLoginViewModel @Inject constructor(session: SessionRepository, prefs: SessionPrefs) :
    LoginViewModel(LoginUseCase { n, p -> session.login(n, p) }, initialLoginName = "") {
    init { viewModelScope.launch { prefs.lastLoginName.first()?.let { setLoginName(it) } } }
}
