package uz.etalon.crm.feature.browse

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.Lightbox
import uz.etalon.crm.core.designsystem.components.PhotoRef
import uz.etalon.crm.core.designsystem.components.SearchField
import uz.etalon.crm.core.designsystem.components.Tag
import uz.etalon.crm.core.designsystem.components.navPillContentPadding
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.GalleryKind
import uz.etalon.crm.core.model.GalleryPost
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.ui.format.formatDate

/**
 * «Галерея» — every loaded and delivered photo, newest first, as the web's `/gallery`.
 *
 * Grouped the way the server groups them: one card per order per kind, because that is the unit an
 * operator asks about — «show me the truck for 0003», not «show me photo 47».
 */
@Composable
fun GalleryRoute(onOpenOrder: (String) -> Unit, vm: GalleryViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    val query by vm.query.collectAsStateWithLifecycle()
    GalleryScreen(
        state = state,
        query = query,
        onQueryChange = vm::setQuery,
        onRetry = vm::refresh,
        onOpenOrder = onOpenOrder,
    )
}

@Composable
internal fun GalleryScreen(
    state: Resource<List<GalleryPost>>,
    query: String,
    onQueryChange: (String) -> Unit,
    onRetry: () -> Unit,
    onOpenOrder: (String) -> Unit,
) {
    val posts = state.dataOrNull.orEmpty()
    // The lightbox is opened from a card, so it carries that card's photos rather than every photo
    // on the screen: swiping must stay inside the order the operator opened.
    var viewing by remember { mutableStateOf<Pair<List<String>, Int>?>(null) }
    Column(Modifier.fillMaxSize().background(EtalonColors.page).statusBarsPadding()) {
        Column(Modifier.padding(horizontal = EtalonSpace.xl, vertical = EtalonSpace.md)) {
            Text(stringResource(R.string.gallery_title), style = EtalonType.displayTitle, color = EtalonColors.ink)
            Text(stringResource(R.string.gallery_subtitle), style = EtalonType.meta, color = EtalonColors.ink2)
        }
        Column(Modifier.padding(horizontal = EtalonSpace.cardMargin)) {
            SearchField(
                value = query,
                onValueChange = onQueryChange,
                placeholder = stringResource(R.string.gallery_search_hint),
            )
        }
        Spacer(Modifier.height(EtalonSpace.sm))
        if (state is Resource.Error) ErrorBanner(state.error.message, onRetry = onRetry)
        if (posts.isEmpty() && state !is Resource.Loading) {
            EmptyState(stringResource(R.string.gallery_empty))
        }
        LazyColumn(
            contentPadding = navPillContentPadding(
                start = EtalonSpace.cardMargin,
                end = EtalonSpace.cardMargin,
                top = EtalonSpace.xs,
            ),
            verticalArrangement = Arrangement.spacedBy(EtalonSpace.md),
        ) {
            items(posts, key = { it.key }) { post ->
                GalleryCard(
                    post = post,
                    onOpenImage = { index -> viewing = post.imageUrls to index },
                    onOpenOrder = { onOpenOrder(post.orderId) },
                )
            }
        }
    }
    viewing?.let { (urls, index) ->
        Lightbox(urls.map { PhotoRef(null, it) }, index, onDismiss = { viewing = null })
    }
}

@Composable
private fun GalleryCard(post: GalleryPost, onOpenImage: (Int) -> Unit, onOpenOrder: () -> Unit) = Column(
    Modifier.fillMaxWidth().clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl),
) {
    // The first photo is the card. The rest are reachable by opening it — a grid of thumbnails
    // here would make every card a different height and the list impossible to scan.
    post.imageUrls.firstOrNull()?.let { url ->
        AsyncImage(
            model = url,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxWidth().aspectRatio(4f / 3f)
                .clickable(role = Role.Button) { onOpenImage(0) },
        )
    }
    Column(Modifier.padding(horizontal = EtalonSpace.cardPadH, vertical = EtalonSpace.rowGap)) {
        Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
            Text(
                post.orderNumber,
                style = EtalonType.rowAmount,
                color = EtalonColors.indigo,
                maxLines = 1,
                modifier = Modifier.clickable(role = Role.Button, onClick = onOpenOrder),
            )
            KindTag(post.kind)
        }
        Spacer(Modifier.height(2.dp))
        Text(
            post.clientName,
            style = EtalonType.rowTitle,
            color = EtalonColors.ink,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
        post.clientAddress?.takeIf { it.isNotBlank() }?.let {
            Text(it, style = EtalonType.meta, color = EtalonColors.ink2, maxLines = 2, overflow = TextOverflow.Ellipsis)
        }
        Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
            Text(
                stringResource(R.string.gallery_photo_count, post.imageUrls.size),
                style = EtalonType.caption,
                color = EtalonColors.ink3,
            )
            Text(formatDate(post.uploadedAt), style = EtalonType.caption, color = EtalonColors.ink3)
        }
    }
}

/** The web's three badges, in its own wording. */
@Composable
private fun KindTag(kind: GalleryKind) = when (kind) {
    GalleryKind.LOADED ->
        Tag(stringResource(R.string.gallery_kind_loaded), fg = EtalonColors.heavy, bg = EtalonColors.warningBg)
    GalleryKind.DELIVERY_PROOF ->
        Tag(stringResource(R.string.gallery_kind_delivered), fg = EtalonColors.green, bg = EtalonColors.greenBg)
    GalleryKind.SHIPMENT_LOADED ->
        Tag(stringResource(R.string.gallery_kind_shipment), fg = EtalonColors.indigo, bg = EtalonColors.lavenderBg)
    GalleryKind.UNKNOWN -> Unit
}
