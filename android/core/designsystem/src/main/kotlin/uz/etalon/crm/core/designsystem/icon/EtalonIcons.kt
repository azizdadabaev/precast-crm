package uz.etalon.crm.core.designsystem.icon

import androidx.annotation.DrawableRes
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.foundation.layout.size
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.theme.EtalonColors

/**
 * Lucide (ISC — see assets/icon/LICENSE-lucide.txt), 2-unit stroke in a 24-unit viewport,
 * round caps. Ints rather than ImageVectors: a drawable reference costs nothing to hold and the
 * whole set can be listed in a test. §1.6 sizes: 20 nav · 18 header · 16 inline · 12 in a square.
 */
object EtalonIcons {
    val ArrowDown = R.drawable.ic_lu_arrow_down
    val ArrowLeft = R.drawable.ic_lu_arrow_left
    val ArrowUp = R.drawable.ic_lu_arrow_up
    val ArrowUpRight = R.drawable.ic_lu_arrow_up_right
    val Bell = R.drawable.ic_lu_bell
    val Box = R.drawable.ic_lu_box
    val Calculator = R.drawable.ic_lu_calculator
    val Camera = R.drawable.ic_lu_camera
    val Check = R.drawable.ic_lu_check
    val ChevronDown = R.drawable.ic_lu_chevron_down
    val ChevronLeft = R.drawable.ic_lu_chevron_left
    val ChevronRight = R.drawable.ic_lu_chevron_right
    val ChevronUp = R.drawable.ic_lu_chevron_up
    val CircleAlert = R.drawable.ic_lu_circle_alert
    val CloudUpload = R.drawable.ic_lu_cloud_upload
    val Copy = R.drawable.ic_lu_copy
    val Delete = R.drawable.ic_lu_delete
    /** The calendar header's Excel backup (§5) — an arrow into a tray, not [CloudUpload]'s cloud:
     *  the file comes DOWN from the server before the share sheet takes it anywhere. */
    val Download = R.drawable.ic_lu_download
    val Ellipsis = R.drawable.ic_lu_ellipsis
    val EllipsisVertical = R.drawable.ic_lu_ellipsis_vertical
    val Factory = R.drawable.ic_lu_factory
    val FileText = R.drawable.ic_lu_file_text
    val GripHorizontal = R.drawable.ic_lu_grip_horizontal
    val House = R.drawable.ic_lu_house
    val Images = R.drawable.ic_lu_images
    /** The delivery location's pin (§5.2). [Navigation]'s arrow is the *go there* action; this is
     *  the place itself — a saved coordinate on the order. */
    val MapPin = R.drawable.ic_lu_map_pin
    val MessageCircle = R.drawable.ic_lu_message_circle
    val Minus = R.drawable.ic_lu_minus
    val Navigation = R.drawable.ic_lu_navigation
    val Package = R.drawable.ic_lu_package
    val Pencil = R.drawable.ic_lu_pencil
    val Phone = R.drawable.ic_lu_phone
    val Plus = R.drawable.ic_lu_plus
    /** «Қайта олиш» — retake the photo, reload a failed list. The two arrows turning clockwise,
     *  not [ArrowUp]: this repeats the step, it does not undo it. */
    val RefreshCw = R.drawable.ic_lu_refresh_cw
    val Save = R.drawable.ic_lu_save
    val Search = R.drawable.ic_lu_search
    val Send = R.drawable.ic_lu_send
    /** Lucide has no plain "share": `share-2` is the three-node graph, and it is what replaces
     *  `Icons.Filled.Share` on the calculator's send-the-quote action when phase 4 redraws it. */
    val Share = R.drawable.ic_lu_share_2
    val SlidersHorizontal = R.drawable.ic_lu_sliders_horizontal
    val Trash = R.drawable.ic_lu_trash
    val TrendingUp = R.drawable.ic_lu_trending_up
    val User = R.drawable.ic_lu_user
    val Users = R.drawable.ic_lu_users
    val Wallet = R.drawable.ic_lu_wallet
    val X = R.drawable.ic_lu_x

    /** Every glyph, for the render test and the token sheet. */
    val all: List<Pair<String, Int>> = listOf(
        "arrow-down" to ArrowDown, "arrow-left" to ArrowLeft, "arrow-up" to ArrowUp,
        "arrow-up-right" to ArrowUpRight, "bell" to Bell, "box" to Box,
        "calculator" to Calculator, "camera" to Camera, "check" to Check, "chevron-down" to ChevronDown,
        "chevron-left" to ChevronLeft, "chevron-right" to ChevronRight, "chevron-up" to ChevronUp,
        "circle-alert" to CircleAlert,
        "cloud-upload" to CloudUpload, "copy" to Copy, "delete" to Delete, "download" to Download,
        "ellipsis" to Ellipsis,
        "ellipsis-vertical" to EllipsisVertical, "factory" to Factory, "file-text" to FileText,
        "grip-horizontal" to GripHorizontal,
        "house" to House, "images" to Images, "map-pin" to MapPin,
        "message-circle" to MessageCircle, "minus" to Minus,
        "navigation" to Navigation, "package" to Package, "pencil" to Pencil, "phone" to Phone,
        "plus" to Plus, "refresh-cw" to RefreshCw, "save" to Save, "search" to Search,
        "send" to Send, "share-2" to Share,
        "sliders-horizontal" to SlidersHorizontal, "trash" to Trash, "trending-up" to TrendingUp,
        "user" to User, "users" to Users, "wallet" to Wallet, "x" to X,
    )
}

@Composable
fun EtalonIcon(
    @DrawableRes id: Int, contentDescription: String?,
    modifier: Modifier = Modifier, size: Dp = 18.dp, tint: Color = EtalonColors.ink,
) = Icon(painterResource(id), contentDescription, modifier.size(size), tint)
