plugins { id("etalon.android.library"); id("etalon.android.compose"); id("etalon.hilt"); alias(libs.plugins.roborazzi) }
android { namespace = "uz.etalon.crm.feature.clients" }
dependencies {
    implementation(project(":core:designsystem"))
    implementation(project(":core:model"))
    implementation(project(":core:ui"))
    implementation(project(":core:data"))
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.hilt.navigation.compose)
    // Tests only: ApiException is how a real 409 reaches toAppError, and the edit sheet has to
    // translate one of them (the phone-already-taken unique violation) into Uzbek itself.
    testImplementation(project(":core:network"))
    // The edit sheet's baseline lives in feature/clients/screenshots/ — same shape as :feature:orders.
    testImplementation(libs.roborazzi); testImplementation(libs.roborazzi.compose)
    testImplementation(libs.robolectric); testImplementation(libs.androidx.test.core)
    testImplementation(platform(libs.compose.bom)); testImplementation(libs.compose.ui.test.junit4)
    testRuntimeOnly(libs.junit.vintage.engine)
}
