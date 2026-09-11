package uz.etalon.crm.feature.clients

import androidx.compose.ui.test.junit4.createComposeRule
import com.github.takahirom.roborazzi.captureScreenRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.ClientCreated
import uz.etalon.crm.core.model.ClientDetail
import uz.etalon.crm.feature.clients.edit.ClientCreateUseCase
import uz.etalon.crm.feature.clients.edit.ClientEditPermissionUseCase
import uz.etalon.crm.feature.clients.edit.ClientEditSheet
import uz.etalon.crm.feature.clients.edit.ClientEditViewModel
import uz.etalon.crm.feature.clients.edit.ClientUpdateUseCase

/**
 * The sheet had **no baseline at all**, which is how its two [RegionField]s came to sit between
 * four bordered `OutlinedTextField`s looking like static text: nobody could see them side by side.
 * This is that picture. The capture is a whole-screen one because the sheet is a
 * `ModalBottomSheet` and lives in a window of its own.
 *
 * The ViewModel is the plain [ClientEditViewModel] built from lambdas, the same way
 * `ClientEditViewModelTest` builds it — no Hilt, no repository, no network.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class ClientEditScreenshotTest {
    @get:Rule val rule = createComposeRule()

    private val client = ClientDetail(
        id = "c1",
        name = "Навоий Build",
        phone = "998901112233",
        address = "Тошкент вилояти, Зангиота тумани, Бобур кўчаси 14",
        notes = null,
        orders = emptyList(),
    )

    private fun viewModel() = ClientEditViewModel(
        create = ClientCreateUseCase { Result.success(ClientCreated("c1", "Навоий Build", false)) },
        update = ClientUpdateUseCase { _, _ -> Result.success(Unit) },
        permissions = ClientEditPermissionUseCase { true },
    )

    private fun shoot(name: String) {
        rule.setContent {
            EtalonTheme {
                ClientEditSheet(
                    client = client,
                    isOffline = false,
                    onDismiss = {},
                    onSaved = {},
                    vm = viewModel(),
                )
            }
        }
        captureScreenRoboImage("screenshots/client_edit_$name.png")
    }

    @Test @Config(qualifiers = "w411dp-h891dp") fun light() = shoot("light")
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun largeFont() = shoot("font13")
}
