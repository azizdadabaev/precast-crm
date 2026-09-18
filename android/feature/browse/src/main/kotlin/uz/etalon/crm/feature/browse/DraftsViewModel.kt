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
import uz.etalon.crm.core.model.DraftLine
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.data.toAppError
import javax.inject.Inject

/**
 * «Лойиҳалар».
 *
 * The search is debounced and sent to the server rather than filtered here: the route matches on
 * the client's name, both address fields and the phone in its `phoneMatchForms` shape, so typing
 * the last four digits of a number finds the project. A client-side filter over one page could not
 * do any of that.
 */
@OptIn(ExperimentalCoroutinesApi::class, FlowPreview::class)
@HiltViewModel
class DraftsViewModel @Inject constructor(private val repo: BrowseRepository) : ViewModel() {

    private val _query = MutableStateFlow("")
    val query: StateFlow<String> = _query.asStateFlow()

    private val _draftsOnly = MutableStateFlow(true)
    val draftsOnly: StateFlow<Boolean> = _draftsOnly.asStateFlow()

    /** Bumped to re-run the same query after a failure. */
    private val reload = MutableStateFlow(0)

    val state: StateFlow<Resource<List<DraftLine>>> =
        combine(_query.debounce { if (it.isBlank()) 0 else SEARCH_DEBOUNCE_MS }, _draftsOnly, reload) { q, only, _ ->
            q to only
        }.flatMapLatest { (q, only) ->
            flow {
                emit(Resource.Loading(null))
                emit(
                    repo.drafts(page = 1, query = q, draftsOnly = only).fold(
                        onSuccess = { Resource.Success(it.rows) },
                        onFailure = { Resource.Error(null, it.toAppError()) },
                    ),
                )
            }
        }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), Resource.Loading(null))

    fun setQuery(value: String) { _query.value = value }
    fun setDraftsOnly(value: Boolean) { _draftsOnly.value = value }
    fun refresh() { reload.value++ }
}

/** Long enough that a name is not four requests, short enough that the list does not feel stuck. */
private const val SEARCH_DEBOUNCE_MS = 300L
