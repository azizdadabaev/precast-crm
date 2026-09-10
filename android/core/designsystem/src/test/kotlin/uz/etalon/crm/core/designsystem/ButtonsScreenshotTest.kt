package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.components.Avatar
import uz.etalon.crm.core.designsystem.components.DangerButton
import uz.etalon.crm.core.designsystem.components.DarkButton
import uz.etalon.crm.core.designsystem.components.EtalonIconButton
import uz.etalon.crm.core.designsystem.components.InverseButton
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonTheme

/**
 * §2's buttons in one sheet, every state the spec names: the primary in its four forms, the
 * secondary and the danger button enabled and disabled, the icon button with and without its
 * badge dot, and the avatar on white and on an indigoPanel with its ring. The navy strip at the
 * bottom is the sticky pair of `2b-order-detail.png` — DarkButton and InverseButton only ever
 * appear there, so they are only legible against navy.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class ButtonsScreenshotTest {
    @get:Rule val rule = createComposeRule()

    @Test fun buttonsLight() {
        rule.setContent { EtalonTheme { ButtonSheet() } }
        rule.onRoot().captureRoboImage("screenshots/ds_buttons_light.png")
    }

    /** The pressed fills — indigoPressed under the primary, lavenderBg under the secondary — are
     *  only reachable by holding the finger down, so the press is never released. */
    @Test fun buttonsPressedLight() {
        rule.setContent { EtalonTheme { ButtonSheet() } }
        rule.onAllNodesWithText("Тасдиқлаш")[0].performTouchInput { down(center) }
        rule.onRoot().captureRoboImage("screenshots/ds_buttons_pressed_light.png")
    }
}

@Composable
private fun ButtonSheet() {
    Column(
        Modifier.fillMaxWidth().background(EtalonColors.page).padding(20.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        PrimaryButton("Тасдиқлаш", onClick = {})
        PrimaryButton("Тасдиқлаш", onClick = {}, enabled = false)
        PrimaryButton("Тасдиқлаш", onClick = {}, loading = true)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            PrimaryButton("Янги", onClick = {}, leadingIcon = EtalonIcons.Plus, compact = true)
            SecondaryButton("Барчаси", onClick = {}, compact = true)
        }
        SecondaryButton("Бекор қилиш", onClick = {})
        SecondaryButton("Бекор қилиш", onClick = {}, enabled = false)
        DangerButton("Ўчириш", onClick = {})
        DangerButton("Ўчириш", onClick = {}, enabled = false)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            EtalonIconButton(EtalonIcons.Bell, null, onClick = {}, badge = true)
            EtalonIconButton(EtalonIcons.Bell, null, onClick = {})
            EtalonIconButton(EtalonIcons.SlidersHorizontal, null, onClick = {}, shape = EtalonShapes.md, size = 36.dp)
            EtalonIconButton(EtalonIcons.Phone, null, onClick = {}, shape = EtalonShapes.md, badge = true, size = 36.dp)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("Tashkent Tower LLC", "Yusupov & Sons", "BuildPro Group", "Fergana Dom", "Каримов Акмал")
                .forEach { Avatar(it) }
        }
        Column(
            Modifier.fillMaxWidth().background(EtalonColors.navy, EtalonShapes.sheet).padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DarkButton("Рад этиш", onClick = {}, modifier = Modifier.weight(1f))
                InverseButton("Сақлаш", onClick = {}, modifier = Modifier.weight(1f))
            }
            Row(
                Modifier.fillMaxWidth().background(EtalonColors.indigoPanel, EtalonShapes.xxl).padding(14.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Avatar("Tashkent Tower LLC", onPanel = true)
                Avatar("Yusupov & Sons", onPanel = true)
                EtalonIconButton(EtalonIcons.Phone, null, onClick = {}, onDark = true, size = 36.dp)
                EtalonIconButton(EtalonIcons.Bell, null, onClick = {}, onDark = true, size = 36.dp, badge = true)
            }
        }
    }
}
