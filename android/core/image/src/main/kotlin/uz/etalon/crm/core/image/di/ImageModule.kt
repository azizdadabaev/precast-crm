package uz.etalon.crm.core.image.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import uz.etalon.crm.core.image.AndroidImagePrep
import uz.etalon.crm.core.image.ImagePrep
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class ImageModule {
    @Binds @Singleton abstract fun imagePrep(impl: AndroidImagePrep): ImagePrep
}
