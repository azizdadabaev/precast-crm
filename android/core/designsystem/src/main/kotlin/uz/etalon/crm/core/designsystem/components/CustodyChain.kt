package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.layout.Row
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.model.CustodyChain

/** One stage of a payment's custody: who touched the money, no timestamp — that is deliberate
 *  in [uz.etalon.crm.core.model.CustodyChain] itself (see its KDoc). */
private data class Stage(val roleLabelRes: Int, val name: String)

/**
 * A single row of small labelled avatars — collected → recorded → handed over → confirmed —
 * skipping the stages [chain] leaves null. Each avatar shows initials only; the full name and
 * its role reach a screen reader through [Modifier.clearAndSetSemantics], so TalkBack announces
 * e.g. "Йиққан: Aziz Aliyev" once instead of the initials and the description both.
 *
 * The stages are [Avatar]s now, so the initials come from `avatarInitials` and the fill from the
 * client palette: the same person is the same colour here as in a row or a detail panel. The
 * chain's own `initialsOf` is retired with it.
 */
@Composable
fun CustodyChain(chain: CustodyChain, modifier: Modifier = Modifier) {
    val stages = buildList {
        chain.collectedBy?.let { add(Stage(R.string.custody_collected, it)) }
        chain.recordedBy?.let { add(Stage(R.string.custody_recorded, it)) }
        chain.handedOverTo?.let { add(Stage(R.string.custody_handed_over, it)) }
        chain.confirmedBy?.let { add(Stage(R.string.custody_confirmed, it)) }
    }
    if (stages.isEmpty()) return
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        stages.forEachIndexed { index, stage ->
            CustodyAvatar(stage)
            if (index != stages.lastIndex) {
                EtalonIcon(EtalonIcons.ChevronRight, null, size = 16.dp, tint = EtalonColors.ink3)
            }
        }
    }
}

@Composable
private fun CustodyAvatar(stage: Stage) {
    val role = stringResource(stage.roleLabelRes)
    val description = stringResource(R.string.custody_stage_description, role, stage.name)
    Avatar(
        stage.name,
        modifier = Modifier.clearAndSetSemantics { contentDescription = description },
        size = 28.dp,
    )
}
