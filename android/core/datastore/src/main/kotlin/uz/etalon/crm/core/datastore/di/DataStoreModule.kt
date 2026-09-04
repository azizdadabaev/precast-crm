package uz.etalon.crm.core.datastore.di

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import uz.etalon.crm.core.datastore.KeystoreTokenStore
import uz.etalon.crm.core.datastore.StoreTokenProvider
import uz.etalon.crm.core.datastore.TokenStore
import uz.etalon.crm.core.datastore.sessionDataStore
import uz.etalon.crm.core.network.TokenProvider
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class DataStoreModule {
    @Binds abstract fun tokenProvider(impl: StoreTokenProvider): TokenProvider
    companion object {
        @Provides @Singleton fun tokenStore(@ApplicationContext ctx: Context): TokenStore = KeystoreTokenStore(ctx)

        /** SessionPrefs takes the store itself (not a Context) so its read-failure fallback is
         *  testable on the JVM without Robolectric. */
        @Provides @Singleton fun sessionDataStore(@ApplicationContext ctx: Context): DataStore<Preferences> = ctx.sessionDataStore
    }
}
