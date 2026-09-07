plugins { id("etalon.android.library"); id("etalon.android.compose"); id("etalon.hilt") }
android { namespace = "uz.etalon.crm.feature.clients" }
dependencies {
    implementation(project(":core:designsystem"))
    implementation(project(":core:model"))
    implementation(project(":core:ui"))
    implementation(project(":core:data"))
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.hilt.navigation.compose)
    implementation(libs.compose.material.icons)
    // Tests only: ApiException is how a real 409 reaches toAppError, and the edit sheet has to
    // translate one of them (the phone-already-taken unique violation) into Uzbek itself.
    testImplementation(project(":core:network"))
}
