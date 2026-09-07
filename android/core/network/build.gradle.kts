plugins { id("etalon.android.library"); id("etalon.hilt"); alias(libs.plugins.kotlin.serialization) }
android { namespace = "uz.etalon.crm.core.network"; buildFeatures.buildConfig = true }
dependencies {
    implementation(project(":core:model"))
    implementation(libs.retrofit)
    implementation(libs.retrofit.kotlinx.serialization)
    implementation(libs.okhttp)
    implementation(libs.okhttp.logging)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    testImplementation(libs.okhttp.mockwebserver)
}

// ServerContractTest reads these two server sources and asserts that every field the DTOs in this
// module depend on is still there. Declaring them as task inputs is what makes that guard real:
// without it Gradle sees no changed input when only the server changes, calls the test task
// up-to-date, and the rename sails through — which is the exact failure the test exists to catch.
tasks.withType<Test>().configureEach {
    inputs.files(
        rootProject.file("../precast-crm/src/lib/dashboard-data.ts"),
        rootProject.file("../precast-crm/prisma/schema.prisma"),
    ).withPropertyName("serverContractSources").withPathSensitivity(PathSensitivity.RELATIVE)
}
