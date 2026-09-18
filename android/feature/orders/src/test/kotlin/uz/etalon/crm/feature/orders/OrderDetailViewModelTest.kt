package uz.etalon.crm.feature.orders

import androidx.lifecycle.SavedStateHandle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.OrderComment
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.PendingUpload
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.feature.orders.detail.OrderDetailSource
import uz.etalon.crm.feature.orders.detail.OrderDetailViewModel
import java.io.IOException
import java.time.Instant

/** The «Шарҳлар» composer's rules. Nothing here touches the network: [FakeSource] is the whole
 *  data layer the screen talks to, which is what [OrderDetailSource] exists for. */
@OptIn(ExperimentalCoroutinesApi::class)
class OrderDetailViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    private fun comment(id: String, body: String) = OrderComment(
        id = id, body = body, createdAt = Instant.parse("2026-09-10T07:15:00Z"),
        authorId = "u7", authorName = "Оператор",
    )

    private class FakeSource(
        var failPost: Throwable? = null,
        var sendToChatResult: Result<Unit> = Result.success(Unit),
    ) : OrderDetailSource {
        val thread = MutableStateFlow<Resource<List<OrderComment>>>(Resource.Loading(null))
        val posted = mutableListOf<String>()
        /** Every `Idempotency-Key` the ViewModel handed over, in order — the thing the retry rule
         *  is actually about. */
        val keys = mutableListOf<String>()
        var commentRefreshes = 0
        override fun detail(id: String): Flow<Resource<OrderDetail>> = MutableStateFlow(Resource.Loading(null))
        override suspend fun refreshDetail(id: String) = Unit
        override fun comments(orderId: String): Flow<Resource<List<OrderComment>>> = thread
        override suspend fun refreshComments(orderId: String) { commentRefreshes++ }
        override suspend fun postComment(orderId: String, body: String, idempotencyKey: String): Result<OrderComment> {
            posted += body
            keys += idempotencyKey
            failPost?.let { return Result.failure(it) }
            val created = OrderComment(
                id = "new-${posted.size}", body = body, createdAt = Instant.parse("2026-09-10T09:00:00Z"),
                authorId = "u7", authorName = "Оператор",
            )
            thread.value = Resource.Success(thread.value.dataOrNull.orEmpty() + created)
            return Result.success(created)
        }
        override fun pendingUploads(orderId: String): Flow<List<PendingUpload>> = MutableStateFlow(emptyList())
        override suspend fun retryUpload(id: String) = Unit
        override suspend fun cancelUpload(id: String) = Unit
        override suspend fun deleteLoadedPhoto(orderId: String, photoId: String): Result<Unit> = Result.success(Unit)
        var canceled = 0
        var cancelResult: Result<Unit> = Result.success(Unit)
        var lastCancelReason: String? = null
        var lastCancelPassword: String? = null
        override suspend fun cancelOrder(orderId: String, reason: String?, password: String?): Result<Unit> {
            canceled++
            lastCancelReason = reason
            lastCancelPassword = password
            return cancelResult
        }

        var sentToChat = 0
        override suspend fun sendToChat(orderId: String): Result<Unit> {
            sentToChat++
            return sendToChatResult
        }
    }

    /** `WhileSubscribed`: without a collector the ViewModel's own flows never run. */
    private fun TestScope.collecting(vm: OrderDetailViewModel) {
        backgroundScope.launch(dispatcher) { vm.comments.collect {} }
    }

    @Test fun `the thread is fetched on open`() = runTest {
        val src = FakeSource()
        OrderDetailViewModel(src, "o3")
        advanceUntilIdle()
        assertEquals(1, src.commentRefreshes)
    }

    @Test fun `posting clears the draft and appends the comment to the thread`() = runTest {
        val src = FakeSource()
        src.thread.value = Resource.Success(listOf(comment("c1", "Биринчи")))
        val vm = OrderDetailViewModel(src, "o3")
        collecting(vm)
        advanceUntilIdle()
        vm.setCommentDraft("  Тест: юкланди, ҳайдовчи йўлда  ")
        vm.postComment()
        advanceUntilIdle()
        // Trimmed on the way out — the server trims too, and an untrimmed body would make an
        // otherwise identical note look different in the thread.
        assertEquals(listOf("Тест: юкланди, ҳайдовчи йўлда"), src.posted)
        assertEquals("", vm.commentDraft.value)
        assertNull(vm.commentError.value)
        assertFalse(vm.postingComment.value)
        assertEquals(
            listOf("Биринчи", "Тест: юкланди, ҳайдовчи йўлда"),
            vm.comments.value.dataOrNull.orEmpty().map { it.body },
        )
    }

    /** The note the operator typed is the thing that must survive a dropped connection. */
    @Test fun `a failed send keeps the draft and reports the reason`() = runTest {
        val src = FakeSource(failPost = IOException("Интернет алоқаси йўқ"))
        val vm = OrderDetailViewModel(src, "o3")
        collecting(vm)
        advanceUntilIdle()
        vm.setCommentDraft("Юкланди")
        vm.postComment()
        advanceUntilIdle()
        assertEquals(listOf("Юкланди"), src.posted)
        assertEquals("Юкланди", vm.commentDraft.value)
        assertNotNull(vm.commentError.value)
        assertFalse(vm.postingComment.value)
    }

    /**
     * The whole point of pinning the key to the draft. `POST /api/orders/{id}/comments` is
     * `withIdempotency`-wrapped, so the retry after a timeout replays the first attempt's
     * response instead of appending a second copy of the note — but only if it carries the SAME
     * key. A key minted per attempt would post the note twice every time a site connection drops
     * between the row committing and the response arriving.
     */
    @Test fun `retrying the same draft sends the key the first attempt used`() = runTest {
        val src = FakeSource(failPost = IOException("Интернет алоқаси йўқ"))
        val vm = OrderDetailViewModel(src, "o3")
        collecting(vm)
        advanceUntilIdle()
        vm.setCommentDraft("Юкланди")
        vm.postComment()
        advanceUntilIdle()
        // The same draft, retried: the composer keeps the text, the operator taps «Юбориш» again.
        vm.postComment()
        advanceUntilIdle()
        assertEquals(2, src.keys.size)
        assertEquals(src.keys[0], src.keys[1], "a retry of the same draft must reuse its key")
    }

    /** …and the key retires with the draft. An operator who writes «Тўланди» twice in a day must
     *  get two comments, not the first one replayed. */
    @Test fun `a new note after a successful send gets a new key`() = runTest {
        val src = FakeSource()
        val vm = OrderDetailViewModel(src, "o3")
        collecting(vm)
        advanceUntilIdle()
        vm.setCommentDraft("Тўланди")
        vm.postComment()
        advanceUntilIdle()
        vm.setCommentDraft("Тўланди")
        vm.postComment()
        advanceUntilIdle()
        assertEquals(listOf("Тўланди", "Тўланди"), src.posted)
        assertEquals(2, src.keys.size)
        assertNotEquals(src.keys[0], src.keys[1], "an identical second note must not replay the first")
    }

    /** Correcting the text is a different note, so it may not carry the refused key: the
     *  idempotency wrapper caches non-5xx outcomes, refusals included, and reusing the key would
     *  replay the refusal for ever. */
    @Test fun `editing the draft after a failure mints a fresh key`() = runTest {
        val src = FakeSource(failPost = IOException("Хатолик"))
        val vm = OrderDetailViewModel(src, "o3")
        collecting(vm)
        advanceUntilIdle()
        vm.setCommentDraft("Юкланд")
        vm.postComment()
        advanceUntilIdle()
        vm.setCommentDraft("Юкланди")
        vm.postComment()
        advanceUntilIdle()
        assertNotEquals(src.keys[0], src.keys[1])
    }

    /** The error belongs to the text that failed. Typing is the operator answering it, so it goes
     *  with the next keystroke rather than sitting over a draft they have already corrected. */
    @Test fun `typing clears the send error`() = runTest {
        val src = FakeSource(failPost = IOException("Интернет алоқаси йўқ"))
        val vm = OrderDetailViewModel(src, "o3")
        collecting(vm)
        advanceUntilIdle()
        vm.setCommentDraft("Юкланди")
        vm.postComment()
        advanceUntilIdle()
        assertNotNull(vm.commentError.value)
        vm.setCommentDraft("Юкланди.")
        assertNull(vm.commentError.value)
    }

    /**
     * M4. The draft survives process death, in the same `SavedStateHandle` as the idempotency key
     * its send will carry. A note kept across a dropped connection but lost to the system killing
     * the app is a note the operator types twice — and the key that guards the send against a
     * double-post already lives there for exactly this reason.
     *
     * The handle IS the restored state: a second ViewModel built from it is what the framework does
     * after process death.
     */
    @Test fun `the draft survives a rebuild from the same saved state`() = runTest {
        val saved = SavedStateHandle()
        val first = OrderDetailViewModel(FakeSource(), "o3", saved)
        collecting(first)
        advanceUntilIdle()
        first.setCommentDraft("Мижоз эртага тўлайман деди")

        val restored = OrderDetailViewModel(FakeSource(), "o3", saved)
        advanceUntilIdle()
        assertEquals("Мижоз эртага тўлайман деди", restored.commentDraft.value)
    }

    /** And a sent note does NOT come back: the draft retires with the key it belonged to. */
    @Test fun `a sent draft is not restored`() = runTest {
        val saved = SavedStateHandle()
        val src = FakeSource()
        val vm = OrderDetailViewModel(src, "o3", saved)
        collecting(vm)
        advanceUntilIdle()
        vm.setCommentDraft("Юкланди")
        vm.postComment()
        advanceUntilIdle()

        assertEquals(listOf("Юкланди"), src.posted)
        assertEquals("", OrderDetailViewModel(FakeSource(), "o3", saved).commentDraft.value)
    }

    /** The comments card's own error banner retries the thread alone — a failed thread is not a
     *  reason to re-fetch the order. */
    @Test fun `the comments retry re-reads the thread`() = runTest {
        val src = FakeSource()
        val vm = OrderDetailViewModel(src, "o3")
        advanceUntilIdle()
        vm.refreshComments()
        advanceUntilIdle()
        assertEquals(2, src.commentRefreshes)
    }

    @Test fun `a blank draft is refused without a call`() = runTest {
        val src = FakeSource()
        val vm = OrderDetailViewModel(src, "o3")
        collecting(vm)
        advanceUntilIdle()
        vm.setCommentDraft("   \n ")
        vm.postComment()
        advanceUntilIdle()
        assertTrue(src.posted.isEmpty())
        assertEquals("   \n ", vm.commentDraft.value)
        assertNull(vm.commentError.value)
    }

    /** Pull-to-refresh re-reads the thread, not only the order: a `COMMENT_MENTION` push is what
     *  brings most people to this screen, and the comment it names must be there after a pull. */
    @Test fun `pull-to-refresh re-reads the thread`() = runTest {
        val src = FakeSource()
        val vm = OrderDetailViewModel(src, "o3")
        advanceUntilIdle()
        vm.refresh()
        advanceUntilIdle()
        assertEquals(2, src.commentRefreshes)
    }

    /**
     * «Чатга юбориш» reaches Chromium and then Telegram on the server, so it fails in ways the
     * operator has to hear about — a locked inbox, a chat the business connection has lost. A
     * send that quietly does nothing looks exactly like a send that worked.
     */
    @Test fun `a failed send to chat is reported rather than swallowed`() = runTest {
        val src = FakeSource(sendToChatResult = Result.failure(IllegalStateException("boom")))
        val vm = OrderDetailViewModel(src, "o3")
        advanceUntilIdle()
        vm.sendToChat()
        advanceUntilIdle()
        assertEquals(1, src.sentToChat)
        assertNotNull(vm.actionError.value)
    }

    @Test fun `a successful send to chat leaves no error behind`() = runTest {
        val src = FakeSource()
        val vm = OrderDetailViewModel(src, "o3")
        advanceUntilIdle()
        vm.sendToChat()
        advanceUntilIdle()
        assertEquals(1, src.sentToChat)
        assertNull(vm.actionError.value)
    }

    /**
     * An OWNER cancels with nothing typed. Both fields must reach the server as null rather than
     * as empty strings: the route's schema treats a present-but-empty password as an attempt and
     * compares it against the company one, which would turn a legitimate role bypass into a 403.
     */
    @Test fun `an empty password and reason are sent as absent, not as blanks`() = runTest {
        val src = FakeSource()
        val vm = OrderDetailViewModel(src, "o3")
        advanceUntilIdle()
        vm.openCancel()
        vm.confirmCancel()
        advanceUntilIdle()
        assertEquals(1, src.canceled)
        assertNull(src.lastCancelPassword)
        assertNull(src.lastCancelReason)
    }

    /** A reason typed with stray spaces is still a reason; one that is only spaces is not. */
    @Test fun `a whitespace-only reason is not sent as a reason`() = runTest {
        val src = FakeSource()
        val vm = OrderDetailViewModel(src, "o3")
        advanceUntilIdle()
        vm.openCancel()
        vm.setCancelReason("   ")
        vm.confirmCancel()
        advanceUntilIdle()
        assertNull(src.lastCancelReason)
    }

    /**
     * A refused cancel keeps the sheet open with the server's own words in it. Closing it would
     * throw away the password the operator typed and leave them guessing why nothing happened.
     */
    @Test fun `a refused cancel keeps the sheet open and shows why`() = runTest {
        val src = FakeSource(sendToChatResult = Result.success(Unit))
        src.cancelResult = Result.failure(IllegalStateException("Бекор қилиш парол талаб қилади"))
        val vm = OrderDetailViewModel(src, "o3")
        advanceUntilIdle()
        vm.openCancel()
        vm.setCancelPassword("wrong")
        vm.confirmCancel()
        advanceUntilIdle()
        assertNotNull(vm.cancel.value)
        assertNotNull(vm.cancel.value?.error)
        assertEquals(false, vm.cancel.value?.submitting)
    }

    /** A successful cancel closes the sheet; the re-fetched order is what tells the rest. */
    @Test fun `a successful cancel closes the sheet`() = runTest {
        val src = FakeSource()
        val vm = OrderDetailViewModel(src, "o3")
        advanceUntilIdle()
        vm.openCancel()
        vm.confirmCancel()
        advanceUntilIdle()
        assertNull(vm.cancel.value)
    }
}
