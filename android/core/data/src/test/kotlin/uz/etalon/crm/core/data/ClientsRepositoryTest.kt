package uz.etalon.crm.core.data

import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.ClientInput
import uz.etalon.crm.core.network.CLIENTS_PAGE_SIZE
import uz.etalon.crm.core.network.dto.*
import uz.etalon.crm.core.testing.FakeEtalonApi

/** Every member of [FakeEtalonApi] throws, so ClientFailingApi below needs no overrides at all
 *  and ClientRecordingApi overrides only what it exercises. */
private open class ClientStubApi : FakeEtalonApi()

/** Any direct call fails the test — proves an operation was refused before it ever reached the
 *  network, or genuinely failed there. */
private class ClientFailingApi : ClientStubApi()

private class ClientRecordingApi : ClientStubApi() {
    val calls = mutableListOf<String>()
    var createResult = ClientRowDto(id = "c1", name = "Navoi Build", phone = "998901112233")
    var updateResult = ClientRowDto(id = "c1", name = "Navoi Build", phone = "998901112233")
    var listResult = ClientsPageDto(rows = emptyList(), total = 0, page = 1, pageSize = 50, pageCount = 1)
    var detailResult = ClientDetailDto(id = "c1", name = "Navoi Build", phone = "998901112233")

    override suspend fun clients(q: String?, phone: String?, page: Int, pageSize: Int): ClientsPageDto {
        calls += "clients:$q:$page:$pageSize"; return listResult
    }
    override suspend fun createClient(body: ClientWriteRequest): ClientRowDto {
        calls += "createClient:${body.name}:${body.phone}:${body.address}:${body.notes}"; return createResult
    }
    override suspend fun client(id: String): ClientDetailDto {
        calls += "client:$id"; return detailResult
    }
    override suspend fun updateClient(id: String, body: ClientWriteRequest): ClientRowDto {
        calls += "updateClient:$id:${body.name}:${body.phone}"; return updateResult
    }
}

/** An operator holding every permission. */
private val CLIENT_GRANTED = PermissionGate { true }

private fun input(
    name: String = "Navoi Build",
    phone: String = "+998 90 111 22 33",
    address: String? = null,
    notes: String? = null,
) = ClientInput(name = name, phone = phone, address = address, notes = notes)

class ClientsRepositoryTest {

    // ── The three that matter ────────────────────────────────────

    @Test fun `create is refused for an operator without client create`() = runTest {
        // ClientRecordingApi, not ClientFailingApi: a FailingApi cannot tell a refusal from a
        // network error, since either way the call throws and the Result comes back failed.
        // Only a recording double that would have SUCCEEDED can prove the guard, not the
        // exception, is what stopped it.
        val api = ClientRecordingApi()
        val repo = ClientsRepository(api, PermissionGate { it != "client.create" })
        val res = repo.create(input())
        assertTrue(res.isFailure, "the server would answer 403; the write must be refused first")
        assertEquals(0, api.calls.size, "the guard must refuse before the network: ${api.calls}")
    }

    @Test fun `update is refused for an operator without client edit`() = runTest {
        val api = ClientRecordingApi()
        val repo = ClientsRepository(api, PermissionGate { it != "client.edit" })
        val res = repo.update("c1", input())
        assertTrue(res.isFailure, "the server would answer 403; the write must be refused first")
        assertEquals(0, api.calls.size, "the guard must refuse before the network: ${api.calls}")
    }

    @Test fun `create normalises the phone before it reaches the request`() = runTest {
        val api = ClientRecordingApi()
        ClientsRepository(api, CLIENT_GRANTED)
            .create(input(phone = "+998 90 111 22 33"))
            .getOrThrow()
        assertEquals(
            listOf("createClient:Navoi Build:998901112233:null:null"), api.calls,
            "the request must carry digits only, matching src/lib/phone.ts's normalizePhone — " +
                "the server dedups POST /api/clients by this exact form",
        )
    }

    @Test fun `update also normalises the phone before it reaches the request`() = runTest {
        val api = ClientRecordingApi()
        ClientsRepository(api, CLIENT_GRANTED)
            .update("c1", input(phone = "8 (90) 111-22-33"))
            .getOrThrow()
        assertEquals(listOf("updateClient:c1:Navoi Build:998901112233"), api.calls)
    }

    /**
     * `ClientsRepository` has no constructor path to the outbox at all — every route here is
     * online-only, so there is no seam to check with a spy the way PaymentsRepository's
     * `attachReceipt` is. The absence itself is the guarantee; assert it structurally, mirroring
     * DiscrepanciesRepositoryTest's own check, so a future change that adds one fails this test
     * instead of compiling in silently.
     */
    @Test fun `ClientsRepository has no constructor path to the outbox`() {
        val params = ClientsRepository::class.java.declaredConstructors.single().parameterTypes.toList()
        assertFalse(params.contains(OutboxGateway::class.java))
    }

    // ── The rest: standard repository shape, mirroring the other suites ─────

    @Test fun `list passes the query through untranslated and asks for one bounded page`() = runTest {
        val api = ClientRecordingApi()
        ClientsRepository(api, CLIENT_GRANTED).list("Navoi").getOrThrow()
        // The page arguments are not decoration: without `page` the route answers a bare array of
        // EVERY client row, and this list has no cache to spare the operator the re-download.
        assertEquals(listOf("clients:Navoi:1:$CLIENTS_PAGE_SIZE"), api.calls)
    }

    /** `total` counts the MATCHES server-side, not the rows on this page — the screen needs the
     *  difference to say the list it is showing is not all of them. */
    @Test fun `list carries the server's match count through, not the row count`() = runTest {
        val row = ClientRowDto(id = "c1", name = "Navoi Build", phone = "998901112233")
        val api = ClientRecordingApi().apply {
            listResult = ClientsPageDto(rows = listOf(row), total = 312, page = 1, pageSize = 50, pageCount = 7)
        }
        val page = ClientsRepository(api, CLIENT_GRANTED).list(null).getOrThrow()
        assertEquals(1, page.items.size)
        assertEquals(312, page.total)
    }

    @Test fun `detail maps the id straight through`() = runTest {
        val api = ClientRecordingApi()
        val detail = ClientsRepository(api, CLIENT_GRANTED).detail("c1").getOrThrow()
        assertEquals("c1", detail.id)
        assertEquals(listOf("client:c1"), api.calls)
    }

    @Test fun `a real create returns the new client and claims nothing else`() = runTest {
        // The server stores `{...body, phone: normalised}` untouched, so the row it answers with
        // repeats every field that was sent. That is what "nothing was discarded" looks like.
        val api = ClientRecordingApi().apply {
            createResult = ClientRowDto(
                id = "c9", name = "Navoi Build", phone = "998901112233",
                address = "Тошкент шаҳри", notes = "эрталаб",
            )
        }
        val created = ClientsRepository(api, CLIENT_GRANTED)
            .create(input(address = "Тошкент шаҳри", notes = "эрталаб"))
            .getOrThrow()
        assertEquals("c9", created.id)
        assertFalse(created.alreadyExisted)
    }

    /**
     * The whole point of returning the row. `POST /api/clients` answers 200 with the EXISTING
     * client when the normalised phone is already on file, discarding the name and address just
     * typed — one mistyped digit is enough, and so are two firms sharing an owner's mobile. The
     * repository must be able to tell the operator, and to name whose number it is.
     */
    @Test fun `a create that only found an existing client says so, with that client's name`() = runTest {
        val api = ClientRecordingApi().apply {
            createResult = ClientRowDto(id = "already-on-file", name = "Бошқа мижоз", phone = "998901112233")
        }
        val created = ClientsRepository(api, CLIENT_GRANTED).create(input(name = "Navoi Build")).getOrThrow()
        assertTrue(created.alreadyExisted)
        assertEquals("already-on-file", created.id)
        assertEquals("Бошқа мижоз", created.name)
    }

    /** A differing address alone is enough — the name can match while the row is a different
     *  customer's, and the address the operator typed was still thrown away. */
    @Test fun `a dedup hit is caught by the address too, not only the name`() = runTest {
        val api = ClientRecordingApi().apply {
            createResult = ClientRowDto(id = "c1", name = "Navoi Build", phone = "998901112233", address = "Самарқанд")
        }
        val created = ClientsRepository(api, CLIENT_GRANTED)
            .create(input(address = "Тошкент шаҳри"))
            .getOrThrow()
        assertTrue(created.alreadyExisted)
    }

    /** ...and by the notes, which no other surface reads back at all. */
    @Test fun `a dedup hit is caught by the notes too`() = runTest {
        val api = ClientRecordingApi().apply {
            createResult = ClientRowDto(id = "c1", name = "Navoi Build", phone = "998901112233", notes = null)
        }
        val created = ClientsRepository(api, CLIENT_GRANTED).create(input(notes = "эрталаб")).getOrThrow()
        assertTrue(created.alreadyExisted)
    }

    @Test fun `update succeeds without surfacing the response row`() = runTest {
        val api = ClientRecordingApi()
        ClientsRepository(api, CLIENT_GRANTED).update("c1", input()).getOrThrow()
        assertEquals(listOf("updateClient:c1:Navoi Build:998901112233"), api.calls)
    }

    @Test fun `an api failure comes back as a Result failure, not an exception`() = runTest {
        val res = ClientsRepository(ClientFailingApi(), CLIENT_GRANTED).create(input())
        assertTrue(res.isFailure)
    }

    // ── findByPhone: an identity lookup, not a search ────────────────────────────

    @Test fun `findByPhone normalises before asking and returns the exact match only`() = runTest {
        var asked: String? = null
        val api = object : FakeEtalonApi() {
            override suspend fun clients(q: String?, phone: String?, page: Int, pageSize: Int): ClientsPageDto {
                asked = phone
                return ClientsPageDto(rows = listOf(row(phone = "998901112233")), total = 1, page = 1, pageSize = 50, pageCount = 1)
            }
        }
        val hit = repo(api).findByPhone("90 111 22 33").getOrThrow()
        assertEquals("998901112233", asked)
        assertEquals("998901112233", hit?.phone)
    }

    @Test fun `a prefix match that is not the same number is not a match`() = runTest {
        val api = object : FakeEtalonApi() {
            override suspend fun clients(q: String?, phone: String?, page: Int, pageSize: Int) =
                ClientsPageDto(rows = listOf(row(phone = "998901112234")), total = 1, page = 1, pageSize = 50, pageCount = 1)
        }
        assertNull(repo(api).findByPhone("998901112233").getOrThrow())
    }

    @Test fun `no rows at all is simply no match, not an error`() = runTest {
        val api = object : FakeEtalonApi() {
            override suspend fun clients(q: String?, phone: String?, page: Int, pageSize: Int) =
                ClientsPageDto(rows = emptyList(), total = 0, page = 1, pageSize = 50, pageCount = 1)
        }
        assertNull(repo(api).findByPhone("998901112233").getOrThrow())
    }

    /** Fewer than nine digits cannot be a real number, so the lookup never reaches the network —
     *  the same guard the server's own dedup only bothers to run against a full number. */
    @Test fun `too few digits is refused before the network`() = runTest {
        val api = ClientRecordingApi()
        val hit = ClientsRepository(api, CLIENT_GRANTED).findByPhone("90 111").getOrThrow()
        assertNull(hit)
        assertEquals(0, api.calls.size)
    }

    @Test fun `a findByPhone failure comes back as a Result failure, not an exception`() = runTest {
        val res = ClientsRepository(ClientFailingApi(), CLIENT_GRANTED).findByPhone("998901112233")
        assertTrue(res.isFailure)
    }

    private fun repo(api: FakeEtalonApi) = ClientsRepository(api, CLIENT_GRANTED)

    private fun row(phone: String, id: String = "c1", name: String = "Navoi Build") =
        ClientRowDto(id = id, name = name, phone = phone)

    @Test fun `a list-row response with no _count still maps to zero orders`() = runTest {
        // POST /api/clients omits _count entirely; ClientRowDto defaults it to zero rather than
        // throwing. list() still goes through the same mapper as any _count-bearing row, so
        // prove the default survives an explicit construction here too.
        val row = ClientRowDto(id = "c1", name = "Navoi Build", phone = "998901112233")
        val api = ClientRecordingApi().apply {
            listResult = ClientsPageDto(rows = listOf(row), total = 1, page = 1, pageSize = 50, pageCount = 1)
        }
        val page = ClientsRepository(api, CLIENT_GRANTED).list(null).getOrThrow()
        assertEquals(0, page.items.single().orderCount)
    }
}
