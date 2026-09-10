package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.components.ConfirmSheet
import uz.etalon.crm.core.designsystem.components.ConfirmTile
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.EtalonToast
import uz.etalon.crm.core.designsystem.components.FormCard
import uz.etalon.crm.core.designsystem.components.FormField
import uz.etalon.crm.core.designsystem.components.FormFieldValue
import uz.etalon.crm.core.designsystem.components.OrderRow
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonSpace
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.ui.format.formatMoney

/**
 * The three components §2 still owed the system: the form surface, the confirm modal and the
 * toast. Compare the card against `2b-new-order-v1-wizard-SUPERSEDED.png` (the wizard is
 * superseded; its field stack is still the reference) and the sheet against `2b-payments.png`.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h891dp")
class FormCardScreenshotTest {
    @get:Rule val rule = createComposeRule()

    @Test fun formCardLight() {
        rule.setContent { EtalonTheme { FormCardSheet() } }
        rule.onRoot().captureRoboImage("screenshots/ds_form_card_light.png")
    }

    @Test fun confirmSheetLight() {
        rule.setContent { EtalonTheme { ConfirmSheetOverPage() } }
        rule.onRoot().captureRoboImage("screenshots/ds_confirm_sheet_light.png")
    }

    @Test fun toastLight() {
        rule.setContent { EtalonTheme { ToastOverPage() } }
        rule.onRoot().captureRoboImage("screenshots/ds_toast_light.png")
    }
}

/** The value slot, filled with plain text — the commonest case. */
@Composable
private fun FieldText(value: String, color: Color = EtalonColors.ink) =
    Text(value, style = FormFieldValue, color = color)

/**
 * Idle, filled and refused. The design system has no error skin of its own for a field: the value
 * is a slot, so the screen paints the offending line red and says why above the card — which is
 * how the rest of the system reports a refusal too ([ErrorBanner]).
 */
@Composable
private fun FormCardSheet() = Column(
    Modifier.fillMaxWidth().background(EtalonColors.page).padding(EtalonSpace.cardMargin),
    verticalArrangement = Arrangement.spacedBy(12.dp),
) {
    Caption("FormCard · бўш")
    FormCard {
        FormField("Мижоз номи") { FieldText("Karimov LLC", EtalonColors.ink3) }
        FormField("Телефон") { FieldText("+998 __ ___ __ __", EtalonColors.ink3) }
        FormField("Вилоят") { FieldText("Танланмаган", EtalonColors.ink3) }
        FormField("Манзил", divider = false) { FieldText("Туман, кўча, уй", EtalonColors.ink3) }
    }
    Caption("FormCard · тўлдирилган")
    FormCard {
        FormField("Мижоз номи") { FieldText("Yusupov & Sons") }
        FormField("Телефон") { FieldText("+998 90 111 22 33") }
        FormField("Вилоят") { FieldText("Тошкент") }
        FormField("Манзил", divider = false) { FieldText("Мирзо Улуғбек, Буюк ипак йўли 12") }
    }
    Caption("FormCard · хатолик")
    ErrorBanner("Телефон рақами нотўғри")
    FormCard {
        FormField("Мижоз номи") { FieldText("Yusupov & Sons") }
        FormField("Телефон", divider = false) { FieldText("+998 90 111", EtalonColors.red) }
    }
}

/** The modal over the queue it is opened from. */
@Composable
private fun ConfirmSheetOverPage() = Box(Modifier.fillMaxSize().background(EtalonColors.page)) {
    Column(Modifier.fillMaxWidth().padding(EtalonSpace.cardMargin)) {
        OrderRow(
            clientName = "Yusupov & Sons",
            status = OrderStatus.PLACED,
            metaLine = "№ 09−0003 · Нақд · Азиз Р.",
            total = Money.parse("12000000.00"),
            debt = Money.parse("9000000.00"),
            paidLabel = "тўланган",
            debtLabel = { "қолди ${formatMoney(it)}" },
            onDark = false,
            onClick = {},
        )
    }
    ConfirmSheet(
        caption = "Тўловни тасдиқлаш · № 09−0003",
        amount = Money.parse("3000000.00"),
        meta = "Нақд · Азиз Р. · 16 сен",
        tiles = { ConfirmTiles() },
        dismissText = "Рад этиш",
        confirmText = "Тасдиқлаш",
        onDismiss = {},
        onConfirm = {},
    )
}

@Composable
private fun RowScope.ConfirmTiles() {
    ConfirmTile("Буюртма жами", formatMoney(Money.parse("12000000.00")), Modifier.weight(1f))
    ConfirmTile("Тасдиқдан кейин қолади", formatMoney(Money.parse("6000000.00")), Modifier.weight(1f))
}

@Composable
private fun ToastOverPage() = Box(Modifier.fillMaxSize().background(EtalonColors.page)) {
    EtalonToast("Тўлов тасдиқланди", visible = true, modifier = Modifier.align(Alignment.BottomCenter))
}

@Composable
private fun Caption(text: String) = Text(text, style = EtalonType.caption, color = EtalonColors.ink2)
