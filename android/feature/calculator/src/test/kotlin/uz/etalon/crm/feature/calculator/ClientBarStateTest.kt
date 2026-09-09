package uz.etalon.crm.feature.calculator

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
private class ClientBarInertSessionPricing : SessionPricing {
    override val pricing: StateFlow<Pricing?> = MutableStateFlow(null)
}

/**
 * [CalculatorViewModel]'s client-bar half: the phone-first `findByPhone` lookup, the collapse to
 * one line once a phone and a name are both present, and the pencil that reopens it. Mirrors
 * `CalculatorViewModelTest`'s shape (same `StandardTestDispatcher` set-up) and
 * `ClientsViewModelTest`'s debounce-timing style, kept in its own file per this task's brief.
 */
@ExperimentalCoroutinesApi
class ClientBarStateTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    private fun vm(clients: suspend (phone: String?) -> ClientsPageDto = { emptyPage() }) = CalculatorViewModel(
        session = ClientBarInertSessionPricing(),
        permissions = PermissionGate { true },
        clients = ClientsRepository(
            api = object : FakeEtalonApi() {
                override suspend fun clients(q: String?, phone: String?, page: Int, pageSize: Int) = clients(phone)
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

    // ── collapse: an edge, not a level ───────────────────────────────────────────

    @Test fun `the bar collapses once a phone and a name are both present — phone first`() = runTest {
        val v = vm { hitPage() }
        v.setClientPhoneDigits("901112233")
        advanceUntilIdle()
        // hitPage() supplies the name too, so both are present the moment the lookup lands.
        assertTrue(v.state.value.clientBarCollapsed)
    }

    @Test fun `the bar collapses once a phone and a name are both present — name first`() = runTest {
        val v = vm { emptyPage() }
        v.setClientName("Навоий Build")
        assertFalse(v.state.value.clientBarCollapsed, "no phone yet")
        v.setClientPhoneDigits("901112233")
        advanceUntilIdle()
        assertTrue(v.state.value.clientBarCollapsed, "a miss still leaves the typed name in place")
    }

    @Test fun `neither a phone alone nor a name alone collapses the bar`() = runTest {
        val phoneOnly = vm { emptyPage() }
        phoneOnly.setClientPhoneDigits("901112233")
        advanceUntilIdle()
        assertFalse(phoneOnly.state.value.clientBarCollapsed)

        val nameOnly = vm { emptyPage() }
        nameOnly.setClientName("Навоий Build")
        assertFalse(nameOnly.state.value.clientBarCollapsed)
    }

    @Test fun `the pencil reopens without clearing anything`() = runTest {
        val v = vm { hitPage() }
        v.setClientPhoneDigits("901112233")
        advanceUntilIdle()
        assertTrue(v.state.value.clientBarCollapsed)

        v.reopenClientBar()
        assertFalse(v.state.value.clientBarCollapsed)
        assertEquals("Навоий Build", v.state.value.clientName, "reopening must not blank the form")
        assertEquals("901112233", v.state.value.clientPhoneDigits)
        assertEquals("c1", v.state.value.matchedClientId)
    }

    /** The edge only re-fires on a fresh phone+name completion — editing a field while both stay
     *  present (the whole point of the pencil) must not snap the bar shut under the operator's
     *  fingers while they are still correcting it. */
    @Test fun `editing a field after reopening does not immediately re-collapse the bar`() = runTest {
        val v = vm { hitPage() }
        v.setClientPhoneDigits("901112233")
        advanceUntilIdle()
        v.reopenClientBar()

        v.setClientStreet("Юнусобод 12-8")
        assertFalse(v.state.value.clientBarCollapsed)
        v.setClientName("Навоий Build MCHJ")
        assertFalse(v.state.value.clientBarCollapsed)
    }

    @Test fun `clearing the phone below nine digits and completing it again re-collapses`() = runTest {
        val v = vm { hitPage() }
        v.setClientPhoneDigits("901112233")
        advanceUntilIdle()
        v.reopenClientBar()

        v.setClientPhoneDigits("90111223") // 8 digits — no longer ready
        assertFalse(v.state.value.clientBarCollapsed)
        v.setClientPhoneDigits("901112233") // ready again — a fresh edge
        advanceUntilIdle()
        assertTrue(v.state.value.clientBarCollapsed)
    }
}
