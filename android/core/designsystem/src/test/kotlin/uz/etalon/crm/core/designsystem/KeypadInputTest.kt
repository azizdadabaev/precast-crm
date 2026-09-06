package uz.etalon.crm.core.designsystem

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.designsystem.components.applyBackspace
import uz.etalon.crm.core.designsystem.components.applyDigit

class KeypadInputTest {
    @Test fun `digits append`() {
        assertEquals("1", applyDigit("", '1', false))
        assertEquals("150", applyDigit("15", '0', false))
    }
    @Test fun `a leading zero is replaced, not stacked`() {
        assertEquals("5", applyDigit("0", '5', false))
        assertEquals("0", applyDigit("0", '0', false))
    }
    @Test fun `a decimal separator is accepted once, and only when allowed`() {
        assertEquals("1,", applyDigit("1", ',', true))
        assertEquals("1,", applyDigit("1,", ',', true))
        assertEquals("1", applyDigit("1", ',', false))
    }
    @Test fun `backspace removes one character and bottoms out at empty`() {
        assertEquals("15", applyBackspace("150"))
        assertEquals("", applyBackspace("1"))
        assertEquals("", applyBackspace(""))
    }
    @Test fun `entry is capped so a slipped finger cannot enter a nonsense amount`() {
        val long = "1".repeat(12)
        assertEquals(long, applyDigit(long, '9', false))
    }
}
