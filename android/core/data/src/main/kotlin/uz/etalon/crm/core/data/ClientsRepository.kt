package uz.etalon.crm.core.data

import uz.etalon.crm.core.data.mapper.normalizePhone
import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.model.ClientCreated
import uz.etalon.crm.core.model.ClientDetail
import uz.etalon.crm.core.model.ClientInput
import uz.etalon.crm.core.model.ClientPage
import uz.etalon.crm.core.model.ClientSummary
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.ClientWriteRequest
import javax.inject.Inject
import javax.inject.Singleton

/** `POST /api/clients` server-side. */
private const val CLIENT_CREATE = "client.create"

/** `PATCH /api/clients/{id}` server-side. */
private const val CLIENT_EDIT = "client.edit"

@Singleton
class ClientsRepository @Inject constructor(
    private val api: EtalonApi,
    private val permissions: PermissionGate,
) {
    // ── Queued: none. Neither POST /api/clients nor PATCH /api/clients/{id} is
    // withIdempotency-wrapped server-side, so nothing here may go through the outbox — a queued
    // replay of either would create or edit the client a second time behind the operator's back.
    // (There is no OutboxGateway in the constructor at all: the absence is the guarantee.)

    // ── Online only: sent live, never queued ───────────────────────

    /**
     * One bounded page of clients — never the whole table. `GET /api/clients` answers a bare
     * array of every row when `page` is absent, and this list has no Room cache while the bottom
     * bar destroys its NavEntry on each tab switch, so an unbounded read would re-download every
     * customer on every switch. [uz.etalon.crm.core.model.ClientPage.total] carries how many
     * matched, so the screen can say when there are more than it holds.
     */
    suspend fun list(query: String?): Result<ClientPage> =
        runCatchingCancellable { api.clients(q = query).toDomain() }

    suspend fun detail(id: String): Result<ClientDetail> =
        runCatchingCancellable { api.client(id).toDomain() }

    /**
     * Phone is this product's unique customer identity, so this is an identity lookup, not a search.
     * The route matches on `startsWith` as well as `contains` (route.ts:88-95) — good enough for the
     * web's autocomplete, wrong for "fill this quote in with that customer", so the exact normalised
     * number is compared here before anything is returned. A near miss is not a customer.
     */
    suspend fun findByPhone(phone: String): Result<ClientSummary?> = runCatchingCancellable {
        val norm = normalizePhone(phone)
        if (norm.length < 9) return@runCatchingCancellable null
        api.clients(phone = norm).toDomain().items.firstOrNull { normalizePhone(it.phone) == norm }
    }

    /**
     * Phone is this product's unique customer identity — client names may legitimately repeat
     * across two different customers, so there is deliberately no uniqueness check on `name`
     * here. The phone itself is normalised before it ever reaches the request: the server dedups
     * `POST /api/clients` by the normalized phone, and sending the raw typed form would let one
     * customer get created twice under two spellings of the same number.
     *
     * The returned client may be one that ALREADY EXISTED. `POST /api/clients` looks the
     * normalised phone up first and, when it finds a row, answers 200 with that row — ignoring
     * the name, address and notes that were submitted. A success here is therefore not proof
     * anything was created, and no caller may report one as «қўшилди».
     *
     * Which of the two happened is decided by comparing the row that came back against what was
     * sent, rather than by discarding it and keeping only the id. On a real create the server
     * stores `{...body, phone: normalised}` untouched, so all three fields match; a difference in
     * any of them means the phone is already on file under a different customer, and
     * [uz.etalon.crm.core.model.ClientCreated.alreadyExisted] says so with the name it is filed
     * under. The phone itself is never compared — the server normalises it on the way in, which
     * is exactly why the dedup fired.
     */
    suspend fun create(input: ClientInput): Result<ClientCreated> = runCatchingCancellable {
        if (!permissions.can(CLIENT_CREATE)) error("Мижоз қўшишга рухсат йўқ")
        val sent = input.toRequest()
        val row = api.createClient(sent)
        ClientCreated(
            id = row.id,
            name = row.name,
            alreadyExisted = row.name != sent.name ||
                row.address != sent.address ||
                row.notes != sent.notes,
        )
    }

    /**
     * The response row is discarded: nothing on this screen reads it back, and `PATCH` answers
     * with the stored row rather than with what was sent.
     *
     * `address` and `notes` cannot be CLEARED through here. The shared JSON config sets
     * `explicitNulls = false`, so a null is omitted from the body rather than sent, and
     * `ClientUpdateSchema` being `.partial()` means an absent key leaves the column untouched.
     * That is the safe default — an edit sheet cannot wipe an address by accident — but it also
     * means a UI must not offer "delete the address", because the delete would silently not happen.
     */
    suspend fun update(id: String, input: ClientInput): Result<Unit> = runCatchingCancellable {
        if (!permissions.can(CLIENT_EDIT)) error("Мижозни таҳрирлашга рухсат йўқ")
        api.updateClient(id, input.toRequest())
        Unit
    }

    private fun ClientInput.toRequest() = ClientWriteRequest(
        name = name, phone = normalizePhone(phone), address = address, notes = notes,
    )
}
