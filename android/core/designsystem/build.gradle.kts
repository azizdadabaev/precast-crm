plugins { id("etalon.android.library"); id("etalon.android.compose") }
android { namespace = "uz.etalon.crm.core.designsystem" }
dependencies {
    implementation(project(":core:model"))
    implementation(project(":core:ui"))
    implementation(libs.compose.material.icons)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
}
