package uz.etalon.crm.core.data.di

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import uz.etalon.crm.core.data.CurrentUser
import uz.etalon.crm.core.data.OrdersGateway
import uz.etalon.crm.core.data.OrdersRepository
import uz.etalon.crm.core.data.OutboxGateway
import uz.etalon.crm.core.data.OutboxRepository
import uz.etalon.crm.core.data.PermissionGate
import uz.etalon.crm.core.data.SessionCurrentUser
import uz.etalon.crm.core.data.SessionPricing
import uz.etalon.crm.core.data.SessionRepository
import java.io.File
import javax.inject.Named
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class OutboxModule {
    @Binds @Singleton abstract fun outboxGateway(impl: OutboxRepository): OutboxGateway
    @Binds @Singleton abstract fun ordersGateway(impl: OrdersRepository): OrdersGateway

    /** Reads the persisted session identity rather than SessionRepository, which would close a
     *  dependency cycle (SessionRepository -> OutboxRepository -> CurrentUser). */
    @Binds @Singleton abstract fun currentUser(impl: SessionCurrentUser): CurrentUser

    /** Same persisted identity, read for its permission set — see [PermissionGate]. */
    @Binds @Singleton abstract fun permissionGate(impl: SessionCurrentUser): PermissionGate

    /** `:feature:calculator`'s narrow view of the session — see [SessionPricing]. */
    @Binds @Singleton abstract fun sessionPricing(impl: SessionRepository): SessionPricing

    companion object {
        @Provides @Singleton @Named("outboxDir")
        fun outboxDir(@ApplicationContext ctx: Context): File = File(ctx.filesDir, "outbox")
    }
}
