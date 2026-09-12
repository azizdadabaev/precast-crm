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
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Assert.assertEquals
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
import uz.etalon.crm.core.designsystem.components.TonalButton
import uz.etalon.crm.core.designsystem.icon.EtalonIcons
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonTheme

/**
 * §2's buttons in one sheet, every state the spec names: the primary enabled, disabled and
 * loading — the last two must not look alike — the secondary and the danger button enabled and
 * disabled, the tonal pill in both of its grounds, the icon button with and without its badge dot,
 * and the avatar on white and on an indigoPanel with its ring. The navy strip at the bottom is §2's
 * ConfirmSheet footer — the DarkButton / InverseButton pair only ever appears there, so it is only
 * legible against navy. The badged bell inside that strip is what pins the badge's ring white
 * rather than letting it sample the button underneath.
 *
 * The frame is 1000 dp tall rather than a phone's 891: the sheet is a catalogue, not a screen, and
 * a button that falls off the bottom is a button no reviewer checks.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h1000dp")
class ButtonsScreenshotTest {
    @get:Rule val rule = createComposeRule()

    @Test fun buttonsLight() {
        rule.setContent { EtalonTheme { ButtonSheet() } }
        rule.onRoot().captureRoboImage("screenshots/ds_buttons_light.png")
    }

    /**
     * Every pressed fill the system has, all held at once: indigoPressed under the primary,
     * lavenderBg under the secondary and the inverse, navy under the dark one, and red again
     * under the danger button — which is the point of pressing all five rather than one. A press
     * is only reachable while the finger is down, so none of these is ever released.
     *
     * Each `down` takes its own pointer id: the touch dispatcher is shared across the tree, and a
     * second pointer 0 while the first is still down is an error, not a second press.
     */
    @Test fun buttonsPressedLight() {
        rule.setContent { EtalonTheme { ButtonSheet() } }
        listOf("Тасдиқлаш", "Бекор қилиш", "Ўчириш", "Рад этиш", "Сақлаш")
            .forEachIndexed { pointer, label ->
                rule.onAllNodesWithText(label)[0].performTouchInput { down(pointer, center) }
            }
        rule.onRoot().captureRoboImage("screenshots/ds_buttons_pressed_light.png")
    }

    /**
     * The compact pill's geometry, in numbers rather than in a picture: 13 dp of side padding, a
     * 16 dp glyph and a 6 dp gap — 48 dp of chrome around whatever the label measures. At the
     * regular 18/18/10 it was 64 dp, and «+ Янги» left no room for the search field beside it on a
     * 360 dp phone.
     *
     * The **chrome** is what this component owns and what is asserted first; it is the same number
     * in any font. The whole pill is pinned second, and at 75 dp it is 5 dp wider than the 70 the
     * prototype draws — «Янги» measures 27 dp in the font Robolectric substitutes and 22 in the
     * design file's. Both nodes come from the same query: merged, `clickable` hands back the
     * button; unmerged, only the label carries the text.
     */
    @Test fun theCompactPillWrapsItsLabelInTheSpecifiedChrome() {
        rule.setContent {
            EtalonTheme {
                PrimaryButton("Янги", onClick = {}, leadingIcon = EtalonIcons.Plus, compact = true)
            }
        }
        val pill = rule.onNodeWithText("Янги").fetchSemanticsNode().size.width
        val label = rule.onNodeWithText("Янги", useUnmergedTree = true).fetchSemanticsNode().size.width
        assertEquals(48f, (pill - label) / rule.density.density, 1f)
        assertEquals(75f, pill / rule.density.density, 1f)
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
        // The tonal pill on the light page: the 32 dp offer §3.5 puts at the end of a payments row,
        // the same pill disabled, and the 48 dp form the single-action screens use.
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TonalButton("Кўриб чиқиш", onClick = {})
            TonalButton("Кўриб чиқиш", onClick = {}, enabled = false)
        }
        TonalButton("Кўриб чиқиш", onClick = {}, compact = false)
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
                // The icon-only pill and the same pill mid-save: the fill and the size do not move,
                // only the glyph becomes the spinner (see DarkButton's `loading`).
                DarkButton(onClick = {}, leadingIcon = EtalonIcons.Save)
                DarkButton(onClick = {}, loading = true, leadingIcon = EtalonIcons.Save)
                DarkButton("Рад этиш", onClick = {}, modifier = Modifier.weight(1f))
                InverseButton("Сақлаш", onClick = {}, modifier = Modifier.weight(1f))
            }
            // The tonal pill's navy ground: navy2 with lavender text. Beside the DarkButton above
            // it shares the fill and differs only in the label's colour, which is the point — one
            // is the quiet half of a decision, the other an offer.
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                TonalButton("Кўриб чиқиш", onClick = {}, onDark = true)
                TonalButton("Кўриб чиқиш", onClick = {}, enabled = false, onDark = true)
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
