package uz.etalon.crm.push

import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await
import uz.etalon.crm.BuildConfig
import uz.etalon.crm.core.data.DeviceRepository
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PushRegistrar @Inject constructor(private val devices: DeviceRepository) {
    /** Registers the current FCM token with the server. Silent on failure: without a
     *  google-services.json there is no default FirebaseApp and getInstance() itself
     *  throws, so the whole lookup — not just the token task — sits inside runCatching. */
    suspend fun registerIfPossible() {
        val token = runCatching { FirebaseMessaging.getInstance().token.await() }.getOrNull() ?: return
        devices.register(token, BuildConfig.VERSION_NAME)
    }
}
