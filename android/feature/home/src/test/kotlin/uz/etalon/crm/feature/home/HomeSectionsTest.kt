package uz.etalon.crm.feature.home

import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.TimeZone

/**
 * §2.4's «Юкланган ҳажм · {ой}» label.
 *
 * The device's own clock zone is set to New York for every case here — not as decoration: the
 * month this card names is the factory's month, and the one line that could have read the phone's
 * zone instead of Tashkent's is exactly what these cases pin.
 */
class HomeSectionsTest {
    private val deviceZone: TimeZone = TimeZone.getDefault()

    @BeforeEach fun up() = TimeZone.setDefault(TimeZone.getTimeZone("America/New_York"))
    @AfterEach fun down() = TimeZone.setDefault(deviceZone)

    /** The ordinary case: the server says which month the payload is about, and nothing else is
     *  consulted — not even the clock. */
    @Test fun `the server's month key names its own month`() {
        assertEquals("сен", shortMonth("2026-09", Instant.parse("2026-01-15T09:00:00Z")))
        assertEquals("янв", shortMonth("2026-01", Instant.parse("2026-09-15T09:00:00Z")))
    }

    /**
     * Half past midnight on 1 October in Tashkent — still 30 September in New York, and still
     * 30 September in UTC. A fallback reading the device's zone (or the JVM's default) names
     * «сен»; the factory's month is «окт».
     */
    @Test fun `a missing month key falls back to Tashkent's month, not the device's`() {
        assertEquals("окт", shortMonth("", Instant.parse("2026-09-30T19:30:00Z")))
    }

    /** A key this client cannot read is no better than no key at all — same fallback, never an
     *  index off the end of the month table. */
    @Test fun `an unreadable month key falls back the same way`() {
        val justAfterMidnightInTashkent = Instant.parse("2026-09-30T19:30:00Z")
        assertEquals("окт", shortMonth("2026-13", justAfterMidnightInTashkent))
        assertEquals("окт", shortMonth("2026-00", justAfterMidnightInTashkent))
        assertEquals("окт", shortMonth("рақам эмас", justAfterMidnightInTashkent))
    }
}
