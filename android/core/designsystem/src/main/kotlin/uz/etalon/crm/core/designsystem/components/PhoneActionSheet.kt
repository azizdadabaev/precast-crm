package uz.etalon.crm.core.designsystem.components

import android.content.Intent
import android.net.Uri
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
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.ClipboardManager
import androidx.compose.ui.platform.LocalClipboardManager
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType

/**
 * What to do with a phone number, asked instead of assumed.
 *
 * Tapping a number used to dial it immediately. That is the wrong default on a screen an operator
 * scrolls with their thumb: the number is also the thing you read out, paste into a message, or
 * check against a receipt, and a mis-tap that opens the dialer costs more than one that opens a
 * two-line sheet. So the number is drawn as text — the web has always shown it, only the phone hid
 * it behind an icon — and the tap asks.
 *
 * Copy lands the number in the digits-only form the CRM stores rather than the spaced form on
 * screen, because what it is usually pasted into is a search box or another system's field.
 *
 * The dialer is `ACTION_DIAL`, never `ACTION_CALL`: the latter needs CALL_PHONE and would place a
 * real call straight from a mis-tap.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PhoneActionSheet(phone: String, formatted: String, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val clipboard: ClipboardManager = LocalClipboardManager.current
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = EtalonColors.surface,
        shape = EtalonShapes.sheetTop,
        dragHandle = null,
    ) {
        Column(Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.lg)) {
            Spacer(Modifier.height(EtalonSpace.lg))
            Text(formatted, style = EtalonType.titleSm, color = EtalonColors.ink, maxLines = 1)
            Spacer(Modifier.height(EtalonSpace.sm))
            PhoneActionRow(EtalonIcons.Copy, stringResource(R.string.ds_phone_copy)) {
                clipboard.setText(AnnotatedString(phone.filter { it.isDigit() }))
                // No toast of our own: minSdk is 36 and the system shows its own clipboard
                // confirmation on every one of those, so a second one would stack on top of it.
                onDismiss()
            }
            PhoneActionRow(EtalonIcons.Phone, stringResource(R.string.ds_phone_call)) {
                // runCatching: a tablet or a work profile can have no dialer at all, and an
                // ActivityNotFoundException here would take the screen down with it.
                runCatching {
                    context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:+${phone.filter { it.isDigit() }}")))
                }
                onDismiss()
            }
            Spacer(Modifier.navigationBarsPadding().height(EtalonSpace.md))
        }
    }
}

@Composable
private fun PhoneActionRow(@DrawableRes icon: Int, label: String, onClick: () -> Unit) = Row(
    Modifier.fillMaxWidth().minimumInteractiveComponentSize()
        .clickable(role = Role.Button, onClick = onClick)
        .padding(vertical = EtalonSpace.md),
    horizontalArrangement = Arrangement.spacedBy(EtalonSpace.md),
    verticalAlignment = Alignment.CenterVertically,
) {
    EtalonIcon(icon, null, size = 20.dp, tint = EtalonColors.ink2)
    Text(label, style = EtalonType.body, color = EtalonColors.ink)
}
