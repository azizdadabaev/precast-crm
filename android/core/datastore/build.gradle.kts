plugins { id("etalon.android.library"); id("etalon.hilt") }
android { namespace = "uz.etalon.crm.core.datastore" }
dependencies {
    implementation(project(":core:network"))
    implementation(libs.datastore.preferences)
    implementation(libs.security.crypto)
    implementation(libs.kotlinx.coroutines.android)
}
