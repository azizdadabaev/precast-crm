# Android Phase 1a — Foundation, Auth, Orders (read) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the Android app's foundation so a staff member can install a build, log in with name + PIN, land on a role-derived shell, browse the orders list and an order's detail from a Room cache that refreshes from the live API, and have the phone registered for push. This is the first executable slice of spec Phase 1; the camera flows, payments, clients and home are follow-up slices (1b–1d).

**Architecture:** Multi-module Gradle project under `android/` in this repo. `:core:*` modules hold theme, model, network (Retrofit + OkHttp + kotlinx.serialization, an envelope call adapter, an auth interceptor), Room database, DataStore, and repositories exposing `Flow<Resource<T>>`. `:feature:auth` and `:feature:orders` are Compose screens driven by Hilt ViewModels holding `StateFlow` UI state. `:app` owns the single Activity, Navigation 3 back stack, the adaptive navigation suite, and the FCM service. No business logic lives in composables.

**Tech Stack:** Kotlin 2.x · Jetpack Compose + Material 3 (+ `material3-adaptive-navigation-suite`) · Navigation 3 · Hilt · Retrofit 3 + OkHttp 5 + kotlinx.serialization · Room (KSP) · DataStore · Coil 3 · Firebase Messaging · JUnit 5 + Turbine + MockWebServer · Compose UI test · Roborazzi.

**Spec:** `docs/superpowers/specs/2026-09-02-android-app-architecture-design.md` (§3.3 module graph, §3.4 stack, §4 cross-cutting, §5.1 shell, §5.3 orders, §6 design system). **Server prerequisite:** `docs/superpowers/plans/2026-09-02-android-phase0-server-enablement.md` must be deployed (Bearer auth, `client:"android"`, `/api/mobile/bootstrap`, `/api/devices`). The committed contract is `docs/api/openapi.json`.

## Global Constraints

- **Toolchain:** Android Studio (latest stable), JDK 17, Android SDK Platform 36, `compileSdk = 36`, `targetSdk = 36`, **`minSdk = 36`** (spec D1, owner-confirmed; it is one line in `android/build-logic/…/AndroidConfig.kt` if revisited). Kotlin 2.x with the Compose compiler Gradle plugin. Take the latest stable of every library at kickoff and pin it in `gradle/libs.versions.toml`.
- **Language:** every user-visible string is **Uzbek Cyrillic** in `res/values/strings.xml` (the default locale). No hard-coded strings in composables. Code identifiers in English.
- **Money:** `Money` is a value class over `BigDecimal` parsed from the server's string. Never `Double` for money. Display with a space thousands separator, comma decimal, `UZS` suffix, tabular mono digits.
- **Theme:** `EtalonTheme` only; every colour from `EtalonColors`/`MaterialTheme.colorScheme`; light and dark both required; dynamic colour off.
- **Network:** every request goes through `:core:network`. `Authorization: Bearer` from the token store. Envelope `{ok,data}` unwrapped by the call adapter; `{ok:false}` on any status throws `ApiException`. Media URLs made absolute by `MediaUrl.absolute()`. `Cache-Control` respected as the server sends it (`no-store`).
- **Offline:** screens render cached Room data first; a blank spinner only when the cache is empty.
- **Tests:** JVM unit tests in `src/test` (JUnit 5, Turbine, MockWebServer); Compose UI tests in `src/androidTest` only where a JVM test cannot express the behaviour. Run: `./gradlew :module:testDebugUnitTest`. Everything must pass before commit.
- **Commits:** from the repo root, imperative style `Feat(android) · …`, trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Never commit `local.properties`, keystores, or `google-services.json` (it is public by design but is environment-specific; it lives in `android/app/` ignored by git and is injected by CI).
- **API base URL** comes from `BuildConfig.API_BASE_URL`: debug `http://10.0.2.2:3000` (emulator → local Next.js), release `https://etalontbm.uz`.

---

## File map

```
android/
  settings.gradle.kts · build.gradle.kts · gradle.properties · gradle/libs.versions.toml
  build-logic/convention/            ← Gradle convention plugins (android library, compose, hilt)
  app/                               ← MainActivity, EtalonApp (Hilt), nav host, shell, FCM service
  core/designsystem/                 ← EtalonColors, EtalonTypography, EtalonTheme, StatusChip, MoneyText, …
  core/model/                        ← Money, OrderStatus, PaymentState, Order, OrderSummary, Me, Permission
  core/ui/                           ← Formatters (money, area, phone, date), Resource, UiError
  core/network/                      ← EtalonApi (Retrofit), EnvelopeCallAdapter, AuthInterceptor, ApiException, DTOs
  core/datastore/                    ← TokenStore (Keystore-encrypted), SessionPrefs
  core/database/                     ← EtalonDatabase, OrderEntity, OrderDetailEntity, DAOs
  core/data/                         ← SessionRepository, OrdersRepository, DeviceRepository
  core/testing/                      ← FakeApi helpers, MainDispatcherExtension
  feature/auth/                      ← LoginScreen, LoginViewModel, ChangePinScreen
  feature/orders/                    ← OrdersListScreen/ViewModel, OrderDetailScreen/ViewModel
```

---

### Task 1: Gradle project skeleton with convention plugins

**Files:**
- Create: `android/settings.gradle.kts`, `android/build.gradle.kts`, `android/gradle.properties`, `android/gradle/libs.versions.toml`
- Create: `android/build-logic/settings.gradle.kts`, `android/build-logic/convention/build.gradle.kts`, `android/build-logic/convention/src/main/kotlin/AndroidLibraryConventionPlugin.kt`, `…/AndroidComposeConventionPlugin.kt`, `…/HiltConventionPlugin.kt`, `…/com/etalon/buildlogic/AndroidConfig.kt`
- Create: `android/app/build.gradle.kts`, `android/app/src/main/AndroidManifest.xml`, `android/app/src/main/kotlin/uz/etalon/crm/EtalonApp.kt`, `android/app/src/main/kotlin/uz/etalon/crm/MainActivity.kt`, `android/app/src/main/res/values/strings.xml`
- Create: `android/.gitignore`
- Test: the build itself (`./gradlew :app:assembleDebug`)

**Interfaces:**
- Produces: convention plugin ids `etalon.android.library`, `etalon.android.compose`, `etalon.hilt`; `AndroidConfig.MIN_SDK = 36`, `COMPILE_SDK = 36`, `TARGET_SDK = 36`; `BuildConfig.API_BASE_URL`; application id `uz.etalon.crm`.

- [ ] **Step 1: Version catalog `android/gradle/libs.versions.toml`**

Fill `[versions]` with the latest stable at kickoff (check each on Maven Central / Google Maven the day you start; the names below are the coordinates that must appear):

```toml
[versions]
agp = "<latest stable>"
kotlin = "<latest 2.x>"
ksp = "<matches kotlin>"
hilt = "<latest>"
composeBom = "<latest>"
navigation3 = "<latest>"
material3Adaptive = "<latest>"
retrofit = "<latest 3.x>"
okhttp = "<latest 5.x>"
kotlinxSerialization = "<latest>"
room = "<latest>"
datastore = "<latest>"
coil = "<latest 3.x>"
firebaseBom = "<latest>"
coroutines = "<latest>"
junit5 = "<latest>"
turbine = "<latest>"
roborazzi = "<latest>"
securityCrypto = "<latest stable>"

[libraries]
androidx-core-ktx = { module = "androidx.core:core-ktx", version = "<latest>" }
androidx-activity-compose = { module = "androidx.activity:activity-compose", version = "<latest>" }
androidx-lifecycle-runtime-compose = { module = "androidx.lifecycle:lifecycle-runtime-compose", version = "<latest>" }
androidx-lifecycle-viewmodel-compose = { module = "androidx.lifecycle:lifecycle-viewmodel-compose", version = "<latest>" }
compose-bom = { module = "androidx.compose:compose-bom", version.ref = "composeBom" }
compose-ui = { module = "androidx.compose.ui:ui" }
compose-ui-tooling = { module = "androidx.compose.ui:ui-tooling" }
compose-ui-tooling-preview = { module = "androidx.compose.ui:ui-tooling-preview" }
compose-material3 = { module = "androidx.compose.material3:material3" }
compose-material3-adaptive = { module = "androidx.compose.material3.adaptive:adaptive", version.ref = "material3Adaptive" }
compose-material3-adaptive-navigation-suite = { module = "androidx.compose.material3:material3-adaptive-navigation-suite" }
compose-material-icons = { module = "androidx.compose.material:material-icons-extended" }
compose-ui-test-junit4 = { module = "androidx.compose.ui:ui-test-junit4" }
compose-ui-test-manifest = { module = "androidx.compose.ui:ui-test-manifest" }
navigation3-runtime = { module = "androidx.navigation3:navigation3-runtime", version.ref = "navigation3" }
navigation3-ui = { module = "androidx.navigation3:navigation3-ui", version.ref = "navigation3" }
hilt-android = { module = "com.google.dagger:hilt-android", version.ref = "hilt" }
hilt-compiler = { module = "com.google.dagger:hilt-android-compiler", version.ref = "hilt" }
hilt-navigation-compose = { module = "androidx.hilt:hilt-navigation-compose", version = "<latest>" }
retrofit = { module = "com.squareup.retrofit2:retrofit", version.ref = "retrofit" }
retrofit-kotlinx-serialization = { module = "com.squareup.retrofit2:converter-kotlinx-serialization", version.ref = "retrofit" }
okhttp = { module = "com.squareup.okhttp3:okhttp", version.ref = "okhttp" }
okhttp-logging = { module = "com.squareup.okhttp3:logging-interceptor", version.ref = "okhttp" }
okhttp-mockwebserver = { module = "com.squareup.okhttp3:mockwebserver", version.ref = "okhttp" }
kotlinx-serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "kotlinxSerialization" }
kotlinx-coroutines-android = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-android", version.ref = "coroutines" }
kotlinx-coroutines-test = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-test", version.ref = "coroutines" }
room-runtime = { module = "androidx.room:room-runtime", version.ref = "room" }
room-ktx = { module = "androidx.room:room-ktx", version.ref = "room" }
room-compiler = { module = "androidx.room:room-compiler", version.ref = "room" }
room-testing = { module = "androidx.room:room-testing", version.ref = "room" }
datastore-preferences = { module = "androidx.datastore:datastore-preferences", version.ref = "datastore" }
security-crypto = { module = "androidx.security:security-crypto", version.ref = "securityCrypto" }
coil-compose = { module = "io.coil-kt.coil3:coil-compose", version.ref = "coil" }
coil-network-okhttp = { module = "io.coil-kt.coil3:coil-network-okhttp", version.ref = "coil" }
firebase-bom = { module = "com.google.firebase:firebase-bom", version.ref = "firebaseBom" }
firebase-messaging = { module = "com.google.firebase:firebase-messaging" }
junit5-api = { module = "org.junit.jupiter:junit-jupiter-api", version.ref = "junit5" }
junit5-engine = { module = "org.junit.jupiter:junit-jupiter-engine", version.ref = "junit5" }
junit5-params = { module = "org.junit.jupiter:junit-jupiter-params", version.ref = "junit5" }
turbine = { module = "app.cash.turbine:turbine", version.ref = "turbine" }
roborazzi = { module = "io.github.takahirom.roborazzi:roborazzi", version.ref = "roborazzi" }
roborazzi-compose = { module = "io.github.takahirom.roborazzi:roborazzi-compose", version.ref = "roborazzi" }
# build-logic classpath
android-gradle-plugin = { module = "com.android.tools.build:gradle", version.ref = "agp" }
kotlin-gradle-plugin = { module = "org.jetbrains.kotlin:kotlin-gradle-plugin", version.ref = "kotlin" }
compose-compiler-gradle-plugin = { module = "org.jetbrains.kotlin:compose-compiler-gradle-plugin", version.ref = "kotlin" }
ksp-gradle-plugin = { module = "com.google.devtools.ksp:com.google.devtools.ksp.gradle.plugin", version.ref = "ksp" }
hilt-gradle-plugin = { module = "com.google.dagger:hilt-android-gradle-plugin", version.ref = "hilt" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
android-library = { id = "com.android.library", version.ref = "agp" }
kotlin-android = { id = "org.jetbrains.kotlin.android", version.ref = "kotlin" }
kotlin-jvm = { id = "org.jetbrains.kotlin.jvm", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
ksp = { id = "com.google.devtools.ksp", version.ref = "ksp" }
hilt = { id = "com.google.dagger.hilt.android", version.ref = "hilt" }
google-services = { id = "com.google.gms.google-services", version = "<latest>" }
roborazzi = { id = "io.github.takahirom.roborazzi", version.ref = "roborazzi" }
```

- [ ] **Step 2: Root files**

`android/settings.gradle.kts`:

```kotlin
pluginManagement {
    includeBuild("build-logic")
    repositories { google(); mavenCentral(); gradlePluginPortal() }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories { google(); mavenCentral() }
}
rootProject.name = "EtalonCRM"
include(":app")
include(":core:designsystem", ":core:model", ":core:ui", ":core:network", ":core:datastore", ":core:database", ":core:data", ":core:testing")
include(":feature:auth", ":feature:orders")
```

`android/build.gradle.kts`:

```kotlin
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.android.library) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.ksp) apply false
    alias(libs.plugins.hilt) apply false
    alias(libs.plugins.google.services) apply false
    alias(libs.plugins.roborazzi) apply false
}
```

`android/gradle.properties`:

```
org.gradle.jvmargs=-Xmx4g -Dfile.encoding=UTF-8
org.gradle.parallel=true
org.gradle.caching=true
org.gradle.configuration-cache=true
android.useAndroidX=true
android.nonTransitiveRClass=true
kotlin.code.style=official
```

`android/.gitignore`:

```
.gradle/
build/
local.properties
*.keystore
*.jks
app/google-services.json
.idea/
*.iml
.kotlin/
```

- [ ] **Step 3: Convention plugins**

`android/build-logic/settings.gradle.kts`:

```kotlin
dependencyResolutionManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
    versionCatalogs { create("libs") { from(files("../gradle/libs.versions.toml")) } }
}
rootProject.name = "build-logic"
include(":convention")
```

`android/build-logic/convention/build.gradle.kts`:

```kotlin
plugins { `kotlin-dsl` }
group = "uz.etalon.buildlogic"
dependencies {
    compileOnly(libs.android.gradle.plugin)
    compileOnly(libs.kotlin.gradle.plugin)
    compileOnly(libs.compose.compiler.gradle.plugin)
    compileOnly(libs.ksp.gradle.plugin)
    compileOnly(libs.hilt.gradle.plugin)
}
gradlePlugin {
    plugins {
        register("androidLibrary") { id = "etalon.android.library"; implementationClass = "AndroidLibraryConventionPlugin" }
        register("androidCompose") { id = "etalon.android.compose"; implementationClass = "AndroidComposeConventionPlugin" }
        register("hilt") { id = "etalon.hilt"; implementationClass = "HiltConventionPlugin" }
    }
}
```

`android/build-logic/convention/src/main/kotlin/uz/etalon/buildlogic/AndroidConfig.kt`:

```kotlin
package uz.etalon.buildlogic

/** Single place for SDK levels. Spec D1: Android 16 floor, owner-confirmed;
 *  lowering to 28 is a one-line change here. */
object AndroidConfig {
    const val COMPILE_SDK = 36
    const val TARGET_SDK = 36
    const val MIN_SDK = 36
}
```

`android/build-logic/convention/src/main/kotlin/AndroidLibraryConventionPlugin.kt`:

```kotlin
import com.android.build.gradle.LibraryExtension
import org.gradle.api.JavaVersion
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure
import org.gradle.kotlin.dsl.dependencies
import org.gradle.kotlin.dsl.getByType
import org.gradle.api.artifacts.VersionCatalogsExtension
import uz.etalon.buildlogic.AndroidConfig

class AndroidLibraryConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("com.android.library")
        pluginManager.apply("org.jetbrains.kotlin.android")
        val libs = extensions.getByType<VersionCatalogsExtension>().named("libs")
        extensions.configure<LibraryExtension> {
            compileSdk = AndroidConfig.COMPILE_SDK
            defaultConfig {
                minSdk = AndroidConfig.MIN_SDK
                testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
            }
            compileOptions {
                sourceCompatibility = JavaVersion.VERSION_17
                targetCompatibility = JavaVersion.VERSION_17
            }
            testOptions.unitTests.isIncludeAndroidResources = true
        }
        tasks.withType(Test::class.java).configureEach { useJUnitPlatform() }
        dependencies {
            add("testImplementation", libs.findLibrary("junit5-api").get())
            add("testRuntimeOnly", libs.findLibrary("junit5-engine").get())
            add("testImplementation", libs.findLibrary("junit5-params").get())
            add("testImplementation", libs.findLibrary("kotlinx-coroutines-test").get())
            add("testImplementation", libs.findLibrary("turbine").get())
        }
    }
}
```

`AndroidComposeConventionPlugin.kt`:

```kotlin
import com.android.build.gradle.LibraryExtension
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.artifacts.VersionCatalogsExtension
import org.gradle.kotlin.dsl.configure
import org.gradle.kotlin.dsl.dependencies
import org.gradle.kotlin.dsl.getByType

class AndroidComposeConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("org.jetbrains.kotlin.plugin.compose")
        val libs = extensions.getByType<VersionCatalogsExtension>().named("libs")
        extensions.configure<LibraryExtension> { buildFeatures.compose = true }
        dependencies {
            val bom = libs.findLibrary("compose-bom").get()
            add("implementation", platform(bom))
            add("androidTestImplementation", platform(bom))
            add("implementation", libs.findLibrary("compose-ui").get())
            add("implementation", libs.findLibrary("compose-material3").get())
            add("implementation", libs.findLibrary("compose-ui-tooling-preview").get())
            add("implementation", libs.findLibrary("androidx-lifecycle-runtime-compose").get())
            add("debugImplementation", libs.findLibrary("compose-ui-tooling").get())
            add("androidTestImplementation", libs.findLibrary("compose-ui-test-junit4").get())
            add("debugImplementation", libs.findLibrary("compose-ui-test-manifest").get())
        }
    }
}
```

`HiltConventionPlugin.kt`:

```kotlin
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.artifacts.VersionCatalogsExtension
import org.gradle.kotlin.dsl.dependencies
import org.gradle.kotlin.dsl.getByType

class HiltConventionPlugin : Plugin<Project> {
    override fun apply(target: Project) = with(target) {
        pluginManager.apply("com.google.devtools.ksp")
        pluginManager.apply("com.google.dagger.hilt.android")
        val libs = extensions.getByType<VersionCatalogsExtension>().named("libs")
        dependencies {
            add("implementation", libs.findLibrary("hilt-android").get())
            add("ksp", libs.findLibrary("hilt-compiler").get())
        }
    }
}
```

- [ ] **Step 4: `:app` module**

`android/app/build.gradle.kts`:

```kotlin
import uz.etalon.buildlogic.AndroidConfig

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    id("etalon.hilt")
    // alias(libs.plugins.google.services)  ← enable in Task 9 once google-services.json exists
}

android {
    namespace = "uz.etalon.crm"
    compileSdk = AndroidConfig.COMPILE_SDK
    defaultConfig {
        applicationId = "uz.etalon.crm"
        minSdk = AndroidConfig.MIN_SDK
        targetSdk = AndroidConfig.TARGET_SDK
        versionCode = 1
        versionName = "0.1.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }
    buildTypes {
        debug { buildConfigField("String", "API_BASE_URL", "\"http://10.0.2.2:3000\"") }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            buildConfigField("String", "API_BASE_URL", "\"https://etalontbm.uz\"")
        }
    }
    buildFeatures { compose = true; buildConfig = true }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
}

dependencies {
    implementation(project(":core:designsystem"))
    implementation(project(":core:model"))
    implementation(project(":core:ui"))
    implementation(project(":core:network"))
    implementation(project(":core:datastore"))
    implementation(project(":core:database"))
    implementation(project(":core:data"))
    implementation(project(":feature:auth"))
    implementation(project(":feature:orders"))
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.material3.adaptive)
    implementation(libs.compose.material3.adaptive.navigation.suite)
    implementation(libs.compose.material.icons)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.hilt.navigation.compose)
    implementation(libs.navigation3.runtime)
    implementation(libs.navigation3.ui)
    implementation(libs.kotlinx.coroutines.android)
    debugImplementation(libs.compose.ui.tooling)
}
```

`android/app/src/main/AndroidManifest.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
    <application
        android:name=".EtalonApp"
        android:label="@string/app_name"
        android:allowBackup="false"
        android:usesCleartextTraffic="false"
        android:enableOnBackInvokedCallback="true"
        android:theme="@android:style/Theme.Material.Light.NoActionBar"
        android:supportsRtl="false">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

(Debug builds need cleartext to reach `10.0.2.2:3000`: add `android/app/src/debug/AndroidManifest.xml` with `<application android:usesCleartextTraffic="true" tools:replace="android:usesCleartextTraffic" />` and the `xmlns:tools` namespace.)

`EtalonApp.kt`:

```kotlin
package uz.etalon.crm

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class EtalonApp : Application()
```

`MainActivity.kt` (placeholder until Task 10 wires the shell):

```kotlin
package uz.etalon.crm

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.Text
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent { Text("EtalonSlabs") }
    }
}
```

`android/app/src/main/res/values/strings.xml`:

```xml
<resources>
    <string name="app_name">EtalonSlabs</string>
</resources>
```

- [ ] **Step 5: Empty module stubs so `settings.gradle.kts` resolves**

For each of `core/designsystem`, `core/model`, `core/ui`, `core/network`, `core/datastore`, `core/database`, `core/data`, `core/testing`, `feature/auth`, `feature/orders` create `build.gradle.kts`:

```kotlin
plugins { id("etalon.android.library") }
android { namespace = "uz.etalon.crm.<segment>" }   // e.g. uz.etalon.crm.core.model
```

(`:core:model` and `:core:ui` stay pure-Kotlin-friendly but use the Android library plugin for simplicity; the engine/geometry ports in Phase 2 will be `kotlin("jvm")` modules.)

- [ ] **Step 6: Build**

Run (from `android/`): `./gradlew :app:assembleDebug --no-daemon`
Expected: BUILD SUCCESSFUL; `app/build/outputs/apk/debug/app-debug.apk` exists.

- [ ] **Step 7: Commit**

```bash
git add android/
git commit -m "Feat(android) · Gradle skeleton with convention plugins and module stubs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Domain model and formatters (`:core:model`, `:core:ui`)

**Files:**
- Create: `android/core/model/src/main/kotlin/uz/etalon/crm/core/model/Money.kt`, `Enums.kt`, `Order.kt`, `Session.kt`, `Resource.kt`
- Create: `android/core/ui/src/main/kotlin/uz/etalon/crm/core/ui/format/Formatters.kt`
- Modify: `android/core/model/build.gradle.kts`, `android/core/ui/build.gradle.kts` (deps)
- Test: `android/core/model/src/test/kotlin/uz/etalon/crm/core/model/MoneyTest.kt`, `android/core/ui/src/test/kotlin/uz/etalon/crm/core/ui/format/FormattersTest.kt`

**Interfaces:**
- Produces: `@JvmInline value class Money(val amount: BigDecimal)` with `Money.parse(server: String)`, `plus/minus`, `isZero`, `coerceAtLeastZero()`; enums `OrderStatus`, `PaymentState`, `PaymentStatus`, `PaymentMethod`, `Role` mirroring Prisma exactly; `data class OrderSummary`, `data class OrderDetail` (fields listed below); `data class Me(id, name, role, permissions: Set<String>, mustChangePassword)` with `fun can(action: String)`; `sealed interface Resource<out T> { Loading(cached), Success(data), Error(cached, error) }`; formatters `formatMoney(Money): String`, `formatArea(BigDecimal): String`, `formatCount(Int): String`, `formatPhone(String): String`, `formatDate(Instant): String`, `formatDateTime(Instant): String`, `UZ_MONTHS_SHORT`.

- [ ] **Step 1: Write the failing tests**

`MoneyTest.kt`:

```kotlin
package uz.etalon.crm.core.model

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.math.BigDecimal

class MoneyTest {
    @Test fun `parses the server's decimal string exactly`() {
        assertEquals(BigDecimal("1250000.00"), Money.parse("1250000.00").amount)
        assertEquals(BigDecimal("0"), Money.parse("0").amount)
    }
    @Test fun `rejects non-numeric input`() {
        assertThrows(IllegalArgumentException::class.java) { Money.parse("abc") }
    }
    @Test fun `remaining is total minus paid, never negative`() {
        val total = Money.parse("100.00"); val paid = Money.parse("130.00")
        assertEquals(Money.parse("-30.00"), total - paid)
        assertEquals(Money.ZERO, (total - paid).coerceAtLeastZero())
        assertTrue(Money.ZERO.isZero)
    }
}
```

`FormattersTest.kt`:

```kotlin
package uz.etalon.crm.core.ui.format

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.Money
import java.math.BigDecimal
import java.time.Instant

class FormattersTest {
    @Test fun `money uses space thousands, no decimals, UZS suffix`() {
        assertEquals("542 200 000 UZS", formatMoney(Money.parse("542200000.00")))
        assertEquals("0 UZS", formatMoney(Money.ZERO))
        assertEquals("1 250 001 UZS", formatMoney(Money.parse("1250000.50")))   // half-away-from-zero, like round2→display
    }
    @Test fun `area uses comma decimal and м²`() {
        assertEquals("12,5 м²", formatArea(BigDecimal("12.500")))
        assertEquals("86,4 м²", formatArea(BigDecimal("86.4")))
        assertEquals("100 м²", formatArea(BigDecimal("100.000")))
    }
    @Test fun `count uses та`() { assertEquals("12 та", formatCount(12)) }
    @Test fun `phone renders +998 90 111 22 33 from digits`() {
        assertEquals("+998 90 111 22 33", formatPhone("998901112233"))
        assertEquals("+998 90 111 22 33", formatPhone("901112233"))
        assertEquals("12345", formatPhone("12345")) // unknown shape: returned as-is
    }
    @Test fun `dates use the hand-rolled Uzbek months in Tashkent time`() {
        val t = Instant.parse("2026-09-04T23:30:00Z") // 04:30 on 5 Sep in Tashkent (+05)
        assertEquals("5 сен 2026", formatDate(t))
        assertEquals("5 сен 2026, 04:30", formatDateTime(t))
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./gradlew :core:model:testDebugUnitTest :core:ui:testDebugUnitTest`
Expected: compilation FAIL (symbols missing).

- [ ] **Step 3: Implement `:core:model`**

`Money.kt`:

```kotlin
package uz.etalon.crm.core.model

import java.math.BigDecimal
import java.math.RoundingMode

/** UZS in major units. Constructed from the server's decimal string only;
 *  the client never derives money from floats. */
@JvmInline
value class Money(val amount: BigDecimal) : Comparable<Money> {
    operator fun plus(o: Money) = Money(amount + o.amount)
    operator fun minus(o: Money) = Money(amount - o.amount)
    val isZero: Boolean get() = amount.signum() == 0
    val isNegative: Boolean get() = amount.signum() < 0
    fun coerceAtLeastZero(): Money = if (isNegative) ZERO else this
    /** Whole-UZS value for display; half-away-from-zero matches the engine's round2 then display. */
    fun roundedWhole(): BigDecimal = amount.setScale(0, RoundingMode.HALF_UP)
    override fun compareTo(other: Money) = amount.compareTo(other.amount)

    companion object {
        val ZERO = Money(BigDecimal.ZERO)
        fun parse(server: String): Money = try {
            Money(BigDecimal(server.trim()))
        } catch (e: NumberFormatException) {
            throw IllegalArgumentException("Not a money string: '$server'", e)
        }
    }
}
```

`Enums.kt` (mirror Prisma exactly; unknown values from a newer server map to `UNKNOWN` so the app never crashes on a new enum):

```kotlin
package uz.etalon.crm.core.model

enum class OrderStatus { DRAFT, PLACED, IN_PRODUCTION, LOADED, DISPATCHED, DELIVERED, CANCELED, UNKNOWN;
    companion object { fun from(s: String) = entries.firstOrNull { it.name == s } ?: UNKNOWN } }
enum class PaymentState { AWAITING_PAYMENT, PARTIALLY_PAID, FULLY_PAID, UNKNOWN;
    companion object { fun from(s: String) = entries.firstOrNull { it.name == s } ?: UNKNOWN } }
enum class PaymentStatus { PENDING_CONFIRMATION, CONFIRMED, REJECTED, UNKNOWN;
    companion object { fun from(s: String) = entries.firstOrNull { it.name == s } ?: UNKNOWN } }
enum class PaymentMethod { CASH, BANK_TRANSFER, CLICK, PAYME, OTHER, UNKNOWN;
    companion object { fun from(s: String) = entries.firstOrNull { it.name == s } ?: UNKNOWN } }
enum class ShipmentStatus { PENDING, LOADED, DISPATCHED, DELIVERED, UNKNOWN;
    companion object { fun from(s: String) = entries.firstOrNull { it.name == s } ?: UNKNOWN } }
enum class Role { OWNER, ADMIN, SALES, INVENTORY, DRIVER, ACCOUNTANT, CUSTOM, UNKNOWN;
    companion object { fun from(s: String) = entries.firstOrNull { it.name == s } ?: UNKNOWN } }
```

`Order.kt`:

```kotlin
package uz.etalon.crm.core.model

import java.math.BigDecimal
import java.time.Instant

data class ClientRef(val id: String, val name: String, val phone: String, val address: String?)

/** One row of GET /api/orders. */
data class OrderSummary(
    val id: String,
    val orderNumber: String,
    val status: OrderStatus,
    val paymentState: PaymentState,
    val totalPrice: Money,
    val confirmedPaid: Money,
    val totalArea: BigDecimal,
    val totalBlocks: Int,
    val totalBeams: Int,
    val scheduledAt: Instant,
    val placedAt: Instant,
    val client: ClientRef,
) { val remaining: Money get() = (totalPrice - confirmedPaid).coerceAtLeastZero() }

data class RoomLine(
    val name: String?, val innerWidth: BigDecimal, val innerLength: BigDecimal, val pattern: String,
    val beamLength: BigDecimal, val beamCount: Int, val totalBlocks: Int, val billedArea: BigDecimal, val subtotal: Money,
)
data class PaymentLine(
    val id: String, val amount: Money, val method: PaymentMethod, val status: PaymentStatus,
    val recordedAt: Instant, val recordedByName: String?, val receiptUrls: List<String>,
)
data class ShipmentLine(
    val id: String, val number: Int, val status: ShipmentStatus, val loadedBlocks: Int?,
    val loadedPhotoUrl: String?, val driverName: String?, val truckIdentifier: String?,
)
data class OrderEventLine(val id: String, val type: String, val message: String?, val actorName: String?, val createdAt: Instant)

/** GET /api/orders/{id} — the parts Phase 1a renders. */
data class OrderDetail(
    val summary: OrderSummary,
    val notes: String?,
    val deliveryLat: Double?, val deliveryLng: Double?, val deliveryLocationUrl: String?, val deliveryLocationLabel: String?,
    val discountAmount: Money, val deliveryCost: Money, val otherCost: Money, val roomsSubtotal: Money,
    val writeOffAmount: Money,
    val rooms: List<RoomLine>,
    val payments: List<PaymentLine>,
    val shipments: List<ShipmentLine>,
    val loadedPhotoUrls: List<String>,
    val deliveryProofUrl: String?,
    val events: List<OrderEventLine>,
    val fetchedAt: Instant,
) {
    val pendingAmount: Money get() = payments.filter { it.status == PaymentStatus.PENDING_CONFIRMATION }.fold(Money.ZERO) { a, p -> a + p.amount }
    val remaining: Money get() = (summary.totalPrice - summary.confirmedPaid - writeOffAmount).coerceAtLeastZero()
}
```

`Session.kt`:

```kotlin
package uz.etalon.crm.core.model

data class Me(
    val id: String, val name: String, val role: Role,
    val permissions: Set<String>, val mustChangePassword: Boolean,
) { fun can(action: String) = action in permissions }

data class Pricing(val m2Tiers: List<Pair<Double, Long>>, val extraBeamTiers: List<Pair<Double, Long>>, val blockUnitPrice: Long)
data class CapacityThresholds(val low: Int, val moderate: Int, val heavy: Int)
data class Bootstrap(val me: Me, val pricing: Pricing, val capacity: CapacityThresholds, val minSupportedAppVersion: String)
```

`Resource.kt`:

```kotlin
package uz.etalon.crm.core.model

/** What every repository Flow emits: cached data first, then the network outcome. */
sealed interface Resource<out T> {
    data class Loading<T>(val cached: T? = null) : Resource<T>
    data class Success<T>(val data: T) : Resource<T>
    data class Error<T>(val cached: T?, val error: AppError) : Resource<T>
    val dataOrNull: T? get() = when (this) { is Loading -> cached; is Success -> data; is Error -> cached }
}

/** Typed failures the UI can react to. `message` is the Uzbek half of the server's bilingual string. */
sealed class AppError(open val message: String) {
    data class Network(override val message: String) : AppError(message)
    data object Unauthorized : AppError("Сессия тугади")
    data class Forbidden(override val message: String) : AppError(message)
    data class Validation(override val message: String, val fields: Map<String, String>) : AppError(message)
    data class Conflict(override val message: String, val code: String?) : AppError(message)
    data class Server(override val message: String, val status: Int) : AppError(message)
}
```

- [ ] **Step 4: Implement `Formatters.kt` in `:core:ui`**

```kotlin
package uz.etalon.crm.core.ui.format

import uz.etalon.crm.core.model.Money
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.ZoneId

/** House number format (spec §6.5): space thousands, comma decimal, unit suffix.
 *  Device ICU is deliberately not used — the server does the same. */
val TASHKENT: ZoneId = ZoneId.of("Asia/Tashkent")
val UZ_MONTHS_SHORT = listOf("янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек")

private fun groupThousands(whole: String): String {
    val neg = whole.startsWith("-")
    val digits = whole.trimStart('-')
    val sb = StringBuilder()
    digits.reversed().forEachIndexed { i, c -> if (i > 0 && i % 3 == 0) sb.append(' '); sb.append(c) }
    return (if (neg) "-" else "") + sb.reverse()
}

fun formatMoney(m: Money): String = groupThousands(m.roundedWhole().toPlainString()) + " UZS"

fun formatDecimal(v: BigDecimal, maxDigits: Int = 1): String {
    val scaled = v.setScale(maxDigits, RoundingMode.HALF_UP).stripTrailingZeros()
    val plain = scaled.toPlainString()
    val parts = plain.split('.')
    val whole = groupThousands(parts[0])
    return if (parts.size == 2 && parts[1].isNotEmpty()) "$whole,${parts[1]}" else whole
}

fun formatArea(m2: BigDecimal): String = formatDecimal(m2, 1) + " м²"
fun formatCount(n: Int): String = groupThousands(n.toString()) + " та"

/** Digits-only storage → `+998 90 111 22 33`. Mirrors src/lib/phone.ts formatPhone. */
fun formatPhone(raw: String): String {
    val d = raw.filter { it.isDigit() }
    val full = when {
        d.length == 12 && d.startsWith("998") -> d
        d.length == 9 -> "998$d"
        else -> return raw
    }
    return "+${full.substring(0, 3)} ${full.substring(3, 5)} ${full.substring(5, 8)} ${full.substring(8, 10)} ${full.substring(10, 12)}"
}

fun formatDate(t: Instant): String {
    val z = t.atZone(TASHKENT)
    return "${z.dayOfMonth} ${UZ_MONTHS_SHORT[z.monthValue - 1]} ${z.year}"
}

fun formatDateTime(t: Instant): String {
    val z = t.atZone(TASHKENT)
    return "${formatDate(t)}, ${"%02d".format(z.hour)}:${"%02d".format(z.minute)}"
}
```

Add to `android/core/ui/build.gradle.kts`: `dependencies { implementation(project(":core:model")) }` and to both modules enable `coreLibraryDesugaring` only if `java.time` is needed below API 26 (not needed at minSdk 36).

- [ ] **Step 5: Run tests**

Run: `./gradlew :core:model:testDebugUnitTest :core:ui:testDebugUnitTest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add android/core/model android/core/ui
git commit -m "Feat(android) · domain model, Money, Resource and house formatters

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Design system (`:core:designsystem`)

**Files:**
- Modify: `android/core/designsystem/build.gradle.kts`
- Create: `android/core/designsystem/src/main/kotlin/uz/etalon/crm/core/designsystem/theme/EtalonColors.kt`, `EtalonTypography.kt`, `EtalonTheme.kt`
- Create: `…/designsystem/components/StatusChip.kt`, `MoneyText.kt`, `SectionLabel.kt`, `EmptyState.kt`, `ErrorBanner.kt`, `StatusStripeCard.kt`
- Create: `android/core/designsystem/src/main/res/font/` — bundle `manrope_regular/medium/semibold/bold.ttf`, `jetbrainsmono_regular/medium/bold.ttf` (download from Google Fonts; both families include Cyrillic)
- Create: `android/core/designsystem/src/main/res/values/strings.xml` (chip labels)
- Test: `android/core/designsystem/src/test/kotlin/uz/etalon/crm/core/designsystem/StatusChipMappingTest.kt`

**Interfaces:**
- Produces: `EtalonTheme(darkTheme: Boolean = isSystemInDarkTheme(), content)`; `LocalEtalonColors.current` with `success`, `warning`, `gold`, `border`, `borderStrong`, `textTertiary`, `surfaceHover`, `paper`, `ink`, `accentGreen`, `terracotta`; `EtalonType.mono` (JetBrains Mono, tabular); `StatusChip(status: OrderStatus)`, `PaymentChip(state: PaymentState)`, `MoneyText(money, style)`, `orderStatusTone(status): ChipTone`, `orderStatusLabel(status): Int` (string res id), `toneColor(tone): Color`, `StatusStripeCard(stripe: Color, onClick?, content)`.

- [ ] **Step 1: Write the failing test**

`StatusChipMappingTest.kt`:

```kotlin
package uz.etalon.crm.core.designsystem

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.designsystem.components.ChipTone
import uz.etalon.crm.core.designsystem.components.orderStatusTone
import uz.etalon.crm.core.designsystem.components.paymentStateTone
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.PaymentState

class StatusChipMappingTest {
    @Test fun `order statuses map to the web's chip variants`() {
        assertEquals(ChipTone.PRIMARY, orderStatusTone(OrderStatus.PLACED))
        assertEquals(ChipTone.WARNING, orderStatusTone(OrderStatus.IN_PRODUCTION))
        assertEquals(ChipTone.WARNING, orderStatusTone(OrderStatus.LOADED))
        assertEquals(ChipTone.GOLD, orderStatusTone(OrderStatus.DISPATCHED))
        assertEquals(ChipTone.SUCCESS, orderStatusTone(OrderStatus.DELIVERED))
        assertEquals(ChipTone.DANGER, orderStatusTone(OrderStatus.CANCELED))
        assertEquals(ChipTone.NEUTRAL, orderStatusTone(OrderStatus.UNKNOWN))
    }
    @Test fun `payment triad is paid=success, partial=primary, pending=neutral`() {
        assertEquals(ChipTone.SUCCESS, paymentStateTone(PaymentState.FULLY_PAID))
        assertEquals(ChipTone.PRIMARY, paymentStateTone(PaymentState.PARTIALLY_PAID))
        assertEquals(ChipTone.NEUTRAL, paymentStateTone(PaymentState.AWAITING_PAYMENT))
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./gradlew :core:designsystem:testDebugUnitTest`
Expected: compilation FAIL.

- [ ] **Step 3: Module build file**

```kotlin
plugins { id("etalon.android.library"); id("etalon.android.compose") }
android { namespace = "uz.etalon.crm.core.designsystem" }
dependencies {
    implementation(project(":core:model"))
    implementation(project(":core:ui"))
    implementation(libs.compose.material.icons)
}
```

- [ ] **Step 4: Colours — `EtalonColors.kt` (values from spec §1.3 / globals.css)**

```kotlin
package uz.etalon.crm.core.designsystem.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

@Immutable
data class EtalonExtendedColors(
    val success: Color, val warning: Color, val gold: Color, val danger: Color,
    val border: Color, val borderStrong: Color, val textTertiary: Color, val surfaceHover: Color,
    // Editorial (owner home) palette
    val paper: Color, val ink: Color, val paperSurface: Color, val paperLine: Color, val paperMuted: Color,
    val accentGreen: Color, val terracotta: Color,
)

val LocalEtalonColors = staticCompositionLocalOf<EtalonExtendedColors> { error("EtalonTheme not applied") }

// App shell — light
private val LightBackground = Color(0xFFF3F5FB); private val LightSurface = Color(0xFFFFFFFF)
private val LightForeground = Color(0xFF0C0F1A); private val LightMuted = Color(0xFFEAECF5)
private val LightMutedFg = Color(0xFF5A6488); private val LightBorder = Color(0xFFDDE1F0)
private val LightPrimary = Color(0xFF4E80FF)
// App shell — dark
private val DarkBackground = Color(0xFF1A1C21); private val DarkSurface = Color(0xFF262830)
private val DarkForeground = Color(0xFFE0E1E6); private val DarkMuted = Color(0xFF353842)
private val DarkMutedFg = Color(0xFF989BA4); private val DarkBorder = Color(0xFF41444F)
private val DarkPrimary = Color(0xFF5D85ED)

val LightColorScheme: ColorScheme = lightColorScheme(
    primary = LightPrimary, onPrimary = Color.White,
    primaryContainer = LightPrimary.copy(alpha = 0.14f), onPrimaryContainer = LightPrimary,
    background = LightBackground, onBackground = LightForeground,
    surface = LightSurface, onSurface = LightForeground,
    surfaceVariant = LightMuted, onSurfaceVariant = LightMutedFg,
    outline = LightBorder, outlineVariant = LightBorder,
    error = Color(0xFFDC2626), onError = Color.White,
    errorContainer = Color(0xFFDC2626).copy(alpha = 0.10f), onErrorContainer = Color(0xFFDC2626),
)
val DarkColorScheme: ColorScheme = darkColorScheme(
    primary = DarkPrimary, onPrimary = Color.White,
    primaryContainer = DarkPrimary.copy(alpha = 0.14f), onPrimaryContainer = DarkPrimary,
    background = DarkBackground, onBackground = DarkForeground,
    surface = DarkSurface, onSurface = DarkForeground,
    surfaceVariant = DarkMuted, onSurfaceVariant = DarkMutedFg,
    outline = DarkBorder, outlineVariant = DarkBorder,
    error = Color(0xFFD65D63), onError = Color.White,
    errorContainer = Color(0xFFD65D63).copy(alpha = 0.10f), onErrorContainer = Color(0xFFD65D63),
)
val LightExtended = EtalonExtendedColors(
    success = Color(0xFF059669), warning = Color(0xFFD97706), gold = Color(0xFFB45309), danger = Color(0xFFDC2626),
    border = LightBorder, borderStrong = Color(0xFFC4CADF), textTertiary = Color(0xFF9AA3BF), surfaceHover = Color(0xFFF8F9FD),
    paper = Color(0xFFF4F3EE), ink = Color(0xFF15181D), paperSurface = Color(0xFFFFFFFF), paperLine = Color(0xFFE6E4DC), paperMuted = Color(0xFF6E7682),
    accentGreen = Color(0xFF0E7C5A), terracotta = Color(0xFFC0492F),
)
val DarkExtended = EtalonExtendedColors(
    success = Color(0xFF45C2A0), warning = Color(0xFFE29A4D), gold = Color(0xFFD4A258), danger = Color(0xFFD65D63),
    border = DarkBorder, borderStrong = Color(0xFF565A66), textTertiary = Color(0xFF757983), surfaceHover = Color(0xFF2C2E36),
    paper = Color(0xFF0E1311), ink = Color(0xFFECEFEA), paperSurface = Color(0xFF161D1A), paperLine = Color(0xFF27302C), paperMuted = Color(0xFF8A958D),
    accentGreen = Color(0xFF34D39A), terracotta = Color(0xFFF08A6E),
)
```

- [ ] **Step 5: Typography — `EtalonTypography.kt`**

```kotlin
package uz.etalon.crm.core.designsystem.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import uz.etalon.crm.core.designsystem.R

val Manrope = FontFamily(
    Font(R.font.manrope_regular, FontWeight.Normal), Font(R.font.manrope_medium, FontWeight.Medium),
    Font(R.font.manrope_semibold, FontWeight.SemiBold), Font(R.font.manrope_bold, FontWeight.Bold),
)
val JetBrainsMono = FontFamily(
    Font(R.font.jetbrainsmono_regular, FontWeight.Normal), Font(R.font.jetbrainsmono_medium, FontWeight.Medium),
    Font(R.font.jetbrainsmono_bold, FontWeight.Bold),
)

/** Every number in the app: mono, tabular, dotless zero (web: "tnum" + "cv14"). */
val MonoNumeric = TextStyle(fontFamily = JetBrainsMono, fontFeatureSettings = "tnum, cv14")

object EtalonType {
    val mono = MonoNumeric
    val monoLabel = MonoNumeric.copy(fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.1.em)
    val monoBody = MonoNumeric.copy(fontSize = 14.sp)
    val monoTitle = MonoNumeric.copy(fontSize = 22.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.01).em)
    val monoDisplay = MonoNumeric.copy(fontSize = 36.sp, fontWeight = FontWeight.Bold, letterSpacing = (-0.02).em)
}

val EtalonTypography = Typography(
    headlineMedium = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.Bold, fontSize = 24.sp, letterSpacing = (-0.02).em),
    titleLarge = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.SemiBold, fontSize = 18.sp),
    titleMedium = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.SemiBold, fontSize = 16.sp),
    bodyLarge = TextStyle(fontFamily = Manrope, fontSize = 15.sp),
    bodyMedium = TextStyle(fontFamily = Manrope, fontSize = 14.sp),
    bodySmall = TextStyle(fontFamily = Manrope, fontSize = 12.sp),
    labelLarge = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.SemiBold, fontSize = 14.sp),
    labelMedium = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, letterSpacing = 0.08.em),
    labelSmall = TextStyle(fontFamily = Manrope, fontWeight = FontWeight.SemiBold, fontSize = 11.sp, letterSpacing = 0.08.em),
)
```

- [ ] **Step 6: Theme — `EtalonTheme.kt`**

```kotlin
package uz.etalon.crm.core.designsystem.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.unit.dp

/** Radii from globals.css: 10 / 6 / 4 px. Brand is fixed; dynamic colour is off on purpose. */
val EtalonShapes = Shapes(small = RoundedCornerShape(4.dp), medium = RoundedCornerShape(6.dp), large = RoundedCornerShape(10.dp), extraLarge = RoundedCornerShape(14.dp))

@Composable
fun EtalonTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val extended = if (darkTheme) DarkExtended else LightExtended
    CompositionLocalProvider(LocalEtalonColors provides extended) {
        MaterialTheme(
            colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme,
            typography = EtalonTypography,
            shapes = EtalonShapes,
            content = content,
        )
    }
}
```

- [ ] **Step 7: Components**

`StatusChip.kt`:

```kotlin
package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.PaymentState

enum class ChipTone { PRIMARY, SUCCESS, WARNING, DANGER, GOLD, NEUTRAL }

/** Mirrors STATUS_META in orders/page.tsx. */
fun orderStatusTone(s: OrderStatus): ChipTone = when (s) {
    OrderStatus.PLACED -> ChipTone.PRIMARY
    OrderStatus.IN_PRODUCTION, OrderStatus.LOADED -> ChipTone.WARNING
    OrderStatus.DISPATCHED -> ChipTone.GOLD
    OrderStatus.DELIVERED -> ChipTone.SUCCESS
    OrderStatus.CANCELED -> ChipTone.DANGER
    OrderStatus.DRAFT, OrderStatus.UNKNOWN -> ChipTone.NEUTRAL
}
/** Spec §6.1 payment triad. */
fun paymentStateTone(p: PaymentState): ChipTone = when (p) {
    PaymentState.FULLY_PAID -> ChipTone.SUCCESS
    PaymentState.PARTIALLY_PAID -> ChipTone.PRIMARY
    PaymentState.AWAITING_PAYMENT, PaymentState.UNKNOWN -> ChipTone.NEUTRAL
}

fun orderStatusLabel(s: OrderStatus): Int = when (s) {
    OrderStatus.PLACED -> R.string.status_placed
    OrderStatus.IN_PRODUCTION -> R.string.status_in_production
    OrderStatus.LOADED -> R.string.status_loaded
    OrderStatus.DISPATCHED -> R.string.status_dispatched
    OrderStatus.DELIVERED -> R.string.status_delivered
    OrderStatus.CANCELED -> R.string.status_canceled
    OrderStatus.DRAFT, OrderStatus.UNKNOWN -> R.string.status_unknown
}
fun paymentStateLabel(p: PaymentState): Int = when (p) {
    PaymentState.FULLY_PAID -> R.string.payment_paid
    PaymentState.PARTIALLY_PAID -> R.string.payment_partial
    PaymentState.AWAITING_PAYMENT, PaymentState.UNKNOWN -> R.string.payment_pending
}

@Composable
fun toneColor(t: ChipTone): Color {
    val ext = LocalEtalonColors.current
    return when (t) {
        ChipTone.PRIMARY -> MaterialTheme.colorScheme.primary
        ChipTone.SUCCESS -> ext.success
        ChipTone.WARNING -> ext.warning
        ChipTone.DANGER -> ext.danger
        ChipTone.GOLD -> ext.gold
        ChipTone.NEUTRAL -> MaterialTheme.colorScheme.onSurfaceVariant
    }
}

/** Text colour on a 14 % tint, 30 % border — never a solid fill (spec §6.1). */
@Composable
fun Chip(tone: ChipTone, text: String, modifier: Modifier = Modifier) {
    val c = toneColor(tone)
    Text(
        text = text.uppercase(),
        style = EtalonType.mono.copy(fontSize = 10.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.08.sp, color = c),
        modifier = modifier
            .background(c.copy(alpha = 0.14f), RoundedCornerShape(999.dp))
            .border(1.dp, c.copy(alpha = 0.30f), RoundedCornerShape(999.dp))
            .padding(horizontal = 8.dp, vertical = 3.dp),
    )
}

@Composable fun StatusChip(status: OrderStatus, modifier: Modifier = Modifier) =
    Chip(orderStatusTone(status), stringResource(orderStatusLabel(status)), modifier)
@Composable fun PaymentChip(state: PaymentState, modifier: Modifier = Modifier) =
    Chip(paymentStateTone(state), stringResource(paymentStateLabel(state)), modifier)
```

`MoneyText.kt`:

```kotlin
package uz.etalon.crm.core.designsystem.components

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatCount
import uz.etalon.crm.core.ui.format.formatMoney
import java.math.BigDecimal

@Composable
fun MoneyText(money: Money, modifier: Modifier = Modifier, style: TextStyle = EtalonType.monoBody, color: Color = MaterialTheme.colorScheme.onSurface) =
    Text(formatMoney(money), modifier = modifier, style = style, color = color, maxLines = 1)

@Composable
fun AreaText(m2: BigDecimal, modifier: Modifier = Modifier, style: TextStyle = EtalonType.monoBody, color: Color = MaterialTheme.colorScheme.onSurfaceVariant) =
    Text(formatArea(m2), modifier = modifier, style = style, color = color, maxLines = 1)

@Composable
fun CountText(n: Int, modifier: Modifier = Modifier, style: TextStyle = EtalonType.monoBody, color: Color = MaterialTheme.colorScheme.onSurfaceVariant) =
    Text(formatCount(n), modifier = modifier, style = style, color = color, maxLines = 1)
```

`SectionLabel.kt`, `EmptyState.kt`, `ErrorBanner.kt`, `StatusStripeCard.kt`:

```kotlin
package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier) =
    Text(text.uppercase(), style = EtalonType.monoLabel, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = modifier)

/** Plain-text empty state, as on the web ("Буюртма йўқ."). */
@Composable
fun EmptyState(text: String, modifier: Modifier = Modifier) =
    Box(modifier.fillMaxWidth().padding(48.dp), contentAlignment = Alignment.Center) {
        Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant, textAlign = TextAlign.Center)
    }

/** destructive/10 tint + destructive/30 border, like the web error box. */
@Composable
fun ErrorBanner(message: String, onRetry: (() -> Unit)? = null, modifier: Modifier = Modifier) {
    val e = MaterialTheme.colorScheme.error
    Row(
        modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium).background(e.copy(alpha = 0.10f))
            .border(1.dp, e.copy(alpha = 0.30f), MaterialTheme.shapes.medium).padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(message, style = MaterialTheme.typography.bodyMedium, color = e, modifier = Modifier.weight(1f))
        if (onRetry != null) TextButton(onClick = onRetry) { Text(androidx.compose.ui.res.stringResource(uz.etalon.crm.core.designsystem.R.string.action_retry)) }
    }
}

/** Card with the web's 3 px status stripe on the left edge. */
@Composable
fun StatusStripeCard(stripe: Color, modifier: Modifier = Modifier, onClick: (() -> Unit)? = null, content: @Composable ColumnScope.() -> Unit) {
    val ext = LocalEtalonColors.current
    val shape = MaterialTheme.shapes.large
    val base = modifier.fillMaxWidth().clip(shape).background(MaterialTheme.colorScheme.surface).border(1.dp, ext.border, shape)
    val clickable = if (onClick != null) base.then(Modifier.clickable(onClick = onClick)) else base
    Row(clickable.height(IntrinsicSize.Min)) {
        Box(Modifier.width(3.dp).fillMaxHeight().background(stripe))
        Column(Modifier.weight(1f).padding(horizontal = 14.dp, vertical = 12.dp), content = content)
    }
}
```

`res/values/strings.xml` (designsystem):

```xml
<resources>
    <string name="status_placed">Қабул қилинган</string>
    <string name="status_in_production">Ишлаб чиқилмоқда</string>
    <string name="status_loaded">Юкланган</string>
    <string name="status_dispatched">Жўнатилган</string>
    <string name="status_delivered">Етказилган</string>
    <string name="status_canceled">Бекор қилинган</string>
    <string name="status_unknown">Номаълум</string>
    <string name="payment_paid">Тўланган</string>
    <string name="payment_partial">Қисман</string>
    <string name="payment_pending">Кутилмоқда</string>
    <string name="action_retry">Қайта уриниш</string>
</resources>
```

- [ ] **Step 8: Run test and build**

Run: `./gradlew :core:designsystem:testDebugUnitTest :core:designsystem:assembleDebug`
Expected: PASS, BUILD SUCCESSFUL.

- [ ] **Step 9: Commit**

```bash
git add android/core/designsystem
git commit -m "Feat(android) · Etalon theme, tokens, fonts and status chips

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Network layer (`:core:network`)

**Files:**
- Modify: `android/core/network/build.gradle.kts`
- Create: `…/core/network/ApiException.kt`, `Envelope.kt`, `EnvelopeInterceptor.kt`, `AuthInterceptor.kt`, `TokenProvider.kt`, `MediaUrl.kt`, `EtalonApi.kt`, `dto/AuthDto.kt`, `dto/OrderDto.kt`, `dto/BootstrapDto.kt`, `di/NetworkModule.kt`
- Test: `…/core/network/src/test/kotlin/uz/etalon/crm/core/network/EnvelopeInterceptorTest.kt`, `AuthInterceptorTest.kt`, `MediaUrlTest.kt`

**Interfaces:**
- Produces: `interface TokenProvider { suspend fun token(): String?; suspend fun onUnauthorized() }`; `class ApiException(val status: Int, val error: String, val details: JsonElement?) : IOException` with `val uzbekMessage`, `val code: String?`; `interface EtalonApi` (Retrofit) with `login`, `me`, `bootstrap`, `registerDevice`, `unregisterDevice`, `changePin`, `orders(q,status,day,page,pageSize)`, `order(id)`; `object MediaUrl { fun absolute(base: String, path: String?): String? }`; Hilt `NetworkModule` providing `Json`, `OkHttpClient`, `Retrofit`, `EtalonApi`, `@Named("apiBaseUrl") String`.

- [ ] **Step 1: Write the failing tests**

`EnvelopeInterceptorTest.kt`:

```kotlin
package uz.etalon.crm.core.network

import kotlinx.coroutines.test.runTest
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinxserialization.asConverterFactory
import retrofit2.http.GET

@Serializable data class Thing(val n: Int)
interface ThingApi { @GET("/api/thing") suspend fun thing(): Thing }

class EnvelopeInterceptorTest {
    private lateinit var server: MockWebServer
    private lateinit var api: ThingApi
    @BeforeEach fun setUp() {
        server = MockWebServer().also { it.start() }
        val json = Json { ignoreUnknownKeys = true }
        api = Retrofit.Builder().baseUrl(server.url("/"))
            .client(OkHttpClient.Builder().addInterceptor(EnvelopeInterceptor(json)).build())
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build().create(ThingApi::class.java)
    }
    @AfterEach fun tearDown() = server.shutdown()

    @Test fun `unwraps ok true data`() = runTest {
        server.enqueue(MockResponse().setBody("""{"ok":true,"data":{"n":7}}""").addHeader("Content-Type", "application/json"))
        assertEquals(Thing(7), api.thing())
    }
    @Test fun `ok false on HTTP 200 throws ApiException with the Uzbek half`() = runTest {
        server.enqueue(MockResponse().setBody("""{"ok":false,"error":"Рухсат йўқ · Permission denied (order.view)"}""").addHeader("Content-Type", "application/json"))
        val e = assertThrows(ApiException::class.java) { kotlinx.coroutines.runBlocking { api.thing() } }
        assertEquals(200, e.status)
        assertEquals("Рухсат йўқ", e.uzbekMessage)
    }
    @Test fun `HTTP 403 with details code is exposed`() = runTest {
        server.enqueue(MockResponse().setResponseCode(403).setBody("""{"ok":false,"error":"Хабарлар қулфланган · Inbox locked","details":{"code":"INBOX_LOCKED"}}""").addHeader("Content-Type", "application/json"))
        val e = assertThrows(ApiException::class.java) { kotlinx.coroutines.runBlocking { api.thing() } }
        assertEquals(403, e.status)
        assertEquals("INBOX_LOCKED", e.code)
    }
    @Test fun `non-JSON 5xx becomes ApiException with status`() = runTest {
        server.enqueue(MockResponse().setResponseCode(502).setBody("Bad Gateway"))
        val e = assertThrows(ApiException::class.java) { kotlinx.coroutines.runBlocking { api.thing() } }
        assertEquals(502, e.status)
    }
}
```

`AuthInterceptorTest.kt`:

```kotlin
package uz.etalon.crm.core.network

import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class AuthInterceptorTest {
    private class FakeTokens(var t: String?) : TokenProvider {
        var unauthorizedCalls = 0
        override suspend fun token() = t
        override suspend fun onUnauthorized() { unauthorizedCalls++; t = null }
    }

    @Test fun `adds the Bearer header when a token exists and skips it when not`() {
        val server = MockWebServer().also { it.start() }
        server.enqueue(MockResponse().setBody("{}")); server.enqueue(MockResponse().setBody("{}"))
        val tokens = FakeTokens("abc")
        val client = OkHttpClient.Builder().addInterceptor(AuthInterceptor(tokens)).build()
        client.newCall(Request.Builder().url(server.url("/api/x")).build()).execute()
        assertEquals("Bearer abc", server.takeRequest().getHeader("Authorization"))
        tokens.t = null
        client.newCall(Request.Builder().url(server.url("/api/x")).build()).execute()
        assertNull(server.takeRequest().getHeader("Authorization"))
        server.shutdown()
    }

    @Test fun `a 401 clears the session once`() {
        val server = MockWebServer().also { it.start() }
        server.enqueue(MockResponse().setResponseCode(401).setBody("""{"ok":false,"error":"Unauthorized"}"""))
        val tokens = FakeTokens("abc")
        val client = OkHttpClient.Builder().addInterceptor(AuthInterceptor(tokens)).build()
        client.newCall(Request.Builder().url(server.url("/api/x")).build()).execute()
        assertEquals(1, tokens.unauthorizedCalls)
        server.shutdown()
    }

    @Test fun `login is never given a stale token`() {
        val server = MockWebServer().also { it.start() }
        server.enqueue(MockResponse().setBody("{}"))
        val client = OkHttpClient.Builder().addInterceptor(AuthInterceptor(FakeTokens("old"))).build()
        client.newCall(Request.Builder().url(server.url("/api/auth/login")).build()).execute()
        assertNull(server.takeRequest().getHeader("Authorization"))
        server.shutdown()
    }
}
```

`MediaUrlTest.kt`:

```kotlin
package uz.etalon.crm.core.network

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class MediaUrlTest {
    @Test fun `prefixes relative uploads paths with the origin`() {
        assertEquals("https://etalontbm.uz/uploads/orders/o1/loaded-1.jpg", MediaUrl.absolute("https://etalontbm.uz", "/uploads/orders/o1/loaded-1.jpg"))
    }
    @Test fun `leaves absolute urls alone and passes null through`() {
        assertEquals("https://x/y.jpg", MediaUrl.absolute("https://etalontbm.uz", "https://x/y.jpg"))
        assertNull(MediaUrl.absolute("https://etalontbm.uz", null))
    }
    @Test fun `tolerates a trailing slash on the base`() {
        assertEquals("https://etalontbm.uz/uploads/a.jpg", MediaUrl.absolute("https://etalontbm.uz/", "/uploads/a.jpg"))
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./gradlew :core:network:testDebugUnitTest`
Expected: compilation FAIL.

- [ ] **Step 3: Module build file**

```kotlin
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
```

- [ ] **Step 4: Envelope + exception**

`Envelope.kt`:

```kotlin
package uz.etalon.crm.core.network

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** The server's {ok,data} / {ok:false,error,details} envelope (src/lib/api.ts). */
@Serializable
data class Envelope(val ok: Boolean, val data: JsonElement? = null, val error: String? = null, val details: JsonElement? = null)
```

`ApiException.kt`:

```kotlin
package uz.etalon.crm.core.network

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.io.IOException

class ApiException(val status: Int, val error: String, val details: JsonElement? = null) : IOException(error) {
    /** Server strings are "Uzbek · English"; the UI shows the Uzbek half. */
    val uzbekMessage: String get() = error.split(" · ").first().trim()
    /** Machine code such as INBOX_LOCKED, PHONE_BELONGS_TO_OTHER, BLENDER_OFFLINE. */
    val code: String? get() = runCatching { details?.jsonObject?.get("code")?.jsonPrimitive?.content }.getOrNull()
}
```

`EnvelopeInterceptor.kt` — an OkHttp interceptor is the right seam (a Retrofit CallAdapter only sees the body after the converter has already run):

```kotlin
package uz.etalon.crm.core.network

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.Response
import okhttp3.ResponseBody.Companion.toResponseBody

/**
 * Rewrites {ok:true,data:T} bodies to just T so Retrofit's converter
 * deserialises T directly, and throws ApiException for {ok:false} on any
 * status or for non-JSON error responses. Twin of src/lib/fetcher.ts.
 * Binary responses (PDF, xlsx) pass through untouched.
 */
class EnvelopeInterceptor(private val json: Json) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val res = chain.proceed(chain.request())
        val type = res.header("Content-Type") ?: ""
        if (!type.contains("application/json")) {
            if (res.isSuccessful) return res
            res.close()
            throw ApiException(res.code, "Сервер хатоси · Server error")
        }
        val text = res.body?.string() ?: ""
        val env = runCatching { json.decodeFromString(Envelope.serializer(), text) }.getOrNull()
            // Not an envelope (legacy bare JSON): pass through untouched.
            ?: return res.newBuilder().body(text.toResponseBody(JSON_TYPE)).build()
        if (!env.ok) throw ApiException(res.code, env.error ?: "Сервер хатоси · Server error", env.details)
        val data: JsonElement = env.data ?: JsonNull
        return res.newBuilder().body(json.encodeToString(JsonElement.serializer(), data).toResponseBody(JSON_TYPE)).build()
    }
    private companion object { val JSON_TYPE = "application/json".toMediaType() }
}
```

- [ ] **Step 5: Auth interceptor, token provider, media url**

`TokenProvider.kt`:

```kotlin
package uz.etalon.crm.core.network

interface TokenProvider {
    suspend fun token(): String?
    /** Called once per 401 so the session can be cleared and the PIN screen shown. */
    suspend fun onUnauthorized()
}
```

`AuthInterceptor.kt`:

```kotlin
package uz.etalon.crm.core.network

import kotlinx.coroutines.runBlocking
import okhttp3.Interceptor
import okhttp3.Response

private val PUBLIC_PATHS = listOf("/api/auth/login", "/api/health")

class AuthInterceptor(private val tokens: TokenProvider) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val req = chain.request()
        val isPublic = PUBLIC_PATHS.any { req.url.encodedPath == it }
        val token = if (isPublic) null else runBlocking { tokens.token() }
        val authed = if (token != null) req.newBuilder().header("Authorization", "Bearer $token").build() else req
        val res = chain.proceed(authed)
        if (res.code == 401 && !isPublic) runBlocking { tokens.onUnauthorized() }
        return res
    }
}
```

`MediaUrl.kt`:

```kotlin
package uz.etalon.crm.core.network

/** The API returns relative /uploads/… paths (served publicly by Caddy).
 *  This is the ONE place that knows the origin; if the owner later gates
 *  uploads, add the signed-URL logic here. */
object MediaUrl {
    fun absolute(base: String, path: String?): String? {
        if (path == null) return null
        if (path.startsWith("http://") || path.startsWith("https://")) return path
        return base.trimEnd('/') + "/" + path.trimStart('/')
    }
}
```

- [ ] **Step 6: DTOs and the API interface**

`dto/AuthDto.kt`:

```kotlin
package uz.etalon.crm.core.network.dto

import kotlinx.serialization.Serializable

@Serializable data class LoginRequest(val loginName: String, val pin: String, val client: String = "android")
@Serializable data class UserDto(val id: String, val name: String, val email: String? = null, val role: String, val permissions: List<String>, val mustChangePassword: Boolean, val isActive: Boolean = true)
@Serializable data class LoginResponse(val token: String, val user: UserDto, val redirectTo: String)
@Serializable data class ChangePinRequest(val currentPin: String = "", val newPin: String)
@Serializable data class ChangedDto(val changed: Boolean)
@Serializable data class DeviceRegisterRequest(val fcmToken: String, val platform: String = "android", val appVersion: String? = null)
@Serializable data class DeviceDto(val id: String, val fcmToken: String)
@Serializable data class DeletedDto(val deleted: Boolean)
```

`dto/BootstrapDto.kt`:

```kotlin
package uz.etalon.crm.core.network.dto

import kotlinx.serialization.Serializable

@Serializable data class TierDto(val max_beam_length: Double, val price: Double)
@Serializable data class PricingDto(val m2PriceTiers: List<TierDto>, val extraBeamPriceTiers: List<TierDto>, val blockUnitPrice: Double, val updatedAt: String? = null)
@Serializable data class ThresholdsDto(val low: Int, val moderate: Int, val heavy: Int)
@Serializable data class BootstrapDto(val me: UserDto, val pricing: PricingDto, val capacityThresholds: ThresholdsDto, val regionsVersion: String, val minSupportedAppVersion: String, val serverTime: String)
```

`dto/OrderDto.kt` (only the fields Phase 1a renders; `ignoreUnknownKeys` drops the rest):

```kotlin
package uz.etalon.crm.core.network.dto

import kotlinx.serialization.Serializable

@Serializable data class ClientDto(val id: String, val name: String, val phone: String, val address: String? = null)
@Serializable data class OrderSummaryDto(
    val id: String, val orderNumber: String, val status: String, val paymentState: String,
    val totalPrice: String, val confirmedPaid: String, val totalArea: String, val totalBlocks: Int, val totalBeams: Int,
    val scheduledAt: String, val placedAt: String, val client: ClientDto,
)
@Serializable data class OrdersPageDto(val items: List<OrderSummaryDto>, val total: Int, val page: Int, val pageSize: Int, val totalPages: Int)

@Serializable data class NameDto(val id: String, val name: String)
@Serializable data class CalculationDto(val name: String? = null, val innerWidth: String, val innerLength: String, val pattern: String, val beamLength: String, val beamCount: Int, val totalBlocks: Int, val billedArea: String, val subtotal: String)
@Serializable data class ProjectDto(val calculations: List<CalculationDto> = emptyList())
@Serializable data class ReceiptDto(val id: String, val imageUrl: String)
@Serializable data class PaymentDto(val id: String, val amount: String, val method: String, val status: String, val recordedAt: String, val recordedBy: NameDto? = null, val receipts: List<ReceiptDto> = emptyList())
@Serializable data class DriverDto(val id: String, val name: String)
@Serializable data class ShipmentDto(val id: String, val number: Int, val status: String, val loadedBlocks: Int? = null, val loadedPhotoUrl: String? = null, val driver: DriverDto? = null, val truckIdentifier: String? = null)
@Serializable data class OrderEventDto(val id: String, val type: String, val message: String? = null, val actor: NameDto? = null, val createdAt: String)
@Serializable data class GalleryPhotoDto(val id: String, val url: String)
@Serializable data class OrderDetailDto(
    val id: String, val orderNumber: String, val status: String, val paymentState: String,
    val totalPrice: String, val confirmedPaid: String, val totalArea: String, val totalBlocks: Int, val totalBeams: Int,
    val scheduledAt: String, val placedAt: String, val client: ClientDto, val notes: String? = null,
    val deliveryLat: Double? = null, val deliveryLng: Double? = null, val deliveryLocationUrl: String? = null, val deliveryLocationLabel: String? = null,
    val roomsSubtotal: String, val discountAmount: String, val deliveryCost: String, val otherCost: String, val writeOffAmount: String = "0",
    val deliveryProofUrl: String? = null,
    val project: ProjectDto = ProjectDto(),
    val payments: List<PaymentDto> = emptyList(),
    val shipments: List<ShipmentDto> = emptyList(),
    val events: List<OrderEventDto> = emptyList(),
    val galleryPhotos: List<GalleryPhotoDto> = emptyList(),
)
```

`EtalonApi.kt`:

```kotlin
package uz.etalon.crm.core.network

import retrofit2.http.*
import uz.etalon.crm.core.network.dto.*

interface EtalonApi {
    @POST("/api/auth/login") suspend fun login(@Body body: LoginRequest): LoginResponse
    @GET("/api/auth/me") suspend fun me(): UserDto
    @GET("/api/mobile/bootstrap") suspend fun bootstrap(): BootstrapDto
    @POST("/api/users/me/password") suspend fun changePin(@Body body: ChangePinRequest): ChangedDto
    @PUT("/api/devices") suspend fun registerDevice(@Body body: DeviceRegisterRequest): DeviceDto
    @DELETE("/api/devices/{token}") suspend fun unregisterDevice(@Path("token") token: String): DeletedDto
    @GET("/api/orders") suspend fun orders(
        @Query("q") q: String? = null, @Query("status") status: String? = null, @Query("day") day: String? = null,
        @Query("page") page: Int = 1, @Query("pageSize") pageSize: Int = 20,
    ): OrdersPageDto
    @GET("/api/orders/{id}") suspend fun order(@Path("id") id: String): OrderDetailDto
}
```

`di/NetworkModule.kt`:

```kotlin
package uz.etalon.crm.core.network.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.Json
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.kotlinxserialization.asConverterFactory
import uz.etalon.crm.core.network.*
import java.util.concurrent.TimeUnit
import javax.inject.Named
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides @Singleton fun json(): Json = Json { ignoreUnknownKeys = true; explicitNulls = false; coerceInputValues = true }

    @Provides @Singleton fun okHttp(json: Json, tokens: TokenProvider): OkHttpClient =
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).writeTimeout(60, TimeUnit.SECONDS)
            .addInterceptor(AuthInterceptor(tokens))
            .addInterceptor(EnvelopeInterceptor(json))
            .addInterceptor(HttpLoggingInterceptor().apply { level = if (BuildConfig.DEBUG) HttpLoggingInterceptor.Level.BASIC else HttpLoggingInterceptor.Level.NONE })
            .build()

    @Provides @Singleton fun retrofit(client: OkHttpClient, json: Json, @Named("apiBaseUrl") base: String): Retrofit =
        Retrofit.Builder().baseUrl(base.trimEnd('/') + "/").client(client)
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType())).build()

    @Provides @Singleton fun api(retrofit: Retrofit): EtalonApi = retrofit.create(EtalonApi::class.java)
}
```

`@Named("apiBaseUrl")` and `TokenProvider` are bound in `:app` (Task 10) and `:core:datastore` (Task 5) respectively. Add `buildConfigField` for `DEBUG` is automatic.

- [ ] **Step 7: Run tests**

Run: `./gradlew :core:network:testDebugUnitTest`
Expected: PASS (7 tests).

- [ ] **Step 8: Commit**

```bash
git add android/core/network
git commit -m "Feat(android) · Retrofit API, envelope + auth interceptors, DTOs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Token store and session prefs (`:core:datastore`)

**Files:**
- Modify: `android/core/datastore/build.gradle.kts`
- Create: `…/core/datastore/TokenStore.kt`, `SessionPrefs.kt`, `di/DataStoreModule.kt`
- Test: `…/core/datastore/src/test/kotlin/uz/etalon/crm/core/datastore/TokenStoreTest.kt`

**Interfaces:**
- Produces: `interface TokenStore { suspend fun get(): String?; suspend fun set(token: String); suspend fun clear(); val isLoggedIn: Flow<Boolean> }`; `KeystoreTokenStore` (EncryptedSharedPreferences via `security-crypto`, key alias `etalon_token`); `InMemoryTokenStore` for tests; `SessionPrefs` (DataStore) with `lastLoginName: Flow<String?>`, `setLastLoginName`, `fcmToken`, `setFcmToken`; `DataStoreModule` binds `TokenStore` and implements `TokenProvider` on top of it.

- [ ] **Step 1: Write the failing test**

```kotlin
package uz.etalon.crm.core.datastore

import app.cash.turbine.test
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test

class TokenStoreTest {
    @Test fun `in-memory store round-trips and reports login state`() = runTest {
        val s = InMemoryTokenStore()
        s.isLoggedIn.test {
            assertFalse(awaitItem())
            s.set("jwt"); assertTrue(awaitItem())
            assertEquals("jwt", s.get())
            s.clear(); assertFalse(awaitItem())
            assertNull(s.get())
        }
    }
    @Test fun `TokenProvider clears on unauthorized`() = runTest {
        val s = InMemoryTokenStore().apply { set("jwt") }
        val p = StoreTokenProvider(s)
        assertEquals("jwt", p.token())
        p.onUnauthorized()
        assertNull(p.token())
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `./gradlew :core:datastore:testDebugUnitTest` — compilation FAIL.

- [ ] **Step 3: Build file and implementation**

```kotlin
plugins { id("etalon.android.library"); id("etalon.hilt") }
android { namespace = "uz.etalon.crm.core.datastore" }
dependencies {
    implementation(project(":core:network"))
    implementation(libs.datastore.preferences)
    implementation(libs.security.crypto)
    implementation(libs.kotlinx.coroutines.android)
}
```

`TokenStore.kt`:

```kotlin
package uz.etalon.crm.core.datastore

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import uz.etalon.crm.core.network.TokenProvider
import javax.inject.Inject
import javax.inject.Singleton

interface TokenStore {
    suspend fun get(): String?
    suspend fun set(token: String)
    suspend fun clear()
    val isLoggedIn: Flow<Boolean>
}

class InMemoryTokenStore : TokenStore {
    private val state = MutableStateFlow<String?>(null)
    override suspend fun get() = state.value
    override suspend fun set(token: String) { state.value = token }
    override suspend fun clear() { state.value = null }
    override val isLoggedIn: Flow<Boolean> = kotlinx.coroutines.flow.map(state.asStateFlow()) { it != null }
}

/** JWT at rest, encrypted with an Android Keystore master key (spec §4.7). */
@Singleton
class KeystoreTokenStore @Inject constructor(context: Context) : TokenStore {
    private val prefs = EncryptedSharedPreferences.create(
        context, "etalon_session",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
    private val state = MutableStateFlow(prefs.getString(KEY, null))
    override suspend fun get() = state.value
    override suspend fun set(token: String) = withContext(Dispatchers.IO) { prefs.edit().putString(KEY, token).apply(); state.value = token }
    override suspend fun clear() = withContext(Dispatchers.IO) { prefs.edit().remove(KEY).apply(); state.value = null }
    override val isLoggedIn: Flow<Boolean> = kotlinx.coroutines.flow.map(state.asStateFlow()) { it != null }
    private companion object { const val KEY = "jwt" }
}

/** Bridges the store to the network layer's TokenProvider. */
class StoreTokenProvider @Inject constructor(private val store: TokenStore) : TokenProvider {
    override suspend fun token() = store.get()
    override suspend fun onUnauthorized() = store.clear()
}
```

`SessionPrefs.kt`:

```kotlin
package uz.etalon.crm.core.datastore

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.sessionDataStore by preferencesDataStore("session_prefs")

@Singleton
class SessionPrefs @Inject constructor(private val context: Context) {
    private val lastLogin = stringPreferencesKey("last_login_name")
    private val fcm = stringPreferencesKey("fcm_token")
    val lastLoginName: Flow<String?> = context.sessionDataStore.data.map { it[lastLogin] }
    suspend fun setLastLoginName(v: String) { context.sessionDataStore.edit { it[lastLogin] = v } }
    val fcmToken: Flow<String?> = context.sessionDataStore.data.map { it[fcm] }
    suspend fun setFcmToken(v: String?) { context.sessionDataStore.edit { if (v == null) it.remove(fcm) else it[fcm] = v } }
}
```

`di/DataStoreModule.kt`:

```kotlin
package uz.etalon.crm.core.datastore.di

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import uz.etalon.crm.core.datastore.KeystoreTokenStore
import uz.etalon.crm.core.datastore.StoreTokenProvider
import uz.etalon.crm.core.datastore.TokenStore
import uz.etalon.crm.core.network.TokenProvider
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class DataStoreModule {
    @Binds abstract fun tokenProvider(impl: StoreTokenProvider): TokenProvider
    companion object {
        @Provides @Singleton fun tokenStore(@ApplicationContext ctx: Context): TokenStore = KeystoreTokenStore(ctx)
    }
}
```

- [ ] **Step 4: Run tests**

Run: `./gradlew :core:datastore:testDebugUnitTest` — PASS.

- [ ] **Step 5: Commit**

```bash
git add android/core/datastore
git commit -m "Feat(android) · Keystore-backed token store and session prefs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Room cache (`:core:database`)

**Files:**
- Modify: `android/core/database/build.gradle.kts`; add `robolectric = { module = "org.robolectric:robolectric", version = "<latest>" }` and `androidx-test-core = { module = "androidx.test:core", version = "<latest>" }` to the version catalog
- Create: `…/core/database/EtalonDatabase.kt`, `entity/OrderSummaryEntity.kt`, `entity/OrderDetailEntity.kt`, `dao/OrdersDao.kt`, `di/DatabaseModule.kt`
- Test: `…/core/database/src/test/kotlin/uz/etalon/crm/core/database/OrdersDaoTest.kt` (Robolectric, in-memory Room)

**Interfaces:**
- Produces: `OrderSummaryEntity(id, orderNumber, status, paymentState, totalPrice: String, confirmedPaid: String, totalArea: String, totalBlocks, totalBeams, scheduledAt: Long, placedAt: Long, clientId, clientName, clientPhone, clientAddress, listKey: String, position: Int, cachedAt: Long)`; `OrderDetailEntity(id, json: String, cachedAt: Long)` (the raw `OrderDetailDto` JSON, decoded by the repository — the detail aggregate changes often and does not need columns); `OrdersDao` with `observeList(listKey): Flow<List<OrderSummaryEntity>>`, `replaceList(listKey, rows)` (transaction: delete + insert), `observeDetail(id): Flow<OrderDetailEntity?>`, `upsertDetail`, `deleteOrder(id)`; `EtalonDatabase` v1.

- [ ] **Step 1: Write the failing test**

```kotlin
package uz.etalon.crm.core.database

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.cash.turbine.test
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.extension.ExtendWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uz.etalon.crm.core.database.entity.OrderSummaryEntity

@org.junit.runner.RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class OrdersDaoTest {
    private fun db() = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), EtalonDatabase::class.java).allowMainThreadQueries().build()
    private fun row(id: String, key: String, pos: Int) = OrderSummaryEntity(
        id = id, orderNumber = "2026-09-00$pos", status = "PLACED", paymentState = "AWAITING_PAYMENT",
        totalPrice = "100.00", confirmedPaid = "0.00", totalArea = "10.000", totalBlocks = 1, totalBeams = 1,
        scheduledAt = 0, placedAt = 0, clientId = "c", clientName = "Азизов", clientPhone = "998901112233", clientAddress = null,
        listKey = key, position = pos, cachedAt = 0,
    )

    @org.junit.Test fun replaceList_keepsOrderAndIsolatesKeys() = runTest {
        val d = db().ordersDao()
        d.replaceList("all", listOf(row("a", "all", 1), row("b", "all", 0)))
        d.replaceList("placed", listOf(row("a", "placed", 0)))
        d.observeList("all").test {
            assertEquals(listOf("b", "a"), awaitItem().map { it.id })
            cancelAndIgnoreRemainingEvents()
        }
        d.replaceList("all", listOf(row("c", "all", 0)))
        d.observeList("all").test { assertEquals(listOf("c"), awaitItem().map { it.id }); cancelAndIgnoreRemainingEvents() }
        d.observeList("placed").test { assertEquals(listOf("a"), awaitItem().map { it.id }); cancelAndIgnoreRemainingEvents() }
    }

    @org.junit.Test fun deleteOrder_removesSummaryAndDetail() = runTest {
        val d = db().ordersDao()
        d.replaceList("all", listOf(row("a", "all", 0)))
        d.upsertDetail(uz.etalon.crm.core.database.entity.OrderDetailEntity("a", "{}", 0))
        d.deleteOrder("a")
        d.observeList("all").test { assertTrue(awaitItem().isEmpty()); cancelAndIgnoreRemainingEvents() }
        d.observeDetail("a").test { assertNull(awaitItem()); cancelAndIgnoreRemainingEvents() }
    }
}
```

(Robolectric needs JUnit 4's runner; the module's `useJUnitPlatform()` runs JUnit 4 tests through the vintage engine — add `testRuntimeOnly("org.junit.vintage:junit-vintage-engine:<junit5 version>")` in this module.)

- [ ] **Step 2: Run to verify it fails** — `./gradlew :core:database:testDebugUnitTest` → compilation FAIL.

- [ ] **Step 3: Build file**

```kotlin
plugins { id("etalon.android.library"); id("etalon.hilt") }
android { namespace = "uz.etalon.crm.core.database" }
dependencies {
    implementation(libs.room.runtime); implementation(libs.room.ktx); ksp(libs.room.compiler)
    testImplementation(libs.robolectric); testImplementation(libs.androidx.test.core); testImplementation(libs.room.testing)
    testRuntimeOnly("org.junit.vintage:junit-vintage-engine:${libs.versions.junit5.get()}")
}
```

- [ ] **Step 4: Entities, DAO, database, module**

`entity/OrderSummaryEntity.kt`:

```kotlin
package uz.etalon.crm.core.database.entity

import androidx.room.Entity
import androidx.room.Index

/** One cached row of a list page. `listKey` = the query (e.g. "q=|status=PLACED|day=|page=1")
 *  so different filters never overwrite each other; money stays a string. */
@Entity(tableName = "order_summaries", primaryKeys = ["id", "listKey"], indices = [Index("listKey", "position")])
data class OrderSummaryEntity(
    val id: String, val orderNumber: String, val status: String, val paymentState: String,
    val totalPrice: String, val confirmedPaid: String, val totalArea: String, val totalBlocks: Int, val totalBeams: Int,
    val scheduledAt: Long, val placedAt: Long,
    val clientId: String, val clientName: String, val clientPhone: String, val clientAddress: String?,
    val listKey: String, val position: Int, val cachedAt: Long,
)
```

`entity/OrderDetailEntity.kt`:

```kotlin
package uz.etalon.crm.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "order_details")
data class OrderDetailEntity(@PrimaryKey val id: String, val json: String, val cachedAt: Long)
```

`dao/OrdersDao.kt`:

```kotlin
package uz.etalon.crm.core.database.dao

import androidx.room.*
import kotlinx.coroutines.flow.Flow
import uz.etalon.crm.core.database.entity.OrderDetailEntity
import uz.etalon.crm.core.database.entity.OrderSummaryEntity

@Dao
interface OrdersDao {
    @Query("SELECT * FROM order_summaries WHERE listKey = :listKey ORDER BY position") fun observeList(listKey: String): Flow<List<OrderSummaryEntity>>
    @Query("DELETE FROM order_summaries WHERE listKey = :listKey") suspend fun clearList(listKey: String)
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun insertAll(rows: List<OrderSummaryEntity>)
    @Transaction suspend fun replaceList(listKey: String, rows: List<OrderSummaryEntity>) { clearList(listKey); insertAll(rows) }
    @Query("SELECT * FROM order_details WHERE id = :id") fun observeDetail(id: String): Flow<OrderDetailEntity?>
    @Insert(onConflict = OnConflictStrategy.REPLACE) suspend fun upsertDetail(row: OrderDetailEntity)
    @Query("DELETE FROM order_summaries WHERE id = :id") suspend fun deleteSummaries(id: String)
    @Query("DELETE FROM order_details WHERE id = :id") suspend fun deleteDetail(id: String)
    @Transaction suspend fun deleteOrder(id: String) { deleteSummaries(id); deleteDetail(id) }
    @Query("DELETE FROM order_summaries") suspend fun clearAllSummaries()
    @Query("DELETE FROM order_details") suspend fun clearAllDetails()
}
```

`EtalonDatabase.kt`:

```kotlin
package uz.etalon.crm.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
import uz.etalon.crm.core.database.dao.OrdersDao
import uz.etalon.crm.core.database.entity.OrderDetailEntity
import uz.etalon.crm.core.database.entity.OrderSummaryEntity

@Database(entities = [OrderSummaryEntity::class, OrderDetailEntity::class], version = 1, exportSchema = true)
abstract class EtalonDatabase : RoomDatabase() {
    abstract fun ordersDao(): OrdersDao
    /** Called on sign-out so the next user never sees the previous user's cache. */
    suspend fun wipe() { ordersDao().clearAllSummaries(); ordersDao().clearAllDetails() }
}
```

`di/DatabaseModule.kt`:

```kotlin
package uz.etalon.crm.core.database.di

import android.content.Context
import androidx.room.Room
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import uz.etalon.crm.core.database.EtalonDatabase
import uz.etalon.crm.core.database.dao.OrdersDao
import javax.inject.Singleton

@Module @InstallIn(SingletonComponent::class)
object DatabaseModule {
    @Provides @Singleton fun db(@ApplicationContext ctx: Context): EtalonDatabase =
        Room.databaseBuilder(ctx, EtalonDatabase::class.java, "etalon.db").fallbackToDestructiveMigration(true).build()
    @Provides fun ordersDao(db: EtalonDatabase): OrdersDao = db.ordersDao()
}
```

(`fallbackToDestructiveMigration` is acceptable: the DB is a cache; every row is re-fetchable.)

- [ ] **Step 5: Run tests** — `./gradlew :core:database:testDebugUnitTest` → PASS.

- [ ] **Step 6: Commit**

```bash
git add android/core/database android/gradle/libs.versions.toml
git commit -m "Feat(android) · Room cache for order lists and details

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Repositories and mappers (`:core:data`)

**Files:**
- Modify: `android/core/data/build.gradle.kts`
- Create: `…/core/data/mapper/OrderMappers.kt`, `mapper/SessionMappers.kt`, `ErrorMapper.kt`, `SessionRepository.kt`, `OrdersRepository.kt`, `DeviceRepository.kt`, `di/DataModule.kt`
- Test: `…/core/data/src/test/kotlin/uz/etalon/crm/core/data/OrderMappersTest.kt`, `ErrorMapperTest.kt`, `OrdersRepositoryTest.kt`

**Interfaces:**
- Produces:
  - `fun OrderSummaryDto.toDomain(): OrderSummary`; `fun OrderDetailDto.toDomain(mediaBase: String, fetchedAt: Instant): OrderDetail`; `fun OrderSummary.toEntity(listKey, position, cachedAt)`; `fun OrderSummaryEntity.toDomain()`
  - `fun Throwable.toAppError(): AppError`
  - `class SessionRepository { val me: StateFlow<Me?>; val isLoggedIn: Flow<Boolean>; suspend fun login(loginName, pin): Result<Me>; suspend fun bootstrap(): Result<Bootstrap>; suspend fun changePin(current, new): Result<Unit>; suspend fun signOut() }`
  - `class OrdersRepository { fun list(filter: OrdersFilter): Flow<Resource<List<OrderSummary>>>; fun detail(id): Flow<Resource<OrderDetail>>; suspend fun refreshList(filter); suspend fun refreshDetail(id) }` with `data class OrdersFilter(q: String? = null, status: OrderStatus? = null, day: LocalDate? = null, page: Int = 1)` and `OrdersFilter.listKey`
  - `class DeviceRepository { suspend fun register(fcmToken, appVersion); suspend fun unregisterCurrent() }`

- [ ] **Step 1: Write the failing tests**

`OrderMappersTest.kt`:

```kotlin
package uz.etalon.crm.core.data

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.model.*
import uz.etalon.crm.core.network.dto.*
import java.math.BigDecimal
import java.time.Instant

class OrderMappersTest {
    private val dto = OrderSummaryDto("o1", "2026-09-0041", "PLACED", "PARTIALLY_PAID", "12400000.00", "6000000.00", "86.400", 210, 10,
        "2026-09-04T00:00:00.000Z", "2026-09-01T09:15:00.000Z", ClientDto("c1", "Азизов Б.", "998901112233", "Яшнобод"))

    @Test fun `summary maps money as strings and enums by name`() {
        val o = dto.toDomain()
        assertEquals(Money.parse("12400000.00"), o.totalPrice)
        assertEquals(OrderStatus.PLACED, o.status)
        assertEquals(PaymentState.PARTIALLY_PAID, o.paymentState)
        assertEquals(BigDecimal("86.400"), o.totalArea)
        assertEquals(Money.parse("6400000.00"), o.remaining)
        assertEquals(Instant.parse("2026-09-04T00:00:00Z"), o.scheduledAt)
    }
    @Test fun `unknown enum values do not crash`() {
        assertEquals(OrderStatus.UNKNOWN, dto.copy(status = "SOMETHING_NEW").toDomain().status)
    }
    @Test fun `detail makes media urls absolute and computes remaining with write-off`() {
        val d = OrderDetailDto("o1", "2026-09-0041", "LOADED", "PARTIALLY_PAID", "100.00", "60.00", "10.000", 1, 1,
            "2026-09-04T00:00:00.000Z", "2026-09-01T00:00:00.000Z", ClientDto("c1", "A", "998901112233", null),
            roomsSubtotal = "100.00", discountAmount = "0", deliveryCost = "0", otherCost = "0", writeOffAmount = "10.00",
            deliveryProofUrl = "/uploads/orders/o1/delivery-1.jpg",
            galleryPhotos = listOf(GalleryPhotoDto("g1", "/uploads/orders/o1/loaded-1.jpg")),
            payments = listOf(PaymentDto("p1", "60.00", "CASH", "CONFIRMED", "2026-09-02T00:00:00.000Z", NameDto("u1", "Азиз"), listOf(ReceiptDto("r1", "/uploads/receipts/u1/x.jpg")))))
        val o = d.toDomain("https://etalontbm.uz", Instant.EPOCH)
        assertEquals(Money.parse("30.00"), o.remaining)
        assertEquals("https://etalontbm.uz/uploads/orders/o1/loaded-1.jpg", o.loadedPhotoUrls.single())
        assertEquals("https://etalontbm.uz/uploads/orders/o1/delivery-1.jpg", o.deliveryProofUrl)
        assertEquals("https://etalontbm.uz/uploads/receipts/u1/x.jpg", o.payments.single().receiptUrls.single())
        assertEquals(PaymentMethod.CASH, o.payments.single().method)
    }
}
```

`ErrorMapperTest.kt`:

```kotlin
package uz.etalon.crm.core.data

import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.network.ApiException
import java.io.IOException

class ErrorMapperTest {
    @Test fun `401 is Unauthorized`() { assertEquals(AppError.Unauthorized, ApiException(401, "Unauthorized").toAppError()) }
    @Test fun `403 keeps the Uzbek half`() {
        val e = ApiException(403, "Рухсат йўқ · Permission denied (order.view)").toAppError()
        assertEquals(AppError.Forbidden("Рухсат йўқ"), e)
    }
    @Test fun `422 exposes field errors from zod flatten`() {
        val details = Json.parseToJsonElement("""{"fieldErrors":{"pin":["PIN must be exactly 4 digits"]},"formErrors":[]}""")
        val e = ApiException(422, "Validation failed", details).toAppError() as AppError.Validation
        assertEquals("PIN must be exactly 4 digits", e.fields["pin"])
    }
    @Test fun `409 carries the machine code`() {
        val details = Json.parseToJsonElement("""{"code":"PHONE_BELONGS_TO_OTHER"}""")
        assertEquals(AppError.Conflict("Телефон бошқа мижозники", "PHONE_BELONGS_TO_OTHER"), ApiException(409, "Телефон бошқа мижозники · Phone belongs to another client", details).toAppError())
    }
    @Test fun `IOException is Network with an Uzbek message`() {
        assertEquals(AppError.Network("Интернет йўқ"), IOException("timeout").toAppError())
    }
}
```

`OrdersRepositoryTest.kt` (fake API + in-memory DAO):

```kotlin
package uz.etalon.crm.core.data

import app.cash.turbine.test
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.database.dao.OrdersDao
import uz.etalon.crm.core.database.entity.OrderDetailEntity
import uz.etalon.crm.core.database.entity.OrderSummaryEntity
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.network.ApiException
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.*
import java.io.IOException

private class FakeDao : OrdersDao {
    val lists = MutableStateFlow<Map<String, List<OrderSummaryEntity>>>(emptyMap())
    val details = MutableStateFlow<Map<String, OrderDetailEntity>>(emptyMap())
    override fun observeList(listKey: String) = lists.map { it[listKey].orEmpty() }
    override suspend fun clearList(listKey: String) { lists.value = lists.value - listKey }
    override suspend fun insertAll(rows: List<OrderSummaryEntity>) { rows.groupBy { it.listKey }.forEach { (k, v) -> lists.value = lists.value + (k to (lists.value[k].orEmpty() + v).sortedBy { it.position }) } }
    override suspend fun replaceList(listKey: String, rows: List<OrderSummaryEntity>) { clearList(listKey); insertAll(rows) }
    override fun observeDetail(id: String) = details.map { it[id] }
    override suspend fun upsertDetail(row: OrderDetailEntity) { details.value = details.value + (row.id to row) }
    override suspend fun deleteSummaries(id: String) { lists.value = lists.value.mapValues { (_, v) -> v.filterNot { it.id == id } } }
    override suspend fun deleteDetail(id: String) { details.value = details.value - id }
    override suspend fun deleteOrder(id: String) { deleteSummaries(id); deleteDetail(id) }
    override suspend fun clearAllSummaries() { lists.value = emptyMap() }
    override suspend fun clearAllDetails() { details.value = emptyMap() }
}

private open class FakeApi : EtalonApi {
    var page: OrdersPageDto = OrdersPageDto(emptyList(), 0, 1, 20, 0)
    var fail: Throwable? = null
    override suspend fun orders(q: String?, status: String?, day: String?, page: Int, pageSize: Int): OrdersPageDto { fail?.let { throw it }; return this.page }
    override suspend fun order(id: String): OrderDetailDto { fail?.let { throw it }; throw ApiException(404, "Топилмади · Not found") }
    override suspend fun login(body: LoginRequest) = error("unused")
    override suspend fun me() = error("unused")
    override suspend fun bootstrap() = error("unused")
    override suspend fun changePin(body: ChangePinRequest) = error("unused")
    override suspend fun registerDevice(body: DeviceRegisterRequest) = error("unused")
    override suspend fun unregisterDevice(token: String) = error("unused")
}

class OrdersRepositoryTest {
    private val summary = OrderSummaryDto("o1", "2026-09-0041", "PLACED", "AWAITING_PAYMENT", "1.00", "0", "1.000", 1, 1, "2026-09-04T00:00:00Z", "2026-09-01T00:00:00Z", ClientDto("c", "A", "998901112233", null))

    @Test fun `emits Loading(null) then Success after a refresh`() = runTest {
        val api = FakeApi().apply { page = OrdersPageDto(listOf(summary), 1, 1, 20, 1) }
        val repo = OrdersRepository(api, FakeDao(), Json { ignoreUnknownKeys = true }, "https://x")
        repo.list(OrdersFilter()).test {
            assertEquals(Resource.Loading<List<uz.etalon.crm.core.model.OrderSummary>>(null), awaitItem())
            repo.refreshList(OrdersFilter())
            val s = awaitItem() as Resource.Success
            assertEquals("2026-09-0041", s.data.single().orderNumber)
            cancelAndIgnoreRemainingEvents()
        }
    }
    @Test fun `network failure keeps cached rows and reports Error`() = runTest {
        val dao = FakeDao(); val api = FakeApi().apply { page = OrdersPageDto(listOf(summary), 1, 1, 20, 1) }
        val repo = OrdersRepository(api, dao, Json { ignoreUnknownKeys = true }, "https://x")
        repo.refreshList(OrdersFilter())
        api.fail = IOException("down")
        repo.list(OrdersFilter()).test {
            awaitItem() // Loading(cached)
            repo.refreshList(OrdersFilter())
            val e = awaitItem() as Resource.Error
            assertEquals(1, e.cached!!.size)
            cancelAndIgnoreRemainingEvents()
        }
    }
    @Test fun `a 404 on detail evicts the cached order`() = runTest {
        val dao = FakeDao().apply { details.value = mapOf("o1" to OrderDetailEntity("o1", "{}", 0)) }
        val repo = OrdersRepository(FakeApi(), dao, Json { ignoreUnknownKeys = true }, "https://x")
        repo.refreshDetail("o1")
        assertNull(dao.details.value["o1"])
    }
    @Test fun `listKey distinguishes filters`() {
        assertNotEquals(OrdersFilter().listKey, OrdersFilter(status = OrderStatus.PLACED).listKey)
        assertEquals("q=|status=|day=|page=1", OrdersFilter().listKey)
    }
}
```

- [ ] **Step 2: Run to verify it fails** — `./gradlew :core:data:testDebugUnitTest` → compilation FAIL.

- [ ] **Step 3: Build file**

```kotlin
plugins { id("etalon.android.library"); id("etalon.hilt"); alias(libs.plugins.kotlin.serialization) }
android { namespace = "uz.etalon.crm.core.data" }
dependencies {
    api(project(":core:model")); implementation(project(":core:network")); implementation(project(":core:database")); implementation(project(":core:datastore"))
    implementation(libs.kotlinx.serialization.json); implementation(libs.kotlinx.coroutines.android)
}
```

- [ ] **Step 4: Mappers**

`mapper/OrderMappers.kt`:

```kotlin
package uz.etalon.crm.core.data.mapper

import uz.etalon.crm.core.database.entity.OrderSummaryEntity
import uz.etalon.crm.core.model.*
import uz.etalon.crm.core.network.MediaUrl
import uz.etalon.crm.core.network.dto.OrderDetailDto
import uz.etalon.crm.core.network.dto.OrderSummaryDto
import java.math.BigDecimal
import java.time.Instant

private fun String.toInstant(): Instant = Instant.parse(this)

fun OrderSummaryDto.toDomain() = OrderSummary(
    id = id, orderNumber = orderNumber, status = OrderStatus.from(status), paymentState = PaymentState.from(paymentState),
    totalPrice = Money.parse(totalPrice), confirmedPaid = Money.parse(confirmedPaid), totalArea = BigDecimal(totalArea),
    totalBlocks = totalBlocks, totalBeams = totalBeams, scheduledAt = scheduledAt.toInstant(), placedAt = placedAt.toInstant(),
    client = ClientRef(client.id, client.name, client.phone, client.address),
)

fun OrderSummary.toEntity(listKey: String, position: Int, cachedAt: Long) = OrderSummaryEntity(
    id = id, orderNumber = orderNumber, status = status.name, paymentState = paymentState.name,
    totalPrice = totalPrice.amount.toPlainString(), confirmedPaid = confirmedPaid.amount.toPlainString(), totalArea = totalArea.toPlainString(),
    totalBlocks = totalBlocks, totalBeams = totalBeams, scheduledAt = scheduledAt.toEpochMilli(), placedAt = placedAt.toEpochMilli(),
    clientId = client.id, clientName = client.name, clientPhone = client.phone, clientAddress = client.address,
    listKey = listKey, position = position, cachedAt = cachedAt,
)

fun OrderSummaryEntity.toDomain() = OrderSummary(
    id = id, orderNumber = orderNumber, status = OrderStatus.from(status), paymentState = PaymentState.from(paymentState),
    totalPrice = Money.parse(totalPrice), confirmedPaid = Money.parse(confirmedPaid), totalArea = BigDecimal(totalArea),
    totalBlocks = totalBlocks, totalBeams = totalBeams, scheduledAt = Instant.ofEpochMilli(scheduledAt), placedAt = Instant.ofEpochMilli(placedAt),
    client = ClientRef(clientId, clientName, clientPhone, clientAddress),
)

fun OrderDetailDto.toDomain(mediaBase: String, fetchedAt: Instant): OrderDetail {
    val summary = OrderSummary(
        id = id, orderNumber = orderNumber, status = OrderStatus.from(status), paymentState = PaymentState.from(paymentState),
        totalPrice = Money.parse(totalPrice), confirmedPaid = Money.parse(confirmedPaid), totalArea = BigDecimal(totalArea),
        totalBlocks = totalBlocks, totalBeams = totalBeams, scheduledAt = scheduledAt.toInstant(), placedAt = placedAt.toInstant(),
        client = ClientRef(client.id, client.name, client.phone, client.address),
    )
    return OrderDetail(
        summary = summary, notes = notes,
        deliveryLat = deliveryLat, deliveryLng = deliveryLng, deliveryLocationUrl = deliveryLocationUrl, deliveryLocationLabel = deliveryLocationLabel,
        discountAmount = Money.parse(discountAmount), deliveryCost = Money.parse(deliveryCost), otherCost = Money.parse(otherCost),
        roomsSubtotal = Money.parse(roomsSubtotal), writeOffAmount = Money.parse(writeOffAmount),
        rooms = project.calculations.map { RoomLine(it.name, BigDecimal(it.innerWidth), BigDecimal(it.innerLength), it.pattern, BigDecimal(it.beamLength), it.beamCount, it.totalBlocks, BigDecimal(it.billedArea), Money.parse(it.subtotal)) },
        payments = payments.map { PaymentLine(it.id, Money.parse(it.amount), PaymentMethod.from(it.method), PaymentStatus.from(it.status), it.recordedAt.toInstant(), it.recordedBy?.name, it.receipts.mapNotNull { r -> MediaUrl.absolute(mediaBase, r.imageUrl) }) },
        shipments = shipments.map { ShipmentLine(it.id, it.number, ShipmentStatus.from(it.status), it.loadedBlocks, MediaUrl.absolute(mediaBase, it.loadedPhotoUrl), it.driver?.name, it.truckIdentifier) },
        loadedPhotoUrls = galleryPhotos.mapNotNull { MediaUrl.absolute(mediaBase, it.url) },
        deliveryProofUrl = MediaUrl.absolute(mediaBase, deliveryProofUrl),
        events = events.map { OrderEventLine(it.id, it.type, it.message, it.actor?.name, it.createdAt.toInstant()) },
        fetchedAt = fetchedAt,
    )
}
```

`mapper/SessionMappers.kt`:

```kotlin
package uz.etalon.crm.core.data.mapper

import uz.etalon.crm.core.model.*
import uz.etalon.crm.core.network.dto.BootstrapDto
import uz.etalon.crm.core.network.dto.UserDto

fun UserDto.toMe() = Me(id, name, Role.from(role), permissions.toSet(), mustChangePassword)
fun BootstrapDto.toDomain() = Bootstrap(
    me = me.toMe(),
    pricing = Pricing(pricing.m2PriceTiers.map { it.max_beam_length to it.price.toLong() }, pricing.extraBeamPriceTiers.map { it.max_beam_length to it.price.toLong() }, pricing.blockUnitPrice.toLong()),
    capacity = CapacityThresholds(capacityThresholds.low, capacityThresholds.moderate, capacityThresholds.heavy),
    minSupportedAppVersion = minSupportedAppVersion,
)
```

`ErrorMapper.kt`:

```kotlin
package uz.etalon.crm.core.data

import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import uz.etalon.crm.core.model.AppError
import uz.etalon.crm.core.network.ApiException
import java.io.IOException

fun Throwable.toAppError(): AppError = when (this) {
    is ApiException -> when (status) {
        401 -> AppError.Unauthorized
        403 -> AppError.Forbidden(uzbekMessage)
        422 -> AppError.Validation(
            if (error == "Validation failed") "Маълумот нотўғри" else uzbekMessage,
            runCatching {
                details!!.jsonObject["fieldErrors"]!!.jsonObject.mapValues { (_, v) -> v.jsonArray.first().jsonPrimitive.content }
            }.getOrDefault(emptyMap()),
        )
        409 -> AppError.Conflict(uzbekMessage, code)
        else -> AppError.Server(uzbekMessage, status)
    }
    is IOException -> AppError.Network("Интернет йўқ")
    else -> AppError.Server(message ?: "Хатолик", 0)
}
```

- [ ] **Step 5: Repositories**

`SessionRepository.kt`:

```kotlin
package uz.etalon.crm.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.data.mapper.toMe
import uz.etalon.crm.core.database.EtalonDatabase
import uz.etalon.crm.core.datastore.SessionPrefs
import uz.etalon.crm.core.datastore.TokenStore
import uz.etalon.crm.core.model.Bootstrap
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.ChangePinRequest
import uz.etalon.crm.core.network.dto.LoginRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SessionRepository @Inject constructor(
    private val api: EtalonApi, private val tokens: TokenStore, private val prefs: SessionPrefs, private val db: EtalonDatabase,
) {
    private val _me = MutableStateFlow<Me?>(null)
    val me: StateFlow<Me?> = _me.asStateFlow()
    val isLoggedIn: Flow<Boolean> = tokens.isLoggedIn

    suspend fun login(loginName: String, pin: String): Result<Me> = runCatching {
        val res = api.login(LoginRequest(loginName.trim(), pin))
        tokens.set(res.token)
        prefs.setLastLoginName(loginName.trim())
        res.user.toMe().also { _me.value = it }
    }

    /** Cold start. A 401 here clears the token (AuthInterceptor) and the caller shows the PIN screen. */
    suspend fun bootstrap(): Result<Bootstrap> = runCatching { api.bootstrap().toDomain().also { _me.value = it.me } }

    suspend fun changePin(currentPin: String, newPin: String): Result<Unit> = runCatching {
        api.changePin(ChangePinRequest(currentPin, newPin))
        _me.value = _me.value?.copy(mustChangePassword = false)
    }

    /** Local sign-out: the mobile JWT has no server-side logout; device unregistration is DeviceRepository's job. */
    suspend fun signOut() { tokens.clear(); _me.value = null; db.wipe() }
}
```

`OrdersRepository.kt`:

```kotlin
package uz.etalon.crm.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.data.mapper.toEntity
import uz.etalon.crm.core.database.dao.OrdersDao
import uz.etalon.crm.core.database.entity.OrderDetailEntity
import uz.etalon.crm.core.model.*
import uz.etalon.crm.core.network.ApiException
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.OrderDetailDto
import java.time.Instant
import java.time.LocalDate
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

data class OrdersFilter(val q: String? = null, val status: OrderStatus? = null, val day: LocalDate? = null, val page: Int = 1) {
    val listKey: String get() = "q=${q.orEmpty()}|status=${status?.name.orEmpty()}|day=${day?.toString().orEmpty()}|page=$page"
}

@Singleton
class OrdersRepository @Inject constructor(
    private val api: EtalonApi, private val dao: OrdersDao, private val json: Json, @Named("apiBaseUrl") private val mediaBase: String,
) {
    /** Last network outcome per key; combined with the cache so the UI always has data if any exists. */
    private val listStatus = MutableStateFlow<Map<String, AppError?>>(emptyMap())
    private val listLoaded = MutableStateFlow<Set<String>>(emptySet())
    private val detailStatus = MutableStateFlow<Map<String, AppError?>>(emptyMap())
    private val detailLoaded = MutableStateFlow<Set<String>>(emptySet())

    fun list(filter: OrdersFilter): Flow<Resource<List<OrderSummary>>> {
        val key = filter.listKey
        return combine(dao.observeList(key).map { rows -> rows.map { it.toDomain() } }, listStatus, listLoaded) { rows, status, loaded ->
            val cached = rows.takeIf { it.isNotEmpty() || key in loaded }
            when {
                status[key] != null -> Resource.Error(cached, status[key]!!)
                key in loaded -> Resource.Success(rows)
                else -> Resource.Loading(cached)
            }
        }
    }

    suspend fun refreshList(filter: OrdersFilter) {
        val key = filter.listKey
        try {
            val page = api.orders(q = filter.q, status = filter.status?.name, day = filter.day?.toString(), page = filter.page)
            val now = System.currentTimeMillis()
            dao.replaceList(key, page.items.mapIndexed { i, dto -> dto.toDomain().toEntity(key, i, now) })
            listStatus.value = listStatus.value + (key to null)
            listLoaded.value = listLoaded.value + key
        } catch (t: Throwable) {
            listStatus.value = listStatus.value + (key to t.toAppError())
        }
    }

    fun detail(id: String): Flow<Resource<OrderDetail>> =
        combine(dao.observeDetail(id), detailStatus, detailLoaded) { row, status, loaded ->
            val cached = row?.let { json.decodeFromString(OrderDetailDto.serializer(), it.json).toDomain(mediaBase, Instant.ofEpochMilli(it.cachedAt)) }
            when {
                status[id] != null -> Resource.Error(cached, status[id]!!)
                cached != null && id in loaded -> Resource.Success(cached)
                else -> Resource.Loading(cached)
            }
        }

    suspend fun refreshDetail(id: String) {
        try {
            val dto = api.order(id)
            dao.upsertDetail(OrderDetailEntity(id, json.encodeToString(OrderDetailDto.serializer(), dto), System.currentTimeMillis()))
            detailStatus.value = detailStatus.value + (id to null)
            detailLoaded.value = detailLoaded.value + id
        } catch (t: Throwable) {
            if (t is ApiException && t.status == 404) dao.deleteOrder(id) // hard-deleted on the server (spec §4.3)
            detailStatus.value = detailStatus.value + (id to t.toAppError())
        }
    }
}
```

`DeviceRepository.kt`:

```kotlin
package uz.etalon.crm.core.data

import uz.etalon.crm.core.datastore.SessionPrefs
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.DeviceRegisterRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DeviceRepository @Inject constructor(private val api: EtalonApi, private val prefs: SessionPrefs) {
    /** Best-effort; a failure is retried on the next app start or token refresh. */
    suspend fun register(fcmToken: String, appVersion: String): Result<Unit> = runCatching {
        api.registerDevice(DeviceRegisterRequest(fcmToken = fcmToken, appVersion = appVersion))
        prefs.setFcmToken(fcmToken)
    }
    suspend fun unregisterCurrent(): Result<Unit> = runCatching {
        val t = kotlinx.coroutines.flow.first(prefs.fcmToken) ?: return@runCatching
        api.unregisterDevice(t)
        prefs.setFcmToken(null)
    }
}
```

`di/DataModule.kt` is empty for now (constructors are `@Inject`); create it only if a binding is needed later.

- [ ] **Step 6: Run tests** — `./gradlew :core:data:testDebugUnitTest` → PASS.

- [ ] **Step 7: Commit**

```bash
git add android/core/data
git commit -m "Feat(android) · session, orders and device repositories with cache-first flows

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Login and forced PIN change (`:feature:auth`)

**Files:**
- Modify: `android/feature/auth/build.gradle.kts`
- Create: `…/feature/auth/LoginViewModel.kt`, `LoginScreen.kt`, `PinPad.kt`, `ChangePinViewModel.kt`, `ChangePinScreen.kt`, `res/values/strings.xml`
- Test: `…/feature/auth/src/test/kotlin/uz/etalon/crm/feature/auth/LoginViewModelTest.kt`

**Interfaces:**
- Produces: `LoginUiState(loginName, pin, isSubmitting, error: String?, done: Me?)`; `LoginViewModel(session: SessionRepository)` with `setLoginName`, `pressDigit(d)`, `backspace`, `submit()`; `LoginScreen(onLoggedIn: (Me) -> Unit)`; `ChangePinScreen(forced: Boolean, onDone: () -> Unit)`.

- [ ] **Step 1: Write the failing test**

```kotlin
package uz.etalon.crm.feature.auth

import app.cash.turbine.test
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Role
import uz.etalon.crm.core.network.ApiException

@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    private class FakeLogin(val outcome: Result<Me>) : LoginUseCase { var calls = 0; override suspend fun invoke(n: String, p: String) = outcome.also { calls++ } }
    private val me = Me("u1", "Азиз", Role.SALES, setOf("order.view"), mustChangePassword = false)

    @Test fun `submit is auto-triggered on the 4th digit and reports done`() = runTest {
        val login = FakeLogin(Result.success(me))
        val vm = LoginViewModel(login, initialLoginName = "Азиз")
        vm.state.test {
            awaitItem()
            "1234".forEach { vm.pressDigit(it) }
            advanceUntilIdle()
            val last = expectMostRecentItem()
            assertEquals(me, last.done)
            assertEquals(1, login.calls)
        }
    }
    @Test fun `a wrong PIN shows the Uzbek error and clears the pin`() = runTest {
        val vm = LoginViewModel(FakeLogin(Result.failure(ApiException(401, "Логин ёки PIN нотўғри · Invalid credentials"))), "Азиз")
        "1234".forEach { vm.pressDigit(it) }
        advanceUntilIdle()
        assertEquals("Логин ёки PIN нотўғри", vm.state.value.error)
        assertEquals("", vm.state.value.pin)
    }
    @Test fun `submit requires a login name`() = runTest {
        val login = FakeLogin(Result.success(me))
        val vm = LoginViewModel(login, "")
        "1234".forEach { vm.pressDigit(it) }
        advanceUntilIdle()
        assertEquals(0, login.calls)
        assertNotNull(vm.state.value.error)
    }
}
```

- [ ] **Step 2: Run to verify it fails** — `./gradlew :feature:auth:testDebugUnitTest` → compilation FAIL.

- [ ] **Step 3: Build file**

```kotlin
plugins { id("etalon.android.library"); id("etalon.android.compose"); id("etalon.hilt") }
android { namespace = "uz.etalon.crm.feature.auth" }
dependencies {
    implementation(project(":core:designsystem")); implementation(project(":core:model")); implementation(project(":core:data")); implementation(project(":core:network")); implementation(project(":core:datastore"))
    implementation(libs.androidx.lifecycle.viewmodel.compose); implementation(libs.hilt.navigation.compose); implementation(libs.compose.material.icons)
}
```

- [ ] **Step 4: ViewModel**

```kotlin
package uz.etalon.crm.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.SessionRepository
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.datastore.SessionPrefs
import uz.etalon.crm.core.model.Me
import javax.inject.Inject

/** Seam so the ViewModel is testable without Hilt. */
fun interface LoginUseCase { suspend operator fun invoke(loginName: String, pin: String): Result<Me> }

data class LoginUiState(val loginName: String = "", val pin: String = "", val isSubmitting: Boolean = false, val error: String? = null, val done: Me? = null)

open class LoginViewModel(private val login: LoginUseCase, initialLoginName: String) : ViewModel() {
    private val _state = MutableStateFlow(LoginUiState(loginName = initialLoginName))
    val state: StateFlow<LoginUiState> = _state.asStateFlow()

    fun setLoginName(v: String) = _state.update { it.copy(loginName = v, error = null) }
    fun backspace() = _state.update { it.copy(pin = it.pin.dropLast(1), error = null) }
    fun pressDigit(d: Char) {
        if (!d.isDigit() || _state.value.isSubmitting) return
        val next = (_state.value.pin + d).take(4)
        _state.update { it.copy(pin = next, error = null) }
        if (next.length == 4) submit()
    }
    fun submit() {
        val s = _state.value
        if (s.loginName.isBlank()) { _state.update { it.copy(error = "Логин киритинг", pin = "") }; return }
        if (s.pin.length != 4) return
        _state.update { it.copy(isSubmitting = true) }
        viewModelScope.launch {
            login(s.loginName, s.pin).fold(
                onSuccess = { me -> _state.update { it.copy(isSubmitting = false, done = me) } },
                onFailure = { t -> _state.update { it.copy(isSubmitting = false, pin = "", error = t.toAppError().message) } },
            )
        }
    }
}

@HiltViewModel
class HiltLoginViewModel @Inject constructor(session: SessionRepository, prefs: SessionPrefs) :
    LoginViewModel(LoginUseCase { n, p -> session.login(n, p) }, initialLoginName = "") {
    init { viewModelScope.launch { prefs.lastLoginName.first()?.let { setLoginName(it) } } }
}
```

- [ ] **Step 5: Screens**

`PinPad.kt`:

```kotlin
package uz.etalon.crm.feature.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonType

/** 3×4 keypad with 64 dp targets — no soft keyboard for a 4-digit PIN. */
@Composable
fun PinPad(onDigit: (Char) -> Unit, onBackspace: () -> Unit, enabled: Boolean, modifier: Modifier = Modifier) {
    val rows = listOf("123", "456", "789", " 0⌫")
    Column(modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        rows.forEach { row ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                row.forEach { ch ->
                    when (ch) {
                        ' ' -> Spacer(Modifier.weight(1f).height(64.dp))
                        '⌫' -> FilledTonalIconButton(onClick = onBackspace, enabled = enabled, modifier = Modifier.weight(1f).height(64.dp)) { Icon(Icons.AutoMirrored.Filled.Backspace, contentDescription = null) }
                        else -> FilledTonalButton(onClick = { onDigit(ch) }, enabled = enabled, modifier = Modifier.weight(1f).height(64.dp)) { Text(ch.toString(), style = EtalonType.monoTitle) }
                    }
                }
            }
        }
    }
}
```

`LoginScreen.kt`:

```kotlin
package uz.etalon.crm.feature.auth

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.SectionLabel
import uz.etalon.crm.core.model.Me

@Composable
fun LoginRoute(onLoggedIn: (Me) -> Unit, vm: HiltLoginViewModel = hiltViewModel()) {
    val state by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(state.done) { state.done?.let(onLoggedIn) }
    LoginScreen(state, vm::setLoginName, vm::pressDigit, vm::backspace)
}

@Composable
fun LoginScreen(state: LoginUiState, onLoginName: (String) -> Unit, onDigit: (Char) -> Unit, onBackspace: () -> Unit) {
    Scaffold { pad ->
        Column(Modifier.padding(pad).padding(24.dp).fillMaxSize(), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Spacer(Modifier.weight(0.6f))
            Text(stringResource(R.string.login_title), style = MaterialTheme.typography.headlineMedium)
            Text(stringResource(R.string.login_subtitle), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            OutlinedTextField(value = state.loginName, onValueChange = onLoginName, label = { Text(stringResource(R.string.login_name)) }, singleLine = true, modifier = Modifier.fillMaxWidth())
            SectionLabel(stringResource(R.string.login_pin))
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterHorizontally)) {
                repeat(4) { i -> Text(if (i < state.pin.length) "●" else "○", style = MaterialTheme.typography.headlineMedium) }
            }
            if (state.error != null) ErrorBanner(state.error)
            if (state.isSubmitting) LinearProgressIndicator(Modifier.fillMaxWidth())
            Spacer(Modifier.weight(1f))
            PinPad(onDigit, onBackspace, enabled = !state.isSubmitting)
        }
    }
}
```

`ChangePinViewModel.kt` + `ChangePinScreen.kt` (forced flow sends an empty current PIN, as the server allows):

```kotlin
package uz.etalon.crm.feature.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.SessionRepository
import uz.etalon.crm.core.data.toAppError
import javax.inject.Inject

data class ChangePinUiState(val current: String = "", val next: String = "", val confirm: String = "", val isSubmitting: Boolean = false, val error: String? = null, val done: Boolean = false)

@HiltViewModel
class ChangePinViewModel @Inject constructor(private val session: SessionRepository) : ViewModel() {
    private val _state = MutableStateFlow(ChangePinUiState())
    val state = _state.asStateFlow()
    fun setCurrent(v: String) = _state.update { it.copy(current = v.filter(Char::isDigit).take(4), error = null) }
    fun setNext(v: String) = _state.update { it.copy(next = v.filter(Char::isDigit).take(4), error = null) }
    fun setConfirm(v: String) = _state.update { it.copy(confirm = v.filter(Char::isDigit).take(4), error = null) }
    fun submit(forced: Boolean) {
        val s = _state.value
        if (s.next.length != 4) { _state.update { it.copy(error = "Янги PIN 4 та рақам бўлиши керак") }; return }
        if (s.next != s.confirm) { _state.update { it.copy(error = "PIN лар мос эмас") }; return }
        if (!forced && s.current.length != 4) { _state.update { it.copy(error = "Жорий PIN керак") }; return }
        _state.update { it.copy(isSubmitting = true) }
        viewModelScope.launch {
            session.changePin(if (forced) "" else s.current, s.next).fold(
                onSuccess = { _state.update { it.copy(isSubmitting = false, done = true) } },
                onFailure = { t -> _state.update { it.copy(isSubmitting = false, error = t.toAppError().message) } },
            )
        }
    }
}
```

```kotlin
package uz.etalon.crm.feature.auth

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.ErrorBanner

@Composable
fun ChangePinRoute(forced: Boolean, onDone: () -> Unit, vm: ChangePinViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(s.done) { if (s.done) onDone() }
    val pinField: @Composable (String, (String) -> Unit, Int) -> Unit = { v, on, label ->
        OutlinedTextField(v, on, label = { Text(stringResource(label)) }, singleLine = true, visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword), modifier = Modifier.fillMaxWidth())
    }
    Scaffold { pad ->
        Column(Modifier.padding(pad).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(stringResource(R.string.change_pin_title), style = MaterialTheme.typography.headlineMedium)
            if (forced) Text(stringResource(R.string.change_pin_forced_hint), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (!forced) pinField(s.current, vm::setCurrent, R.string.change_pin_current)
            pinField(s.next, vm::setNext, R.string.change_pin_new)
            pinField(s.confirm, vm::setConfirm, R.string.change_pin_confirm)
            if (s.error != null) ErrorBanner(s.error!!)
            Button(onClick = { vm.submit(forced) }, enabled = !s.isSubmitting, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text(stringResource(R.string.action_save)) }
        }
    }
}
```

`res/values/strings.xml` (feature:auth):

```xml
<resources>
    <string name="login_title">Кириш</string>
    <string name="login_subtitle">Исмингиз ва 4 рақамли PIN</string>
    <string name="login_name">Логин</string>
    <string name="login_pin">PIN</string>
    <string name="change_pin_title">PIN ни ўзгартириш</string>
    <string name="change_pin_forced_hint">Биринчи киришда янги PIN ўрнатинг</string>
    <string name="change_pin_current">Жорий PIN</string>
    <string name="change_pin_new">Янги PIN</string>
    <string name="change_pin_confirm">Янги PIN (такрор)</string>
    <string name="action_save">Сақлаш</string>
</resources>
```

- [ ] **Step 6: Run tests** — `./gradlew :feature:auth:testDebugUnitTest` → PASS.

- [ ] **Step 7: Commit**

```bash
git add android/feature/auth
git commit -m "Feat(android) · PIN login and forced PIN change screens

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Orders list and detail (`:feature:orders`)

**Files:**
- Modify: `android/feature/orders/build.gradle.kts`
- Create: `…/feature/orders/list/OrdersListViewModel.kt`, `list/OrdersListScreen.kt`, `list/OrderCard.kt`, `detail/OrderDetailViewModel.kt`, `detail/OrderDetailScreen.kt`, `res/values/strings.xml`
- Test: `…/feature/orders/src/test/kotlin/uz/etalon/crm/feature/orders/OrdersListViewModelTest.kt`

**Interfaces:**
- Produces: `OrdersListUiState(query, status: OrderStatus?, items, isRefreshing, error, hasMore, page)`; `OrdersListViewModel(repo)` with `setQuery` (debounced 300 ms), `setStatus`, `refresh()`, `loadMore()`; `OrdersListRoute(onOpenOrder: (String) -> Unit)`; `OrderDetailRoute(orderId, onBack)`. Detail is **read-only** in this slice (status advance, payments and camera arrive in 1b/1c).

- [ ] **Step 1: Write the failing test**

```kotlin
package uz.etalon.crm.feature.orders

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.data.OrdersFilter
import uz.etalon.crm.core.model.*
import uz.etalon.crm.feature.orders.list.OrdersListViewModel
import uz.etalon.crm.feature.orders.list.OrdersSource
import java.math.BigDecimal
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class OrdersListViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    private fun order(n: String) = OrderSummary("id-$n", n, OrderStatus.PLACED, PaymentState.AWAITING_PAYMENT, Money.parse("1"), Money.ZERO, BigDecimal.ONE, 1, 1, Instant.EPOCH, Instant.EPOCH, ClientRef("c", "A", "998901112233", null))

    private class FakeSource : OrdersSource {
        val flows = mutableMapOf<String, MutableStateFlow<Resource<List<OrderSummary>>>>()
        val refreshed = mutableListOf<OrdersFilter>()
        override fun list(filter: OrdersFilter): Flow<Resource<List<OrderSummary>>> = flows.getOrPut(filter.listKey) { MutableStateFlow(Resource.Loading(null)) }
        override suspend fun refreshList(filter: OrdersFilter) { refreshed += filter }
    }

    @Test fun `refreshes page 1 on start and exposes rows`() = runTest {
        val src = FakeSource()
        val vm = OrdersListViewModel(src)
        advanceUntilIdle()
        assertEquals(listOf(OrdersFilter()), src.refreshed)
        src.flows[OrdersFilter().listKey]!!.value = Resource.Success(listOf(order("2026-09-0001")))
        advanceUntilIdle()
        assertEquals("2026-09-0001", vm.state.value.items.single().orderNumber)
    }
    @Test fun `changing the status chip re-queries with page 1`() = runTest {
        val src = FakeSource(); val vm = OrdersListViewModel(src); advanceUntilIdle()
        vm.setStatus(OrderStatus.DELIVERED); advanceUntilIdle()
        assertEquals(OrdersFilter(status = OrderStatus.DELIVERED), src.refreshed.last())
        assertEquals(1, vm.state.value.page)
    }
    @Test fun `query is debounced`() = runTest {
        val src = FakeSource(); val vm = OrdersListViewModel(src); advanceUntilIdle()
        vm.setQuery("Аз"); vm.setQuery("Ази"); vm.setQuery("Азиз")
        advanceTimeBy(100); assertEquals(1, src.refreshed.size)
        advanceTimeBy(400); advanceUntilIdle()
        assertEquals(OrdersFilter(q = "Азиз"), src.refreshed.last())
        assertEquals(2, src.refreshed.size)
    }
}
```

- [ ] **Step 2: Run to verify it fails** — `./gradlew :feature:orders:testDebugUnitTest` → compilation FAIL.

- [ ] **Step 3: Build file**

```kotlin
plugins { id("etalon.android.library"); id("etalon.android.compose"); id("etalon.hilt") }
android { namespace = "uz.etalon.crm.feature.orders" }
dependencies {
    implementation(project(":core:designsystem")); implementation(project(":core:model")); implementation(project(":core:ui")); implementation(project(":core:data"))
    implementation(libs.androidx.lifecycle.viewmodel.compose); implementation(libs.hilt.navigation.compose); implementation(libs.compose.material.icons)
    implementation(libs.coil.compose); implementation(libs.coil.network.okhttp)
}
```

- [ ] **Step 4: List ViewModel**

```kotlin
package uz.etalon.crm.feature.orders.list

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.OrdersFilter
import uz.etalon.crm.core.data.OrdersRepository
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.model.Resource
import javax.inject.Inject

/** Test seam over OrdersRepository. */
interface OrdersSource {
    fun list(filter: OrdersFilter): Flow<Resource<List<OrderSummary>>>
    suspend fun refreshList(filter: OrdersFilter)
}
class RepositoryOrdersSource @Inject constructor(private val repo: OrdersRepository) : OrdersSource {
    override fun list(filter: OrdersFilter) = repo.list(filter)
    override suspend fun refreshList(filter: OrdersFilter) = repo.refreshList(filter)
}

data class OrdersListUiState(
    val query: String = "", val status: OrderStatus? = null, val page: Int = 1,
    val items: List<OrderSummary> = emptyList(), val isRefreshing: Boolean = false, val error: String? = null, val hasCache: Boolean = false,
)

@OptIn(FlowPreview::class, ExperimentalCoroutinesApi::class)
open class OrdersListViewModel(private val source: OrdersSource) : ViewModel() {
    private val query = MutableStateFlow("")
    private val status = MutableStateFlow<OrderStatus?>(null)
    private val page = MutableStateFlow(1)
    private val refreshing = MutableStateFlow(false)

    private val filter: Flow<OrdersFilter> = combine(query.debounce(300), status, page) { q, s, p -> OrdersFilter(q = q.ifBlank { null }, status = s, page = p) }
        .distinctUntilChanged()
        .onEach { f -> viewModelScope.launch { refreshing.value = true; source.refreshList(f); refreshing.value = false } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, OrdersFilter())

    private val resource: Flow<Resource<List<OrderSummary>>> = filter.flatMapLatest { source.list(it) }

    val state: StateFlow<OrdersListUiState> = combine(query, status, page, resource, refreshing) { q, s, p, r, busy ->
        OrdersListUiState(
            query = q, status = s, page = p, items = r.dataOrNull.orEmpty(), isRefreshing = busy || (r is Resource.Loading && r.cached == null),
            error = (r as? Resource.Error)?.error?.message, hasCache = r.dataOrNull != null,
        )
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), OrdersListUiState())

    fun setQuery(v: String) { query.value = v; page.value = 1 }
    fun setStatus(v: OrderStatus?) { status.value = v; page.value = 1 }
    fun refresh() { viewModelScope.launch { refreshing.value = true; source.refreshList(filter.first()); refreshing.value = false } }
    fun nextPage() { page.value += 1 }
    fun previousPage() { if (page.value > 1) page.value -= 1 }
}

@HiltViewModel
class HiltOrdersListViewModel @Inject constructor(source: RepositoryOrdersSource) : OrdersListViewModel(source)
```

(Paging is page-based with next/previous buttons in this slice, matching the server's offset dialect; Paging 3 infinite scroll is a 1b refinement once the list stabilises.)

- [ ] **Step 5: List screen and card**

`OrderCard.kt`:

```kotlin
package uz.etalon.crm.feature.orders.list

import androidx.compose.foundation.layout.*
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.components.*
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.OrderSummary
import uz.etalon.crm.core.ui.format.formatDate
import uz.etalon.crm.core.ui.format.formatPhone

@Composable
fun OrderCard(o: OrderSummary, onClick: () -> Unit) {
    StatusStripeCard(stripe = toneColor(orderStatusTone(o.status)), onClick = onClick) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(o.orderNumber, style = EtalonType.monoBody.copy(fontWeight = FontWeight.Bold), color = MaterialTheme.colorScheme.primary, modifier = Modifier.weight(1f))
            MoneyText(o.totalPrice, style = EtalonType.monoBody.copy(fontWeight = FontWeight.Bold))
        }
        Spacer(Modifier.height(4.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text("${o.client.name} · ${formatPhone(o.client.phone)}", style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f), maxLines = 1)
            AreaText(o.totalArea)
        }
        Spacer(Modifier.height(6.dp))
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(formatDate(o.scheduledAt) + (o.client.address?.let { " · $it" } ?: ""), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.weight(1f), maxLines = 1)
            PaymentChip(o.paymentState)
            StatusChip(o.status)
        }
    }
}
```

`OrdersListScreen.kt`:

```kotlin
package uz.etalon.crm.feature.orders.list

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.orderStatusLabel
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.feature.orders.R

private val STATUS_CHIPS = listOf(null, OrderStatus.PLACED, OrderStatus.IN_PRODUCTION, OrderStatus.DISPATCHED, OrderStatus.DELIVERED, OrderStatus.CANCELED)

@Composable
fun OrdersListRoute(onOpenOrder: (String) -> Unit, vm: HiltOrdersListViewModel = hiltViewModel()) {
    val s by vm.state.collectAsStateWithLifecycle()
    OrdersListScreen(s, vm::setQuery, vm::setStatus, vm::refresh, vm::nextPage, vm::previousPage, onOpenOrder)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrdersListScreen(s: OrdersListUiState, onQuery: (String) -> Unit, onStatus: (OrderStatus?) -> Unit, onRefresh: () -> Unit, onNext: () -> Unit, onPrev: () -> Unit, onOpen: (String) -> Unit) {
    Scaffold(topBar = {
        Column {
            OutlinedTextField(s.query, onQuery, placeholder = { Text(stringResource(R.string.orders_search_hint)) }, leadingIcon = { Icon(Icons.Default.Search, null) },
                singleLine = true, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp))
            LazyRow(contentPadding = PaddingValues(horizontal = 16.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                items(STATUS_CHIPS) { st ->
                    FilterChip(selected = s.status == st, onClick = { onStatus(st) }, label = { Text(if (st == null) stringResource(R.string.orders_all) else stringResource(orderStatusLabel(st))) })
                }
            }
        }
    }) { pad ->
        PullToRefreshBox(isRefreshing = s.isRefreshing, onRefresh = onRefresh, modifier = Modifier.padding(pad)) {
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxSize()) {
                if (s.error != null) item { ErrorBanner(s.error, onRetry = onRefresh) }
                if (s.items.isEmpty() && !s.isRefreshing) item { EmptyState(stringResource(R.string.orders_empty)) }
                items(s.items, key = { it.id }) { o -> OrderCard(o) { onOpen(o.id) } }
                item {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        TextButton(onClick = onPrev, enabled = s.page > 1) { Text(stringResource(R.string.paging_prev)) }
                        Text(s.page.toString(), style = MaterialTheme.typography.labelMedium)
                        TextButton(onClick = onNext, enabled = s.items.size >= 20) { Text(stringResource(R.string.paging_next)) }
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 6: Detail ViewModel and screen (read-only card stack)**

`OrderDetailViewModel.kt`:

```kotlin
package uz.etalon.crm.feature.orders.detail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.OrdersRepository
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.Resource
import javax.inject.Inject

@HiltViewModel
class OrderDetailViewModel @Inject constructor(private val repo: OrdersRepository, handle: SavedStateHandle) : ViewModel() {
    val orderId: String = checkNotNull(handle["orderId"])
    val state: StateFlow<Resource<OrderDetail>> = repo.detail(orderId).stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), Resource.Loading(null))
    init { refresh() }
    fun refresh() { viewModelScope.launch { repo.refreshDetail(orderId) } }
}
```

`OrderDetailScreen.kt`:

```kotlin
package uz.etalon.crm.feature.orders.detail

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.Navigation
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import uz.etalon.crm.core.designsystem.components.*
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus
import uz.etalon.crm.core.model.Resource
import uz.etalon.crm.core.ui.format.*
import uz.etalon.crm.feature.orders.R

@Composable
fun OrderDetailRoute(onBack: () -> Unit, vm: OrderDetailViewModel = hiltViewModel()) {
    val r by vm.state.collectAsStateWithLifecycle()
    OrderDetailScreen(r, onBack, vm::refresh)
}

private val FLOW = listOf(OrderStatus.PLACED, OrderStatus.LOADED, OrderStatus.DELIVERED)
private fun OrderStatus.collapsed() = when (this) { OrderStatus.IN_PRODUCTION -> OrderStatus.PLACED; OrderStatus.DISPATCHED -> OrderStatus.LOADED; else -> this }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderDetailScreen(r: Resource<OrderDetail>, onBack: () -> Unit, onRefresh: () -> Unit) {
    val o = r.dataOrNull
    val ctx = LocalContext.current
    Scaffold(topBar = {
        TopAppBar(title = { Text(o?.summary?.orderNumber ?: "", style = EtalonType.monoTitle) },
            navigationIcon = { IconButton(onClick = onBack) { Icon(Icons.AutoMirrored.Filled.ArrowBack, null) } })
    }) { pad ->
        PullToRefreshBox(isRefreshing = r is Resource.Loading && o == null, onRefresh = onRefresh, modifier = Modifier.padding(pad)) {
            LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxSize()) {
                if (r is Resource.Error) item { ErrorBanner(r.error.message, onRetry = onRefresh) }
                if (o == null) return@LazyColumn
                // 1 · header
                item {
                    StatusStripeCard(stripe = toneColor(orderStatusTone(o.summary.status))) {
                        Text(o.summary.client.name, style = MaterialTheme.typography.titleMedium)
                        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text(formatPhone(o.summary.client.phone), style = EtalonType.monoBody, color = MaterialTheme.colorScheme.primary)
                            IconButton(onClick = { ctx.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:+${o.summary.client.phone}"))) }) { Icon(Icons.Default.Call, stringResource(R.string.action_call)) }
                            if (o.deliveryLat != null && o.deliveryLng != null) IconButton(onClick = { ctx.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("geo:${o.deliveryLat},${o.deliveryLng}?q=${o.deliveryLat},${o.deliveryLng}"))) }) { Icon(Icons.Default.Navigation, stringResource(R.string.action_navigate)) }
                        }
                        o.summary.client.address?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        Text(stringResource(R.string.scheduled_on, formatDate(o.summary.scheduledAt)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                // 2 · status timeline (read-only in 1a)
                item {
                    StatusStripeCard(stripe = LocalEtalonColors.current.border) {
                        val current = o.summary.status.collapsed()
                        val idx = FLOW.indexOf(current)
                        FLOW.forEachIndexed { i, st ->
                            val done = idx >= i && o.summary.status != OrderStatus.CANCELED
                            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(vertical = 4.dp)) {
                                Text(if (done) "●" else "○", color = if (done) LocalEtalonColors.current.success else MaterialTheme.colorScheme.onSurfaceVariant)
                                Spacer(Modifier.width(10.dp))
                                Text(stringResource(orderStatusLabel(st)), style = MaterialTheme.typography.bodyMedium, fontWeight = if (i == idx) FontWeight.Bold else FontWeight.Normal)
                            }
                        }
                        if (o.summary.status == OrderStatus.CANCELED) StatusChip(OrderStatus.CANCELED)
                    }
                }
                // 3 · payments
                item {
                    StatusStripeCard(stripe = if (o.remaining.isZero) LocalEtalonColors.current.success else MaterialTheme.colorScheme.primary) {
                        SectionLabel(stringResource(R.string.remaining))
                        MoneyText(o.remaining, style = EtalonType.monoDisplay)
                        Text(stringResource(R.string.paid_of_total, formatMoney(o.summary.confirmedPaid), formatMoney(o.summary.totalPrice)), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (!o.pendingAmount.isZero) Text(stringResource(R.string.pending_amount, formatMoney(o.pendingAmount)), style = MaterialTheme.typography.bodySmall, color = LocalEtalonColors.current.warning)
                        o.payments.forEach { p ->
                            Row(Modifier.fillMaxWidth().padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    MoneyText(p.amount)
                                    Text("${formatDateTime(p.recordedAt)}${p.recordedByName?.let { " · $it" } ?: ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                Chip(when (p.status) { uz.etalon.crm.core.model.PaymentStatus.CONFIRMED -> ChipTone.SUCCESS; uz.etalon.crm.core.model.PaymentStatus.REJECTED -> ChipTone.DANGER; else -> ChipTone.WARNING }, stringResource(when (p.status) { uz.etalon.crm.core.model.PaymentStatus.CONFIRMED -> R.string.payment_confirmed; uz.etalon.crm.core.model.PaymentStatus.REJECTED -> R.string.payment_rejected; else -> R.string.payment_pending_confirmation }))
                            }
                        }
                    }
                }
                // 4 · rooms
                item {
                    StatusStripeCard(stripe = LocalEtalonColors.current.border) {
                        SectionLabel(stringResource(R.string.rooms))
                        o.rooms.forEachIndexed { i, rm ->
                            Row(Modifier.fillMaxWidth().padding(vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) {
                                    Text(rm.name ?: stringResource(R.string.room_n, i + 1), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
                                    Text("${formatDecimal(rm.innerWidth, 2)} × ${formatDecimal(rm.innerLength, 2)} м · ${rm.pattern} · ${rm.beamCount} балка ${formatDecimal(rm.beamLength, 2)} · ${rm.totalBlocks} блок", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                                MoneyText(rm.subtotal)
                            }
                        }
                        HorizontalDivider(Modifier.padding(vertical = 6.dp))
                        Row(Modifier.fillMaxWidth()) { Text(stringResource(R.string.total_area), Modifier.weight(1f), style = MaterialTheme.typography.bodySmall); AreaText(o.summary.totalArea) }
                        if (!o.discountAmount.isZero) Row(Modifier.fillMaxWidth()) { Text(stringResource(R.string.discount), Modifier.weight(1f), style = MaterialTheme.typography.bodySmall); MoneyText(o.discountAmount) }
                        if (!o.deliveryCost.isZero) Row(Modifier.fillMaxWidth()) { Text(stringResource(R.string.delivery), Modifier.weight(1f), style = MaterialTheme.typography.bodySmall); MoneyText(o.deliveryCost) }
                        Row(Modifier.fillMaxWidth()) { Text(stringResource(R.string.total), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.Bold); MoneyText(o.summary.totalPrice, style = EtalonType.monoBody.copy(fontWeight = FontWeight.Bold)) }
                    }
                }
                // 5 · photos
                val photos = o.loadedPhotoUrls + listOfNotNull(o.deliveryProofUrl)
                if (photos.isNotEmpty()) item {
                    SectionLabel(stringResource(R.string.photos))
                    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(top = 6.dp)) {
                        items(photos) { url -> AsyncImage(model = url, contentDescription = null, modifier = Modifier.size(120.dp)) }
                    }
                }
                // 6 · timeline
                item {
                    SectionLabel(stringResource(R.string.events))
                    o.events.take(20).forEach { e ->
                        Text("${formatDateTime(e.createdAt)} · ${e.message ?: e.type}${e.actorName?.let { " · $it" } ?: ""}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 4.dp))
                    }
                }
            }
        }
    }
}
```

`res/values/strings.xml` (feature:orders):

```xml
<resources>
    <string name="orders_title">Буюртмалар</string>
    <string name="orders_search_hint">Буюртма № · Мижоз · Телефон · Манзил</string>
    <string name="orders_all">Барчаси</string>
    <string name="orders_empty">Буюртма йўқ.</string>
    <string name="paging_prev">Олдинги</string>
    <string name="paging_next">Кейинги</string>
    <string name="action_call">Қўнғироқ қилиш</string>
    <string name="action_navigate">Навигация</string>
    <string name="scheduled_on">Жадвал: %1$s</string>
    <string name="remaining">Қолди</string>
    <string name="paid_of_total">Тўланган %1$s / %2$s</string>
    <string name="pending_amount">Тасдиқ кутилмоқда: %1$s</string>
    <string name="payment_confirmed">Тасдиқланган</string>
    <string name="payment_rejected">Рад этилган</string>
    <string name="payment_pending_confirmation">Кутилмоқда</string>
    <string name="rooms">Хоналар</string>
    <string name="room_n">Хона %1$d</string>
    <string name="total_area">Майдон</string>
    <string name="discount">Чегирма</string>
    <string name="delivery">Етказиш</string>
    <string name="total">Жами</string>
    <string name="photos">Расмлар</string>
    <string name="events">Тарих</string>
</resources>
```

- [ ] **Step 7: Run tests and build** — `./gradlew :feature:orders:testDebugUnitTest :feature:orders:assembleDebug` → PASS, BUILD SUCCESSFUL.

- [ ] **Step 8: Commit**

```bash
git add android/feature/orders
git commit -m "Feat(android) · orders list with filters and read-only order detail

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: App shell — auth gate, Navigation 3, role-derived bottom bar, push registration

**Files:**
- Modify: `android/app/build.gradle.kts` (enable `google-services`, add firebase deps), `android/app/src/main/AndroidManifest.xml` (FCM service), `android/app/src/main/res/values/strings.xml`
- Create: `android/app/src/main/kotlin/uz/etalon/crm/di/AppModule.kt`, `nav/Keys.kt`, `nav/EtalonNavHost.kt`, `shell/Destinations.kt`, `shell/MoreScreen.kt`, `push/EtalonMessagingService.kt`, `push/PushRegistrar.kt`, `MainViewModel.kt`
- Modify: `MainActivity.kt`
- Test: `android/app/src/test/kotlin/uz/etalon/crm/shell/DestinationsTest.kt`

**Interfaces:**
- Produces: `@Named("apiBaseUrl") String = BuildConfig.API_BASE_URL`; `sealed interface Key : NavKey` with `Login`, `ChangePin(forced)`, `Orders`, `OrderDetail(id)`, `More`; `fun destinationsFor(me: Me): List<Destination>` (spec §5.1 priority, max 5, `More` always last); `EtalonMessagingService` (FCM data → local notification with deep link `etalon://order/{id}`); `PushRegistrar.registerIfPossible()`.

- [ ] **Step 1: Write the failing test**

```kotlin
package uz.etalon.crm.shell

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.Role

class DestinationsTest {
    private fun me(vararg p: String) = Me("u", "n", Role.CUSTOM, p.toSet(), false)
    @Test fun `owner gets five plus More in priority order`() {
        val d = destinationsFor(me("order.view", "calculator.use", "inbox.access", "payment.view", "inventory.view"))
        assertEquals(listOf(Destination.HOME, Destination.ORDERS, Destination.CALCULATOR, Destination.INBOX, Destination.PAYMENTS, Destination.MORE), d)
    }
    @Test fun `factory user gets home, production, gazoblok, more`() {
        assertEquals(listOf(Destination.HOME, Destination.PRODUCTION, Destination.GAZOBLOK, Destination.MORE), destinationsFor(me("inventory.view")))
    }
    @Test fun `never more than five before More`() {
        val d = destinationsFor(me("order.view", "calculator.use", "inbox.access", "payment.view", "inventory.view", "client.view"))
        assertEquals(6, d.size); assertEquals(Destination.MORE, d.last())
    }
}
```

- [ ] **Step 2: Run to verify it fails** — `./gradlew :app:testDebugUnitTest` → compilation FAIL.

- [ ] **Step 3: Destinations (spec §5.1)**

`shell/Destinations.kt`:

```kotlin
package uz.etalon.crm.shell

import uz.etalon.crm.core.model.Me

/** Bottom-bar destinations. Only ORDERS and MORE have screens in slice 1a; the rest
 *  are declared so the bar is stable across slices and route to a "coming in the next
 *  release" notice via MoreScreen until their feature module lands. */
enum class Destination(val labelRes: Int, val requires: String?) {
    HOME(R.string.nav_home, null),
    ORDERS(R.string.nav_orders, "order.view"),
    CALCULATOR(R.string.nav_calculator, "calculator.use"),
    INBOX(R.string.nav_inbox, "inbox.access"),
    PAYMENTS(R.string.nav_payments, "payment.view"),
    PRODUCTION(R.string.nav_production, "inventory.view"),
    GAZOBLOK(R.string.nav_gazoblok, null),
    MORE(R.string.nav_more, null),
}
private const val MAX_BEFORE_MORE = 5

fun destinationsFor(me: Me): List<Destination> {
    val ordered = Destination.entries.filter { it != Destination.MORE }
    val allowed = ordered.filter { it.requires == null || me.can(it.requires) }
    return allowed.take(MAX_BEFORE_MORE) + Destination.MORE
}
```

(`R.string.*` ids in the `:app` module are compile-time constants, so they are legal enum constructor arguments. Add `import uz.etalon.crm.R` at the top of the file.)

- [ ] **Step 4: Nav keys and host**

`nav/Keys.kt`:

```kotlin
package uz.etalon.crm.nav

import androidx.navigation3.runtime.NavKey
import kotlinx.serialization.Serializable

@Serializable sealed interface Key : NavKey
@Serializable data object Login : Key
@Serializable data class ChangePin(val forced: Boolean) : Key
@Serializable data object Orders : Key
@Serializable data class OrderDetail(val id: String) : Key
@Serializable data object More : Key
@Serializable data class ComingSoon(val labelRes: Int) : Key
```

`nav/EtalonNavHost.kt`:

```kotlin
package uz.etalon.crm.nav

import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.entryProvider
import androidx.navigation3.ui.NavDisplay
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.feature.auth.ChangePinRoute
import uz.etalon.crm.feature.auth.LoginRoute
import uz.etalon.crm.feature.orders.detail.OrderDetailRoute
import uz.etalon.crm.feature.orders.list.OrdersListRoute
import uz.etalon.crm.shell.Destination
import uz.etalon.crm.shell.MoreScreen
import uz.etalon.crm.shell.destinationsFor

private fun Destination.icon() = when (this) {
    Destination.HOME -> Icons.Default.Home; Destination.ORDERS -> Icons.Default.Inventory2; Destination.CALCULATOR -> Icons.Default.Calculate
    Destination.INBOX -> Icons.Default.ChatBubble; Destination.PAYMENTS -> Icons.Default.AccountBalanceWallet; Destination.PRODUCTION -> Icons.Default.Factory
    Destination.GAZOBLOK -> Icons.Default.ViewInAr; Destination.MORE -> Icons.Default.MoreHoriz
}
private fun Destination.key(): Key = when (this) { Destination.ORDERS -> Orders; Destination.MORE -> More; else -> ComingSoon(labelRes) }

/** Signed-in shell: navigation suite (bottom bar on phones, rail at ≥600 dp) + Nav3 display. */
@Composable
fun SignedInShell(me: Me, backStack: NavBackStack, onSignOut: () -> Unit) {
    val destinations = destinationsFor(me)
    val current = backStack.lastOrNull()
    NavigationSuiteScaffold(navigationSuiteItems = {
        destinations.forEach { d ->
            val selected = current == d.key() || (d == Destination.ORDERS && current is OrderDetail)
            item(selected = selected, onClick = { backStack.clear(); backStack.add(d.key()) }, icon = { Icon(d.icon(), null) }, label = { Text(stringResource(d.labelRes)) })
        }
    }) {
        NavDisplay(backStack = backStack, onBack = { backStack.removeLastOrNull() }, entryProvider = entryProvider {
            entry<Orders> { OrdersListRoute(onOpenOrder = { backStack.add(OrderDetail(it)) }) }
            entry<OrderDetail> { k -> OrderDetailRoute(onBack = { backStack.removeLastOrNull() }) }
            entry<More> { MoreScreen(me, onChangePin = { backStack.add(ChangePin(forced = false)) }, onSignOut = onSignOut) }
            entry<ChangePin> { k -> ChangePinRoute(forced = k.forced, onDone = { backStack.removeLastOrNull() }) }
            entry<ComingSoon> { k -> uz.etalon.crm.shell.ComingSoonScreen(k.labelRes) }
        })
    }
}

@Composable
fun SignedOutShell(backStack: NavBackStack, onLoggedIn: (Me) -> Unit) {
    NavDisplay(backStack = backStack, onBack = { backStack.removeLastOrNull() }, entryProvider = entryProvider {
        entry<Login> { LoginRoute(onLoggedIn = onLoggedIn) }
        entry<ChangePin> { k -> ChangePinRoute(forced = k.forced, onDone = { backStack.clear(); backStack.add(Orders) }) }
    })
}
```

(`OrderDetailViewModel` reads `orderId` from `SavedStateHandle`; with Nav3 supply it via `hiltViewModel(creationCallback = …)` or pass the id into `OrderDetailRoute(orderId)` and a `ViewModel` factory — use whichever the pinned Nav3 + Hilt versions document; the test seam does not depend on it.)

`shell/MoreScreen.kt` + `ComingSoonScreen`:

```kotlin
package uz.etalon.crm.shell

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.etalon.crm.R
import uz.etalon.crm.core.designsystem.components.EmptyState
import uz.etalon.crm.core.designsystem.components.SectionLabel
import uz.etalon.crm.core.model.Me

@Composable
fun MoreScreen(me: Me, onChangePin: () -> Unit, onSignOut: () -> Unit) {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(me.name, style = MaterialTheme.typography.headlineMedium)
        SectionLabel(me.role.name)
        OutlinedButton(onClick = onChangePin, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text(stringResource(R.string.more_change_pin)) }
        Spacer(Modifier.weight(1f))
        TextButton(onClick = onSignOut, modifier = Modifier.fillMaxWidth().height(48.dp)) { Text(stringResource(R.string.more_sign_out)) }
    }
}

@Composable
fun ComingSoonScreen(labelRes: Int) {
    Column(Modifier.fillMaxSize()) {
        Text(stringResource(labelRes), style = MaterialTheme.typography.headlineMedium, modifier = Modifier.padding(24.dp))
        EmptyState(stringResource(R.string.coming_soon))
    }
}
```

- [ ] **Step 5: `MainViewModel` and `MainActivity`**

```kotlin
package uz.etalon.crm

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.DeviceRepository
import uz.etalon.crm.core.data.SessionRepository
import uz.etalon.crm.core.model.Me
import uz.etalon.crm.push.PushRegistrar
import javax.inject.Inject

sealed interface AppState { data object Booting : AppState; data object SignedOut : AppState; data class SignedIn(val me: Me) : AppState }

@HiltViewModel
class MainViewModel @Inject constructor(private val session: SessionRepository, private val devices: DeviceRepository, private val push: PushRegistrar) : ViewModel() {
    private val _state = MutableStateFlow<AppState>(AppState.Booting)
    val state: StateFlow<AppState> = _state.asStateFlow()

    init {
        viewModelScope.launch {
            if (session.isLoggedIn.first()) session.bootstrap().onSuccess { onSignedIn(it.me) }.onFailure { _state.value = AppState.SignedOut }
            else _state.value = AppState.SignedOut
            // Interceptor cleared the token on a 401 → drop to the PIN screen from anywhere.
            session.isLoggedIn.collect { if (!it) _state.value = AppState.SignedOut }
        }
    }
    fun onSignedIn(me: Me) { _state.value = AppState.SignedIn(me); viewModelScope.launch { push.registerIfPossible() } }
    fun signOut() { viewModelScope.launch { devices.unregisterCurrent(); session.signOut(); _state.value = AppState.SignedOut } }
}
```

```kotlin
package uz.etalon.crm

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.rememberNavBackStack
import dagger.hilt.android.AndroidEntryPoint
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.nav.*

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    private val vm: MainViewModel by viewModels()
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val deepLinkOrderId = intent?.data?.takeIf { it.scheme == "etalon" && it.host == "order" }?.lastPathSegment
        setContent {
            EtalonTheme {
                val state by vm.state.collectAsStateWithLifecycle()
                when (val s = state) {
                    AppState.Booting -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
                    // A successful login flips the state to SignedIn; the forced PIN change is the SignedIn start key below.
                    AppState.SignedOut -> { val bs = rememberNavBackStack(Login); SignedOutShell(bs, onLoggedIn = vm::onSignedIn) }
                    is AppState.SignedIn -> {
                        val start: Key = if (s.me.mustChangePassword) ChangePin(forced = true) else deepLinkOrderId?.let { OrderDetail(it) } ?: Orders
                        val bs = rememberNavBackStack(start)
                        SignedInShell(s.me, bs, onSignOut = vm::signOut)
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 6: Push**

`push/PushRegistrar.kt`:

```kotlin
package uz.etalon.crm.push

import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await
import uz.etalon.crm.BuildConfig
import uz.etalon.crm.core.data.DeviceRepository
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class PushRegistrar @Inject constructor(private val devices: DeviceRepository) {
    /** Registers the current FCM token with the server. Silent on failure (no Play services, no network). */
    suspend fun registerIfPossible() {
        val token = runCatching { FirebaseMessaging.getInstance().token.await() }.getOrNull() ?: return
        devices.register(token, BuildConfig.VERSION_NAME)
    }
}
```

`push/EtalonMessagingService.kt`:

```kotlin
package uz.etalon.crm.push

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import uz.etalon.crm.MainActivity
import uz.etalon.crm.R
import uz.etalon.crm.core.data.DeviceRepository
import uz.etalon.crm.core.data.OrdersRepository
import javax.inject.Inject

@AndroidEntryPoint
class EtalonMessagingService : FirebaseMessagingService() {
    @Inject lateinit var devices: DeviceRepository
    @Inject lateinit var orders: OrdersRepository
    private val scope = CoroutineScope(Dispatchers.IO)

    override fun onNewToken(token: String) { scope.launch { devices.register(token, uz.etalon.crm.BuildConfig.VERSION_NAME) } }

    /** Data message from src/lib/notifications.ts (Phase 0 S3): type, notificationId, title, body, orderId, … */
    override fun onMessageReceived(msg: RemoteMessage) {
        val d = msg.data
        val orderId = d["orderId"]?.takeIf { it.isNotBlank() }
        if (orderId != null) scope.launch { orders.refreshDetail(orderId) } // invalidate cache
        val channelId = channelFor(d["type"].orEmpty())
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(channelId, channelName(channelId), NotificationManager.IMPORTANCE_HIGH))
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (orderId != null) data = Uri.parse("etalon://order/$orderId")
        }
        val pi = PendingIntent.getActivity(this, orderId.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification).setContentTitle(d["title"]).setContentText(d["body"]?.takeIf { it.isNotBlank() })
            .setAutoCancel(true).setContentIntent(pi).setPriority(NotificationCompat.PRIORITY_HIGH).build()
        nm.notify(d["notificationId"].hashCode(), n)
    }

    private fun channelFor(type: String) = when {
        type.startsWith("ORDER") || type == "DELIVERY_PROOF_UPLOADED" -> "orders"
        type.startsWith("PAYMENT") -> "payments"
        type == "AGENT_ESCALATION" -> "inbox"
        else -> "comments"
    }
    private fun channelName(id: String) = when (id) { "orders" -> getString(R.string.channel_orders); "payments" -> getString(R.string.channel_payments); "inbox" -> getString(R.string.channel_inbox); else -> getString(R.string.channel_comments) }
}
```

Manifest additions inside `<application>`:

```xml
<service android:name=".push.EtalonMessagingService" android:exported="false">
    <intent-filter><action android:name="com.google.firebase.MESSAGING_EVENT" /></intent-filter>
</service>
```

and on `MainActivity` a second intent filter for the deep link:

```xml
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:scheme="etalon" android:host="order" />
</intent-filter>
```

`app/build.gradle.kts`: uncomment `alias(libs.plugins.google.services)`, add `implementation(platform(libs.firebase.bom)); implementation(libs.firebase.messaging); implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:<coroutines version>")`. Add a vector `res/drawable/ic_notification.xml` (a 24 dp white monochrome "E" glyph or a simple square; any monochrome vector is acceptable). Place the Firebase project's `google-services.json` in `android/app/` (git-ignored; CI injects it from a secret). Request `POST_NOTIFICATIONS` at runtime in `MainActivity` on first sign-in via `rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission())`.

`di/AppModule.kt`:

```kotlin
package uz.etalon.crm.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import uz.etalon.crm.BuildConfig
import javax.inject.Named

@Module @InstallIn(SingletonComponent::class)
object AppModule { @Provides @Named("apiBaseUrl") fun apiBaseUrl(): String = BuildConfig.API_BASE_URL }
```

`res/values/strings.xml` (app) — replace with:

```xml
<resources>
    <string name="app_name">EtalonSlabs</string>
    <string name="nav_home">Бош саҳифа</string>
    <string name="nav_orders">Буюртмалар</string>
    <string name="nav_calculator">Калькулятор</string>
    <string name="nav_inbox">Хабарлар</string>
    <string name="nav_payments">Тўловлар</string>
    <string name="nav_production">Ишлаб чиқариш</string>
    <string name="nav_gazoblok">Газоблок</string>
    <string name="nav_more">Яна</string>
    <string name="more_change_pin">PIN ни ўзгартириш</string>
    <string name="more_sign_out">Чиқиш</string>
    <string name="coming_soon">Бу бўлим кейинги релизда</string>
    <string name="channel_orders">Буюртмалар</string>
    <string name="channel_payments">Тўловлар</string>
    <string name="channel_inbox">Хабарлар</string>
    <string name="channel_comments">Изоҳлар</string>
</resources>
```

- [ ] **Step 7: Run tests and build**

Run: `./gradlew :app:testDebugUnitTest :app:assembleDebug`
Expected: PASS, BUILD SUCCESSFUL.

- [ ] **Step 8: Commit**

```bash
git add android/app
git commit -m "Feat(android) · app shell: auth gate, Nav3, role-derived bottom bar, FCM

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Screenshot tests and end-to-end verification

**Files:**
- Create: `android/feature/auth/src/test/kotlin/uz/etalon/crm/feature/auth/LoginScreenshotTest.kt`, `android/feature/orders/src/test/kotlin/uz/etalon/crm/feature/orders/OrderCardScreenshotTest.kt`
- Modify: both feature `build.gradle.kts` (apply `alias(libs.plugins.roborazzi)`, add `testImplementation(libs.roborazzi); testImplementation(libs.roborazzi.compose); testImplementation(libs.robolectric); testImplementation(libs.compose.ui.test.junit4)`)
- Create: `android/.github/workflows/android.yml` is NOT in scope here (CI lives at the repo root; add `.github/workflows/android.yml` running `./gradlew testDebugUnitTest verifyRoborazziDebug assembleDebug` in `android/`).

- [ ] **Step 1: Screenshot tests (light + dark, phone + 600 dp, font 1.0 + 1.3)**

```kotlin
package uz.etalon.crm.feature.auth

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.theme.EtalonTheme

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class LoginScreenshotTest {
    @get:Rule val rule = createComposeRule()
    private fun shoot(name: String, dark: Boolean) {
        rule.setContent { EtalonTheme(darkTheme = dark) { LoginScreen(LoginUiState(loginName = "Азиз", pin = "12", error = null), {}, {}, {}) } }
        rule.onRoot().captureRoboImage("screenshots/login_$name.png")
    }
    @Test @Config(qualifiers = "w411dp-h891dp") fun phoneLight() = shoot("phone_light", false)
    @Test @Config(qualifiers = "w411dp-h891dp") fun phoneDark() = shoot("phone_dark", true)
    @Test @Config(qualifiers = "w600dp-h960dp") fun tabletLight() = shoot("tablet_light", false)
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun phoneLargeFont() = shoot("phone_font13", false)
}
```

```kotlin
package uz.etalon.crm.feature.orders

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.model.*
import uz.etalon.crm.feature.orders.list.OrderCard
import java.math.BigDecimal
import java.time.Instant

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class OrderCardScreenshotTest {
    @get:Rule val rule = createComposeRule()
    private val o = OrderSummary("o1", "2026-09-0041", OrderStatus.LOADED, PaymentState.PARTIALLY_PAID, Money.parse("12400000.00"), Money.parse("6000000.00"),
        BigDecimal("86.400"), 210, 10, Instant.parse("2026-09-04T00:00:00Z"), Instant.parse("2026-09-01T00:00:00Z"), ClientRef("c", "Азизов Бахтиёр Рустамович", "998901112233", "Тошкент, Яшнобод"))
    @Test @Config(qualifiers = "w411dp-h891dp") fun light() { rule.setContent { EtalonTheme(false) { OrderCard(o) {} } }; rule.onRoot().captureRoboImage("screenshots/order_card_light.png") }
    @Test @Config(qualifiers = "w411dp-h891dp") fun dark() { rule.setContent { EtalonTheme(true) { OrderCard(o) {} } }; rule.onRoot().captureRoboImage("screenshots/order_card_dark.png") }
    @Test @Config(qualifiers = "w411dp-h891dp", fontScale = 1.3f) fun largeFont() { rule.setContent { EtalonTheme(false) { OrderCard(o) {} } }; rule.onRoot().captureRoboImage("screenshots/order_card_font13.png") }
}
```

Run: `./gradlew recordRoborazziDebug` once to record baselines, then `./gradlew verifyRoborazziDebug` must pass. Open the PNGs and check: no clipped text at 1.3×, chips readable in dark, digits aligned.

- [ ] **Step 2: End-to-end on an emulator against the local server**

1. Start the Next.js dev server with Phase 0 deployed: `cd precast-crm && npm run dev`.
2. Create an Android 16 (API 36) emulator in Android Studio; install the debug APK (`./gradlew :app:installDebug`).
3. Log in with a seeded user (name + PIN from `prisma/seed.ts`). Expected: orders list renders from the network; kill the dev server, relaunch the app → the list still renders from Room with an error banner and a Retry button.
4. Open an order: header, timeline, payments, rooms, photos (served from `http://10.0.2.2:3000/uploads/...`), events. Tap the phone → dialer opens.
5. Filter chips and search work; paging buttons move pages.
6. Яна → PIN change → sign out → PIN screen. Log back in.
7. With `google-services.json` in place and the server's `FIREBASE_SERVICE_ACCOUNT_JSON` set: confirm a payment on the web as the same user's recipient → the phone shows a notification; tapping it opens that order.
8. Rotate / resize to a 600 dp window: the bar becomes a rail; nothing is clipped.

- [ ] **Step 3: Commit**

```bash
git add android/feature/auth android/feature/orders
git commit -m "Test(android) · Roborazzi screenshots for login and order card

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## What the next slices cover (not in this plan)

- **1b · Camera and logistics:** load-truck (single + split), extra loaded photos, delivery proof with cash keypad, dispatch, drivers, delivery map; the WorkManager outbox with `Idempotency-Key`; the sticky next-step action bar on the detail screen.
- **1c · Payments:** record payment sheet with receipts, confirm/reject queue, discrepancies, settle remaining.
- **1d · Home, clients, gallery, notifications screen, biometric re-unlock, Paging 3 on lists.**

## Self-review

**Spec coverage (Phase 1 scope in §7 and the slice boundary above):** auth (D5, §4.1 steps 1–2, 4) → Tasks 5, 8, 10 · role-derived shell + adaptive rail (D10, §5.1) → Task 10 · orders list as stripe cards, detail card stack read-only (§5.3) → Task 9 · Room read-through cache and 404 eviction (D7, §4.3) → Tasks 6–7 · FCM registration and data-message rendering with deep links (D6, §4.4) → Task 10 · design tokens, fonts, chips, Money formatting (§6) → Tasks 2–3 · envelope/error mapping with Uzbek half (§4.2, §4.6) → Tasks 4, 7 · screenshot tests light/dark/600 dp/1.3× (§7.1) → Task 11. Deferred to 1b–1d as listed. Biometric re-unlock (§4.1 step 3) is deliberately in 1d, after the outbox exists, so the unlock gate can also protect queued uploads.

**Placeholder scan:** none. Every code step contains code. Version numbers in the catalog are intentionally "latest stable at kickoff" per the spec ("pinned by role, not by version"); the coordinates are exact.

**Type consistency:** `TokenProvider` (Task 4) implemented by `StoreTokenProvider` (Task 5) and bound in `DataStoreModule`; `EtalonApi` methods (Task 4) match the `FakeApi` overrides (Task 7); `OrdersRepository.list/refreshList` (Task 7) match `OrdersSource` (Task 9); `OrdersFilter.listKey` format matches the repository test; `Resource.dataOrNull` (Task 2) used by ViewModels (Task 9); `destinationsFor(me)` (Task 10) returns `List<Destination>` as the test expects; `MediaUrl.absolute(base, path)` (Task 4) called with that order in mappers (Task 7); `LoginUseCase` (Task 8) is a `fun interface` so the test's class implementation compiles.
