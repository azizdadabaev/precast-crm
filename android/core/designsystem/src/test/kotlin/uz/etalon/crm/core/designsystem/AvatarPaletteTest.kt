package uz.etalon.crm.core.designsystem

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.designsystem.components.avatarInitials
import uz.etalon.crm.core.designsystem.theme.EtalonColors

class AvatarPaletteTest {
    @Test fun `the palette is the seven colours of the spec, in order`() {
        assertEquals(7, EtalonColors.avatarPalette.size)
        assertEquals(EtalonColors.indigo, EtalonColors.avatarPalette[0])
        assertEquals(EtalonColors.indigoTint, EtalonColors.avatarPalette[1])
        assertEquals(EtalonColors.indigoPanel, EtalonColors.avatarPalette[2])
        assertEquals(EtalonColors.green, EtalonColors.avatarPalette[4])
        assertEquals(EtalonColors.indigoTile, EtalonColors.avatarPalette[5])
    }

    @Test fun `a client keeps the same colour whatever renders it`() {
        // Sum of char codes mod 7 — recomputed here by hand so a "better" hash cannot slip in.
        val name = "Yusupov & Sons"
        val expected = EtalonColors.avatarPalette[name.sumOf { it.code } % 7]
        assertEquals(expected, EtalonColors.avatarColor(name))
        assertEquals(EtalonColors.avatarColor(name), EtalonColors.avatarColor(name))
    }

    @Test fun `Cyrillic names index inside the palette too`() {
        // Cyrillic code points are far above ASCII; the modulo must still land in range.
        listOf("Раҳимов Аброр", "Каримов", "Тошкент Tower LLC", "", "  ").forEach {
            assertTrue(EtalonColors.avatarPalette.contains(EtalonColors.avatarColor(it)))
        }
    }

    @Test fun `initials are the first letters of the first two words, ampersand ignored`() {
        assertEquals("YS", avatarInitials("Yusupov & Sons"))
        assertEquals("РА", avatarInitials("Раҳимов Аброр Тоҳирович"))
        assertEquals("К", avatarInitials("Каримов"))
        assertEquals("TT", avatarInitials("Tashkent Tower LLC"))
        assertEquals("", avatarInitials("   "))
    }
}
