plugins { id("etalon.android.library"); id("etalon.android.compose"); id("etalon.hilt"); alias(libs.plugins.roborazzi) }
android { namespace = "uz.etalon.crm.feature.payments" }
dependencies {
    implementation(project(":core:designsystem"))
    implementation(project(":core:model"))
    implementation(project(":core:ui"))
    implementation(project(":core:data"))
    implementation(project(":core:image"))
    implementation(project(":feature:capture"))
    // For DriverPicker only. A payment collected on site names the driver who took the cash, and
    // that picker already exists in :feature:logistics — a second copy here would be one more
    // place for the "no driver" row and the 48 dp rows to drift apart.
    implementation(project(":feature:logistics"))
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.hilt.navigation.compose)
    implementation(libs.compose.material.icons)
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    testRuntimeOnly(libs.junit.vintage.engine)
}
