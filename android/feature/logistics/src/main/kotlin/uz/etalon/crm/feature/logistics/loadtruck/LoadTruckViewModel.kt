package uz.etalon.crm.feature.logistics.loadtruck

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.LogisticsRepository
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.image.ImagePrep
import uz.etalon.crm.core.image.PreparedImage

data class LoadTruckUiState(
    val photo: PreparedImage? = null,
    val submitting: Boolean = false,
    val error: String? = null,
    val done: Boolean = false,
)

fun interface LoadTruckUseCase {
    suspend operator fun invoke(orderId: String, photo: PreparedImage): Result<String>
}

open class LoadTruckViewModel(
    private val orderId: String,
    private val load: LoadTruckUseCase,
) : ViewModel() {
    private val _state = MutableStateFlow(LoadTruckUiState())
    val state: StateFlow<LoadTruckUiState> = _state.asStateFlow()

    fun onPhoto(p: PreparedImage) = _state.update { it.copy(photo = p, error = null) }
    fun retake() = _state.update { it.copy(photo = null, error = null) }

    fun submit() {
        val photo = _state.value.photo
        if (photo == null) {
            _state.update { it.copy(error = "Аввал расм олинг") }
            return
        }
        if (_state.value.submitting) return
        _state.update { it.copy(submitting = true, error = null) }
        viewModelScope.launch {
            load(orderId, photo).fold(
                onSuccess = { _state.update { s -> s.copy(submitting = false, done = true) } },
                onFailure = { t -> _state.update { s -> s.copy(submitting = false, error = t.toAppError().message) } },
            )
        }
    }
}

@HiltViewModel(assistedFactory = HiltLoadTruckViewModel.Factory::class)
class HiltLoadTruckViewModel @AssistedInject constructor(
    repo: LogisticsRepository,
    val imagePrep: ImagePrep,
    @Assisted("orderId") orderId: String,
    @Assisted("extra") extraPhoto: Boolean,
) : LoadTruckViewModel(
    orderId,
    LoadTruckUseCase { id, photo ->
        if (extraPhoto) repo.addLoadedPhoto(id, photo) else repo.loadTruck(id, photo)
    },
) {
    @AssistedFactory
    interface Factory {
        fun create(@Assisted("orderId") orderId: String, @Assisted("extra") extraPhoto: Boolean): HiltLoadTruckViewModel
    }
}
