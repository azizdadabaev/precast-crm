plugins { id("etalon.android.library"); id("etalon.android.compose"); id("etalon.hilt"); alias(libs.plugins.roborazzi) }
android { namespace = "uz.etalon.crm.feature.orders" }
dependencies {
    implementation(project(":core:designsystem")); implementation(project(":core:model")); implementation(project(":core:ui")); implementation(project(":core:data"))
    implementation(libs.androidx.lifecycle.viewmodel.compose); implementation(libs.hilt.navigation.compose); implementation(libs.compose.material.icons)
    implementation(libs.coil.compose); implementation(libs.coil.network.okhttp)
    testImplementation(libs.roborazzi); testImplementation(libs.roborazzi.compose)
    testImplementation(libs.robolectric); testImplementation(libs.androidx.test.core)
    testImplementation(platform(libs.compose.bom)); testImplementation(libs.compose.ui.test.junit4)
    testRuntimeOnly(libs.junit.vintage.engine)
}
