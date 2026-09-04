package uz.etalon.crm.core.datastore.di

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import uz.etalon.crm.core.datastore.KeystoreTokenStore
import uz.etalon.crm.core.datastore.StoreTokenProvider
import uz.etalon.crm.core.datastore.TokenStore
import uz.etalon.crm.core.network.TokenProvider
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class DataStoreModule {
    @Binds abstract fun tokenProvider(impl: StoreTokenProvider): TokenProvider
    companion object {
        @Provides @Singleton fun tokenStore(@ApplicationContext ctx: Context): TokenStore = KeystoreTokenStore(ctx)
    }
}
