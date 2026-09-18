plugins { id("etalon.android.library"); id("etalon.hilt") }
android { namespace = "uz.etalon.crm.core.ui" }
dependencies {
    implementation(project(":core:model"))
    implementation(libs.kotlinx.coroutines.android)
}
