package uz.etalon.crm.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import uz.etalon.crm.BuildConfig
import uz.etalon.crm.core.data.OutboxScheduler
import javax.inject.Named
import javax.inject.Singleton

/** The base URL is a build-type value, so only :app can bind what :core:network asks for. */
@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides @Named("apiBaseUrl") fun apiBaseUrl(): String = BuildConfig.API_BASE_URL

    /**
     * Placeholder until Task 7 adds `:core:sync` and binds the real WorkManager-backed
     * `OutboxScheduler` there — replace this @Provides with that dependency then; leaving both
     * bound at once is a duplicate-binding compile error, which is the signal to remove this one.
     * It exists at all because `EtalonMessagingService` already injects `SessionRepository`,
     * which (this fix round) now depends on `OutboxRepository` to guard sign-out against a race;
     * without *some* `OutboxScheduler` binding reachable from `:app`, the whole app fails to
     * build. `schedule()` is a no-op: nothing calls `OutboxRepository.enqueue` outside tests yet,
     * so no real upload is silently dropped by this stand-in.
     */
    @Provides @Singleton fun outboxScheduler(): OutboxScheduler = object : OutboxScheduler {
        override fun schedule(id: String) { /* no-op until Task 7 wires WorkManager here */ }
    }
}
