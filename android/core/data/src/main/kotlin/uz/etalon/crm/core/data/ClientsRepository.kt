package uz.etalon.crm.core.data

import uz.etalon.crm.core.data.mapper.normalizePhone
import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.model.ClientDetail
import uz.etalon.crm.core.model.ClientInput
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

    suspend fun list(query: String?): Result<List<ClientSummary>> =
        runCatchingCancellable { api.clients(q = query).map { it.toDomain() } }

    suspend fun detail(id: String): Result<ClientDetail> =
        runCatchingCancellable { api.client(id).toDomain() }

    /**
     * Phone is this product's unique customer identity — client names may legitimately repeat
     * across two different customers, so there is deliberately no uniqueness check on `name`
     * here. The phone itself is normalised before it ever reaches the request: the server dedups
     * `POST /api/clients` by the normalized phone, and sending the raw typed form would let one
     * customer get created twice under two spellings of the same number.
     */
    suspend fun create(input: ClientInput): Result<String> = runCatchingCancellable {
        if (!permissions.can(CLIENT_CREATE)) error("Мижоз қўшишга рухсат йўқ")
        api.createClient(input.toRequest()).id
    }

    suspend fun update(id: String, input: ClientInput): Result<Unit> = runCatchingCancellable {
        if (!permissions.can(CLIENT_EDIT)) error("Мижозни таҳрирлашга рухсат йўқ")
        mutate { api.updateClient(id, input.toRequest()) }
    }

    private fun ClientInput.toRequest() = ClientWriteRequest(
        name = name, phone = normalizePhone(phone), address = address, notes = notes,
    )

    /** Discards the response row; mirrors LogisticsRepository's `mutate` — `call`'s declared type
     *  is `suspend () -> Unit`, and Kotlin's unit-coercion for lambda literals lets the call site
     *  above pass a body that returns `ClientRowDto` unchanged, the value simply discarded. */
    private suspend fun mutate(call: suspend () -> Unit) = call()
}
