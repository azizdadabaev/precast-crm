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
import uz.etalon.crm.core.model.ClientCreated
import uz.etalon.crm.core.model.ClientDetail
import uz.etalon.crm.core.model.ClientInput
import uz.etalon.crm.core.network.ApiException
import uz.etalon.crm.feature.clients.edit.ClientCreateUseCase
import uz.etalon.crm.feature.clients.edit.ClientEditPermissionUseCase
import uz.etalon.crm.feature.clients.edit.ClientEditState
import uz.etalon.crm.feature.clients.edit.ClientEditViewModel
import uz.etalon.crm.feature.clients.edit.ClientUpdateUseCase
import uz.etalon.crm.feature.clients.edit.completeSave
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

    /** Only the fields that actually hold something: telling an operator their notes cannot be
     *  deleted when they never wrote any is noise on the one screen that must read clearly. */
    @Test fun `the keep notice names only the fields that were populated`() {
        assertFalse(form().addressLocked)
        assertFalse(form().notesLocked)
        // Creating: nothing is stored yet, so nothing is locked, whatever is typed.
        assertFalse(form(street = "Юнусобод 12-7", notes = "изоҳ").addressLocked)

        val addressOnly = form(clientId = "c1", originalAddress = "Тошкент шаҳри, Юнусобод 12-7")
        assertTrue(addressOnly.addressLocked)
        assertFalse(addressOnly.notesLocked)

        val notesOnly = form(clientId = "c1", originalNotes = "эски изоҳ")
        assertFalse(notesOnly.addressLocked)
        assertTrue(notesOnly.notesLocked)

        val both = form(clientId = "c1", originalAddress = "Тошкент шаҳри", originalNotes = "эски изоҳ")
        assertTrue(both.addressLocked)
        assertTrue(both.notesLocked)
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

    @Test fun `a Latin address parses too, in the alphabet it was written in`() {
        val latin = parseAddress("Toshkent shahri, Yunusobod tumani, Yunusobod 12-7")
        assertEquals("Toshkent shahri", latin.viloyat)
        assertEquals("Yunusobod tumani", latin.tuman)
        assertEquals(
            "Toshkent shahri, Yunusobod tumani, Yunusobod 12-7",
            composeAddress(latin.viloyat, latin.tuman, latin.street),
        )
    }

    /**
     * The one branch that is NOT a faithful round trip, asserted as such rather than left
     * implicit. A bare tuman with no viloyat head parses with its parent filled in, so the next
     * save writes the completed three-part form. It only ever ADDS the region the tuman already
     * implies — it cannot change which place the address names — and it turns a shape the web
     * parses through a fallback branch into the canonical one.
     */
    @Test fun `a bare tuman snaps to its viloyat, and the next save writes the completed form`() {
        val bare = parseAddress("Юнусобод тумани, Юнусобод 12-7")
        assertEquals("Тошкент шаҳри", bare.viloyat)
        assertEquals("Юнусобод тумани", bare.tuman)
        assertEquals("Юнусобод 12-7", bare.street)

        val recomposed = composeAddress(bare.viloyat, bare.tuman, bare.street)
        assertEquals("Тошкент шаҳри, Юнусобод тумани, Юнусобод 12-7", recomposed)
        // Completed, never changed: it reparses to the same three parts, and is now stable.
        assertEquals(bare, parseAddress(recomposed))

        // The Latin spelling snaps to a Latin viloyat, so the alphabet is not switched either.
        val bareLatin = parseAddress("Yunusobod tumani, Yunusobod 12-7")
        assertEquals("Toshkent shahri", bareLatin.viloyat)
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
        val vm = viewModel(create = { sent = it; Result.success(created()) })
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
     * created. The id is still reported (the operator can open the client that holds the number),
     * but the name it is filed under comes with it, so the sheet can say what happened instead of
     * closing onto a stranger's detail screen.
     */
    @Test fun `a create that only found an existing client names that client`() = runTest {
        val vm = viewModel(create = { Result.success(alreadyOnFile()) })
        advanceUntilIdle()
        vm.openCreate()
        vm.setName("Бошқа ном")
        vm.setPhoneDigits("901112233")
        vm.submit()
        advanceUntilIdle()
        assertEquals("already-on-file", vm.state.value.savedId)
        assertEquals("Бошқа мижоз", vm.state.value.existingClientName)
    }

    /** The mirror: a genuine create must NOT raise the notice, or every added client would claim
     *  the number was already on file. */
    @Test fun `a real create raises no already-on-file notice`() = runTest {
        val vm = viewModel(create = { Result.success(created()) })
        advanceUntilIdle()
        vm.openCreate()
        vm.setName("Навоий Build")
        vm.setPhoneDigits("901112233")
        vm.submit()
        advanceUntilIdle()
        assertEquals("c9", vm.state.value.savedId)
        assertNull(vm.state.value.existingClientName)
    }

    /**
     * The sheet's completion handler, at the seam a test can reach.
     *
     * `consumeSaved()` must run BEFORE `onSaved` — `onSaved` dismisses the sheet and navigates,
     * which can dispose the composable and cancel the effect, so a clear placed after it could
     * land in that gap and leave the id standing. This ViewModel outlives the sheet (it belongs
     * to the screen's back-stack entry), so a standing id makes the next open replay the
     * completion: the sheet becomes single-use per screen. That is this slice's one Critical, and
     * swapping the two lines in [completeSave] is all it takes to bring it back.
     */
    @Test fun `the saved id is consumed before the host is told`() {
        val order = mutableListOf<String>()
        completeSave(
            savedId = "c9", existingClientName = null,
            consume = { order += "consume" }, onSaved = { order += "onSaved" },
        )
        assertEquals(listOf("consume", "onSaved"), order)
    }

    /** Nothing was created, so nothing is reported: the sheet stays open and says whose number
     *  it is. The id is still held, for the explicit "open them" action. */
    @Test fun `a dedup hit neither consumes nor reports`() {
        val order = mutableListOf<String>()
        completeSave(
            savedId = "already-on-file", existingClientName = "Бошқа мижоз",
            consume = { order += "consume" }, onSaved = { order += "onSaved" },
        )
        assertEquals(emptyList<String>(), order)
    }

    @Test fun `no save at all reports nothing`() {
        val order = mutableListOf<String>()
        completeSave(
            savedId = null, existingClientName = null,
            consume = { order += "consume" }, onSaved = { order += "onSaved" },
        )
        assertEquals(emptyList<String>(), order)
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

    @Test fun `clearing a note that was set is refused rather than silently ignored`() = runTest {
        var called = false
        val vm = viewModel(update = { _, _ -> called = true; Result.success(Unit) })
        advanceUntilIdle()
        vm.openEdit(
            ClientDetail(
                id = "c1", name = "Навоий Build", phone = "998901112233",
                address = null, notes = "эрталаб қўнғироқ", orders = emptyList(),
            ),
        )
        vm.setNotes("   ")
        vm.submit()
        advanceUntilIdle()
        assertNotNull(vm.state.value.error)
        assertFalse(called, "the clear must not reach a PATCH that would drop it")
        assertNull(vm.state.value.savedId)
    }

    /**
     * The sheet is opened and dismissed many times against ONE ViewModel: it is resolved against
     * the screen's back-stack entry, not the sheet, so a completion left standing would replay
     * itself on the next open — a second tap on «Мижоз қўшиш» would navigate straight to the
     * client added a minute ago instead of opening an empty form.
     */
    @Test fun `the completion is consumed, so a reopened sheet cannot replay it`() = runTest {
        val vm = viewModel(create = { Result.success(created()) })
        advanceUntilIdle()
        vm.openCreate()
        vm.setName("Навоий Build")
        vm.setPhoneDigits("901112233")
        vm.submit()
        advanceUntilIdle()
        assertEquals("c9", vm.state.value.savedId)

        vm.consumeSaved()
        assertNull(vm.state.value.savedId)

        // Reopened on the same ViewModel: nothing left over, and the form is blank again.
        vm.openCreate()
        assertNull(vm.state.value.savedId)
        assertEquals("", vm.state.value.name)
        assertEquals("", vm.state.value.phoneDigits)
    }

    /**
     * `PATCH` sends the phone on every save, so a stored number that is not nine local digits
     * would be rewritten by the server — silently changing the customer's identity. The save
     * stays blocked, but the operator is told WHY on open rather than discovering it when a name
     * correction is refused.
     */
    @Test fun `a malformed stored phone is surfaced on open and blocks the save`() = runTest {
        var called = false
        val vm = viewModel(update = { _, _ -> called = true; Result.success(Unit) })
        advanceUntilIdle()
        vm.openEdit(
            ClientDetail(
                id = "c1", name = "Навоий Build", phone = "99890111223",
                address = null, notes = null, orders = emptyList(),
            ),
        )
        assertTrue(vm.state.value.storedPhoneInvalid)
        assertEquals("99890111223", vm.state.value.phoneDigits, "show what is stored, not a tidied version")

        vm.setName("Навоий Build MChJ")
        vm.submit()
        advanceUntilIdle()
        assertFalse(called, "the server would rewrite the phone; block the save")
        assertNotNull(vm.state.value.error)

        // The notice retires the moment the number it complains about is corrected.
        vm.setPhoneDigits("901112233")
        assertFalse(vm.state.value.storedPhoneInvalid)
        vm.submit()
        advanceUntilIdle()
        assertTrue(called)
    }

    @Test fun `a well-formed stored phone raises no notice`() = runTest {
        val vm = viewModel()
        advanceUntilIdle()
        vm.openEdit(client())
        assertFalse(vm.state.value.storedPhoneInvalid)
        assertEquals("901112233", vm.state.value.phoneDigits)
    }

    /**
     * `Client.phone` is `@unique` and PATCH does not pre-check it, so Prisma's P2002 surfaces as
     * a 409 whose message is English on BOTH sides of the " · " the UI splits on — meaning
     * `uzbekMessage` would show the raw database wording to the operator. Reachable by an
     * ordinary correction: one mistyped digit that happens to be somebody else's number.
     */
    @Test fun `a phone that belongs to another client fails in Uzbek, not in English`() = runTest {
        val vm = viewModel(
            update = { _, _ ->
                Result.failure(ApiException(409, "Unique constraint violation: phone"))
            },
        )
        advanceUntilIdle()
        vm.openEdit(client())
        vm.submit()
        advanceUntilIdle()
        val message = vm.state.value.error.orEmpty()
        assertTrue(CYRILLIC.containsMatchIn(message), "the raw server wording reached the operator: $message")
        assertFalse(message.contains("Unique constraint"), message)
    }

    /** Every other failure keeps the server's own Uzbek message — the mapping above is a patch
     *  for one specific English string, not a blanket replacement. */
    @Test fun `an unrelated conflict keeps the server's own message`() = runTest {
        val vm = viewModel(
            update = { _, _ -> Result.failure(ApiException(409, "Мижоз аллақачон ўчирилган · Client already deleted")) },
        )
        advanceUntilIdle()
        vm.openEdit(client())
        vm.submit()
        advanceUntilIdle()
        assertEquals("Мижоз аллақачон ўчирилган", vm.state.value.error)
    }

    @Test fun `create is refused without client create, before the network`() = runTest {
        var called = false
        val vm = viewModel(
            create = { called = true; Result.success(created()) },
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
        val vm = viewModel(create = { called = true; Result.success(created()) })
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
        val gate = CompletableDeferred<Result<ClientCreated>>()
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

        gate.complete(Result.success(created()))
        advanceUntilIdle()
        assertFalse(vm.state.value.submitting)
        assertEquals("c9", vm.state.value.savedId)
    }

    @Test fun `a failed save keeps what was typed and lets it be sent again`() = runTest {
        var fail = true
        var calls = 0
        val vm = viewModel(
            create = { calls++; if (fail) Result.failure(java.io.IOException("no net")) else Result.success(created()) },
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

    /** A real create: the server stored what was sent and answered with it. */
    private fun created(id: String = "c9", name: String = "Навоий Build") =
        ClientCreated(id = id, name = name, alreadyExisted = false)

    /** A dedup hit: the phone was already on file under [name], and nothing was created. */
    private fun alreadyOnFile(id: String = "already-on-file", name: String = "Бошқа мижоз") =
        ClientCreated(id = id, name = name, alreadyExisted = true)

    private fun viewModel(
        create: suspend (ClientInput) -> Result<ClientCreated> = { Result.success(created()) },
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
