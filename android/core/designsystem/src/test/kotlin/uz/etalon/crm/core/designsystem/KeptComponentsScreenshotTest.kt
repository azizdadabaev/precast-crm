package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.components.BrandMark
import uz.etalon.crm.core.designsystem.components.ChipTone
import uz.etalon.crm.core.designsystem.components.CountStepper
import uz.etalon.crm.core.designsystem.components.CustodyChain
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonTextField
import uz.etalon.crm.core.designsystem.components.NoticeBanner
import uz.etalon.crm.core.designsystem.components.NumericKeypad
import uz.etalon.crm.core.designsystem.components.OutboxBanner
import uz.etalon.crm.core.designsystem.components.PhotoStrip
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.RegionField
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.SectionLabel
import uz.etalon.crm.core.designsystem.components.StatusStripeCard
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.designsystem.components.toneColor
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.CustodyChain as CustodyChainModel

private val CHAIN = CustodyChainModel(
    collectedBy = "Азиз Раҳимов",
    recordedBy = "Дилноза Каримова",
    handedOverTo = "Жасур Тошматов",
    confirmedBy = "Каримов",
)

/**
 * The components the restyle kept, on one sheet, plus the one the calculator adds
 * ([EtalonTextField]): every one of them reads [EtalonColors] and [EtalonType] alone. A reviewer
 * can reject a tint, a radius or a weight here without opening a screen.
 *
 * `Lightbox`, `DriverPicker` and `RegionPickerSheet` are absent because each owns a `Dialog` or a
 * `ModalBottomSheet` and cannot be composed into a sheet like this — two full-screen scrims over
 * one page would photograph as one scrim. The two pickers have a capture each in
 * `PickerSheetsScreenshotTest`; what stands here is the field that opens them, [RegionField].
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h1900dp")
class KeptComponentsScreenshotTest {
    @get:Rule val rule = createComposeRule()

    @Test fun keptLight() {
        rule.setContent { EtalonTheme { KeptSheet() } }
        rule.onRoot().captureRoboImage("screenshots/ds_kept_light.png")
    }
}

@Composable
private fun KeptSheet() = Column(
    Modifier.fillMaxWidth().background(EtalonColors.page).padding(EtalonSpace.cardMargin),
    verticalArrangement = Arrangement.spacedBy(10.dp),
) {
    // Extracted from Home's app bar in this task. It stands first here for the same reason it
    // stands first on Home: a reviewer checks the gradient, the 14/800 wordmark and the tagline's
    // ink2 before anything else on the page.
    BrandMark()
    SectionLabel("Кутилаётган тўловлар")
    EmptyState("Буюртма йўқ.")
    ErrorBanner("Тармоққа уланиб бўлмади", onRetry = {})
    NoticeBanner("Сизда тасдиқлаш ҳуқуқи йўқ")
    OutboxBanner(pending = 2, failedMessage = null, onRetry = {}, onCancel = {})
    OutboxBanner(pending = 0, failedMessage = "Сервер расмни қабул қилмади", onRetry = {}, onCancel = {})
    StatusStripeCard(stripe = toneColor(ChipTone.SUCCESS)) {
        Text("StatusStripeCard", style = EtalonType.rowTitle, color = EtalonColors.ink)
        Text("оқ xl карта, ҳошия, 3 dp чизиқ", style = EtalonType.meta, color = EtalonColors.ink3)
    }
    CountStepper("Тўсин", value = 12, onChange = {}, max = 20)
    CountStepper("Ғишт", value = 0, onChange = {}, max = 0)
    CustodyChain(CHAIN)
    PhotoStrip(photos = emptyList(), onOpen = {}, onAdd = {})
    RegionField("Вилоят", "Тошкент", onOpen = {})
    // EtalonTextField: empty with its placeholder, filled, with the «+998 » prefix, in error with
    // its reason, and disabled — which is the same `page` fill at `ink3`, on purpose.
    // The focused state is not here — a blinking cursor is not a stable baseline,
    // and faking the focused border with a second colours object would photograph the fake rather
    // than the component. The indigo focus border is checked on the emulator instead.
    EtalonTextField(value = "", onValueChange = {}, placeholder = "Исм", modifier = Modifier.fillMaxWidth())
    EtalonTextField(value = "Азиз Раҳимов", onValueChange = {}, modifier = Modifier.fillMaxWidth())
    EtalonTextField(
        value = "90 481 33 30", onValueChange = {}, modifier = Modifier.fillMaxWidth(), prefix = "+998 ",
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
    )
    EtalonTextField(
        value = "12", onValueChange = {}, modifier = Modifier.fillMaxWidth(), isError = true,
        supportingText = "Телефон рақами тўлиқ эмас",
    )
    EtalonTextField(
        value = "Тошкент вилояти", onValueChange = {}, modifier = Modifier.fillMaxWidth(),
        enabled = false,
    )
    NumericKeypad(
        value = "4000000",
        suffix = "UZS",
        allowDecimal = false,
        confirmLabel = "Тасдиқлаш",
        onValue = {},
        onConfirm = {},
    )
    StickyActionBar {
        SecondaryButton("Бекор қилиш", onClick = {}, modifier = Modifier.weight(1f))
        PrimaryButton("Сақлаш", onClick = {}, modifier = Modifier.weight(1f))
    }
}
