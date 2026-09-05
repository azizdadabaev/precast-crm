plugins { id("etalon.android.library"); id("etalon.hilt") }
android { namespace = "uz.etalon.crm.core.image" }
dependencies {
    implementation(libs.androidx.exifinterface)
    implementation(libs.kotlinx.coroutines.android)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.junit4)
    testRuntimeOnly(libs.junit.vintage.engine)
}
