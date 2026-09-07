package uz.etalon.crm.feature.clients.edit

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.ClientsRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.model.ClientDetail
import uz.etalon.crm.core.model.ClientInput
import javax.inject.Inject

/** Same wording every other online-only action in the app uses for a refused write. */
private const val OFFLINE_MESSAGE = "Интернет йўқ — бу амал онлайн бажарилади"

/** Mirrors ClientsRepository's own refusals, so the sheet never offers a save the operator
 *  cannot make and the repository never has to be the first to say no. */
private const val NO_CREATE_MESSAGE = "Мижоз қўшишга рухсат йўқ"
private const val NO_EDIT_MESSAGE = "Мижозни таҳрирлашга рухсат йўқ"

private const val CLIENT_CREATE = "client.create"
private const val CLIENT_EDIT = "client.edit"

/** `ClientCreateSchema`: name `.max(120)`, address `.max(200)`, notes `.max(2000)`. */
private const val MAX_NAME = 120
private const val MAX_ADDRESS = 200
private const val MAX_NOTES = 2000

/** `normalizePhone` turns exactly nine digits into `998` + those nine. */
private const val LOCAL_PHONE_DIGITS = 9

/** What the create/edit sheet holds. Kept in the ViewModel rather than in the composition so
 *  what was typed survives the keypad taking the screen, and so the guards live at a seam a
 *  test can reach. */
data class ClientEditState(
    /** null while creating; the client's id while editing. */
    val clientId: String? = null,
    val name: String = "",
    /** The NINE local digits only. The `+998` the field shows is display-only — the value sent
     *  is the twelve-digit form, exactly as the drivers sheet does it. */
    val phoneDigits: String = "",
    val viloyat: String = "",
    val tuman: String = "",
    val street: String = "",
    val notes: String = "",
    /** What was stored when the sheet opened. Only [validateClient] reads these, and only to
     *  refuse a clear that `PATCH` would silently drop — see its doc. */
    val originalAddress: String = "",
    val originalNotes: String = "",
    val submitting: Boolean = false,
    val error: String? = null,
    val canCreate: Boolean = false,
    val canEdit: Boolean = false,
    /** "Not yet known" is not "yes": [canSave] stays false until the answer lands. */
    val permissionsResolved: Boolean = false,
    val isOffline: Boolean = false,
    /** The id the server answered with. The host reads it, opens that client, and dismisses.
     *  On a create it may be a client that ALREADY EXISTED — see [ClientEditViewModel]. */
    val savedId: String? = null,
) {
    val isEditing: Boolean get() = clientId != null

    /** The address in the stored `"<Viloyat>, <Tuman>, <street>"` convention. */
    val address: String get() = composeAddress(viloyat, tuman, street)

    private val permitted: Boolean get() = if (isEditing) canEdit else canCreate

    val canSave: Boolean get() = permissionsResolved && permitted && !submitting && !isOffline

    /** Both fields keep their stored value on a clear, so say so where the operator can see it
     *  before typing rather than only when the save is refused. */
    val showKeepNotice: Boolean get() = isEditing && (originalAddress.isNotBlank() || originalNotes.isNotBlank())
}

/**
 * Everything the form must be right about before it reaches the network, as an Uzbek message or
 * null. A pure function of one form — it is handed no other client and no list, which is how the
 * one rule that matters here is enforced structurally:
 *
 * **A repeated name is never refused.** Two different customers may both be «Навоий Build»; the
 * PHONE is this product's unique customer identity. Anything that treated two same-named clients
 * as a problem would be a domain bug, not a safety net.
 */
fun validateClient(s: ClientEditState): String? {
    val name = s.name.trim()
    if (name.isEmpty()) return "Мижоз номини киритинг"
    if (name.length > MAX_NAME) return "Ном $MAX_NAME белгидан ошмаслиги керак"

    // ASCII digits only, matching the server's own `/\D+/`: a non-ASCII digit would normalise
    // differently on the two sides and store some other number as this customer's identity.
    if (s.phoneDigits.length != LOCAL_PHONE_DIGITS || s.phoneDigits.any { it !in '0'..'9' }) {
        return "Телефон рақами $LOCAL_PHONE_DIGITS та рақамдан иборат бўлиши керак"
    }

    val address = s.address
    if (address.length > MAX_ADDRESS) return "Манзил $MAX_ADDRESS белгидан ошмаслиги керак"
    val notes = s.notes.trim()
    if (notes.length > MAX_NOTES) return "Изоҳ $MAX_NOTES белгидан ошмаслиги керак"

    // A null is OMITTED from the PATCH body (`explicitNulls = false`) and ClientUpdateSchema is
    // `.partial()`, so an absent key leaves the stored column untouched. Clearing either field
    // here would therefore do nothing at all — and silently. Refuse it instead of pretending.
    if (s.isEditing && s.originalAddress.isNotBlank() && address.isBlank()) {
        return "Манзилни бу ердан ўчириб бўлмайди — фақат ўзгартириш мумкин"
    }
    if (s.isEditing && s.originalNotes.isNotBlank() && notes.isEmpty()) {
        return "Изоҳни бу ердан ўчириб бўлмайди — фақат ўзгартириш мумкин"
    }
    return null
}

fun interface ClientCreateUseCase {
    suspend operator fun invoke(input: ClientInput): Result<String>
}

fun interface ClientUpdateUseCase {
    suspend operator fun invoke(id: String, input: ClientInput): Result<Unit>
}

fun interface ClientEditPermissionUseCase {
    suspend operator fun invoke(action: String): Boolean
}

/**
 * Adding a customer, or correcting one. The only write path in this slice, and it writes the
 * field that identifies a customer.
 *
 * A successful create is NOT proof a client was created: `POST /api/clients` looks the normalised
 * phone up first and, when it finds a row, answers with that existing row — ignoring the name and
 * address submitted. So this reports only [ClientEditState.savedId] and the host opens that
 * client, where the operator sees what is actually stored. Nothing here says «қўшилди».
 */
open class ClientEditViewModel(
    create: ClientCreateUseCase,
    update: ClientUpdateUseCase,
    permissions: ClientEditPermissionUseCase,
) : ViewModel() {
    private val createClient = create
    private val updateClient = update
    private val can = permissions

    private val _state = MutableStateFlow(ClientEditState())
    val state: StateFlow<ClientEditState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            val create0 = can(CLIENT_CREATE)
            val edit0 = can(CLIENT_EDIT)
            _state.update { it.copy(canCreate = create0, canEdit = edit0, permissionsResolved = true) }
        }
    }

    /** Blanks the form. Called every time the sheet opens: this ViewModel is scoped to the
     *  back-stack entry, not to the sheet, so it outlives a dismissal. */
    fun openCreate() = _state.update { blank(it) }

    fun openEdit(client: ClientDetail) = _state.update {
        val parsed = parseAddress(client.address)
        blank(it).copy(
            clientId = client.id,
            name = client.name,
            phoneDigits = localDigits(client.phone),
            viloyat = parsed.viloyat,
            tuman = parsed.tuman,
            street = parsed.street,
            notes = client.notes.orEmpty(),
            originalAddress = client.address.orEmpty(),
            originalNotes = client.notes.orEmpty(),
        )
    }

    /** The list/detail screen's own offline signal, pushed down: neither client route is
     *  `withIdempotency`-wrapped, so a save may never be queued. */
    fun setOffline(v: Boolean) = _state.update { it.copy(isOffline = v) }

    fun setName(v: String) = edit { it.copy(name = v) }
    fun setPhoneDigits(v: String) = edit { it.copy(phoneDigits = v) }
    fun setStreet(v: String) = edit { it.copy(street = v) }
    fun setNotes(v: String) = edit { it.copy(notes = v) }

    /** Choosing a viloyat narrows the tumans to it, so a tuman from a different one is cleared —
     *  the same linking rule the web widget follows. */
    fun setViloyat(v: String) = edit { s ->
        val keepTuman = v.isNotEmpty() && findTumanByName(s.tuman)?.let { t ->
            findViloyatByName(v)?.id == t.viloyatId
        } == true
        s.copy(viloyat = v, tuman = if (keepTuman) s.tuman else "")
    }

    /** Choosing a tuman snaps the viloyat to its parent, in the alphabet the tuman was named in. */
    fun setTuman(v: String) = edit { s ->
        val t = findTumanByName(v)
        val parent = t?.let { tuman -> VILOYATS.firstOrNull { it.id == tuman.viloyatId } }
        val viloyat = when {
            t == null -> s.viloyat
            parent == null -> s.viloyat
            v == t.nameUz -> parent.nameUz
            else -> parent.name
        }
        s.copy(tuman = v, viloyat = viloyat)
    }

    /**
     * Guarded here as well as on the button: the phone is the customer's identity, and this is
     * the seam a test can reach.
     */
    fun submit() {
        val s = _state.value
        if (s.submitting || s.savedId != null) return
        if (!s.permissionsResolved || (if (s.isEditing) !s.canEdit else !s.canCreate)) {
            _state.update { it.copy(error = if (s.isEditing) NO_EDIT_MESSAGE else NO_CREATE_MESSAGE) }
            return
        }
        if (s.isOffline) {
            _state.update { it.copy(error = OFFLINE_MESSAGE) }
            return
        }
        val problem = validateClient(s)
        if (problem != null) {
            _state.update { it.copy(error = problem) }
            return
        }

        val input = ClientInput(
            name = s.name.trim(),
            // The twelve-digit form; the repository normalises again, which is idempotent.
            phone = "998${s.phoneDigits}",
            address = s.address.ifBlank { null },
            notes = s.notes.trim().ifBlank { null },
        )
        val id = s.clientId
        _state.update { it.copy(submitting = true, error = null) }
        viewModelScope.launch {
            val result = if (id == null) createClient(input) else updateClient(id, input).map { id }
            result.fold(
                onSuccess = { savedId -> _state.update { it.copy(submitting = false, savedId = savedId) } },
                onFailure = { t ->
                    // What was typed is deliberately kept: a network drop is exactly the case
                    // where the operator wants to tap save again, not retype the form.
                    _state.update { it.copy(submitting = false, error = t.toAppError().message) }
                },
            )
        }
    }

    private fun blank(s: ClientEditState) = ClientEditState(
        canCreate = s.canCreate, canEdit = s.canEdit,
        permissionsResolved = s.permissionsResolved, isOffline = s.isOffline,
    )

    private fun edit(block: (ClientEditState) -> ClientEditState) =
        _state.update { block(it).copy(error = null) }

    /**
     * The stored phone is digits-only with a `998` prefix. Anything else — a legacy landline, a
     * foreign number — is shown as the digits it is, and [validateClient] then refuses the save
     * until it is nine local digits. That is the honest outcome: the server would rewrite such a
     * number on the next PATCH anyway.
     */
    private fun localDigits(stored: String): String {
        val d = stored.filter { it in '0'..'9' }
        return if (d.length == 12 && d.startsWith("998")) d.substring(3) else d
    }
}

@HiltViewModel
class HiltClientEditViewModel @Inject constructor(
    clients: ClientsRepository,
    permissions: PermissionGate,
) : ClientEditViewModel(
    create = ClientCreateUseCase { input -> clients.create(input) },
    update = ClientUpdateUseCase { id, input -> clients.update(id, input) },
    permissions = ClientEditPermissionUseCase { action -> permissions.can(action) },
)
