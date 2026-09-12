package uz.etalon.crm.feature.clients

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.ClientDetail
import uz.etalon.crm.core.model.ClientOrderLine
import uz.etalon.crm.core.model.ClientPage
import uz.etalon.crm.core.model.ClientSummary
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.feature.clients.detail.ClientDetailPermissionUseCase
import uz.etalon.crm.feature.clients.detail.ClientDetailUseCase
import uz.etalon.crm.feature.clients.detail.ClientDetailViewModel
import uz.etalon.crm.feature.clients.list.CLIENT_SEARCH_DEBOUNCE_MS
import uz.etalon.crm.feature.clients.list.ClientsListUseCase
import uz.etalon.crm.feature.clients.list.ClientsPermissionUseCase
import uz.etalon.crm.feature.clients.list.ClientsViewModel
import java.io.IOException
import java.math.BigDecimal
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class ClientsViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    // ── the list shape ────────────────────────────────────────────────────────────

    /**
     * The defect this project has shipped three times: an empty list beside an error banner
     * reads as "this customer is not in the CRM" when the truth is "couldn't check" — and an
     * operator who believes the first will create a second row for a customer who already has one.
     */
    @Test fun `no empty state while loading or while an error shows`() = runTest {
        val failing = viewModel(list = { Result.failure(IOException("no net")) })
        assertFalse(failing.state.value.showEmptyState, "still loading")
        advanceUntilIdle()
        assertNotNull(failing.state.value.error)
        assertFalse(failing.state.value.showEmptyState, "an error banner is showing")
        assertTrue(failing.state.value.isOffline)

        val empty = viewModel(list = { Result.success(emptyList()) })
        advanceUntilIdle()
        assertTrue(empty.state.value.showEmptyState)
        assertNull(empty.state.value.error)
    }

    @Test fun `a failed refresh can be retried and recovers`() = runTest {
        var fail = true
        val vm = viewModel(list = { if (fail) Result.failure(IOException("no net")) else Result.success(listOf(row())) })
        advanceUntilIdle()
        assertNotNull(vm.state.value.error)

        fail = false
        vm.refresh()
        advanceUntilIdle()
        assertNull(vm.state.value.error)
        assertFalse(vm.state.value.isOffline)
        assertEquals(1, vm.state.value.items.size)
    }

    /**
     * The order on screen is the server's. `ClientsRepository.list` asks for
     * `sortBy=totalBooked&sortDir=desc`, so the customer who has booked the most arrives first —
     * which is what «жами айланма бўйича» under the title claims. Re-sorting the page here would
     * be a second, disagreeing opinion about the same list, and it could not even be a correct
     * one: this is the first 50 rows of the SERVER's ordering, so sorting them locally would
     * reorder an arbitrary subset and still miss the customers that ordering left out.
     */
    @Test fun `the rows keep the order the server sent`() = runTest {
        val rows = listOf(
            row(id = "c1", name = "Rahimov Construction", phone = "998902239888", total = "29000000"),
            row(id = "c2", name = "Tashkent Tower LLC", phone = "998901112233", total = "18420000"),
            row(id = "c3", name = "Andijon Stroy", phone = "998934445566", total = "4947920"),
        )
        val vm = viewModel(list = { Result.success(rows) })
        advanceUntilIdle()
        assertEquals(rows, vm.state.value.items)
        assertEquals(listOf("c1", "c2", "c3"), vm.state.value.items.map { it.id })
        assertEquals(Money.parse("29000000"), vm.state.value.items.first().totalBooked)
    }

    // ── phone-first search ────────────────────────────────────────────────────────

    /**
     * Phone is this product's unique customer identity, and an operator reaches this field with a
     * number they pasted from a chat or read off a note — in whatever spelling it was written.
     *
     * The query must reach the server EXACTLY as typed. `GET /api/clients?q=` runs it through
     * `phoneMatchForms` (which strips to digits and matches the trailing 4/7/9/12 of the stored
     * number) *and* through a `name contains` — so stripping the separators here would gain
     * nothing and stripping the letters would break searching by name.
     */
    @Test fun `a phone typed with any separators reaches the server unchanged`() = runTest {
        listOf(
            "+998 90 111 22 33",
            "998901112233",
            "8 (90) 111-22-33",
            "90 111 22 33",
            "1122 33",
        ).forEach { typed ->
            val asked = mutableListOf<String?>()
            val vm = viewModel(list = { q -> asked += q; Result.success(emptyList()) })
            advanceUntilIdle()
            vm.setQuery(typed)
            advanceUntilIdle()
            assertEquals(listOf(null, typed), asked, "the typed phone was altered on the way out")
        }
    }

    @Test fun `a name search reaches the server unchanged, trimmed`() = runTest {
        val asked = mutableListOf<String?>()
        val vm = viewModel(list = { q -> asked += q; Result.success(emptyList()) })
        advanceUntilIdle()
        vm.setQuery("  Навоий Build  ")
        advanceUntilIdle()
        assertEquals(listOf(null, "Навоий Build"), asked)
    }

    /** A blank field is "no filter", not a search for the empty string. */
    @Test fun `clearing the field asks for the unfiltered list`() = runTest {
        val asked = mutableListOf<String?>()
        val vm = viewModel(list = { q -> asked += q; Result.success(emptyList()) })
        advanceUntilIdle()
        vm.setQuery("Навоий")
        advanceUntilIdle()
        vm.setQuery("   ")
        advanceUntilIdle()
        assertEquals(listOf(null, "Навоий", null), asked)
    }

    @Test fun `typing does not fetch once per keystroke`() = runTest {
        val asked = mutableListOf<String?>()
        val vm = viewModel(list = { q -> asked += q; Result.success(emptyList()) })
        advanceUntilIdle()
        asked.clear()

        "Навоий".forEachIndexed { i, _ -> vm.setQuery("Навоий".take(i + 1)); advanceTimeBy(50) }
        assertEquals(emptyList<String?>(), asked, "a fetch went out before the operator stopped typing")

        advanceUntilIdle()
        assertEquals(listOf("Навоий"), asked, "exactly one fetch, for the settled query")
    }

    /**
     * The refresh spinner belongs to the request, not to the wait before it. Driving it from the
     * debounce made it run for 300 ms on every single keystroke — a permanently spinning
     * indicator for anyone typing a nine-digit phone.
     */
    @Test fun `the refresh spinner does not run through the debounce`() = runTest {
        val vm = viewModel(list = { Result.success(emptyList()) })
        advanceUntilIdle()
        assertFalse(vm.state.value.loading)

        vm.setQuery("Навоий")
        assertFalse(vm.state.value.loading, "the spinner started before the request did")
        assertTrue(vm.state.value.searching)
        // ...and «Мижоз топилмади» must not flash under a query that has not been asked yet.
        assertFalse(vm.state.value.showEmptyState)

        advanceTimeBy(CLIENT_SEARCH_DEBOUNCE_MS + 1)
        assertFalse(vm.state.value.searching)

        advanceUntilIdle()
        assertFalse(vm.state.value.loading)
        assertTrue(vm.state.value.showEmptyState)
    }

    @Test fun `pull to refresh does not wait for the debounce`() = runTest {
        val asked = mutableListOf<String?>()
        val vm = viewModel(list = { q -> asked += q; Result.success(emptyList()) })
        advanceUntilIdle()
        asked.clear()

        vm.setQuery("Навоий")
        vm.refresh()
        // Short of the debounce window: only the explicit refresh may have gone out.
        advanceTimeBy(CLIENT_SEARCH_DEBOUNCE_MS / 2)
        assertEquals(listOf("Навоий"), asked)

        advanceUntilIdle()
        assertEquals(listOf("Навоий"), asked, "the pending debounced search fired a duplicate")
    }

    // ── two clients may share a name ──────────────────────────────────────────────

    /**
     * Names legitimately repeat: two different customers can both be «Навоий Build», and the
     * phone is what tells them apart. The list must show both rows, keyed apart, with no warning
     * of any kind — a duplicate-name notice here would be a domain bug, not a safety net.
     */
    @Test fun `two clients with the same name are both listed, with no warning`() = runTest {
        val rows = listOf(
            row(id = "c1", name = "Навоий Build", phone = "998901112233"),
            row(id = "c2", name = "Навоий Build", phone = "998935554433"),
        )
        val vm = viewModel(list = { Result.success(rows) })
        advanceUntilIdle()
        assertEquals(rows, vm.state.value.items)
        assertNull(vm.state.value.error)
        assertEquals(2, vm.state.value.items.map { it.id }.toSet().size)
    }

    // ── one bounded page ──────────────────────────────────────────────────────────

    /**
     * The app fetches ONE page of clients, so the bottom of the list is not necessarily the end
     * of the customers. Left unsaid, that is the same harm the empty state guards against: an
     * operator who scrolls to the bottom without finding their customer concludes the customer
     * is not in the CRM, and adds a second row for one who already has one.
     */
    @Test fun `a truncated first page says so`() = runTest {
        val rows = List(50) { row(id = "c$it", phone = "9989011122%02d".format(it)) }
        val vm = viewModel(list = { Result.success(rows) }, total = 312)
        advanceUntilIdle()
        assertTrue(vm.state.value.showTruncatedNotice)
        assertEquals(312, vm.state.value.total)
    }

    @Test fun `a page that holds every match says nothing`() = runTest {
        val vm = viewModel(list = { Result.success(listOf(row())) })
        advanceUntilIdle()
        assertFalse(vm.state.value.showTruncatedNotice)
    }

    /** Never beside an error banner or a spinner — a `total` left over from the last successful
     *  fetch would otherwise claim a truncation the failed one knows nothing about. */
    @Test fun `no truncation notice while loading or while an error shows`() = runTest {
        val vm = viewModel(list = { Result.failure(IOException("no net")) }, total = 312)
        assertFalse(vm.state.value.showTruncatedNotice, "still loading")
        advanceUntilIdle()
        assertNotNull(vm.state.value.error)
        assertFalse(vm.state.value.showTruncatedNotice, "an error banner is showing")
    }

    // ── permissions ───────────────────────────────────────────────────────────────

    /** "Not yet known" is not "yes": the add action must never flash for an operator who cannot
     *  create, and must never be offered to one at all. */
    @Test fun `the add action waits until client create is known and stays off without it`() = runTest {
        val readOnly = viewModel(permissions = { it != "client.create" })
        assertFalse(readOnly.state.value.permissionsResolved)
        assertFalse(readOnly.state.value.canCreate)
        advanceUntilIdle()
        assertTrue(readOnly.state.value.permissionsResolved)
        assertFalse(readOnly.state.value.canCreate)

        val operator = viewModel(permissions = { true })
        advanceUntilIdle()
        assertTrue(operator.state.value.canCreate)
    }

    // ── the detail ────────────────────────────────────────────────────────────────

    @Test fun `the detail loads its client and its orders`() = runTest {
        val detail = detail(orders = listOf(orderLine("o1"), orderLine("o2")))
        val vm = detailViewModel(load = { Result.success(detail) })
        advanceUntilIdle()
        assertEquals(detail, vm.state.value.client)
        assertNull(vm.state.value.error)
        assertFalse(vm.state.value.loading)
    }

    @Test fun `a failed detail keeps an error and a retry, and shows no client`() = runTest {
        var fail = true
        val vm = detailViewModel(load = { if (fail) Result.failure(IOException("no net")) else Result.success(detail()) })
        advanceUntilIdle()
        assertNull(vm.state.value.client)
        assertNotNull(vm.state.value.error)
        assertTrue(vm.state.value.isOffline)

        fail = false
        vm.refresh()
        advanceUntilIdle()
        assertNotNull(vm.state.value.client)
        assertNull(vm.state.value.error)
    }

    @Test fun `the edit action waits until client edit is known and stays off without it`() = runTest {
        val readOnly = detailViewModel(permissions = { it != "client.edit" })
        assertFalse(readOnly.state.value.canEdit)
        advanceUntilIdle()
        assertTrue(readOnly.state.value.permissionsResolved)
        assertFalse(readOnly.state.value.canEdit)

        val editor = detailViewModel(permissions = { true })
        advanceUntilIdle()
        assertTrue(editor.state.value.canEdit)
    }

    // ── fixtures ──────────────────────────────────────────────────────────────────

    /** [total] is what the server says MATCHED, which is only the same as the number of rows
     *  when the whole result fit on the one page this app fetches. */
    private fun viewModel(
        list: suspend (String?) -> Result<List<ClientSummary>> = { Result.success(emptyList()) },
        total: Int? = null,
        permissions: suspend (String) -> Boolean = { true },
    ) = ClientsViewModel(
        list = ClientsListUseCase { q -> list(q).map { rows -> ClientPage(rows, total ?: rows.size) } },
        permissions = ClientsPermissionUseCase { permissions(it) },
    )

    private fun detailViewModel(
        load: suspend (String) -> Result<ClientDetail> = { Result.success(detail()) },
        permissions: suspend (String) -> Boolean = { true },
    ) = ClientDetailViewModel(
        clientId = "c1",
        load = ClientDetailUseCase { load(it) },
        permissions = ClientDetailPermissionUseCase { permissions(it) },
    )

    private fun row(
        id: String = "c1",
        name: String = "Навоий Build",
        phone: String = "998901112233",
        total: String = "0",
    ) = ClientSummary(
        id = id, name = name, phone = phone, address = null, orderCount = 3,
        totalBooked = Money.parse(total),
    )

    private fun detail(orders: List<ClientOrderLine> = emptyList()) = ClientDetail(
        id = "c1", name = "Навоий Build", phone = "998901112233",
        address = "Тошкент шаҳри, Юнусобод тумани, Юнусобод 12-7", notes = null, orders = orders,
    )

    private fun orderLine(id: String) = ClientOrderLine(
        id = id, orderNumber = "ORD-$id", status = OrderStatus.PLACED,
        totalPrice = Money.parse("12000000"), scheduledAt = Instant.EPOCH,
        totalArea = BigDecimal("42.500"),
    )
}
