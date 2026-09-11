plugins { id("etalon.android.library"); id("etalon.android.compose"); id("etalon.hilt"); alias(libs.plugins.roborazzi) }
android { namespace = "uz.etalon.crm.feature.home" }
dependencies {
    implementation(project(":core:designsystem"))
    implementation(project(":core:model"))
    implementation(project(":core:ui"))
    implementation(project(":core:data"))
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.hilt.navigation.compose)
    implementation(libs.compose.material.icons)
    // Tests only: ApiException is how a real 403 reaches toAppError — Home must tell a withdrawn
    // dashboard permission apart from a network drop (silent absence vs. a retry-capable banner).
    testImplementation(project(":core:network"))
    // Home's baseline lives in feature/home/screenshots/ — same shape as :feature:orders.
    testImplementation(libs.roborazzi); testImplementation(libs.roborazzi.compose)
    testImplementation(libs.robolectric); testImplementation(libs.androidx.test.core)
    testImplementation(platform(libs.compose.bom)); testImplementation(libs.compose.ui.test.junit4)
    testRuntimeOnly(libs.junit.vintage.engine)
}
