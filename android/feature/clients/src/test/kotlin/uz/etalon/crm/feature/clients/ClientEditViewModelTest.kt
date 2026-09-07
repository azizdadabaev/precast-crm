package uz.etalon.crm.feature.clients

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
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
import uz.etalon.crm.core.model.ClientInput
import uz.etalon.crm.feature.clients.edit.ClientCreateUseCase
import uz.etalon.crm.feature.clients.edit.ClientEditPermissionUseCase
import uz.etalon.crm.feature.clients.edit.ClientEditState
import uz.etalon.crm.feature.clients.edit.ClientEditViewModel
import uz.etalon.crm.feature.clients.edit.ClientUpdateUseCase
import uz.etalon.crm.feature.clients.edit.composeAddress
import uz.etalon.crm.feature.clients.edit.parseAddress
import uz.etalon.crm.feature.clients.edit.validateClient

private val CYRILLIC = Regex("[\\u0400-\\u04FF]")

@OptIn(ExperimentalCoroutinesApi::class)
class ClientEditViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    // ── validateClient: a pure function of the form ───────────────────────────────

    @Test fun `a blank name is refused`() {
        assertNotNull(validateClient(form(name = "")))
        assertNotNull(validateClient(form(name = "   ")))
        assertNull(validateClient(form(name = "Навоий Build")))
    }

    /** `ClientCreateSchema`: `name: z.string().min(1).max(120)`. */
    @Test fun `a name longer than the server allows is refused`() {
        assertNull(validateClient(form(name = "ж".repeat(120))))
        assertNotNull(validateClient(form(name = "ж".repeat(121))))
    }

    /**
     * The field collects the nine LOCAL digits behind a display-only `+998`, and
     * `normalizePhone` in src/lib/phone.ts turns exactly nine digits into `998` + those nine.
     * Anything else would be stored as some other number entirely — and the phone is what
     * identifies the customer.
     */
    @Test fun `a phone that is not nine local digits is refused`() {
        assertNull(validateClient(form(phoneDigits = "901112233")))
        assertNotNull(validateClient(form(phoneDigits = "")))
        assertNotNull(validateClient(form(phoneDigits = "90111223")))
        assertNotNull(validateClient(form(phoneDigits = "9011122334")))
        assertNotNull(validateClient(form(phoneDigits = "99890111223")))
    }

    /** ASCII digits only: the server's own filter is `/\D+/`, which a non-ASCII digit survives
     *  differently on the two sides — one typed number, two stored phones. */
    @Test fun `a non-ASCII digit is not a digit`() {
        assertNotNull(validateClient(form(phoneDigits = "90111223٤")))
    }

    /**
     * THE domain rule of this module. Two different customers may both be called «Навоий Build»
     * — the phone is what tells them apart — so a repeated name is never refused, never warned
     * about, and never even visible to the validator: it is handed one form and nothing else.
     */
    @Test fun `a duplicate name is never refused`() {
        val first = form(name = "Навоий Build", phoneDigits = "901112233")
        val second = form(name = "Навоий Build", phoneDigits = "935554433")
        assertNull(validateClient(first))
        assertNull(validateClient(second))
        assertEquals(first.name, second.name)
    }

    @Test fun `every refusal is written in Uzbek Cyrillic`() {
        val messages = listOfNotNull(
            validateClient(form(name = "")),
            validateClient(form(name = "ж".repeat(121))),
            validateClient(form(phoneDigits = "12")),
            validateClient(form(street = "ж".repeat(201))),
            validateClient(form(notes = "ж".repeat(2001))),
            validateClient(
                form(clientId = "c1", street = "", originalAddress = "Тошкент шаҳри, Юнусобод 12-7"),
            ),
            validateClient(form(clientId = "c1", notes = "", originalNotes = "эски изоҳ")),
        )
        assertEquals(7, messages.size, "one of the refusals went missing")
        messages.forEach { assertTrue(CYRILLIC.containsMatchIn(it), "not Uzbek Cyrillic: $it") }
    }

    // ── the stored address convention ─────────────────────────────────────────────

    /** `composeAddress` in src/lib/regions/index.ts, case for case. */
    @Test fun `the address is composed in the stored convention`() {
        assertEquals("", composeAddress("", "", ""))
        assertEquals("Тошкент шаҳри", composeAddress("Тошкент шаҳри", "", ""))
        assertEquals("Тошкент шаҳри, Юнусобод 12-7", composeAddress("Тошкент шаҳри", "", "Юнусобод 12-7"))
        assertEquals("Тошкент шаҳри, Юнусобод тумани", composeAddress("Тошкент шаҳри", "Юнусобод тумани", ""))
        assertEquals(
            "Тошкент шаҳри, Юнусобод тумани, Юнусобод 12-7",
            composeAddress("Тошкент шаҳри", "Юнусобод тумани", "Юнусобод 12-7"),
        )
        // Whitespace-only parts are absent parts, exactly as on the web.
        assertEquals("Юнусобод 12-7", composeAddress("  ", " ", " Юнусобод 12-7 "))
    }

    @Test fun `an address the web wrote parses back into the same three parts`() {
        val parsed = parseAddress("Тошкент шаҳри, Юнусобод тумани, Юнусобод 12-7")
        assertEquals("Тошкент шаҳри", parsed.viloyat)
        assertEquals("Юнусобод тумани", parsed.tuman)
        assertEquals("Юнусобод 12-7", parsed.street)
        assertEquals(
            "Тошкент шаҳри, Юнусобод тумани, Юнусобод 12-7",
            composeAddress(parsed.viloyat, parsed.tuman, parsed.street),
        )
    }

    @Test fun `a Latin address parses too, and a bare tuman snaps to its viloyat`() {
        val latin = parseAddress("Toshkent shahri, Yunusobod tumani, Yunusobod 12-7")
        assertEquals("Toshkent shahri", latin.viloyat)
        assertEquals("Yunusobod tumani", latin.tuman)

        val bare = parseAddress("Юнусобод тумани, Юнусобод 12-7")
        assertEquals("Тошкент шаҳри", bare.viloyat)
        assertEquals("Юнусобод тумани", bare.tuman)
        assertEquals("Юнусобод 12-7", bare.street)
    }

    /** An address written before the region widget existed has no recognisable head. It must
     *  survive the sheet untouched rather than being torn apart into fields it never had. */
    @Test fun `an unrecognised address round-trips through the street field unchanged`() {
        val legacy = "Чилонзор 5-мавзе, 12-уй"
        val parsed = parseAddress(legacy)
        assertEquals("", parsed.viloyat)
        assertEquals("", parsed.tuman)
        assertEquals(legacy, parsed.street)
        assertEquals(legacy, composeAddress(parsed.viloyat, parsed.tuman, parsed.street))
    }

    // ── the ViewModel ─────────────────────────────────────────────────────────────

    @Test fun `create sends the twelve-digit phone and the composed address`() = runTest {
        var sent: ClientInput? = null
        val vm = viewModel(create = { sent = it; Result.success("c9") })
        advanceUntilIdle()
        vm.openCreate()
        vm.setName("  Навоий Build  ")
        vm.setPhoneDigits("901112233")
        vm.setViloyat("Тошкент шаҳри")
        vm.setTuman("Юнусобод тумани")
        vm.setStreet("Юнусобод 12-7")
        vm.setNotes("  эрталаб қўнғироқ  ")
        vm.submit()
        advanceUntilIdle()

        assertEquals(
            ClientInput(
                name = "Навоий Build",
                phone = "998901112233",
                address = "Тошкент шаҳри, Юнусобод тумани, Юнусобод 12-7",
                notes = "эрталаб қўнғироқ",
            ),
            sent,
        )
        assertEquals("c9", vm.state.value.savedId)
        assertNull(vm.state.value.error)
    }

    /**
     * `POST /api/clients` dedups on the normalised phone and answers 200 with the EXISTING row,
     * ignoring the name and address that were submitted — so a success is not proof anything was
     * created. The ViewModel therefore reports only the id, and the sheet's host opens that
     * client rather than announcing «қўшилди».
     */
    @Test fun `a create that only found an existing client still reports that client's id`() = runTest {
        val vm = viewModel(create = { Result.success("already-on-file") })
        advanceUntilIdle()
        vm.openCreate()
        vm.setName("Бошқа ном")
        vm.setPhoneDigits("901112233")
        vm.submit()
        advanceUntilIdle()
        assertEquals("already-on-file", vm.state.value.savedId)
    }

    @Test fun `editing seeds the form from the stored client and updates by id`() = runTest {
        var sent: Pair<String, ClientInput>? = null
        val vm = viewModel(update = { id, input -> sent = id to input; Result.success(Unit) })
        advanceUntilIdle()
        vm.openEdit(
            ClientDetail(
                id = "c1", name = "Навоий Build", phone = "998901112233",
                address = "Тошкент шаҳри, Юнусобод тумани, Юнусобод 12-7",
                notes = "эрталаб қўнғироқ", orders = emptyList(),
            ),
        )
        val seeded = vm.state.value
        assertEquals("Навоий Build", seeded.name)
        assertEquals("901112233", seeded.phoneDigits)
        assertEquals("Тошкент шаҳри", seeded.viloyat)
        assertEquals("Юнусобод тумани", seeded.tuman)
        assertEquals("Юнусобод 12-7", seeded.street)
        assertEquals("эрталаб қўнғироқ", seeded.notes)

        vm.setStreet("Юнусобод 12-9")
        vm.submit()
        advanceUntilIdle()
        assertEquals("c1", sent?.first)
        assertEquals("Тошкент шаҳри, Юнусобод тумани, Юнусобод 12-9", sent?.second?.address)
        assertEquals("c1", vm.state.value.savedId)
    }

    /**
     * `explicitNulls = false` in the shared JSON config drops a null from the PATCH body, and
     * `ClientUpdateSchema` is `.partial()`, so an omitted key leaves the stored column exactly as
     * it was. Clearing the address here would therefore do nothing at all — and silently. Say so
     * instead, and never reach the network.
     */
    @Test fun `clearing an address that was set is refused rather than silently ignored`() = runTest {
        var called = false
        val vm = viewModel(update = { _, _ -> called = true; Result.success(Unit) })
        advanceUntilIdle()
        vm.openEdit(
            ClientDetail(
                id = "c1", name = "Навоий Build", phone = "998901112233",
                address = "Тошкент шаҳри, Юнусобод тумани, Юнусобод 12-7",
                notes = null, orders = emptyList(),
            ),
        )
        vm.setViloyat("")
        vm.setTuman("")
        vm.setStreet("")
        vm.submit()
        advanceUntilIdle()
        assertNotNull(vm.state.value.error)
        assertFalse(called, "the clear must not reach a PATCH that would drop it")
        assertNull(vm.state.value.savedId)
    }

    @Test fun `create is refused without client create, before the network`() = runTest {
        var called = false
        val vm = viewModel(
            create = { called = true; Result.success("c9") },
            permissions = { it != "client.create" },
        )
        advanceUntilIdle()
        vm.openCreate()
        vm.setName("Навоий Build")
        vm.setPhoneDigits("901112233")
        vm.submit()
        advanceUntilIdle()
        assertFalse(called, "the server would answer 403; the write must be refused first")
        assertNotNull(vm.state.value.error)
        assertNull(vm.state.value.savedId)
    }

    @Test fun `an edit is refused without client edit, before the network`() = runTest {
        var called = false
        val vm = viewModel(
            update = { _, _ -> called = true; Result.success(Unit) },
            permissions = { it != "client.edit" },
        )
        advanceUntilIdle()
        vm.openEdit(client())
        vm.submit()
        advanceUntilIdle()
        assertFalse(called)
        assertNotNull(vm.state.value.error)
    }

    /** Neither client route is `withIdempotency`-wrapped, so neither may be queued: offline, the
     *  save is refused with a reason rather than sent and failed. */
    @Test fun `a save is refused while the module knows it is offline`() = runTest {
        var called = false
        val vm = viewModel(create = { called = true; Result.success("c9") })
        advanceUntilIdle()
        vm.openCreate()
        vm.setName("Навоий Build")
        vm.setPhoneDigits("901112233")
        vm.setOffline(true)
        vm.submit()
        advanceUntilIdle()
        assertFalse(called)
        assertTrue(CYRILLIC.containsMatchIn(vm.state.value.error.orEmpty()))
    }

    /** The phone is the customer's identity: a double tap that creates two rows, or writes one
     *  twice, is not something the server deduplicates for an EDIT. Guarded here as well as on
     *  the button, because this is the seam a test can reach. */
    @Test fun `a second submit while the first is in flight never goes out`() = runTest {
        val gate = CompletableDeferred<Result<String>>()
        var calls = 0
        val vm = viewModel(create = { calls++; gate.await() })
        advanceUntilIdle()
        vm.openCreate()
        vm.setName("Навоий Build")
        vm.setPhoneDigits("901112233")

        vm.submit()
        advanceUntilIdle()
        assertTrue(vm.state.value.submitting)
        vm.submit()
        vm.submit()
        advanceUntilIdle()
        assertEquals(1, calls)

        gate.complete(Result.success("c9"))
        advanceUntilIdle()
        assertFalse(vm.state.value.submitting)
        assertEquals("c9", vm.state.value.savedId)
    }

    @Test fun `a failed save keeps what was typed and lets it be sent again`() = runTest {
        var fail = true
        var calls = 0
        val vm = viewModel(
            create = { calls++; if (fail) Result.failure(java.io.IOException("no net")) else Result.success("c9") },
        )
        advanceUntilIdle()
        vm.openCreate()
        vm.setName("Навоий Build")
        vm.setPhoneDigits("901112233")
        vm.submit()
        advanceUntilIdle()
        assertNotNull(vm.state.value.error)
        assertEquals("Навоий Build", vm.state.value.name)
        assertFalse(vm.state.value.submitting)

        fail = false
        vm.submit()
        advanceUntilIdle()
        assertEquals(2, calls)
        assertEquals("c9", vm.state.value.savedId)
    }

    /** "Not yet known" is not "yes": the save button must not be live before the answer lands. */
    @Test fun `the save action waits until the permission is known`() = runTest {
        val vm = viewModel(permissions = { true })
        vm.openCreate()
        assertFalse(vm.state.value.permissionsResolved)
        assertFalse(vm.state.value.canSave)
        advanceUntilIdle()
        assertTrue(vm.state.value.canSave)
    }

    // ── fixtures ──────────────────────────────────────────────────────────────────

    private fun viewModel(
        create: suspend (ClientInput) -> Result<String> = { Result.success("c9") },
        update: suspend (String, ClientInput) -> Result<Unit> = { _, _ -> Result.success(Unit) },
        permissions: suspend (String) -> Boolean = { true },
    ) = ClientEditViewModel(
        create = ClientCreateUseCase { create(it) },
        update = ClientUpdateUseCase { id, input -> update(id, input) },
        permissions = ClientEditPermissionUseCase { permissions(it) },
    )

    private fun client() = ClientDetail(
        id = "c1", name = "Навоий Build", phone = "998901112233",
        address = null, notes = null, orders = emptyList(),
    )

    private fun form(
        clientId: String? = null,
        name: String = "Навоий Build",
        phoneDigits: String = "901112233",
        viloyat: String = "",
        tuman: String = "",
        street: String = "",
        notes: String = "",
        originalAddress: String = "",
        originalNotes: String = "",
    ) = ClientEditState(
        clientId = clientId, name = name, phoneDigits = phoneDigits,
        viloyat = viloyat, tuman = tuman, street = street, notes = notes,
        originalAddress = originalAddress, originalNotes = originalNotes,
    )
}
