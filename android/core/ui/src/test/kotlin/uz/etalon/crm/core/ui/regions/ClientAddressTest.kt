package uz.etalon.crm.core.ui.regions

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * Coverage for the address convention that moved here from `:feature:clients` in Task 7 (the
 * calculator's client bar needs the same `composeAddress`/`parseAddress`, so the logic itself —
 * not just the region table — is now canonical in `:core:ui`).
 *
 * These are the same cases `:feature:clients`' own `ClientEditViewModelTest` already pins against
 * its re-export shim (`feature/clients/.../edit/Regions.kt`) — that file is left untouched per
 * this task's own rule ("`:feature:clients`' tests must pass completely unedited"), so this suite
 * is net-new coverage of the code at its new home rather than a relocation of the old file.
 */
class ClientAddressTest {

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

    @Test fun `a null or blank address parses to three empty parts`() {
        assertEquals(ParsedAddress("", "", ""), parseAddress(null))
        assertEquals(ParsedAddress("", "", ""), parseAddress("   "))
    }
}
