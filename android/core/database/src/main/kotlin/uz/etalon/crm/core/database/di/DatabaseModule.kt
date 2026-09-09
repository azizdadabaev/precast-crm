package uz.etalon.crm.core.database.di

import android.content.Context
import androidx.room.Room
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import uz.etalon.crm.core.database.ALL_MIGRATIONS
import uz.etalon.crm.core.database.EtalonDatabase
import uz.etalon.crm.core.database.dao.CalculatorDraftDao
import uz.etalon.crm.core.database.dao.OrdersDao
import uz.etalon.crm.core.database.dao.OutboxDao
import javax.inject.Singleton

@Module @InstallIn(SingletonComponent::class)
object DatabaseModule {
    /**
     * No destructive fallback. This file holds the outbox, and the outbox is the only durable copy
     * of a photo the operator has already taken and of the cash they counted against it — see
     * [uz.etalon.crm.core.database.ALL_MIGRATIONS]. A version bump with no migration behind it now
     * fails when the database is opened, instead of silently deleting that work.
     */
    @Provides @Singleton fun db(@ApplicationContext ctx: Context): EtalonDatabase =
        Room.databaseBuilder(ctx, EtalonDatabase::class.java, "etalon.db")
            .addMigrations(*ALL_MIGRATIONS)
            .build()
    @Provides fun ordersDao(db: EtalonDatabase): OrdersDao = db.ordersDao()
    @Provides fun outboxDao(db: EtalonDatabase): OutboxDao = db.outboxDao()
    @Provides fun calculatorDraftDao(db: EtalonDatabase): CalculatorDraftDao = db.calculatorDraftDao()
}
