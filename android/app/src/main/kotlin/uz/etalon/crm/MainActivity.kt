package uz.etalon.crm

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.rememberNavBackStack
import dagger.hilt.android.AndroidEntryPoint
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.nav.ChangePin
import uz.etalon.crm.nav.Key
import uz.etalon.crm.nav.Login
import uz.etalon.crm.nav.SignedInShell
import uz.etalon.crm.nav.SignedOutShell
import uz.etalon.crm.nav.startKeyFor

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private val vm: HiltMainViewModel by viewModels()

    /** etalon://order/{id} from a push notification. Consumed once, so a later sign-out and
     *  sign-in on the same activity does not re-open a stale order. */
    private var deepLinkOrderId: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        // The page is light only (D6); force dark status/nav-bar icons regardless of the
        // system's dark-mode setting, or SystemBarStyle.auto picks light icons there and they
        // vanish against our light page.
        val transparentBarStyle = SystemBarStyle.light(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT)
        enableEdgeToEdge(statusBarStyle = transparentBarStyle, navigationBarStyle = transparentBarStyle)
        super.onCreate(savedInstanceState)
        deepLinkOrderId = intent?.data?.takeIf { it.scheme == "etalon" && it.host == "order" }?.lastPathSegment
        setContent {
            EtalonTheme {
                val state by vm.state.collectAsStateWithLifecycle()
                when (val s = state) {
                    AppState.Booting -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                    // A successful login flips the state to SignedIn; the forced PIN change is the SignedIn start key below.
                    is AppState.SignedOut -> {
                        val bs = rememberNavBackStack(Login)
                        SignedOutShell(bs, hintRes = s.hintRes, onLoggedIn = vm::onSignedIn)
                    }
                    is AppState.SignedIn -> {
                        AskForNotificationPermission()
                        // Computed once: the LaunchedEffect below clears the deep link, and a
                        // recomputed start key must not be able to reset the back stack.
                        val start: Key = remember(s.me) {
                            if (s.me.mustChangePassword) ChangePin(forced = true) else startKeyFor(s.me, deepLinkOrderId)
                        }
                        val bs = rememberNavBackStack(start)
                        LaunchedEffect(Unit) { deepLinkOrderId = null }
                        SignedInShell(s.me, bs, onSignOut = vm::signOut, onPinChanged = vm::onPinChanged)
                    }
                }
            }
        }
    }
}

/** Asked once per signed-in composition, and only when it is not already granted. */
@Composable
private fun AskForNotificationPermission() {
    val context = LocalContext.current
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(Unit) {
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) ==
            PackageManager.PERMISSION_GRANTED
        if (!granted) launcher.launch(Manifest.permission.POST_NOTIFICATIONS)
    }
}
