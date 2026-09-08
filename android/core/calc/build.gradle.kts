plugins { id("etalon.android.library") }
android { namespace = "uz.etalon.crm.core.calc" }
dependencies {
    // Test-only: GoldenVectors decodes docs/api/calc-golden.json to replay the TS engine's
    // recorded outputs against this Kotlin port. This module has no serialization at runtime.
    testImplementation(libs.kotlinx.serialization.json)
}

// GoldenVectors reads docs/api/calc-golden.json — the vectors the server exports from the real
// calculation-engine.ts. Declaring it as a Test task input is what makes Gradle re-run this suite
// when the server regenerates the file; without it, a parity break sails through as "up to date",
// which is the exact failure ServerContractTest's own input declaration (:core:network) exists to
// avoid for its own sources.
tasks.withType<Test>().configureEach {
    inputs.files(rootProject.file("../docs/api/calc-golden.json"))
        .withPropertyName("goldenVectors").withPathSensitivity(PathSensitivity.RELATIVE)
}
