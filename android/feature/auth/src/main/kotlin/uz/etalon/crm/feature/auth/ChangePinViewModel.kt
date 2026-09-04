package uz.etalon.crm.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.SessionRepository
import uz.etalon.crm.core.data.toAppError
import javax.inject.Inject

data class ChangePinUiState(val current: String = "", val next: String = "", val confirm: String = "", val isSubmitting: Boolean = false, val error: String? = null, val done: Boolean = false)

@HiltViewModel
class ChangePinViewModel @Inject constructor(private val session: SessionRepository) : ViewModel() {
    private val _state = MutableStateFlow(ChangePinUiState())
    val state = _state.asStateFlow()
    fun setCurrent(v: String) = _state.update { it.copy(current = v.filter(Char::isDigit).take(4), error = null) }
    fun setNext(v: String) = _state.update { it.copy(next = v.filter(Char::isDigit).take(4), error = null) }
    fun setConfirm(v: String) = _state.update { it.copy(confirm = v.filter(Char::isDigit).take(4), error = null) }
    fun submit(forced: Boolean) {
        val s = _state.value
        if (s.next.length != 4) { _state.update { it.copy(error = "Янги PIN 4 та рақам бўлиши керак") }; return }
        if (s.next != s.confirm) { _state.update { it.copy(error = "PIN лар мос эмас") }; return }
        if (!forced && s.current.length != 4) { _state.update { it.copy(error = "Жорий PIN керак") }; return }
        _state.update { it.copy(isSubmitting = true) }
        viewModelScope.launch {
            session.changePin(if (forced) "" else s.current, s.next).fold(
                onSuccess = { _state.update { it.copy(isSubmitting = false, done = true) } },
                onFailure = { t -> _state.update { it.copy(isSubmitting = false, error = t.toAppError().message) } },
            )
        }
    }
}
