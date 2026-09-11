package uz.etalon.crm.feature.orders

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
import uz.etalon.crm.core.model.Role
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
        authorId = "u7", authorName = "Оператор", authorRole = Role.SALES,
    )

    private class FakeSource(var failPost: Throwable? = null) : OrderDetailSource {
        val thread = MutableStateFlow<Resource<List<OrderComment>>>(Resource.Loading(null))
        val posted = mutableListOf<String>()
        var commentRefreshes = 0
        override fun detail(id: String): Flow<Resource<OrderDetail>> = MutableStateFlow(Resource.Loading(null))
        override suspend fun refreshDetail(id: String) = Unit
        override fun comments(orderId: String): Flow<Resource<List<OrderComment>>> = thread
        override suspend fun refreshComments(orderId: String) { commentRefreshes++ }
        override suspend fun postComment(orderId: String, body: String): Result<OrderComment> {
            posted += body
            failPost?.let { return Result.failure(it) }
            val created = OrderComment(
                id = "new-${posted.size}", body = body, createdAt = Instant.parse("2026-09-10T09:00:00Z"),
                authorId = "u7", authorName = "Оператор", authorRole = Role.SALES,
            )
            thread.value = Resource.Success(thread.value.dataOrNull.orEmpty() + created)
            return Result.success(created)
        }
        override fun pendingUploads(orderId: String): Flow<List<PendingUpload>> = MutableStateFlow(emptyList())
        override suspend fun retryUpload(id: String) = Unit
        override suspend fun cancelUpload(id: String) = Unit
        override suspend fun deleteLoadedPhoto(orderId: String, photoId: String): Result<Unit> = Result.success(Unit)
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
}
