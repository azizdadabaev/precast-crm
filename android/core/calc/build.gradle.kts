plugins { id("etalon.android.library") }
android { namespace = "uz.etalon.crm.core.calc" }
dependencies {
    // Boundary.kt is the only file in this module that touches Money — RoomMoney/ProjectMoney
    // expose it in their public signatures, so this is `api`, not `implementation`.
    api(project(":core:model"))

    // Test-only: GoldenVectors decodes docs/api/calc-golden.json to replay the TS engine's
    // recorded outputs against this Kotlin port. This module has no serialization at runtime.
    testImplementation(libs.kotlinx.serialization.json)
}

// GoldenVectors reads docs/api/calc-golden.json and docs/api/gazoblok-golden.json — the vectors
// the server exports from the real calculation-engine.ts / gazoblok-engine.ts. Declaring both as
// Test task inputs is what makes Gradle re-run this suite when the server regenerates either
// file; without it, a parity break sails through as "up to date", which is the exact failure
// ServerContractTest's own input declaration (:core:network) exists to avoid for its own sources.
tasks.withType<Test>().configureEach {
    inputs.files(rootProject.file("../docs/api/calc-golden.json"))
        .withPropertyName("goldenVectors").withPathSensitivity(PathSensitivity.RELATIVE)
    inputs.files(rootProject.file("../docs/api/gazoblok-golden.json"))
        .withPropertyName("gazoblokGoldenVectors").withPathSensitivity(PathSensitivity.RELATIVE)
}
