package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonType

/** Where a step sits relative to the order's progress. */
enum class StepState { DONE, CURRENT, UPCOMING }

/** @param caption the date the step happened, a «✓», or `null` for a step with nothing to say. */
data class TimelineStep(val label: String, val caption: String?, val state: StepState)

/**
 * §2 StepTimeline — the «Етказиш» card's four columns on `2b-order-detail.png`. Equal-width
 * 5 dp pill bars, navy behind, indigo for the step the order is on, `lavenderBg` ahead of it.
 *
 * Four columns is what the order lifecycle has (Қабул · Ишлаб чиқ. · Йўлда · Етказилди), but the
 * count is the caller's — the component just splits the width evenly across whatever it is given.
 */
@Composable
fun StepTimeline(steps: List<TimelineStep>, modifier: Modifier = Modifier) =
    Row(modifier.fillMaxWidth(), Arrangement.spacedBy(6.dp)) {
        steps.forEach { s ->
            Column(Modifier.weight(1f)) {
                Box(
                    Modifier.fillMaxWidth().height(5.dp).clip(EtalonShapes.pill).background(
                        when (s.state) {
                            StepState.DONE -> EtalonColors.navy
                            StepState.CURRENT -> EtalonColors.indigo
                            StepState.UPCOMING -> EtalonColors.lavenderBg
                        },
                    ),
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    s.label,
                    style = EtalonType.caption,
                    maxLines = 1,
                    color = if (s.state == StepState.UPCOMING) EtalonColors.ink3 else EtalonColors.ink,
                )
                if (s.caption != null) {
                    Text(
                        s.caption,
                        style = EtalonType.caption.copy(fontWeight = FontWeight.W400),
                        color = EtalonColors.ink3,
                        maxLines = 1,
                    )
                }
            }
        }
    }
