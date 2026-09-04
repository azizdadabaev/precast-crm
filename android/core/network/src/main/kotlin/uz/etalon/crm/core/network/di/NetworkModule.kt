package uz.etalon.crm.core.network.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import uz.etalon.crm.core.network.*
import java.util.concurrent.TimeUnit
import javax.inject.Named
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides @Singleton fun json(): Json = EtalonJson.create()

    @Provides @Singleton fun okHttp(json: Json, tokens: TokenProvider): OkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).writeTimeout(60, TimeUnit.SECONDS)
            // EnvelopeInterceptor must be added first (outer) and AuthInterceptor
            // second (inner): AuthInterceptor still adds the header on the way
            // down, but on the way back it sees the raw 401 response BEFORE
            // EnvelopeInterceptor turns a {ok:false} 401 body into a thrown
            // ApiException. If the order were reversed, that throw would
            // propagate out of chain.proceed() and onUnauthorized() would
            // never run -- see InterceptorChainTest.
            .addInterceptor(EnvelopeInterceptor(json))
            .addInterceptor(AuthInterceptor(tokens))
            .addInterceptor(HttpLoggingInterceptor().apply { level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE })
            .build()

    @Provides @Singleton fun retrofit(client: OkHttpClient, json: Json, @Named("apiBaseUrl") base: String): Retrofit =
        Retrofit.Builder().baseUrl(base.trimEnd('/') + "/").client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType())).build()

    @Provides @Singleton fun api(retrofit: Retrofit): EtalonApi = retrofit.create(EtalonApi::class.java)
}
