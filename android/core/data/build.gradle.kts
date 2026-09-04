plugins { id("etalon.android.library"); id("etalon.hilt"); alias(libs.plugins.kotlin.serialization) }
android { namespace = "uz.etalon.crm.core.data" }
dependencies {
    api(project(":core:model")); implementation(project(":core:network")); implementation(project(":core:database")); implementation(project(":core:datastore"))
    implementation(libs.kotlinx.serialization.json); implementation(libs.kotlinx.coroutines.android)
    implementation(libs.room.runtime) // EtalonDatabase (core:database, implementation-scoped Room) extends RoomDatabase; needed for SessionRepository's db.wipe()
}
