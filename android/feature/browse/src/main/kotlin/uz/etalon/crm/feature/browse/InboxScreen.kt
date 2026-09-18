package uz.etalon.crm.feature.browse

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import uz.etalon.crm.core.designsystem.components.EtalonTextField
import uz.etalon.crm.core.designsystem.components.FormCard
import uz.etalon.crm.core.designsystem.components.FormField
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.Avatar
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.SearchField
import uz.etalon.crm.core.designsystem.components.navPillContentPadding
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.model.Conversation
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.ui.format.formatDateTime

/**
 * «Хабарлар» — the conversation list, as the web's `/inbox`.
 *
 * Read-only for now: this lists who has written and when, which is what the drawer needed. Opening
 * a thread and replying is the inbox proper, and it is a screen of its own.
 *
 * The route is behind a password gate as well as `inbox.access`, and the phone has no way through
 * it — unlocking is a web flow. A locked inbox therefore gets a sentence saying where to unlock it
 * rather than the generic «Рухсат йўқ», which would send an owner looking for a permission they
 * already hold.
 */
@Composable
fun InboxRoute(onOpenChat: (String) -> Unit, vm: InboxViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val query by vm.query.collectAsStateWithLifecycle()
    val password by vm.password.collectAsStateWithLifecycle()
    val unlocking by vm.unlocking.collectAsStateWithLifecycle()
    val unlockError by vm.unlockError.collectAsStateWithLifecycle()
    InboxScreen(
        state = state,
        query = query,
        onQueryChange = vm::setQuery,
        onRetry = vm::refresh,
        password = password,
        unlocking = unlocking,
        unlockError = unlockError,
        onPasswordChange = vm::setPassword,
        onUnlock = vm::unlock,
        onOpenChat = onOpenChat,
    )
}

@Composable
internal fun InboxScreen(
    state: Resource<List<Conversation>>,
    query: String,
    onQueryChange: (String) -> Unit,
    onRetry: () -> Unit,
    password: String = "",
    unlocking: Boolean = false,
    unlockError: String? = null,
    onPasswordChange: (String) -> Unit = {},
    onUnlock: () -> Unit = {},
    onOpenChat: (String) -> Unit = {},
) {
    val all = state.dataOrNull.orEmpty()
    // Filtered here, not on the server: the route takes no query at all and caps at 500, so the
    // whole list is already in hand.
    val rows = if (query.isBlank()) all else all.filter { it.matches(query) }
    val locked = (state as? Resource.Error)?.error?.isInboxLocked() == true
    Column(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding()) {
        Column(Modifier.padding(horizontal = EtalonSpace.xl, vertical = EtalonSpace.md)) {
            Text(stringResource(R.string.inbox_title), style = EtalonType.displayTitle, color = EtalonColors.ink)
        }
        if (locked) {
            UnlockForm(
                password = password,
                unlocking = unlocking,
                error = unlockError,
                onPasswordChange = onPasswordChange,
                onUnlock = onUnlock,
            )
            return@Column
        }
        Column(Modifier.padding(horizontal = EtalonSpace.cardMargin)) {
            SearchField(
                value = query,
                onValueChange = onQueryChange,
                placeholder = stringResource(R.string.inbox_search_hint),
            )
        }
        Spacer(Modifier.height(EtalonSpace.sm))
        if (state is Resource.Error) ErrorBanner(state.error.message, onRetry = onRetry)
        if (rows.isEmpty() && state !is Resource.Loading) {
            EmptyState(
                if (query.isBlank()) {
                    stringResource(R.string.inbox_empty)
                } else {
                    stringResource(R.string.inbox_empty_search)
                },
            )
        }
        LazyColumn(
            contentPadding = navPillContentPadding(
                start = EtalonSpace.cardMargin,
                end = EtalonSpace.cardMargin,
                top = EtalonSpace.xs,
            ),
            verticalArrangement = Arrangement.spacedBy(EtalonSpace.xs),
        ) {
            items(rows, key = { it.id }) { ConversationRow(it, onClick = { onOpenChat(it.id) }) }
        }
    }
}

/**
 * The password gate, asked here instead of pointed at.
 *
 * This screen used to say Â«unlock it in the web CRMÂ», which is no help at all to an operator
 * holding a phone and nothing else. It is the same password either way and the same
 * `POST /api/inbox/unlock` behind it, so there was never a reason the app could not ask.
 *
 * On success the token is kept for this device and the list is re-requested; the interceptor
 * carries it from then on, including for Â«Ð§Ð°ÑÐ³Ð° ÑÐ±Ð¾ÑÐ¸ÑÂ», which is behind the same gate.
 */
@Composable
private fun UnlockForm(
    password: String,
    unlocking: Boolean,
    error: String?,
    onPasswordChange: (String) -> Unit,
    onUnlock: () -> Unit,
) = Column(Modifier.fillMaxWidth().padding(horizontal = EtalonSpace.cardMargin)) {
    Text(
        stringResource(R.string.inbox_locked_title),
        style = EtalonType.sectionTitle,
        color = EtalonColors.ink,
    )
    Spacer(Modifier.height(EtalonSpace.xs))
    Text(
        stringResource(R.string.inbox_locked_body),
        style = EtalonType.meta,
        color = EtalonColors.ink2,
    )
    Spacer(Modifier.height(EtalonSpace.md))
    FormCard {
        FormField(stringResource(R.string.inbox_password_label), divider = false) {
            EtalonTextField(
                value = password,
                onValueChange = onPasswordChange,
                placeholder = stringResource(R.string.inbox_password_hint),
                enabled = !unlocking,
                keyboardOptions = KeyboardOptions(
                    keyboardType = KeyboardType.Password,
                    imeAction = ImeAction.Go,
                ),
                // The keyboard's own Go key submits: on a one-field form, reaching past it to a
                // button is a step for nothing.
                keyboardActions = KeyboardActions(onGo = { onUnlock() }),
                visualTransformation = PasswordVisualTransformation(),
            )
        }
    }
    error?.let {
        Spacer(Modifier.height(EtalonSpace.sm))
        ErrorBanner(it)
    }
    Spacer(Modifier.height(EtalonSpace.md))
    PrimaryButton(
        text = stringResource(R.string.inbox_unlock),
        onClick = onUnlock,
        enabled = password.isNotBlank(),
        loading = unlocking,
    )
}


@Composable
private fun ConversationRow(c: Conversation, onClick: () -> Unit) = Row(
    Modifier.fillMaxWidth().clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .clickable(role = Role.Button, onClick = onClick)
        .padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.rowGap),
    horizontalArrangement = Arrangement.spacedBy(EtalonSpace.rowGap),
    verticalAlignment = Alignment.CenterVertically,
) {
    Avatar(c.displayName, size = 40.dp)
    Column(Modifier.weight(1f)) {
        Text(
            c.displayName,
            style = EtalonType.rowTitle,
            color = EtalonColors.ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        Text(
            // A conversation whose last message was a photo or a voice note has no text to show;
            // the web prints the same placeholder rather than an empty second line.
            c.lastSnippet.takeIf { it.isNotBlank() } ?: stringResource(R.string.inbox_no_snippet),
            style = EtalonType.meta,
            color = EtalonColors.ink2,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
    Column(horizontalAlignment = Alignment.End) {
        Text(formatDateTime(c.lastMessageAt), style = EtalonType.caption, color = EtalonColors.ink3, maxLines = 1)
        if (c.unread) {
            Spacer(Modifier.height(EtalonSpace.xs))
            Box(Modifier.size(UnreadDot).clip(EtalonShapes.pill).background(EtalonColors.indigo))
        }
    }
}

private fun Conversation.matches(q: String): Boolean {
    val needle = q.trim().lowercase()
    return displayName.lowercase().contains(needle) ||
        username?.lowercase()?.contains(needle) == true ||
        lastSnippet.lowercase().contains(needle)
}

/** A locked inbox is a 403 whose body names the gate. Anything else is a real permission failure
 *  and must keep saying so. */
private fun AppError.isInboxLocked(): Boolean = message.contains("қулфланган")

private val UnreadDot = 8.dp
