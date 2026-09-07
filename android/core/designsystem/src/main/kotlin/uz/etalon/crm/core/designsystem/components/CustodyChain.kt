package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.CustodyChain

/** One stage of a payment's custody: who touched the money, no timestamp — that is deliberate
 *  in [uz.etalon.crm.core.model.CustodyChain] itself (see its KDoc). */
private data class Stage(val roleLabelRes: Int, val name: String)

/**
 * A single row of small labelled avatars — collected → recorded → handed over → confirmed —
 * skipping the stages [chain] leaves null. Each avatar shows initials only; the full name and
 * its role reach a screen reader through [Modifier.clearAndSetSemantics], so TalkBack announces
 * e.g. "Йиққан: Aziz Aliyev" once instead of the initials and the description both.
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
                Icon(
                    Icons.Filled.ChevronRight,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.size(16.dp),
                )
            }
        }
    }
}

@Composable
private fun CustodyAvatar(stage: Stage) {
    val role = stringResource(stage.roleLabelRes)
    val description = stringResource(R.string.custody_stage_description, role, stage.name)
    Box(
        modifier = Modifier
            .size(28.dp)
            .background(MaterialTheme.colorScheme.primaryContainer, CircleShape)
            .clearAndSetSemantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = initialsOf(stage.name),
            style = EtalonType.monoLabel.copy(color = MaterialTheme.colorScheme.onPrimaryContainer),
            maxLines = 1,
            overflow = TextOverflow.Clip,
        )
    }
}

/** First letter of the first two words, or the first two characters of a single-word name. */
private fun initialsOf(name: String): String {
    val words = name.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }
    return when {
        words.size >= 2 -> "${words[0].first()}${words[1].first()}".uppercase()
        words.size == 1 -> words[0].take(2).uppercase()
        else -> ""
    }
}
