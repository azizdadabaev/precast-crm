package uz.etalon.crm.core.database.di

import android.content.Context
import androidx.room.Room
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import uz.etalon.crm.core.database.EtalonDatabase
import uz.etalon.crm.core.database.dao.OrdersDao
import uz.etalon.crm.core.database.dao.OutboxDao
import javax.inject.Singleton

@Module @InstallIn(SingletonComponent::class)
object DatabaseModule {
    @Provides @Singleton fun db(@ApplicationContext ctx: Context): EtalonDatabase =
        Room.databaseBuilder(ctx, EtalonDatabase::class.java, "etalon.db").fallbackToDestructiveMigration(dropAllTables = true).build()
    @Provides fun ordersDao(db: EtalonDatabase): OrdersDao = db.ordersDao()
    @Provides fun outboxDao(db: EtalonDatabase): OutboxDao = db.outboxDao()
}
