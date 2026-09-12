plugins { id("etalon.android.library"); id("etalon.android.compose"); id("etalon.hilt"); alias(libs.plugins.roborazzi) }
android { namespace = "uz.etalon.crm.feature.auth" }
dependencies {
    implementation(project(":core:designsystem")); implementation(project(":core:model")); implementation(project(":core:data")); implementation(project(":core:network")); implementation(project(":core:datastore"))
    implementation(libs.androidx.lifecycle.viewmodel.compose); implementation(libs.hilt.navigation.compose)
    testImplementation(libs.roborazzi); testImplementation(libs.roborazzi.compose)
    testImplementation(libs.robolectric); testImplementation(libs.androidx.test.core)
    testImplementation(platform(libs.compose.bom)); testImplementation(libs.compose.ui.test.junit4)
    testRuntimeOnly(libs.junit.vintage.engine)
}
