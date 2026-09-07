plugins { id("etalon.android.library"); id("etalon.hilt"); alias(libs.plugins.kotlin.serialization) }
android { namespace = "uz.etalon.crm.core.sync" }
dependencies {
    implementation(project(":core:data"))
    implementation(project(":core:database"))
    implementation(project(":core:model"))
    implementation(project(":core:network"))
    implementation(libs.work.runtime.ktx)
    implementation(libs.hilt.work)
    ksp(libs.hilt.androidx.compiler)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)

    // The drain loop (resetRunning ordering, retry-doesn't-block-newer-rows, requeue-at-end) is
    // exercised by constructing a real OutboxWorker via work-testing's TestListenableWorkerBuilder
    // against a real in-memory Room database, the same way :core:data/:core:database test their
    // DAOs and repositories.
    testImplementation(libs.work.testing)
    // FakeEtalonApi — see :core:data's own note.
    testImplementation(project(":core:testing"))
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.room.testing)
    testRuntimeOnly(libs.junit.vintage.engine)
}
