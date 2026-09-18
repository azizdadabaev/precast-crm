package uz.etalon.crm.feature.browse

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import android.net.Uri
import uz.etalon.crm.core.image.ImagePrep
import uz.etalon.crm.core.ui.location.DeviceLocation
import uz.etalon.crm.core.data.BrowseRepository
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.model.ChatProject
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.Thread
import javax.inject.Inject

/**
 * One conversation.
 *
 * Every send re-reads the thread rather than appending the returned message locally. The route
 * answers with the bubble it persisted, so appending would work — but a send is also when the
 * customer is most likely to have written back, and one extra GET on a 500-message cap is cheaper
 * than a thread that silently drifts out of order.
 */
@HiltViewModel(assistedFactory = ThreadViewModel.Factory::class)
class ThreadViewModel @AssistedInject constructor(
    private val repo: BrowseRepository,
    private val imagePrep: ImagePrep,
    private val deviceLocation: DeviceLocation,
    @Assisted private val conversationId: String,
) : ViewModel() {

    @AssistedFactory
    interface Factory {
        fun create(conversationId: String): ThreadViewModel
    }

    private val _state = MutableStateFlow<Resource<Thread>>(Resource.Loading(null))
    val state: StateFlow<Resource<Thread>> = _state.asStateFlow()

    private val _draft = MutableStateFlow("")
    val draft: StateFlow<String> = _draft.asStateFlow()

    private val _sending = MutableStateFlow(false)
    val sending: StateFlow<Boolean> = _sending.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    /** The quotes already attached to this chat, for «Лойиҳа юбориш». Loaded lazily. */
    private val _projects = MutableStateFlow<List<ChatProject>>(emptyList())
    val projects: StateFlow<List<ChatProject>> = _projects.asStateFlow()

    init {
        refresh()
        loadProjects()
    }

    fun refresh() {
        viewModelScope.launch {
            // Keeps what is on screen while re-reading: a thread that blanks on every send is
            // unreadable to anyone typing quickly.
            _state.value = Resource.Loading(_state.value.dataOrNull)
            _state.value = repo.thread(conversationId).fold(
                onSuccess = { Resource.Success(it) },
                onFailure = { Resource.Error(_state.value.dataOrNull, it.toAppError()) },
            )
        }
    }

    private fun loadProjects() {
        viewModelScope.launch {
            repo.chatProjects(conversationId).onSuccess { _projects.value = it }
        }
    }

    fun setDraft(value: String) { _draft.value = value }

    fun sendText() {
        val text = _draft.value.trim()
        if (text.isEmpty() || _sending.value) return
        send { repo.sendText(conversationId, text).onSuccess { _draft.value = "" } }
    }

    /**
     * Re-encodes before sending. The route takes jpeg/png/webp and caps at 8 MB; a modern phone's
     * own camera file is routinely larger than that, so an untouched pick would simply be refused.
     */
    fun sendPhotoFromUri(uri: Uri, caption: String) = send {
        imagePrep.prepare(uri).mapCatching { prepared ->
            repo.sendPhoto(conversationId, prepared.file, caption).getOrThrow()
            _draft.value = ""
        }
    }

    /**
     * Sends where the operator is standing.
     *
     * There is no map picker on this screen: the case it serves is an operator at a delivery point
     * telling a customer where they are. Picking an arbitrary point on a map is the delivery-location
     * screen's job, and it already exists.
     */
    fun sendCurrentLocation() = send {
        deviceLocation.current().mapCatching { at ->
            repo.sendLocation(conversationId, at.lat, at.lng).getOrThrow()
        }
    }

    fun sendProject(projectId: String) = send { repo.sendProjectToChat(projectId) }

    fun dismissError() { _error.value = null }

    /** One place decides what a failed send does: it says so and leaves the thread alone. */
    private fun send(block: suspend () -> Result<Unit>) {
        if (_sending.value) return
        _sending.value = true
        _error.value = null
        viewModelScope.launch {
            block().fold(
                onSuccess = { _sending.value = false; refresh() },
                onFailure = { t -> _sending.value = false; _error.value = t.toAppError().message },
            )
        }
    }
}
