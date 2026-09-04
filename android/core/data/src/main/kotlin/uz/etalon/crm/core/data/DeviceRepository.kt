package uz.etalon.crm.core.data

import kotlinx.coroutines.flow.first
import uz.etalon.crm.core.datastore.SessionPrefs
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.DeviceRegisterRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DeviceRepository @Inject constructor(private val api: EtalonApi, private val prefs: SessionPrefs) {
    /** Best-effort; a failure is retried on the next app start or token refresh. */
    suspend fun register(fcmToken: String, appVersion: String): Result<Unit> = runCatchingCancellable {
        api.registerDevice(DeviceRegisterRequest(fcmToken = fcmToken, appVersion = appVersion))
        prefs.setFcmToken(fcmToken)
    }
    suspend fun unregisterCurrent(): Result<Unit> = runCatchingCancellable {
        val t = prefs.fcmToken.first() ?: return@runCatchingCancellable
        api.unregisterDevice(t)
        prefs.setFcmToken(null)
    }
}
