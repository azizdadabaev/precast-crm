package uz.etalon.crm.feature.orders.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import uz.etalon.crm.feature.orders.list.MemoryOrdersOpenDayStore
import uz.etalon.crm.feature.orders.list.OrdersOpenDayStore
import javax.inject.Singleton

/**
 * This feature's one graph binding, the shape `OutboxModule` uses.
 *
 * `PrefsOrdersViewStore` needs none — it is a concrete `@Inject constructor` class the ViewModel
 * asks for by name, and the DataStore behind it is the singleton. [OrdersOpenDayStore] does: the
 * dashboard writes it from the shell and `OrdersListViewModel` reads it from its own entry's
 * ViewModelStore, so the two must be handed the SAME instance or the handover writes to one object
 * and reads from another. `@Singleton` on the binding is what says so.
 */
@Module
@InstallIn(SingletonComponent::class)
abstract class OrdersModule {
    @Binds @Singleton abstract fun openDayStore(impl: MemoryOrdersOpenDayStore): OrdersOpenDayStore
}
