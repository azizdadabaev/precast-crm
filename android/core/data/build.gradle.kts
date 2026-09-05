plugins { id("etalon.android.library"); id("etalon.hilt"); alias(libs.plugins.kotlin.serialization) }
android { namespace = "uz.etalon.crm.core.data" }
dependencies {
    api(project(":core:model")); implementation(project(":core:network")); implementation(project(":core:database")); implementation(project(":core:datastore"))
    implementation(libs.kotlinx.serialization.json); implementation(libs.kotlinx.coroutines.android)
    // Room runtime comes transitively via :core:database's `api(libs.room.runtime)` — needed to
    // compile against EtalonDatabase (extends RoomDatabase) for SessionRepository's db.wipe().
    testImplementation(libs.robolectric); testImplementation(libs.androidx.test.core); testImplementation(libs.room.testing)
    testImplementation(libs.datastore.preferences)
    testRuntimeOnly(libs.junit.vintage.engine)
}
