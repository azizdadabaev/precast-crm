package uz.etalon.crm.feature.browse

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.stateIn
import uz.etalon.crm.core.data.BrowseRepository
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.model.GalleryPost
import uz.etalon.crm.core.model.Resource
import javax.inject.Inject

/** «Галерея». The route searches order number, client name, phone and address, so the query goes
 *  to the server rather than being applied to the page already in hand. */
@OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
@HiltViewModel
class GalleryViewModel @Inject constructor(private val repo: BrowseRepository) : ViewModel() {

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()
    private val reload = MutableStateFlow(0)

    val state: StateFlow<Resource<List<GalleryPost>>> =
        combine(_query.debounce { if (it.isBlank()) 0 else SEARCH_DEBOUNCE_MS }, reload) { q, _ -> q }
            .flatMapLatest { q ->
                flow {
                    emit(Resource.Loading(null))
                    emit(
                        repo.gallery(page = 1, query = q).fold(
                            onSuccess = { Resource.Success(it.posts) },
                            onFailure = { Resource.Error(null, it.toAppError()) },
                        ),
                    )
                }
            }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), Resource.Loading(null))

    fun setQuery(value: String) { _query.value = value }
    fun refresh() { reload.value++ }
}
