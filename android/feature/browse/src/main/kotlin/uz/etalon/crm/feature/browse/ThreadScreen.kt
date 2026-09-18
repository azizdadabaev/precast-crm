package uz.etalon.crm.feature.browse

import android.content.Intent
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import kotlinx.coroutines.launch
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonIconButton
import uz.etalon.crm.core.designsystem.components.EtalonTextField
import uz.etalon.crm.core.designsystem.components.Lightbox
import uz.etalon.crm.core.designsystem.components.PhotoRef
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.ChatMessage
import uz.etalon.crm.core.model.MessageKind
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.model.Thread
import uz.etalon.crm.core.ui.format.formatDateTime

/**
 * One conversation: the messages, and a composer.
 *
 * Tapping a chat used to do nothing. This is the thread the drawer's list was always pointing at —
 * read what the customer sent, answer, send a photo, send a pin, send a saved quote.
 *
 * What it deliberately does NOT do: voice recording, document upload, deleting a message, or the
 * AI hand-off toggle. Each is a real feature with its own server contract, and a composer crowded
 * with half of them is worse than one that does four things properly.
 */
@Composable
fun ThreadRoute(
    conversationId: String,
    onBack: () -> Unit,
    onOpenOrder: (String) -> Unit,
    vm: ThreadViewModel = hiltViewModel<ThreadViewModel, ThreadViewModel.Factory>(
        creationCallback = { it.create(conversationId) },
    ),
) {
    val state by vm.state.collectAsStateWithLifecycle()
    val draft by vm.draft.collectAsStateWithLifecycle()
    val sending by vm.sending.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val projects by vm.projects.collectAsStateWithLifecycle()
    ThreadScreen(
        state = state,
        draft = draft,
        sending = sending,
        error = error,
        projectCount = projects.size,
        onDraftChange = vm::setDraft,
        onSendText = vm::sendText,
        onSendPhoto = { uri, caption -> vm.sendPhotoFromUri(uri, caption) },
        onSendLocation = vm::sendCurrentLocation,
        onSendFirstProject = { projects.firstOrNull()?.let { vm.sendProject(it.id) } },
        onOpenOrder = { projects.firstNotNullOfOrNull { it.orderId }?.let(onOpenOrder) },
        onDismissError = vm::dismissError,
        onBack = onBack,
    )
}

@Composable
internal fun ThreadScreen(
    state: Resource<Thread>,
    draft: String,
    sending: Boolean,
    error: String?,
    projectCount: Int,
    onDraftChange: (String) -> Unit,
    onSendText: () -> Unit,
    onSendPhoto: (Uri, String) -> Unit,
    onSendLocation: () -> Unit,
    onSendFirstProject: () -> Unit,
    onOpenOrder: () -> Unit,
    onDismissError: () -> Unit,
    onBack: () -> Unit,
) {
    val thread = state.dataOrNull
    val messages = thread?.messages.orEmpty()
    var viewing by remember { mutableStateOf<String?>(null) }
    val listState = rememberLazyListState()
    val scope = rememberCoroutineScope()
    // The newest message is at the bottom, which is where a conversation is read from.
    LaunchedEffect(messages.size) {
        if (messages.isNotEmpty()) scope.launch { listState.animateScrollToItem(messages.lastIndex) }
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        uri?.let { onSendPhoto(it, draft) }
    }

    Column(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding().imePadding()) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.sm, vertical = EtalonSpace.xs),
            horizontalArrangement = Arrangement.spacedBy(EtalonSpace.xs),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            EtalonIconButton(EtalonIcons.ArrowLeft, stringResource(R.string.thread_back), onBack)
            Column(Modifier.weight(1f)) {
                Text(
                    thread?.displayName.orEmpty(),
                    style = EtalonType.titleSm,
                    color = EtalonColors.ink,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                thread?.username?.let {
                    Text("@$it", style = EtalonType.meta, color = EtalonColors.ink3, maxLines = 1)
                }
            }
            // Only when this chat actually has a quote behind it.
            if (projectCount > 0) {
                EtalonIconButton(EtalonIcons.FileText, stringResource(R.string.thread_open_order), onOpenOrder)
            }
        }
        HorizontalDivider(color = EtalonColors.surfaceBorder, thickness = EtalonSpace.hairline)

        if (state is Resource.Error && messages.isEmpty()) {
            ErrorBanner(state.error.message)
        }
        error?.let { ErrorBanner(it, onDismiss = onDismissError) }

        LazyColumn(
            state = listState,
            modifier = Modifier.weight(1f).fillMaxWidth(),
            contentPadding = androidx.compose.foundation.layout.PaddingValues(EtalonSpace.md),
            verticalArrangement = Arrangement.spacedBy(EtalonSpace.xs),
        ) {
            items(messages, key = { it.id }) { m ->
                MessageBubble(m, onOpenImage = { viewing = it })
            }
        }

        Composer(
            draft = draft,
            sending = sending,
            canSendProject = projectCount > 0,
            onDraftChange = onDraftChange,
            onSendText = onSendText,
            onPickPhoto = { picker.launch("image/*") },
            onSendLocation = onSendLocation,
            onSendProject = onSendFirstProject,
        )
    }

    viewing?.let { url ->
        Lightbox(listOf(PhotoRef(null, url)), 0, onDismiss = { viewing = null })
    }
}

@Composable
private fun MessageBubble(m: ChatMessage, onOpenImage: (String) -> Unit) = Row(
    Modifier.fillMaxWidth(),
    horizontalArrangement = if (m.outbound) Arrangement.End else Arrangement.Start,
) {
    Column(
        Modifier.widthIn(max = BubbleMax).clip(EtalonShapes.lg)
            .background(if (m.outbound) EtalonColors.indigo else EtalonColors.surface)
            .padding(EtalonSpace.sm),
    ) {
        val onBubble = if (m.outbound) EtalonColors.onDark else EtalonColors.ink
        // Locals: these are public properties of another module, so Kotlin will not smart-cast them.
        val imageUrl = m.mediaUrl
        val lat = m.lat
        val lng = m.lng
        val quiet = if (m.outbound) EtalonColors.onDarkMuted else EtalonColors.ink3

        when {
            // Media the server could not fetch. Saying so beats a broken frame.
            m.mediaMissing -> Text(stringResource(R.string.thread_media_missing), style = EtalonType.meta, color = quiet)

            m.kind == MessageKind.IMAGE && imageUrl != null -> AsyncImage(
                model = imageUrl,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxWidth().aspectRatio(1f).clip(EtalonShapes.md)
                    .clickable(role = Role.Button) { onOpenImage(imageUrl) },
            )

            m.kind == MessageKind.LOCATION && lat != null && lng != null ->
                LocationBubble(lat, lng, m.locationTitle, onBubble, quiet)

            m.kind == MessageKind.VOICE ->
                MediaNote(EtalonIcons.Phone, m.durationSec?.let { "$it с" } ?: stringResource(R.string.thread_voice), onBubble)

            m.kind == MessageKind.VIDEO ->
                MediaNote(EtalonIcons.Images, stringResource(R.string.thread_video), onBubble)

            m.kind == MessageKind.DOCUMENT ->
                MediaNote(EtalonIcons.FileText, m.mediaName ?: stringResource(R.string.thread_document), onBubble)

            m.kind == MessageKind.UNSUPPORTED ->
                Text(stringResource(R.string.thread_unsupported), style = EtalonType.meta, color = quiet)
        }

        // A caption sits under its media; a text message is only this.
        m.text?.takeIf { it.isNotBlank() }?.let {
            if (m.kind != MessageKind.TEXT) Spacer(Modifier.height(EtalonSpace.xs))
            Text(it, style = EtalonType.body, color = onBubble)
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(formatDateTime(m.createdAt), style = EtalonType.caption, color = quiet)
            if (m.failed) {
                Spacer(Modifier.width(EtalonSpace.xs))
                Text(stringResource(R.string.thread_failed), style = EtalonType.caption, color = EtalonColors.debtOnDark)
            }
        }
    }
}

/**
 * A pin, as a line that opens the maps app.
 *
 * No map tile: the web draws a fake one out of CSS and this app has no maps SDK wired in. A pin
 * the operator can open in the app that does maps properly is worth more than a picture of a map.
 */
@Composable
private fun LocationBubble(lat: Double, lng: Double, title: String?, fg: androidx.compose.ui.graphics.Color, quiet: androidx.compose.ui.graphics.Color) {
    val context = LocalContext.current
    Row(
        Modifier.clickable(role = Role.Button) {
            runCatching {
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:$lat,$lng?q=$lat,$lng")))
            }
        },
        horizontalArrangement = Arrangement.spacedBy(EtalonSpace.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        EtalonIcon(EtalonIcons.MapPin, null, size = 18.dp, tint = fg)
        Column {
            Text(title ?: stringResource(R.string.thread_location), style = EtalonType.body, color = fg)
            Text("$lat, $lng", style = EtalonType.caption, color = quiet, maxLines = 1)
        }
    }
}

@Composable
private fun MediaNote(icon: Int, label: String, fg: androidx.compose.ui.graphics.Color) = Row(
    horizontalArrangement = Arrangement.spacedBy(EtalonSpace.xs),
    verticalAlignment = Alignment.CenterVertically,
) {
    EtalonIcon(icon, null, size = 18.dp, tint = fg)
    Text(label, style = EtalonType.body, color = fg, maxLines = 1, overflow = TextOverflow.Ellipsis)
}

@Composable
private fun Composer(
    draft: String,
    sending: Boolean,
    canSendProject: Boolean,
    onDraftChange: (String) -> Unit,
    onSendText: () -> Unit,
    onPickPhoto: () -> Unit,
    onSendLocation: () -> Unit,
    onSendProject: () -> Unit,
) = Column(
    Modifier.fillMaxWidth().background(EtalonColors.surface).navigationBarsPadding()
        .padding(horizontal = EtalonSpace.sm, vertical = EtalonSpace.xs),
) {
    HorizontalDivider(color = EtalonColors.surfaceBorder, thickness = EtalonSpace.hairline)
    Spacer(Modifier.height(EtalonSpace.xs))
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(EtalonSpace.xs),
        verticalAlignment = Alignment.Bottom,
    ) {
        EtalonIconButton(EtalonIcons.Images, stringResource(R.string.thread_attach), onPickPhoto)
        EtalonIconButton(EtalonIcons.MapPin, stringResource(R.string.thread_send_location), onSendLocation)
        if (canSendProject) {
            EtalonIconButton(EtalonIcons.Save, stringResource(R.string.thread_send_quote), onSendProject)
        }
        Box(Modifier.weight(1f)) {
            EtalonTextField(
                value = draft,
                onValueChange = onDraftChange,
                placeholder = stringResource(R.string.thread_placeholder),
                singleLine = false,
                maxLines = 4,
                enabled = !sending,
            )
        }
        EtalonIconButton(EtalonIcons.Send, stringResource(R.string.thread_send), onSendText)
    }
}

private val BubbleMax = 280.dp
