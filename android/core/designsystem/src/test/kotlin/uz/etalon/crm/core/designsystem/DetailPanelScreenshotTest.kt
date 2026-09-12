package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.components.AddTile
import uz.etalon.crm.core.designsystem.components.DetailPanel
import uz.etalon.crm.core.designsystem.components.EtalonIconButton
import uz.etalon.crm.core.designsystem.components.PanelTotal
import uz.etalon.crm.core.designsystem.components.RoomTile
import uz.etalon.crm.core.designsystem.components.StatusTag
import uz.etalon.crm.core.designsystem.components.TagSurface
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatMoney
import java.math.BigDecimal

/** `2b-order-detail.png`'s own order, room by room. */
private val ROOMS = listOf(
    "37.10" to "Зал · 5,8 × 6,4",
    "22.90" to "Хона 1 · 4,4 × 5,2",
    "19.20" to "Хона 2 · 4,0 × 4,8",
    "14.60" to "Ошхона · 3,4 × 4,3",
)

private const val ADD_ROOM = "Хона қўшиш"

@Composable
private fun FlowRowScope.rooms(count: Int) {
    ROOMS.take(count).forEach { (area, caption) ->
        RoomTile(formatArea(BigDecimal(area)), caption, onOpen = {}, modifier = Modifier.weight(1f))
    }
    AddTile(ADD_ROOM, onClick = {}, modifier = Modifier.weight(1f))
}

/**
 * The panel's footer. `Жами` and `Қолди` are bare figures — `2b-order-detail.png` writes no unit
 * beside them, and D8 keeps `UZS` for hero figures only; the area carries its `м²` because
 * `formatArea` does. Each column takes `weight(1f)`, which is what makes the three-column grid the
 * prototype draws rather than three blocks pushed to the edges.
 */
@Composable
private fun totalsRow(): @Composable androidx.compose.foundation.layout.RowScope.() -> Unit = {
    PanelTotal("Майдон", formatArea(BigDecimal("78.70")), modifier = Modifier.weight(1f))
    PanelTotal("Жами", formatMoney(Money.parse("13350000.00")), modifier = Modifier.weight(1f))
    PanelTotal("Қолди", formatMoney(Money.parse("7350000.00")), modifier = Modifier.weight(1f))
}

@Composable
private fun Panel(tileCount: Int) = DetailPanel(
    caption = "Буюртма",
    headline = "# 09−0003",
    statusTag = { StatusTag(OrderStatus.DISPATCHED, TagSurface.PANEL_ON_INDIGO) },
    clientName = "Yusupov & Sons",
    addressLine = "Бухоро ш., Эски шаҳар, Хўжа Нуробод кўч. 7",
    tiles = { rooms(tileCount) },
    totals = totalsRow(),
    onBack = {},
    dateLabel = "30 авг 2026",
    onCall = {},
    modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin),
)

/**
 * §2's DetailPanel against `2b-order-detail.png`: the prototype's own three rooms plus the dashed
 * AddTile, then the two grids either side of it — two rooms (the AddTile alone on the second row)
 * and four (the AddTile starting a third). The tile count is the one thing that changes the
 * panel's shape, so it is the one thing the sheet varies.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h1500dp")
class DetailPanelScreenshotTest {
    @get:Rule val rule = createComposeRule()

    @Test fun detailPanelLight() {
        rule.setContent { EtalonTheme { PanelSheet() } }
        rule.onRoot().captureRoboImage("screenshots/ds_detail_panel_light.png")
    }

    /**
     * The `actions` slot, which the client detail is the first screen to use: an extra icon button
     * to the LEFT of the call button, and the same panel with `onCall = null` so the header row
     * proves it closes up rather than leaving a hole where the call button was. The enabled and
     * disabled pencil are both in the frame — «disabled» is a state this app shows rather than
     * hides, so it has to be legible on navy.
     */
    @Test fun detailPanelActionsLight() {
        rule.setContent { EtalonTheme { ActionsSheet() } }
        rule.onRoot().captureRoboImage("screenshots/ds_detail_panel_actions.png")
    }

    /**
     * The accessibility floor the totals have to survive: at 1.3× the three 13/700 figures are the
     * first thing in the panel to run out of column. `Density` is overridden rather than the
     * device's font setting so the check is exact and does not depend on Robolectric's config.
     */
    @Test fun detailPanelFontScaleLight() {
        rule.setContent {
            EtalonTheme {
                val d = LocalDensity.current
                CompositionLocalProvider(LocalDensity provides Density(d.density, 1.3f)) {
                    Column(
                        Modifier.fillMaxWidth().background(EtalonColors.page).padding(vertical = 16.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp),
                    ) { Panel(tileCount = 3) }
                }
            }
        }
        rule.onRoot().captureRoboImage("screenshots/ds_detail_panel_fontscale_light.png")
    }
}

@Composable
private fun PanelSheet() = Column(
    Modifier.fillMaxWidth().background(EtalonColors.page).padding(vertical = 16.dp),
    verticalArrangement = Arrangement.spacedBy(14.dp),
) {
    Caption("DetailPanel · 3 хона (прототип)")
    Panel(tileCount = 3)
    Caption("DetailPanel · 2 хона")
    Panel(tileCount = 2)
    Caption("DetailPanel · 4 хона")
    Panel(tileCount = 4)
}

/** The client-detail shape: no status tag, no tiles, the phone in the `clientName` slot, the
 *  client's own initials kept via `avatarName`, and a blank `dateLabel` (a client has no date). */
@Composable
private fun ActionsPanel(editEnabled: Boolean, onCall: (() -> Unit)?) = DetailPanel(
    caption = "Мижоз",
    headline = "Yusupov & Sons",
    clientName = "+998 90 987 65 43",
    addressLine = "Бухоро вилояти, Когон тумани, Мустақиллик кўчаси 4",
    tiles = {},
    totals = {
        PanelTotal("Буюртмалар", "7 та", modifier = Modifier.weight(1f))
        PanelTotal("Жами", formatMoney(Money.parse("41250000.00")), modifier = Modifier.weight(1f))
    },
    onBack = {},
    dateLabel = "",
    onCall = onCall,
    actions = {
        EtalonIconButton(EtalonIcons.Pencil, "Таҳрирлаш", onClick = {}, onDark = true, enabled = editEnabled)
    },
    avatarName = "Yusupov & Sons",
    modifier = Modifier.padding(horizontal = EtalonSpace.cardMargin),
)

@Composable
private fun ActionsSheet() = Column(
    Modifier.fillMaxWidth().background(EtalonColors.page).padding(vertical = 16.dp),
    verticalArrangement = Arrangement.spacedBy(14.dp),
) {
    Caption("actions + onCall")
    ActionsPanel(editEnabled = true, onCall = {})
    Caption("actions ўчирилган + onCall = null")
    ActionsPanel(editEnabled = false, onCall = null)
}

@Composable
private fun Caption(text: String, color: Color = EtalonColors.ink2) = Text(
    text,
    style = EtalonType.caption,
    color = color,
    modifier = Modifier.padding(horizontal = EtalonSpace.headerMargin),
)
