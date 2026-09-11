package uz.etalon.crm.shell

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import uz.etalon.crm.R
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.theme.EtalonColors

/** Shown for a back-stack key this user's permissions no longer register an entry for. It kept
 *  `MoreScreen.kt` company until the account sheet replaced that file; it is the only screen the
 *  shell itself draws. */
@Composable
fun NoAccessScreen() {
    Column(Modifier.fillMaxSize().background(EtalonColors.page)) { EmptyState(stringResource(R.string.no_access)) }
}
