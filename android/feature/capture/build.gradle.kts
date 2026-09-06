plugins { id("etalon.android.library"); id("etalon.android.compose") }
android { namespace = "uz.etalon.crm.feature.capture" }
dependencies {
    implementation(project(":core:designsystem"))
    implementation(project(":core:image"))
    implementation(libs.camera.core)
    implementation(libs.camera.camera2)
    implementation(libs.camera.lifecycle)
    implementation(libs.camera.view)
    implementation(libs.androidx.activity.compose)
    implementation(libs.compose.material.icons)
    implementation(libs.kotlinx.coroutines.android)
}
