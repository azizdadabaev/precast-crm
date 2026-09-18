package uz.etalon.crm.feature.browse

import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
        // Three to a row, as the web's grid does. A card this narrow cannot carry the client's
        // address and the upload date as well — at 360 dp each cell is about 105 dp — so it keeps
        // the two things the grid is scanned by: the photo and which order it belongs to. The rest
        // is one tap away in the order itself.
        val rows = posts.chunked(GALLERY_COLUMNS)
        LazyColumn(
            contentPadding = navPillContentPadding(
                start = EtalonSpace.cardMargin,
                end = EtalonSpace.cardMargin,
                top = EtalonSpace.xs,
            ),
            verticalArrangement = Arrangement.spacedBy(EtalonSpace.sm),
        ) {
            items(rows, key = { row -> row.first().key }) { row ->
                Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(EtalonSpace.sm)) {
                    row.forEach { post ->
                        GalleryCard(
                            post = post,
                            modifier = Modifier.weight(1f),
                            onOpenImage = { index -> viewing = post.imageUrls to index },
                            onOpenOrder = { onOpenOrder(post.orderId) },
                        )
                    }
                    // Keeps the last row's cards the width of every other row's rather than
                    // stretching one photo across the gap.
                    repeat(GALLERY_COLUMNS - row.size) { Spacer(Modifier.weight(1f)) }
                }
            }
        }
    }
    viewing?.let { (urls, index) ->
        Lightbox(urls.map { PhotoRef(null, it) }, index, onDismiss = { viewing = null })
    }
}

@Composable
private fun GalleryCard(
    post: GalleryPost,
    modifier: Modifier = Modifier,
    onOpenImage: (Int) -> Unit,
    onOpenOrder: () -> Unit,
) = Column(
    modifier.clip(EtalonShapes.lg).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.lg),
) {
    Box(Modifier.fillMaxWidth().aspectRatio(1f)) {
        post.imageUrls.firstOrNull()?.let { url ->
            AsyncImage(
                model = url,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize().clickable(role = Role.Button) { onOpenImage(0) },
            )
        }
        // A count, not a row of thumbnails: at this width the second photo would be 40 dp wide.
        if (post.imageUrls.size > 1) {
            Box(
                Modifier.align(Alignment.BottomEnd).padding(EtalonSpace.xs)
                    .clip(EtalonShapes.xs).background(EtalonColors.navy.copy(alpha = 0.72f))
                    .padding(horizontal = 5.dp, vertical = 1.dp),
            ) {
                Text(
                    post.imageUrls.size.toString(),
                    style = EtalonType.caption,
                    color = EtalonColors.onDark,
                    maxLines = 1,
                )
            }
        }
    }
    Column(Modifier.padding(horizontal = EtalonSpace.sm, vertical = EtalonSpace.xs)) {
        Text(
            post.orderNumber,
            style = EtalonType.caption,
            color = EtalonColors.indigo,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.clickable(role = Role.Button, onClick = onOpenOrder),
        )
        Text(
            post.clientName,
            style = EtalonType.caption,
            color = EtalonColors.ink2,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
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

/** Three to a row. Two would read more comfortably; three is what the owner asked to see first,
 *  and the compact card was built to survive it. */
private const val GALLERY_COLUMNS = 3
