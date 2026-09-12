package uz.etalon.crm.feature.orders.detail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.Binds
import dagger.Module
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.InstallIn
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.LogisticsRepository
import uz.etalon.crm.core.data.OrdersRepository
import uz.etalon.crm.core.data.OutboxRepository
import uz.etalon.crm.core.data.runCatchingCancellable
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.model.OrderComment
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.PendingUpload
import uz.etalon.crm.core.model.Resource
import java.util.UUID
import javax.inject.Inject

/**
 * Everything this screen asks of the data layer, in one seam — the twin of `OrdersSource` on the
 * list. The three repositories behind it need Room, a file tree and a WorkManager scheduler to
 * exist, so naming the calls the ViewModel actually makes is what lets a unit test hand it a
 * double instead of a database.
 */
interface OrderDetailSource {
    fun detail(id: String): Flow<Resource<OrderDetail>>
    suspend fun refreshDetail(id: String)
    fun comments(orderId: String): Flow<Resource<List<OrderComment>>>
    suspend fun refreshComments(orderId: String)
    suspend fun postComment(orderId: String, body: String, idempotencyKey: String): Result<OrderComment>
    fun pendingUploads(orderId: String): Flow<List<PendingUpload>>
    suspend fun retryUpload(id: String)
    suspend fun cancelUpload(id: String)
    suspend fun deleteLoadedPhoto(orderId: String, photoId: String): Result<Unit>
}

class RepositoryOrderDetailSource @Inject constructor(
    private val repo: OrdersRepository,
    private val outbox: OutboxRepository,
    private val logistics: LogisticsRepository,
) : OrderDetailSource {
    override fun detail(id: String) = repo.detail(id)
    override suspend fun refreshDetail(id: String) = repo.refreshDetail(id)
    override fun comments(orderId: String) = repo.comments(orderId)
    override suspend fun refreshComments(orderId: String) = repo.refreshComments(orderId)
    override suspend fun postComment(orderId: String, body: String, idempotencyKey: String) =
        repo.postComment(orderId, body, idempotencyKey)
    override fun pendingUploads(orderId: String) = outbox.observeForOrder(orderId)
    override suspend fun retryUpload(id: String) = outbox.retry(id)
    override suspend fun cancelUpload(id: String) = outbox.cancel(id)
    override suspend fun deleteLoadedPhoto(orderId: String, photoId: String) = logistics.deleteLoadedPhoto(orderId, photoId)
}

/** The list side gets away with a Hilt subclass (`HiltOrdersListViewModel`); an assisted-injected
 *  ViewModel has no such seam, so the interface is bound the ordinary way. */
@Module
@InstallIn(SingletonComponent::class)
abstract class OrderDetailSourceModule {
    @Binds abstract fun orderDetailSource(impl: RepositoryOrderDetailSource): OrderDetailSource
}

/** The draft the `Idempotency-Key` in flight belongs to, and the key itself — see
 *  [commentIdempotencyKeyFor]. Both ride in `SavedStateHandle` so process death in the middle of
 *  a send cannot mint a fresh key for a note the server may already have taken. */
private const val KEY_COMMENT_IDEMPOTENCY = "detail.commentIdempotencyKey"
private const val KEY_COMMENT_IDEMPOTENCY_FOR = "detail.commentIdempotencyFor"

/** The note being typed, in the same handle as the two above — see [OrderDetailViewModel.commentDraft]. */
private const val KEY_COMMENT_DRAFT = "detail.commentDraft"

@HiltViewModel(assistedFactory = OrderDetailViewModel.Factory::class)
class OrderDetailViewModel @AssistedInject constructor(
    private val source: OrderDetailSource,
    @Assisted val orderId: String,
    // Defaulted so a unit test can build the ViewModel with nothing but a fake source; Hilt always
    // passes the real one from the ViewModel component.
    private val saved: SavedStateHandle = SavedStateHandle(),
) : ViewModel() {
    @AssistedFactory
    interface Factory {
        fun create(orderId: String): OrderDetailViewModel
    }

    val state: StateFlow<Resource<OrderDetail>> = source.detail(orderId).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), Resource.Loading(null))

    /** This operator's own queue for this order. Nothing here triggers a detail refresh: the
     *  upload worker already pulls the order fresh after every send that lands, and a second
     *  refresh driven off the queue emptying would only race it. */
    val pending: StateFlow<List<PendingUpload>> = source.pendingUploads(orderId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptyList())

    /** The deal's «Шарҳлар» thread, oldest first. Online only — there is no cached copy to fall
     *  back on, so this stays `Loading(null)` until the first answer arrives. */
    val comments: StateFlow<Resource<List<OrderComment>>> = source.comments(orderId)
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), Resource.Loading(null))

    private val _actionError = MutableStateFlow<String?>(null)
    val actionError: StateFlow<String?> = _actionError.asStateFlow()

    /**
     * The note being typed, in `SavedStateHandle` beside the idempotency key its send will carry.
     *
     * The draft is deliberately kept until the server has the comment (see [postComment]), and
     * process death is the other way it can be lost: an operator at a building site taps a photo,
     * or takes a call, and comes back to an empty field with no idea a sentence was ever there.
     * The key that guards the send against a double-post already rides here for the same reason;
     * the words the key belongs to had better survive with it.
     */
    val commentDraft: StateFlow<String> = saved.getStateFlow(KEY_COMMENT_DRAFT, "")

    private val _postingComment = MutableStateFlow(false)
    val postingComment: StateFlow<Boolean> = _postingComment.asStateFlow()

    private val _commentError = MutableStateFlow<String?>(null)
    val commentError: StateFlow<String?> = _commentError.asStateFlow()

    init { refresh() }

    fun refresh() {
        viewModelScope.launch { source.refreshDetail(orderId) }
        refreshComments()
    }

    /** The thread alone — what the comments card's own error banner retries. Pulling the whole
     *  screen would work too, but a failed thread is not a reason to re-fetch the order. */
    fun refreshComments() {
        viewModelScope.launch { source.refreshComments(orderId) }
    }

    /** Typing is the operator answering the failure, so the message goes with the next keystroke
     *  rather than sitting over a draft that has already been corrected. */
    fun setCommentDraft(text: String) {
        saved[KEY_COMMENT_DRAFT] = text
        _commentError.value = null
    }

    /**
     * Sends the draft as typed — `@name` and all, since the server is what resolves a mention.
     *
     * The draft is cleared only once the server has the comment: a note lost to a dropped
     * connection is a note the operator has to type again, and on a phone at a building site that
     * is the difference between the thread having it and not. A second tap while one send is in
     * flight is ignored rather than queued.
     */
    fun postComment() {
        val body = commentDraft.value.trim()
        if (body.isEmpty() || _postingComment.value) return
        viewModelScope.launch {
            _postingComment.value = true
            source.postComment(orderId, body, commentIdempotencyKeyFor(body)).fold(
                onSuccess = {
                    // The key retires WITH the draft it belonged to. Leaving it would make an
                    // identical second note — «Тўланди», twice in a day — replay the first
                    // comment's response instead of writing a new row.
                    saved.remove<String>(KEY_COMMENT_IDEMPOTENCY_FOR)
                    saved.remove<String>(KEY_COMMENT_IDEMPOTENCY)
                    saved[KEY_COMMENT_DRAFT] = ""
                    _commentError.value = null
                },
                onFailure = { t -> _commentError.value = t.toAppError().message },
            )
            _postingComment.value = false
        }
    }

    /**
     * The `Idempotency-Key` for ONE draft. `POST /api/orders/{id}/comments` is
     * `withIdempotency`-wrapped, so a retry carrying the key the first attempt used replays that
     * attempt's response instead of appending a second copy of the note — which is the whole
     * defence against a response lost after the row had already committed. Tapping «Юбориш» again
     * after a timeout is exactly that case, and it is the tap an operator makes every time.
     *
     * The key therefore may not change between retries of the same text, and must change once the
     * text does: the wrapper caches every non-5xx outcome, refusals included, so reusing a key
     * after correcting a body the server rejected would replay the 422 for ever. The body is the
     * discriminator and it never leaves the device — only the opaque UUID is sent.
     */
    private fun commentIdempotencyKeyFor(body: String): String {
        if (saved.get<String>(KEY_COMMENT_IDEMPOTENCY_FOR) != body) {
            saved[KEY_COMMENT_IDEMPOTENCY_FOR] = body
            saved[KEY_COMMENT_IDEMPOTENCY] = UUID.randomUUID().toString()
        }
        return requireNotNull(saved.get<String>(KEY_COMMENT_IDEMPOTENCY))
    }

    fun retryUpload(id: String) = runAction { runCatchingCancellable { source.retryUpload(id) } }
    fun cancelUpload(id: String) = runAction { runCatchingCancellable { source.cancelUpload(id) } }

    /** Online only — the delete route carries no server-side idempotency, so it is never queued.
     *  LogisticsRepository re-fetches the order on success, which is what drops the tile. */
    fun deletePhoto(photoId: String) = runAction { source.deleteLoadedPhoto(orderId, photoId) }

    private fun runAction(call: suspend () -> Result<Unit>) {
        viewModelScope.launch {
            call().fold(
                onSuccess = { _actionError.value = null },
                onFailure = { t -> _actionError.value = t.toAppError().message },
            )
        }
    }
}
