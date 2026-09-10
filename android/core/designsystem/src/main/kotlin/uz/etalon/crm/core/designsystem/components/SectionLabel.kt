package uz.etalon.crm.core.designsystem.components

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonType

/** §2: `sectionTitle` in ink, sentence case. The old `.uppercase()` is gone — this system sets a
 *  section title the way it is written, and shouting it broke Cyrillic word shapes. */
@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) =
    Text(text, style = EtalonType.sectionTitle, color = EtalonColors.ink, modifier = modifier)
