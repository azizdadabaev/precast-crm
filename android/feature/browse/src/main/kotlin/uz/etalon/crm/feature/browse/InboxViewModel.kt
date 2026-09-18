package uz.etalon.crm.feature.browse

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn
import uz.etalon.crm.core.data.BrowseRepository
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.model.Conversation
import uz.etalon.crm.core.model.Resource
import javax.inject.Inject

/**
 * «Хабарлар».
 *
 * No debounce and no server query: the route takes no parameters and returns the whole list, so
 * the search is a filter over data already in hand.
 */
@OptIn(ExperimentalCoroutinesApi::class)
@HiltViewModel
class InboxViewModel @Inject constructor(private val repo: BrowseRepository) : ViewModel() {

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()
    private val reload = MutableStateFlow(0)

    val state: StateFlow<Resource<List<Conversation>>> =
        reload.flatMapLatest {
            flow {
                emit(Resource.Loading(null))
                emit(
                    repo.conversations().fold(
                        onSuccess = { Resource.Success(it) },
                        onFailure = { Resource.Error(null, it.toAppError()) },
                    ),
                )
            }
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), Resource.Loading(null))

    // ── The password gate ─────────────────────────────────────────────

    private val _password = MutableStateFlow("")
    val password: StateFlow<String> = _password.asStateFlow()

    private val _unlocking = MutableStateFlow(false)
    val unlocking: StateFlow<Boolean> = _unlocking.asStateFlow()

    private val _unlockError = MutableStateFlow<String?>(null)
    val unlockError: StateFlow<String?> = _unlockError.asStateFlow()

    fun setPassword(v: String) { _password.value = v; _unlockError.value = null }

    /** On success the token is stored and the list is simply re-requested — the interceptor now
     *  carries the header, so the same call that was refused a moment ago succeeds. */
    fun unlock() {
        val pw = _password.value
        if (pw.isBlank() || _unlocking.value) return
        _unlocking.value = true
        _unlockError.value = null
        viewModelScope.launch {
            repo.unlockInbox(pw).fold(
                onSuccess = {
                    _password.value = ""
                    _unlocking.value = false
                    reload.value++
                },
                onFailure = { t ->
                    _unlocking.value = false
                    _unlockError.value = t.toAppError().message
                },
            )
        }
    }

    fun setQuery(value: String) { _query.value = value }
    fun refresh() { reload.value++ }
}
