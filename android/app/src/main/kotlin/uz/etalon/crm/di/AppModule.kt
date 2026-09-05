package uz.etalon.crm.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import uz.etalon.crm.BuildConfig
import javax.inject.Named

/** The base URL is a build-type value, so only :app can bind what :core:network asks for. */
@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides @Named("apiBaseUrl") fun apiBaseUrl(): String = BuildConfig.API_BASE_URL

    // OutboxScheduler is now bound in :core:sync's SyncModule (WorkManagerOutboxScheduler) —
    // Task 7 replaced the no-op placeholder that used to live here.
}
