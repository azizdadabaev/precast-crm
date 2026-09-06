package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp

private val MIN_TOUCH = 48.dp

@Composable
private fun ButtonBody(text: String, loading: Boolean, leading: ImageVector?) {
    if (loading) {
        CircularProgressIndicator(
            modifier = Modifier.size(18.dp), strokeWidth = 2.dp,
            color = LocalContentColor.current,
        )
        Spacer(Modifier.width(10.dp))
    } else if (leading != null) {
        Icon(leading, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(10.dp))
    }
    Text(text, maxLines = 1)
}

/** The one action a screen exists for. Full width, 48 dp, thumb height. */
@Composable
fun PrimaryButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier,
    enabled: Boolean = true, loading: Boolean = false, leading: ImageVector? = null,
) = Button(
    onClick = onClick, enabled = enabled && !loading,
    modifier = modifier.fillMaxWidth().heightIn(min = MIN_TOUCH),
) { ButtonBody(text, loading, leading) }

@Composable
fun SecondaryButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier,
    enabled: Boolean = true, loading: Boolean = false, leading: ImageVector? = null,
) = OutlinedButton(
    onClick = onClick, enabled = enabled && !loading,
    modifier = modifier.fillMaxWidth().heightIn(min = MIN_TOUCH),
) { ButtonBody(text, loading, leading) }

/** Destructive actions: delete a shipment, remove a photo. */
@Composable
fun DangerButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier,
    enabled: Boolean = true, loading: Boolean = false, leading: ImageVector? = null,
) = Button(
    onClick = onClick, enabled = enabled && !loading,
    colors = ButtonDefaults.buttonColors(
        containerColor = MaterialTheme.colorScheme.error,
        contentColor = MaterialTheme.colorScheme.onError,
    ),
    modifier = modifier.fillMaxWidth().heightIn(min = MIN_TOUCH),
) { ButtonBody(text, loading, leading) }
