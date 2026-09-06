package uz.etalon.crm

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import dagger.hilt.android.HiltAndroidApp
import okhttp3.OkHttpClient
import javax.inject.Inject
import javax.inject.Named

@HiltAndroidApp
class EtalonApp : Application(), Configuration.Provider, SingletonImageLoader.Factory {
    @Inject lateinit var workerFactory: HiltWorkerFactory

    /** The image client, which carries the operator's bearer token — see ImageAuthInterceptor. */
    @Inject @Named("imageOkHttp") lateinit var imageClient: dagger.Lazy<OkHttpClient>

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().setWorkerFactory(workerFactory).build()

    /**
     * Coil's default loader sends no credentials, so loaded/delivery photos — served from the same
     * origin as the API under /uploads — never rendered against a guarded server. Every AsyncImage
     * in the app resolves through this singleton, so binding the client here covers the photo strip,
     * the lightbox and the three capture screens at once.
     */
    override fun newImageLoader(context: PlatformContext): ImageLoader =
        ImageLoader.Builder(context)
            .components { add(OkHttpNetworkFetcherFactory(callFactory = { imageClient.get() })) }
            .build()
}
