package uz.etalon.crm.shell

import androidx.annotation.DrawableRes
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import uz.etalon.crm.R
import uz.etalon.crm.core.data.OutboxRepository
import uz.etalon.crm.core.designsystem.components.Avatar
import uz.etalon.crm.core.designsystem.components.DangerButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Role as UserRole
import uz.etalon.crm.nav.PERM_DISCREPANCY_VIEW
import uz.etalon.crm.nav.PERM_DRIVER_VIEW
import javax.inject.Inject

/** Uzbek label for a role; the enum constant itself is an English identifier and must not reach the UI. */
fun roleLabel(role: UserRole): Int = when (role) {
    UserRole.OWNER -> R.string.role_owner
    UserRole.ADMIN -> R.string.role_admin
    UserRole.SALES -> R.string.role_sales
    UserRole.INVENTORY -> R.string.role_inventory
    UserRole.DRIVER -> R.string.role_driver
    UserRole.ACCOUNTANT -> R.string.role_accountant
    UserRole.CUSTOM -> R.string.role_custom
    UserRole.UNKNOWN -> R.string.role_unknown
}

/**
 * Only the pending count is needed here. Signing out does NOT wipe the outbox — a queued upload
 * belongs to the operator who made it and waits for them to come back (`SessionRepository.signOut`)
 * — but they still need to know work is unsent before they hand the phone over, because a
 * *different* operator signing in on it is what destroys it (`login`'s ownership purge).
 *
 * The count excludes rows the server already rejected: those are not on their way anywhere, and
 * counting them would put this dialog in front of the operator on every sign-out from then on.
 */
@HiltViewModel
class AccountViewModel @Inject constructor(outbox: OutboxRepository) : ViewModel() {
    val pendingUploads: StateFlow<Int> = outbox.observePendingCount()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)
}

/**
 * Ruling R3: with no «Яна» cell, the owner tools live behind the Home app bar's avatar — the
 * signed-in name and role, «Ҳайдовчилар» (`driver.view`), «Нақд пул тафовутлари»
 * (`discrepancy.view`, its only door until phase 3 links it from Payments), «PIN ни ўзгартириш»
 * and «Чиқиш». Nothing else lives here.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AccountSheet(
    me: Me,
    pendingUploads: Int,
    onDrivers: () -> Unit,
    onDiscrepancies: () -> Unit,
    onChangePin: () -> Unit,
    onSignOut: () -> Unit,
    onDismiss: () -> Unit,
) {
    var confirmSignOut by remember { mutableStateOf(false) }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = EtalonColors.surface,
        shape = EtalonShapes.sheetTop,
        dragHandle = null,
    ) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.xl, vertical = EtalonSpace.lg),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(EtalonSpace.md),
            ) {
                Avatar(me.name, size = 40.dp)
                Column {
                    Text(
                        me.name,
                        style = EtalonType.rowTitle,
                        color = EtalonColors.ink,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(stringResource(roleLabel(me.role)), style = EtalonType.meta, color = EtalonColors.ink2)
                }
            }
            Spacer(Modifier.height(EtalonSpace.md))
            HorizontalDivider(color = EtalonColors.surfaceBorder, thickness = EtalonSpace.hairline)
            if (me.can(PERM_DRIVER_VIEW)) {
                AccountRow(EtalonIcons.Users, stringResource(R.string.account_drivers), onDrivers)
            }
            if (me.can(PERM_DISCREPANCY_VIEW)) {
                AccountRow(EtalonIcons.CircleAlert, stringResource(R.string.account_discrepancies), onDiscrepancies)
            }
            AccountRow(EtalonIcons.Pencil, stringResource(R.string.account_change_pin), onChangePin)
            AccountRow(
                EtalonIcons.X,
                stringResource(R.string.account_sign_out),
                onClick = { if (pendingUploads > 0) confirmSignOut = true else onSignOut() },
                tint = EtalonColors.red,
            )
            Spacer(Modifier.navigationBarsPadding().height(EtalonSpace.sm))
        }
    }
    if (confirmSignOut) {
        SignOutConfirm(
            pendingUploads = pendingUploads,
            onConfirm = { confirmSignOut = false; onSignOut() },
            onDismiss = { confirmSignOut = false },
        )
    }
}

/**
 * The unsent-work warning kept from «Яна». It is an [AlertDialog] rather than the design system's
 * [uz.etalon.crm.core.designsystem.components.ConfirmSheet]: that component is the payments
 * confirm modal — a money hero plus two figure tiles — and has no shape for a plain question with
 * no amount in it. The dialog is dressed in the same tokens so it does not read as a stock one.
 */
@Composable
private fun SignOutConfirm(pendingUploads: Int, onConfirm: () -> Unit, onDismiss: () -> Unit) = AlertDialog(
    onDismissRequest = onDismiss,
    containerColor = EtalonColors.surface,
    shape = EtalonShapes.xl,
    title = {
        Text(stringResource(R.string.sign_out_pending_title), style = EtalonType.titleSm, color = EtalonColors.ink)
    },
    text = {
        Text(
            stringResource(R.string.sign_out_pending_message, pendingUploads),
            style = EtalonType.body,
            color = EtalonColors.ink2,
        )
    },
    confirmButton = { DangerButton(stringResource(R.string.account_sign_out), onConfirm, compact = true) },
    dismissButton = { SecondaryButton(stringResource(R.string.app_action_cancel), onDismiss, compact = true) },
)

@Composable
private fun AccountRow(
    @DrawableRes icon: Int,
    label: String,
    onClick: () -> Unit,
    tint: Color = EtalonColors.ink,
) = Row(
    Modifier.fillMaxWidth().minimumInteractiveComponentSize()
        .clickable(onClick = onClick, role = Role.Button)
        .padding(vertical = EtalonSpace.md),
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(EtalonSpace.md),
) {
    EtalonIcon(icon, null, size = 20.dp, tint = tint)
    Text(label, style = EtalonType.body, color = tint)
}
