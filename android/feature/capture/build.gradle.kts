plugins { id("etalon.android.library"); id("etalon.android.compose"); alias(libs.plugins.roborazzi) }
android { namespace = "uz.etalon.crm.feature.capture" }
dependencies {
    implementation(project(":core:designsystem"))
    implementation(project(":core:image"))
    implementation(libs.camera.core)
    implementation(libs.camera.camera2)
    implementation(libs.camera.lifecycle)
    implementation(libs.camera.view)
    implementation(libs.androidx.activity.compose)
    implementation(libs.kotlinx.coroutines.android)
    // The viewfinder's own baselines. JUnit 4 via the vintage engine, the same shape
    // :feature:payments and :core:designsystem use.
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    testRuntimeOnly(libs.junit.vintage.engine)
}
