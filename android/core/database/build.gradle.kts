plugins { id("etalon.android.library"); id("etalon.hilt") }
android { namespace = "uz.etalon.crm.core.database" }
dependencies {
    api(libs.room.runtime); implementation(libs.room.ktx); ksp(libs.room.compiler)
    testImplementation(libs.robolectric); testImplementation(libs.androidx.test.core); testImplementation(libs.room.testing)
    testRuntimeOnly(libs.junit.vintage.engine)
}
