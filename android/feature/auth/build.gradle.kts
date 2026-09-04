plugins { id("etalon.android.library"); id("etalon.android.compose"); id("etalon.hilt") }
android { namespace = "uz.etalon.crm.feature.auth" }
dependencies {
    implementation(project(":core:designsystem")); implementation(project(":core:model")); implementation(project(":core:data")); implementation(project(":core:network")); implementation(project(":core:datastore"))
    implementation(libs.androidx.lifecycle.viewmodel.compose); implementation(libs.hilt.navigation.compose); implementation(libs.compose.material.icons)
}
