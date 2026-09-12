package uz.etalon.crm.feature.calculator

import androidx.compose.ui.text.AnnotatedString
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
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
import uz.etalon.crm.core.data.ClientsRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.SessionPricing
import uz.etalon.crm.core.model.Pricing
import uz.etalon.crm.core.network.dto.ClientRowDto
import uz.etalon.crm.core.network.dto.ClientsPageDto
import uz.etalon.crm.core.testing.FakeEtalonApi
import java.io.IOException

/** No pricing is needed for any test here — the client bar prices nothing. */
private class ClientRowInertSessionPricing : SessionPricing {
    override val pricing: StateFlow<Pricing?> = MutableStateFlow(null)
}

/**
 * [CalculatorViewModel]'s client-bar half: the phone-first `findByPhone` lookup, the collapse to
 * one line once a phone and a name are both present, and the pencil that reopens it. Mirrors
 * `CalculatorViewModelTest`'s shape (same `StandardTestDispatcher` set-up) and
 * `ClientsViewModelTest`'s debounce-timing style, kept in its own file per this task's brief.
 */
@ExperimentalCoroutinesApi
class ClientRowStateTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    private fun vm(clients: suspend (phone: String?) -> ClientsPageDto = { emptyPage() }) = CalculatorViewModel(
        session = ClientRowInertSessionPricing(),
        permissions = PermissionGate { true },
        clients = ClientsRepository(
            api = object : FakeEtalonApi() {
                override suspend fun clients(q: String?, phone: String?, page: Int, pageSize: Int, sortBy: String?, sortDir: String?) = clients(phone)
            },
            permissions = PermissionGate { true },
        ),
    )

    private fun emptyPage() = ClientsPageDto(rows = emptyList(), total = 0, page = 1, pageSize = 50, pageCount = 1)

    private fun hitPage(
        phone: String = "998901112233",
        name: String = "Навоий Build",
        address: String? = "Тошкент шаҳри, Юнусобод тумани, Юнусобод 12-7",
    ) = ClientsPageDto(rows = listOf(ClientRowDto(id = "c1", name = name, phone = phone, address = address)), total = 1, page = 1, pageSize = 50, pageCount = 1)

    // ── the ninth digit debounces before asking ──────────────────────────────────

    @Test fun `fewer than nine digits never asks the network`() = runTest {
        var asked = false
        val v = vm { asked = true; emptyPage() }
        v.setClientPhoneDigits("9011122")
        advanceUntilIdle()
        assertFalse(asked)
    }

    @Test fun `the ninth digit waits out the debounce before asking`() = runTest {
        var asked = false
        val v = vm { asked = true; hitPage() }
        v.setClientPhoneDigits("901112233")
        assertFalse(asked, "a request went out before the debounce settled")
        advanceTimeBy(CLIENT_PHONE_LOOKUP_DEBOUNCE_MS - 1)
        assertFalse(asked, "fired early")
        advanceTimeBy(2)
        advanceUntilIdle()
        assertTrue(asked)
    }

    @Test fun `typing does not fire one request per digit`() = runTest {
        var count = 0
        val v = vm { count++; emptyPage() }
        for (i in 1..9) v.setClientPhoneDigits("901112233".take(i))
        advanceUntilIdle()
        assertEquals(1, count, "only the settled nine-digit number should ever be asked about")
    }

    // ── a hit vs. a miss ──────────────────────────────────────────────────────────

    @Test fun `a hit fills the name and address and remembers the client id`() = runTest {
        val v = vm { hitPage() }
        v.setClientPhoneDigits("901112233")
        advanceUntilIdle()
        val s = v.state.value
        assertEquals("Навоий Build", s.clientName)
        assertEquals("Тошкент шаҳри", s.clientAddress.viloyat)
        assertEquals("Юнусобод тумани", s.clientAddress.tuman)
        assertEquals("Юнусобод 12-7", s.clientAddress.street)
        assertEquals("c1", s.matchedClientId)
    }

    @Test fun `a miss leaves the typed fields alone and is not an error — a new customer`() = runTest {
        val v = vm { emptyPage() }
        v.setClientName("Қурилиш ХК")
        v.setClientPhoneDigits("901112233")
        advanceUntilIdle()
        val s = v.state.value
        assertEquals("Қурилиш ХК", s.clientName, "what was typed must survive a miss")
        assertNull(s.matchedClientId)
        assertNull(s.clientLookupError, "a new customer is not an error")
    }

    @Test fun `editing the phone away from a match clears matchedClientId immediately`() = runTest {
        val v = vm { hitPage() }
        v.setClientPhoneDigits("901112233")
        advanceUntilIdle()
        assertEquals("c1", v.state.value.matchedClientId)
        v.setClientPhoneDigits("901112234")
        assertNull(v.state.value.matchedClientId, "no longer the same customer")
    }

    // ── a lookup failure ─────────────────────────────────────────────────────────

    @Test fun `a lookup failure sets an error and does not block further typing`() = runTest {
        val v = vm { throw IOException("no net") }
        v.setClientPhoneDigits("901112233")
        advanceUntilIdle()
        assertNotNull(v.state.value.clientLookupError)
        v.setClientPhoneDigits("901112234")
        assertEquals("901112234", v.state.value.clientPhoneDigits, "the field kept accepting input")
    }

    @Test fun `retry re-issues the lookup without waiting for the debounce`() = runTest {
        var fail = true
        val v = vm { if (fail) throw IOException("no net") else hitPage() }
        v.setClientPhoneDigits("901112233")
        advanceUntilIdle()
        assertNotNull(v.state.value.clientLookupError)

        fail = false
        v.retryClientLookup()
        advanceUntilIdle()
        assertNull(v.state.value.clientLookupError)
        assertEquals("c1", v.state.value.matchedClientId)
    }

    // ── the client form opening and closing: an edge, not a level ───────────────

    @Test fun `a blank quote opens on the form, and a complete client closes it`() = runTest {
        val v = vm { emptyPage() }
        assertTrue(v.state.value.clientFormOpen, "there is nothing to show on one line yet")

        v.setClientName("Навоий Build")
        v.setClientPhoneDigits("901112233")
        advanceUntilIdle()

        assertFalse(v.state.value.clientFormOpen, "a phone and a name fit on the one-line row")
    }

    /** The other half of the same rule: a quote whose phone or name has been emptied has nothing
     *  to show on one line, so the form comes back. */
    @Test fun `blanking the name reopens the form`() = runTest {
        val v = vm { hitPage() }
        v.setClientPhoneDigits("901112233")
        advanceUntilIdle()
        assertFalse(v.state.value.clientFormOpen)

        v.setClientName("")

        assertTrue(v.state.value.clientFormOpen)
    }

    @Test fun `the form closes once a phone and a name are both present — phone first`() = runTest {
        val v = vm { hitPage() }
        v.setClientPhoneDigits("901112233")
        advanceUntilIdle()
        // hitPage() supplies the name too, so both are present the moment the lookup lands.
        assertFalse(v.state.value.clientFormOpen)
    }

    @Test fun `the form closes once a phone and a name are both present — name first`() = runTest {
        val v = vm { emptyPage() }
        v.setClientName("Навоий Build")
        assertTrue(v.state.value.clientFormOpen, "no phone yet")
        v.setClientPhoneDigits("901112233")
        advanceUntilIdle()
        assertFalse(v.state.value.clientFormOpen, "a miss still leaves the typed name in place")
    }

    @Test fun `neither a phone alone nor a name alone closes the form`() = runTest {
        val phoneOnly = vm { emptyPage() }
        phoneOnly.setClientPhoneDigits("901112233")
        advanceUntilIdle()
        assertTrue(phoneOnly.state.value.clientFormOpen)

        val nameOnly = vm { emptyPage() }
        nameOnly.setClientName("Навоий Build")
        assertTrue(nameOnly.state.value.clientFormOpen)
    }

    @Test fun `the chevron reopens without clearing anything`() = runTest {
        val v = vm { hitPage() }
        v.setClientPhoneDigits("901112233")
        advanceUntilIdle()
        assertFalse(v.state.value.clientFormOpen)

        v.toggleClientForm()
        assertTrue(v.state.value.clientFormOpen)
        assertEquals("Навоий Build", v.state.value.clientName, "reopening must not blank the form")
        assertEquals("901112233", v.state.value.clientPhoneDigits)
        assertEquals("c1", v.state.value.matchedClientId)
    }

    /** The edge only re-fires on a fresh phone+name completion — editing a field while both stay
     *  present (the whole point of the pencil) must not snap the bar shut under the operator's
     *  fingers while they are still correcting it. */
    @Test fun `editing a field after reopening does not immediately re-close the form`() = runTest {
        val v = vm { hitPage() }
        v.setClientPhoneDigits("901112233")
        advanceUntilIdle()
        v.toggleClientForm()

        v.setClientStreet("Юнусобод 12-8")
        assertTrue(v.state.value.clientFormOpen)
        v.setClientName("Навоий Build MCHJ")
        assertTrue(v.state.value.clientFormOpen)
    }

    @Test fun `clearing the phone below nine digits and completing it again re-closes the form`() = runTest {
        val v = vm { hitPage() }
        v.setClientPhoneDigits("901112233")
        advanceUntilIdle()
        v.toggleClientForm()

        v.setClientPhoneDigits("90111223") // 8 digits — no longer ready
        assertTrue(v.state.value.clientFormOpen)
        v.setClientPhoneDigits("901112233") // ready again — a fresh edge
        advanceUntilIdle()
        assertFalse(v.state.value.clientFormOpen)
    }

    // ── The phone mask — §3.4's `+998 90 ___ __ __` ────────────────────────────────

    /** The nine stored digits as the field DRAWS them, behind its own fixed «+998 » prefix. The
     *  stored value never changes — `normalizePhone` and the lookup want bare digits. */
    @Test fun `the mask groups nine digits as 90 111 22 33`() {
        assertEquals("90 111 22 33", PhoneDigitsMask.filter(AnnotatedString("901112233")).text.text)
    }

    /** Half-typed numbers too: the mask is applied on every keystroke, not only to a full one. */
    @Test fun `the mask groups a partial number without trailing separators`() {
        listOf(
            "" to "",
            "9" to "9",
            "90" to "90",
            "901" to "90 1",
            "90111" to "90 111",
            "901112" to "90 111 2",
            "9011122" to "90 111 22",
            "90111223" to "90 111 22 3",
        ).forEach { (digits, drawn) ->
            assertEquals(drawn, PhoneDigitsMask.filter(AnnotatedString(digits)).text.text)
        }
    }

    /**
     * The offset mapping, both ways, across every group boundary of «90 111 22 33».
     *
     * This is the whole reason the mask is a `VisualTransformation` rather than a formatted value:
     * with the inserted spaces unmapped the caret and any selection drift by one character per
     * group, and backspace starts eating the wrong digit. Each original offset is checked against
     * the drawn one, and the round trip back.
     */
    @Test fun `the offset mapping survives every group boundary in both directions`() {
        val mapping = PhoneDigitsMask.filter(AnnotatedString("901112233")).offsetMapping
        // original 0..9 → transformed: +1 after «90», +1 more after «111», +1 more after «22».
        listOf(0 to 0, 1 to 1, 2 to 2, 3 to 4, 5 to 6, 6 to 8, 7 to 9, 8 to 11, 9 to 12)
            .forEach { (original, transformed) ->
                assertEquals(
                    transformed,
                    mapping.originalToTransformed(original),
                    "original $original draws at $transformed",
                )
                assertEquals(
                    original,
                    mapping.transformedToOriginal(transformed),
                    "and back again from $transformed",
                )
            }
    }

    /** A caret dropped ON one of the inserted spaces belongs to the digit before it — never past
     *  the end of the nine digits actually stored. */
    @Test fun `an offset inside an inserted space maps back to the digit before it`() {
        val mapping = PhoneDigitsMask.filter(AnnotatedString("901112233")).offsetMapping
        assertEquals(2, mapping.transformedToOriginal(3))  // the space after «90»
        assertEquals(5, mapping.transformedToOriginal(7))  // the space after «111»
        assertEquals(7, mapping.transformedToOriginal(10)) // the space after «22»
    }
}
