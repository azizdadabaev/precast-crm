package uz.etalon.crm.core.ui.location

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.location.LocationManager
import android.os.CancellationSignal
import androidx.core.content.ContextCompat
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.suspendCancellableCoroutine
import uz.etalon.crm.core.model.LatLng
import uz.etalon.crm.core.ui.R
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

/**
 * The device's own position, no Play Services. Requesting the runtime permission is the
 * screen's job — via the same `rememberLauncherForActivityResult` pattern feature:capture's
 * `PhotoCapture` uses for the camera (see [uz.etalon.crm.feature.capture.isPermanentlyDenied])
 * — so [current] only ever runs once that permission is expected to already be granted; it
 * still re-checks defensively since a grant can be revoked from system settings while the app
 * is backgrounded, or `current()` could in principle be called before the screen's own check.
 *
 * FINE **or** COARSE counts as granted, and `DeliveryLocationScreen` gates on exactly the same
 * rule — the two must not disagree, or an operator who chose "Approximate" hits a dead button on a
 * permission that works. An approximate fix is accepted because the operator is at the address and
 * reviews the coordinates before saving; the screen says so when that is all it got.
 */
fun interface DeviceLocation {
    suspend fun current(): Result<LatLng>
}

@Singleton
class AndroidDeviceLocation @Inject constructor(
    @param:ApplicationContext private val context: Context,
) : DeviceLocation {
    override suspend fun current(): Result<LatLng> {
        val granted = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (!granted) return Result.failure(IllegalStateException(context.getString(R.string.location_permission_needed)))

        val manager = context.getSystemService(Context.LOCATION_SERVICE) as? LocationManager
            ?: return Result.failure(IllegalStateException(context.getString(R.string.location_failed)))

        return suspendCancellableCoroutine { cont ->
            val signal = CancellationSignal()
            cont.invokeOnCancellation { signal.cancel() }
            try {
                // FUSED_PROVIDER is a virtual provider always present from API 31 (minSdk here
                // is 36); getCurrentLocation carries its own ~30s internal timeout and calls
                // back with a null Location rather than hanging forever when a fix can't be
                // produced (location services off, no signal indoors, etc.).
                manager.getCurrentLocation(LocationManager.FUSED_PROVIDER, signal, context.mainExecutor) { location ->
                    if (!cont.isActive) return@getCurrentLocation
                    if (location != null) cont.resume(Result.success(LatLng(location.latitude, location.longitude)))
                    else cont.resume(Result.failure(IllegalStateException(context.getString(R.string.location_failed))))
                }
            } catch (e: SecurityException) {
                if (cont.isActive) cont.resume(Result.failure(IllegalStateException(context.getString(R.string.location_permission_needed))))
            }
        }
    }
}

@Module
@InstallIn(SingletonComponent::class)
abstract class DeviceLocationModule {
    @Binds @Singleton abstract fun deviceLocation(impl: AndroidDeviceLocation): DeviceLocation
}
