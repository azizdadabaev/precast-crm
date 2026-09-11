package uz.etalon.crm.feature.home

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.R as DesignSystemR

/**
 * What the app bar's bell opens (ruling R3): how much of this operator's own work is still
 * unsent. It states the count and nothing else — the outbox sends itself, and a "retry now"
 * button here would only duplicate what the sync worker already does on its own schedule.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OutboxSheet(pending: Int, onDismiss: () -> Unit) = ModalBottomSheet(
    onDismissRequest = onDismiss,
    containerColor = EtalonColors.surface,
    shape = EtalonShapes.sheetTop,
    dragHandle = null,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.xl, vertical = EtalonSpace.lg)) {
        Text(stringResource(R.string.home_bell), style = EtalonType.sectionTitle, color = EtalonColors.ink)
        Spacer(Modifier.height(EtalonSpace.sm))
        Text(
            if (pending > 0) {
                pluralStringResource(DesignSystemR.plurals.outbox_pending, pending, pending)
            } else {
                stringResource(R.string.home_outbox_clear_data)
            },
            style = EtalonType.body,
            color = EtalonColors.ink2,
        )
        Spacer(Modifier.height(EtalonSpace.lg))
        SecondaryButton(stringResource(R.string.home_close), onDismiss)
        Spacer(Modifier.navigationBarsPadding().height(EtalonSpace.sm))
    }
}
