package uz.etalon.crm.core.network

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class MediaUrlTest {
    @Test fun `prefixes relative uploads paths with the origin`() {
        assertEquals("https://etalontbm.uz/uploads/orders/o1/loaded-1.jpg", MediaUrl.absolute("https://etalontbm.uz", "/uploads/orders/o1/loaded-1.jpg"))
    }
    @Test fun `leaves absolute urls alone and passes null through`() {
        assertEquals("https://x/y.jpg", MediaUrl.absolute("https://etalontbm.uz", "https://x/y.jpg"))
        assertNull(MediaUrl.absolute("https://etalontbm.uz", null))
    }
    @Test fun `tolerates a trailing slash on the base`() {
        assertEquals("https://etalontbm.uz/uploads/a.jpg", MediaUrl.absolute("https://etalontbm.uz/", "/uploads/a.jpg"))
    }
}
