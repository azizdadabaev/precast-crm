plugins { id("etalon.android.library"); id("etalon.android.compose"); alias(libs.plugins.roborazzi) }
android { namespace = "uz.etalon.crm.core.designsystem" }
dependencies {
    implementation(project(":core:model"))
    implementation(project(":core:ui"))
    implementation(libs.compose.material.icons)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    // Component baselines live beside the components (see core/designsystem/screenshots/), so the
    // reviewer can reject one part without opening a screen. JUnit 4 via the vintage engine, the
    // same shape :feature:payments uses.
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    testRuntimeOnly(libs.junit.vintage.engine)
}
