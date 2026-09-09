plugins { id("etalon.android.library"); id("etalon.hilt"); alias(libs.plugins.kotlin.serialization) }
android { namespace = "uz.etalon.crm.core.data" }
dependencies {
    api(project(":core:model")); implementation(project(":core:network")); implementation(project(":core:database")); implementation(project(":core:datastore")); api(project(":core:image"))
    // CalculatorRepository's public signatures return/take CalculatorDraft (a List<SlabRow>), so
    // this is `api` — the same rule :core:calc's own build.gradle.kts states for Boundary.kt's
    // Money exposure: a dependency that leaks into this module's public API must not be
    // `implementation`, or a consumer resolving that type off its own classpath is left guessing.
    api(project(":core:calc"))
    implementation(libs.kotlinx.serialization.json); implementation(libs.kotlinx.coroutines.android)
    // Room runtime comes transitively via :core:database's `api(libs.room.runtime)` — needed to
    // compile against EtalonDatabase (extends RoomDatabase) for SessionRepository's db.wipe().
    testImplementation(libs.robolectric); testImplementation(libs.androidx.test.core); testImplementation(libs.room.testing)
    testImplementation(libs.datastore.preferences); testImplementation(libs.okhttp)
    // FakeEtalonApi — the one EtalonApi double. Widening that interface used to break every
    // hand-written copy in every module; now it costs one member in :core:testing.
    testImplementation(project(":core:testing"))
    testRuntimeOnly(libs.junit.vintage.engine)
}
