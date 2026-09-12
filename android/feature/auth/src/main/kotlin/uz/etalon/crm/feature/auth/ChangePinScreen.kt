package uz.etalon.crm.feature.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextOverflow
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonIconButton
import uz.etalon.crm.core.designsystem.components.EtalonTextField
import uz.etalon.crm.core.designsystem.components.FormCard
import uz.etalon.crm.core.designsystem.components.FormField
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.navPillPadding
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.R as DesignSystemR

/**
 * Changing the PIN.
 *
 * [forced] is the server having expired the operator's PIN: the screen is then a gate — the shell
 * draws no nav pill over it, there is no back arrow, and the hint says why they are here. Reached
 * voluntarily from the account sheet it is an ordinary screen with a back circle.
 *
 * [onBack] is only ever called from the voluntary screen's arrow.
 */
@Composable
fun ChangePinRoute(
    forced: Boolean,
    onDone: () -> Unit,
    onBack: () -> Unit,
    vm: HiltChangePinViewModel = hiltViewModel(),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(s.done) { if (s.done) onDone() }
    ChangePinScreen(
        state = s,
        forced = forced,
        onCurrent = vm::setCurrent,
        onNext = vm::setNext,
        onConfirm = vm::setConfirm,
        onSubmit = { vm.submit(forced) },
        onBack = onBack,
    )
}

/**
 * §5.2's row: one FormCard and a PrimaryButton on the page ground.
 *
 * All three fields are `NumberPassword` behind a `PasswordVisualTransformation` — the digits are
 * never drawn, and the ViewModel keeps each field to four of them. `imePadding` on the root is
 * R13: the number keyboard covers the bottom of a three-field form otherwise, and «Сақлаш» with
 * it.
 */
@Composable
fun ChangePinScreen(
    state: ChangePinUiState,
    forced: Boolean,
    onCurrent: (String) -> Unit,
    onNext: (String) -> Unit,
    onConfirm: (String) -> Unit,
    onSubmit: () -> Unit,
    onBack: () -> Unit,
) {
    Column(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding().imePadding()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.headerMargin, vertical = EtalonSpace.md),
            horizontalArrangement = Arrangement.spacedBy(EtalonSpace.md),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            // No way back off a forced change: the token is expired, and everything behind this
            // screen would 401.
            if (!forced) {
                EtalonIconButton(
                    icon = EtalonIcons.ArrowLeft,
                    contentDescription = stringResource(DesignSystemR.string.ds_cd_back),
                    onClick = onBack,
                    shape = EtalonShapes.md,
                )
            }
            Text(
                stringResource(R.string.change_pin_title),
                style = EtalonType.headline,
                color = EtalonColors.ink,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f),
            )
        }
        Column(
            Modifier.fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = EtalonSpace.cardMargin)
                .padding(top = EtalonSpace.sm, bottom = EtalonSpace.lg)
                .navPillPadding(),
            verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
        ) {
            if (forced) {
                Text(
                    stringResource(R.string.change_pin_forced_hint),
                    style = EtalonType.body,
                    color = EtalonColors.ink2,
                )
            }
            FormCard {
                // A forced change has no current PIN to give — the server takes the expired one
                // on trust — so the field is not shown rather than shown and refused.
                if (!forced) {
                    FormField(stringResource(R.string.change_pin_current)) {
                        PinField(state.current, onCurrent)
                    }
                }
                FormField(stringResource(R.string.change_pin_new)) {
                    PinField(state.next, onNext)
                }
                FormField(stringResource(R.string.change_pin_confirm), divider = false) {
                    PinField(state.confirm, onConfirm)
                }
            }
            state.error?.let { ErrorBanner(it) }
            // `loading` rather than `enabled = false`: the call is in flight, and painting the
            // disabled skin over a save that IS going through reads as a refusal.
            PrimaryButton(
                text = stringResource(R.string.auth_action_save),
                onClick = onSubmit,
                loading = state.isSubmitting,
            )
        }
    }
}

/** One of the three PIN fields: digits only, never drawn, on the number keyboard. */
@Composable
private fun PinField(value: String, onValueChange: (String) -> Unit) = EtalonTextField(
    value = value,
    onValueChange = onValueChange,
    modifier = Modifier.fillMaxWidth(),
    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword),
    visualTransformation = PasswordVisualTransformation(),
)
