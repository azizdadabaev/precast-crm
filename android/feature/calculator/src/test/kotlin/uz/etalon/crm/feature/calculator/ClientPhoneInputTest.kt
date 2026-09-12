package uz.etalon.crm.feature.calculator

import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.test.SemanticsNodeInteraction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.performTextInput
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uz.etalon.crm.core.data.ClientsRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.SessionPricing
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.Pricing
import uz.etalon.crm.core.network.dto.ClientsPageDto
import uz.etalon.crm.core.testing.FakeEtalonApi

/** Nine Arabic-Indic digits (U+0660…U+0669) — what a paste from an Arabic keyboard or a copied
 *  web page can carry. They read as «٩٠١١١٢٢٣٣» and are digits to `Char.isDigit()`. */
private const val ARABIC_INDIC = "٩٠١١١٢٢٣٣"

/** The same number in ASCII, so the test can prove the field accepts a phone at all. */
private const val ASCII = "901112233"

private class PhoneInertSessionPricing : SessionPricing {
    override val pricing: StateFlow<Pricing?> = MutableStateFlow(null)
}

/**
 * The client form's phone field, filtered with ASCII `'0'..'9'` rather than `Char.isDigit()`.
 *
 * Kotlin's `isDigit()` is Unicode-aware, so a pasted Arabic-Indic number used to fill the field
 * with nine "digits" — enough for `canPlaceClient` to call the client complete — that
 * `normalizePhone` then stripped to the empty string. The order went out under no phone at all,
 * and phone is this product's unique customer identity: nobody could look that customer up again.
 *
 * Driven through the real [CalculatorViewModel] and the real field, because the filter lives on
 * the field's `onValueChange` — a test of the ViewModel alone would not touch it.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class ClientPhoneInputTest {
    @get:Rule val rule = createComposeRule()

    @Test fun `a pasted non-ASCII number never reaches the phone, and never completes the client`() {
        val vm = vm()
        // Everything else `canPlaceClient` asks for, so the phone is the only thing left deciding.
        vm.setClientName("Тошматов Илҳом")
        vm.setClientViloyat("Тошкент вилояти")
        vm.setClientTuman("Зангиота")
        vm.setClientStreet("Чинор кўчаси 12")
        showForm(vm)

        phoneField().performTextInput(ARABIC_INDIC)
        rule.waitForIdle()

        assertEquals("", vm.state.value.clientPhoneDigits)
        assertFalse("nine Unicode digits must not complete the client", canPlaceClient(vm.state.value))

        // …and the same nine digits in ASCII do land, so the assertion above is about the alphabet
        // and not about the field being inert.
        phoneField().performTextInput(ASCII)
        rule.waitForIdle()

        assertEquals(ASCII, vm.state.value.clientPhoneDigits)
        assertTrue(canPlaceClient(vm.state.value))
    }

    /** The form's text fields in composition order — name, phone, street. The count is asserted so
     *  that a field added to the form breaks this test loudly instead of moving the index. */
    private fun phoneField(): SemanticsNodeInteraction {
        val fields = rule.onAllNodes(hasSetTextAction())
        assertEquals("the client form's text fields", 3, fields.fetchSemanticsNodes().size)
        return fields[1]
    }

    private fun showForm(vm: CalculatorViewModel) {
        rule.setContent {
            EtalonTheme {
                val s by vm.state.collectAsState()
                ClientForm(s, vm)
            }
        }
    }

    private fun vm() = CalculatorViewModel(
        session = PhoneInertSessionPricing(),
        permissions = PermissionGate { true },
        clients = ClientsRepository(
            api = object : FakeEtalonApi() {
                override suspend fun clients(
                    q: String?,
                    phone: String?,
                    page: Int,
                    pageSize: Int,
                    sortBy: String?,
                    sortDir: String?,
                ) = ClientsPageDto(rows = emptyList(), total = 0, page = 1, pageSize = 50, pageCount = 1)
            },
            permissions = PermissionGate { true },
        ),
    )
}
