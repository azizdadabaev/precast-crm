package uz.etalon.crm

import android.Manifest
import android.content.pm.PackageManager
import android.os.Bundle
import androidx.activity.ComponentActivity
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
import uz.etalon.crm.nav.OrderDetail
import uz.etalon.crm.nav.Orders
import uz.etalon.crm.nav.SignedInShell
import uz.etalon.crm.nav.SignedOutShell

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private val vm: MainViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        // etalon://order/{id} from a push notification.
        val deepLinkOrderId = intent?.data?.takeIf { it.scheme == "etalon" && it.host == "order" }?.lastPathSegment
        setContent {
            EtalonTheme {
                val state by vm.state.collectAsStateWithLifecycle()
                when (val s = state) {
                    AppState.Booting -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                    // A successful login flips the state to SignedIn; the forced PIN change is the SignedIn start key below.
                    AppState.SignedOut -> {
                        val bs = rememberNavBackStack(Login)
                        SignedOutShell(bs, onLoggedIn = vm::onSignedIn)
                    }
                    is AppState.SignedIn -> {
                        AskForNotificationPermission()
                        val start: Key = when {
                            s.me.mustChangePassword -> ChangePin(forced = true)
                            deepLinkOrderId != null -> OrderDetail(deepLinkOrderId)
                            else -> Orders
                        }
                        val bs = rememberNavBackStack(start)
                        SignedInShell(s.me, bs, onSignOut = vm::signOut)
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
