package uz.etalon.crm.shell

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import uz.etalon.crm.R
import uz.etalon.crm.core.designsystem.components.Avatar
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Me

/**
 * The sections the nav bar has no seat for, behind a hamburger.
 *
 * Four cells is the bar's whole budget at 360 dp once each carries a label, and the app has more
 * places than that. The split follows the web: the things an operator *does* all day stay on the
 * bar, and the things they go and *look at* — the gallery, the client list, the message inbox —
 * live here, in the sidebar's own order and wording.
 *
 * Drawn as a scrim and a panel rather than Material's ModalNavigationDrawer: that component brings
 * its own colours and shapes, and this app's theme bans reading M3's slots back.
 */
@Composable
internal fun AppDrawer(
    open: Boolean,
    me: Me,
    entries: List<DrawerDestination>,
    onSelect: (DrawerDestination) -> Unit,
    onDismiss: () -> Unit,
) {
    AnimatedVisibility(visible = open, enter = fadeIn(), exit = fadeOut()) {
        Box(
            Modifier.fillMaxSize()
                .background(EtalonColors.navy.copy(alpha = 0.55f))
                // No ripple and no role: the scrim is a way out, not a control.
                .clickable(
                    interactionSource = remember { MutableInteractionSource() },
                    indication = null,
                    onClick = onDismiss,
                ),
        )
    }
    AnimatedVisibility(
        visible = open,
        enter = slideInHorizontally { -it },
        exit = slideOutHorizontally { -it },
    ) {
        Column(
            Modifier.fillMaxHeight().widthIn(max = PanelWidth).fillMaxWidth(PanelFraction)
                .background(EtalonColors.navy)
                .statusBarsPadding()
                .navigationBarsPadding()
                .padding(vertical = EtalonSpace.md),
        ) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.lg, vertical = EtalonSpace.sm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Avatar(me.name, size = 36.dp, onPanel = true)
                Spacer(Modifier.width(EtalonSpace.rowGap))
                Column(Modifier.weight(1f)) {
                    Text(
                        me.name,
                        style = EtalonType.rowTitle,
                        color = EtalonColors.onDark,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                    Text(
                        stringResource(R.string.nav_menu),
                        style = EtalonType.meta,
                        color = EtalonColors.onDarkMuted,
                        maxLines = 1,
                    )
                }
            }
            Spacer(Modifier.height(EtalonSpace.sm))
            entries.forEach { entry ->
                DrawerRow(entry, onClick = { onSelect(entry) })
            }
        }
    }
}

@Composable
private fun DrawerRow(entry: DrawerDestination, onClick: () -> Unit) = Row(
    Modifier.fillMaxWidth()
        .padding(horizontal = EtalonSpace.md, vertical = 2.dp)
        .clip(EtalonShapes.lg)
        .clickable(role = Role.Button, onClick = onClick)
        .padding(horizontal = EtalonSpace.md, vertical = EtalonSpace.md),
    horizontalArrangement = Arrangement.spacedBy(EtalonSpace.md),
    verticalAlignment = Alignment.CenterVertically,
) {
    EtalonIcon(entry.icon(), null, tint = EtalonColors.onDarkMuted, size = 20.dp)
    Text(
        stringResource(entry.labelRes),
        style = EtalonType.body,
        color = EtalonColors.onDark,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
    )
}

/** The web sidebar's icon for the same row, so the two apps look like one product. */
private fun DrawerDestination.icon(): Int = when (this) {
    DrawerDestination.GALLERY -> EtalonIcons.Images
    DrawerDestination.DRAFTS_LINK -> EtalonIcons.Save
    DrawerDestination.CLIENTS -> EtalonIcons.Users
    DrawerDestination.INBOX -> EtalonIcons.MessageCircle
}

/** Wide enough for «Хабарлар» at font scale 1,3, never so wide it hides the screen behind it. */
private val PanelWidth = 320.dp
private const val PanelFraction = 0.84f
