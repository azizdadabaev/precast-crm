package uz.etalon.crm.core.datastore

import app.cash.turbine.test
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class TokenStoreTest {
    @Test fun `in-memory store round-trips and reports login state`() = runTest {
        val s = InMemoryTokenStore()
        s.isLoggedIn.test {
            assertFalse(awaitItem())
            s.set("jwt"); assertTrue(awaitItem())
            assertEquals("jwt", s.get())
            s.clear(); assertFalse(awaitItem())
            assertNull(s.get())
        }
    }
    @Test fun `TokenProvider clears on unauthorized`() = runTest {
        val s = InMemoryTokenStore().apply { set("jwt") }
        val p = StoreTokenProvider(s)
        assertEquals("jwt", p.token())
        p.onUnauthorized()
        assertNull(p.token())
    }
}
