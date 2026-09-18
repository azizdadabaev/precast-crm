package uz.etalon.crm.feature.orders.detail

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import uz.etalon.crm.core.designsystem.components.DangerButton
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonTextField
import uz.etalon.crm.core.designsystem.components.FormCard
import uz.etalon.crm.core.designsystem.components.FormField
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.feature.orders.R

/**
 * «Буюртмани бекор қилиш».
 *
 * White sheet rather than the navy [uz.etalon.crm.core.designsystem.components.ConfirmSheet]: that
 * one is for a confirmation with nothing to type, and this one must carry a password and a reason.
 * The same rule the payments queue's reject sheet follows.
 *
 * Cancelling is not only a status change — the server sends the project back to DRAFT so it can be
 * re-quoted, marks any deal lost, and restocks a delivered order. The body says so, in the web's
 * own words, because an operator who thinks this merely hides a row will use it far too readily.
 *
 * @param needsPassword false for an OWNER or ADMIN, whose role is the authorisation. The server
 *   accepts either, so showing them a field they must leave empty is a question with one wrong
 *   answer.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CancelOrderSheet(
    orderNumber: String,
    needsPassword: Boolean,
    password: String,
    reason: String,
    submitting: Boolean,
    error: String?,
    onPasswordChange: (String) -> Unit,
    onReasonChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(
        skipPartiallyExpanded = true,
        // A cancel in flight must not be dismissed out from under itself: the request is already
        // with the server and the screen would stop listening for its answer.
        confirmValueChange = { target -> target != SheetValue.Hidden || !submitting },
    )
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = EtalonColors.surface,
        shape = EtalonShapes.sheetTop,
        dragHandle = null,
    ) {
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState())
                .padding(horizontal = EtalonSpace.lg),
        ) {
            Spacer(Modifier.height(EtalonSpace.lg))
            Text(
                stringResource(R.string.detail_cancel_title, orderNumber),
                style = EtalonType.sectionTitle,
                color = EtalonColors.ink,
            )
            Spacer(Modifier.height(EtalonSpace.xs))
            Text(
                stringResource(R.string.detail_cancel_body),
                style = EtalonType.meta,
                color = EtalonColors.ink2,
            )
            Spacer(Modifier.height(EtalonSpace.md))
            FormCard {
                if (needsPassword) {
                    FormField(stringResource(R.string.detail_cancel_password_label)) {
                        EtalonTextField(
                            value = password,
                            onValueChange = onPasswordChange,
                            placeholder = stringResource(R.string.detail_cancel_password_hint),
                            // Password, not NumberPassword: the company cancel password is
                            // alphanumeric, and a numeric keypad could not type it.
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                            visualTransformation = PasswordVisualTransformation(),
                        )
                    }
                }
                FormField(stringResource(R.string.detail_cancel_reason_label), divider = false) {
                    EtalonTextField(
                        value = reason,
                        onValueChange = onReasonChange,
                        placeholder = stringResource(R.string.detail_cancel_reason_hint),
                    )
                }
            }
            error?.let {
                Spacer(Modifier.height(EtalonSpace.sm))
                ErrorBanner(it)
            }
            Spacer(Modifier.height(EtalonSpace.md))
            Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(EtalonSpace.sm)) {
                SecondaryButton(
                    text = stringResource(R.string.detail_cancel_keep),
                    onClick = onDismiss,
                    enabled = !submitting,
                    modifier = Modifier.weight(1f),
                )
                DangerButton(
                    text = stringResource(R.string.detail_cancel_confirm),
                    onClick = onConfirm,
                    loading = submitting,
                    modifier = Modifier.weight(1f),
                )
            }
            Spacer(Modifier.navigationBarsPadding().height(EtalonSpace.md))
        }
    }
}
