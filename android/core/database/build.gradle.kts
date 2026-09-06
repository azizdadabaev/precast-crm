plugins { id("etalon.android.library"); id("etalon.hilt") }
android { namespace = "uz.etalon.crm.core.database" }

// Room's exported schema JSON is a committed build artifact, like docs/api/openapi.json on the web
// side: EtalonDatabaseMigrationTest builds a database at an OLD version from it. Room's
// MigrationTestHelper loads that schema out of the assets folder named after the database class, so
// the export goes straight into src/main/assets rather than a separate directory that would then
// have to be wired in as a second asset source.
ksp { arg("room.schemaLocation", layout.projectDirectory.dir("src/main/assets").asFile.path) }

dependencies {
    api(libs.room.runtime); implementation(libs.room.ktx); ksp(libs.room.compiler)
    testImplementation(libs.robolectric); testImplementation(libs.androidx.test.core); testImplementation(libs.room.testing)
    testRuntimeOnly(libs.junit.vintage.engine)
}
