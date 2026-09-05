package uz.etalon.crm.core.sync.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import uz.etalon.crm.core.data.OutboxScheduler
import uz.etalon.crm.core.sync.WorkManagerOutboxScheduler
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class SyncModule {
    @Binds @Singleton abstract fun outboxScheduler(impl: WorkManagerOutboxScheduler): OutboxScheduler
}
