import org.gradle.api.tasks.PathSensitivity
import org.gradle.api.tasks.testing.Test

plugins { id("etalon.android.library"); id("etalon.android.compose"); alias(libs.plugins.roborazzi) }
android { namespace = "uz.etalon.crm.core.designsystem" }
dependencies {
    implementation(project(":core:model"))
    implementation(project(":core:ui"))
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    // Component baselines live beside the components (see core/designsystem/screenshots/), so the
    // reviewer can reject one part without opening a screen. JUnit 4 via the vintage engine, the
    // same shape :feature:payments uses.
    // The calendar's September fixture — one month, shared with :feature:orders (and later the
    // calculator), so two modules cannot photograph two different Septembers.
    testImplementation(project(":core:testing"))
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    testRuntimeOnly(libs.junit.vintage.engine)
}

// `NoRawHexTest` scans every module's `src/main`, but Gradle only knew about THIS module's
// sources — so a raw hex planted in a feature module passed a warm build and only ever failed
// from cold. Declaring the scanned files as inputs is what makes the lint run when the files it
// actually reads have changed. Nothing writes into `src/main` during a build, so there is no
// input/output thrash here — which is exactly why `screenshots/` is NOT declared the same way.
//
// One tree per module rather than one tree over the whole checkout: a tree rooted at the root
// directory contains every module's `build/`, and Gradle then reports an implicit dependency on
// every task that writes into one.
val hexLintSources = rootProject.allprojects
    .map { File(it.projectDir, "src/main") }
    .filter { it.isDirectory }
    .map { dir -> project.fileTree(dir) { include("**/*.kt") } }

tasks.withType<Test>().configureEach {
    inputs.files(hexLintSources)
        .withPathSensitivity(PathSensitivity.RELATIVE)
        .withPropertyName("hexLintSources")
}
