package uz.etalon.crm.feature.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.BrandMark
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonTextField
import uz.etalon.crm.core.designsystem.components.FormCard
import uz.etalon.crm.core.designsystem.components.FormField
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Me

/** §3.7's PIN indicator: four 12 dp dots. Named because the dot is one drawn object, not spacing. */
private val PIN_DOT = 12.dp

/** The PIN this app signs in with is four digits — [LoginViewModel] submits on the fourth. */
private const val PIN_LENGTH = 4

/** A hairline of motion, not Material's 4 dp bar: the screen is already flat and white. */
private val PROGRESS_HEIGHT = 2.dp

/** How much of the free height sits above «Кириш» — the mark stays near the top, the title sits
 *  a little above centre, and the pad keeps the rest. */
private const val TOP_WEIGHT = 0.4f

/** [hint] is an already-resolved info line (e.g. "sign in with your new PIN" after a PIN change). */
@Composable
fun LoginRoute(onLoggedIn: (Me) -> Unit, hint: String? = null, vm: HiltLoginViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(state.done) { state.done?.let(onLoggedIn) }
    LoginScreen(state, vm::setLoginName, vm::pressDigit, vm::backspace, hint)
}

/**
 * Signing in: the brand page (§5.2's "page bg, logo block, FormCard"), the login name in a form
 * card, and the PIN entered on the pad below it.
 *
 * The pad stays (ruling R6). §5.2's row names a PIN *field*, but this app has never had one: the
 * PIN is four digits with auto-submit on the fourth, and a system keyboard here would cover the
 * dots it is filling and put the digits on a 6 mm target. What changed is the pad's skin — it is
 * now §2's key, the same one the numeric keypad draws — not the way the screen is used.
 *
 * The screen is outside the signed-in shell, so there is no nav pill to clear; the pad keeps the
 * gesture bar's inset instead. `imePadding` is the login-name field's (R13): with the keyboard up
 * the column shortens and the two weighted spacers give their room back, which is what keeps the
 * pad on screen rather than under the keyboard.
 */
@Composable
fun LoginScreen(state: LoginUiState, onLoginName: (String) -> Unit, onDigit: (Char) -> Unit, onBackspace: () -> Unit, hint: String? = null) {
    Column(
        Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding().imePadding()
            .padding(horizontal = EtalonSpace.headerMargin, vertical = EtalonSpace.lg),
        verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
    ) {
        BrandMark()
        Spacer(Modifier.weight(TOP_WEIGHT))
        Text(stringResource(R.string.login_title), style = EtalonType.displayTitle, color = EtalonColors.ink)
        Text(stringResource(R.string.login_subtitle), style = EtalonType.body, color = EtalonColors.ink2)
        // Why they are back here — after a PIN change the token is already dead, so this line is
        // the only thing that distinguishes "signed out" from "something broke".
        if (hint != null) Text(hint, style = EtalonType.label, color = EtalonColors.indigo)
        FormCard {
            FormField(stringResource(R.string.login_name), divider = false) {
                EtalonTextField(value = state.loginName, onValueChange = onLoginName, modifier = Modifier.fillMaxWidth())
            }
        }
        PinDots(state.pin.length)
        if (state.error != null) ErrorBanner(state.error)
        // Held open by a Spacer whether or not it is submitting: the dots and the pad must not
        // jump two dp up the screen the moment the fourth digit lands.
        if (state.isSubmitting) {
            LinearProgressIndicator(
                modifier = Modifier.fillMaxWidth().height(PROGRESS_HEIGHT),
                color = EtalonColors.indigo,
                trackColor = EtalonColors.lavenderBg,
            )
        } else {
            Spacer(Modifier.height(PROGRESS_HEIGHT))
        }
        Spacer(Modifier.weight(1f))
        PinPad(onDigit, onBackspace, enabled = !state.isSubmitting, modifier = Modifier.navigationBarsPadding())
    }
}

/**
 * How many digits are in, without showing them. Filled dots are indigo, the rest are the hairline
 * ring §2 draws around everything empty.
 *
 * TalkBack is told this row is the PIN — the dots themselves are unlabelled boxes, and the visible
 * «PIN» caption the old screen carried is gone with the Material form.
 */
@Composable
private fun PinDots(filled: Int) {
    val label = stringResource(R.string.login_pin)
    Row(
        Modifier.fillMaxWidth().semantics { contentDescription = label },
        horizontalArrangement = Arrangement.spacedBy(EtalonSpace.md, Alignment.CenterHorizontally),
    ) {
        repeat(PIN_LENGTH) { i ->
            Box(
                Modifier.size(PIN_DOT).clip(EtalonShapes.pill).then(
                    if (i < filled) {
                        Modifier.background(EtalonColors.indigo)
                    } else {
                        Modifier.border(EtalonSpace.hairline, EtalonColors.ink3, EtalonShapes.pill)
                    },
                ),
            )
        }
    }
}
