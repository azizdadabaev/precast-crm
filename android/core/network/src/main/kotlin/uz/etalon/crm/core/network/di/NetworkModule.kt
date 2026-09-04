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
    @Provides @Singleton fun json(): Json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }

    @Provides @Singleton fun okHttp(json: Json, tokens: TokenProvider): OkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).writeTimeout(60, TimeUnit.SECONDS)
            .addInterceptor(AuthInterceptor(tokens))
            .addInterceptor(EnvelopeInterceptor(json))
            .addInterceptor(HttpLoggingInterceptor().apply { level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE })
            .build()

    @Provides @Singleton fun retrofit(client: OkHttpClient, json: Json, @Named("apiBaseUrl") base: String): Retrofit =
        Retrofit.Builder().baseUrl(base.trimEnd('/') + "/").client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType())).build()

    @Provides @Singleton fun api(retrofit: Retrofit): EtalonApi = retrofit.create(EtalonApi::class.java)
}
