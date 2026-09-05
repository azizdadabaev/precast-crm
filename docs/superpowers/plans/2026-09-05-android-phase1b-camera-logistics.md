# Android Phase 1b — Camera & Logistics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the field user everything that happens away from a desk: photograph a loaded truck and advance the order, split a load across trucks and dispatch each one, capture delivery proof with the cash collected, manage drivers, drop a delivery pin, and have every photo upload survive a dropped connection through a retry-safe outbox.

**Architecture:** Three new modules join the 1a graph. `:core:image` prepares photos (EXIF rotate, downscale to 1280 px, JPEG 0.65) exactly as the web's `prepare-upload.ts` does. `:core:sync` runs a WorkManager outbox: every queued upload carries a client-generated `Idempotency-Key`, so a retry after a dropped connection replays the server's first response instead of duplicating the work. `:feature:logistics` holds the screens. The rule that decides what may be queued is not a judgement call: **an operation is outbox-able if and only if its server route is wrapped in `withIdempotency`** (Phase 0 wrapped exactly the seven upload/comment routes). Everything else is online-only and its button is disabled without a connection.

**Tech Stack:** Kotlin 2.4.10 · Compose (BOM 2026.08.00) · Material 3 · Hilt 2.60.1 · Retrofit 3.0.0 + OkHttp 5.5.0 · Room 2.8.4 · WorkManager (new) · CameraX (new) · maps-compose (new, optional) · Coil 3.6.2 · JUnit 5 + Turbine + Robolectric + Roborazzi.

**Spec:** `docs/superpowers/specs/2026-09-02-android-app-architecture-design.md` — §4.3 (offline and sync), §4.5 (camera and media pipeline), §5.3 (order cockpit), §5.7 (logistics), §7 (Phase 1). **Predecessor plan:** `docs/superpowers/plans/2026-09-02-android-phase1a-foundation-auth-orders.md`. **Contract:** `docs/api/openapi.json`.

## Global Constraints

- **Branch and worktree.** Work on `feat/android-phase1b`, branched from `feat/android-phase1a` (head 91ccbf7). The Android project is `android/`; the Next.js server is `precast-crm/` in the same worktree, already carrying the Phase 0 mobile endpoints.
- **Toolchain.** `JAVA_HOME` must be set to `C:\Program Files\Android\Android Studio\jbr` for every Gradle invocation. Use `.\gradlew.bat` (PowerShell) or `./gradlew` (Git Bash) from `android/`. SDK at `C:\Users\aziz\AppData\Local\Android\Sdk`; AVD `anatome_api36`.
- **AGP 9 has built-in Kotlin.** Never apply `org.jetbrains.kotlin.android` in any module. Configure Kotlin through `kotlin { compilerOptions { … } }`. `compileSdk = 37`, `minSdk = 36`, `targetSdk = 36` — read them from `uz.etalon.buildlogic.AndroidConfig`, never inline.
- **Every user-visible string is Uzbek Cyrillic in `res/values/strings.xml`.** No English in composables, and no raw enum names rendered. Code identifiers stay English.
- **Money is `Money` (a `BigDecimal` value class) parsed from server strings.** Never `Double`, never `Float`. Every displayed number goes through `:core:ui`'s formatters.
- **Colour and type come only from `EtalonTheme`** — `MaterialTheme.colorScheme` or `LocalEtalonColors.current`. No literal hex in a screen.
- **Outbox rule.** Queue an operation only if its route is `withIdempotency`-wrapped on the server: `orders/{id}/load`, `orders/{id}/loaded-photos`, `orders/{id}/delivery-proof`, `orders/{id}/shipments/{sid}/load`, `payments/upload-receipt`, `payments/{id}/receipts`. Everything else (create/dispatch/deliver/delete shipment, create dispatch, mark returned, delivery location, driver writes, delete photo) is online-only.
- **`Idempotency-Key` is a client-generated UUID stored with the outbox row** and re-sent on every retry. Header name is exactly `Idempotency-Key`; max 128 characters.
- **Beam-length map keys are two-decimal strings.** `loadedBeams` must be keyed `"3.30"`, not `"3.3"` — the server's over-load guard builds its totals with `Number(beamLength).toFixed(2)` and a mismatched key compares against a total of zero, rejecting any positive count with a 422.
- **Testing.** JVM unit tests under `src/test` (JUnit 5, Turbine, MockWebServer, Robolectric where an Android type is unavoidable). The `etalon.android.library` convention plugin already supplies JUnit 5, coroutines-test, Turbine and the platform launcher; Robolectric modules add `robolectric`, `androidx-test-core` and `testRuntimeOnly(libs.junit.vintage.engine)` themselves. Run `.\gradlew.bat :module:testDebugUnitTest` per task and the whole suite before the final task.
- **Commits** from the worktree root with `git add android/` (or `precast-crm/` for the one server task), messages in the repo style (`Feat(android) · …`, `Fix(android) · …`, `Test(android) · …`), each ending with the trailer `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Never push.
- **Never weaken an existing assertion.** If a test in this plan is wrong against the code that exists, fix the smallest thing that preserves its intent and disclose it in the report.

---

## File map

```
precast-crm/
  src/lib/openapi/registry.ts                     modify — register the 10 missing 1b paths
  docs/api/openapi.json                           regenerated

android/
  gradle/libs.versions.toml                       modify — workmanager, camerax, exifinterface, maps, hilt-work
  core/image/                                     NEW  — ImagePrep: decode, EXIF rotate, downscale, JPEG encode
  core/sync/                                      NEW  — OutboxWorker, OutboxScheduler, Hilt worker factory
  core/network/
    EtalonApi.kt                                  modify — 16 new endpoints (multipart + JSON)
    dto/OrderDto.kt                               modify — shipment/dispatch/photo fields the detail screen needs
    dto/LogisticsDto.kt                           NEW  — driver, dispatch, geo, shipment request/response bodies
  core/database/
    EtalonDatabase.kt                             modify — version 2, + OutboxEntity
    entity/OutboxEntity.kt                        NEW
    dao/OutboxDao.kt                              NEW
  core/data/
    LogisticsRepository.kt                        NEW  — every order/shipment/dispatch mutation
    DriversRepository.kt                          NEW
    OutboxRepository.kt                           NEW  — enqueue, observe, retry, cancel
    mapper/OrderMappers.kt                        modify — new shipment/photo/dispatch fields
    mapper/LogisticsMappers.kt                    NEW
  core/designsystem/components/
    EtalonButtons.kt                              NEW  — PrimaryButton, SecondaryButton, DangerButton
    StickyActionBar.kt                            NEW
    NumericKeypadSheet.kt                         NEW  — amount and count entry, no soft keyboard
    OutboxBanner.kt                               NEW
    PhotoStrip.kt                                 NEW  — thumbnails + add + delete
    Lightbox.kt                                   NEW
  feature/capture/                                NEW  — CameraX capture, Photo Picker, CAMERA permission
  feature/logistics/                              NEW  — load truck, shipments, delivery proof, dispatch, drivers, location
  feature/orders/detail/OrderDetailScreen.kt      modify — sticky action bar, shipments card, photo strip, outbox banner
  app/
    AndroidManifest.xml                           modify — CAMERA, FileProvider, maps key placeholder
    res/xml/file_paths.xml                        NEW
    nav/Keys.kt, nav/EtalonNavHost.kt             modify — logistics entries
    EtalonApp.kt                                  modify — WorkManager Configuration.Provider
```

---

### Task 1: Carry-over fixes from Phase 1a

Three defects the 1a final review parked. They are unrelated to each other and each is a few lines, so they ship as one commit before any new surface is built on top of them.

**Files:**
- Modify: `android/core/data/src/main/kotlin/uz/etalon/crm/core/data/SessionRepository.kt`
- Modify: `android/app/src/main/kotlin/uz/etalon/crm/push/PushRegistrar.kt`
- Modify: `android/app/src/main/res/values/strings.xml`
- Modify: `android/app/src/main/kotlin/uz/etalon/crm/shell/Destinations.kt`
- Modify: `android/app/src/main/kotlin/uz/etalon/crm/nav/EtalonNavHost.kt`
- Test: `android/core/data/src/test/kotlin/uz/etalon/crm/core/data/SessionSignOutOrderTest.kt` (create)

**Interfaces:**
- Consumes: `OrdersRepository.clearCache()`, `EtalonDatabase.wipe()`, `runCatchingCancellable` (all exist).
- Produces: `Destination.shortLabelRes: Int` alongside the existing `labelRes`; string resources `nav_*_short`.

- [ ] **Step 1: Write the failing test**

Create `android/core/data/src/test/kotlin/uz/etalon/crm/core/data/SessionSignOutOrderTest.kt`:

```kotlin
package uz.etalon.crm.core.data

import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

/**
 * The 1a final review found that `signOut()` wiped Room before bumping the
 * OrdersRepository epoch, leaving a window in which an in-flight refresh could
 * write the previous user's rows back into the just-wiped table. The epoch must
 * move first so any refresh that resumes afterwards is dropped.
 */
class SessionSignOutOrderTest {

    @Test
    fun `clearCache runs before the database wipe`() = runTest {
        val order = mutableListOf<String>()
        // Minimal doubles: we only care about call ordering inside signOut().
        val recorded = SignOutRecorder(order)
        recorded.signOut()
        assertEquals(listOf("tokens.clear", "lastMe.null", "orders.clearCache", "db.wipe"), order)
    }
}

/**
 * Mirrors SessionRepository.signOut()'s body. Kept in the test source set so the
 * ordering contract is asserted without constructing Retrofit/Room/DataStore.
 * If SessionRepository.signOut() changes, this must change with it.
 */
private class SignOutRecorder(private val log: MutableList<String>) {
    suspend fun signOut() {
        log += "tokens.clear"
        log += "lastMe.null"
        log += "orders.clearCache"
        log += "db.wipe"
    }
}
```

This test as written cannot fail, so it is worthless on its own — replace the private recorder with the real repository. Read `SessionRepository.kt` first, then write the test against the real class using fakes for its five constructor dependencies (`EtalonApi`, `TokenStore`, `SessionPrefs`, `EtalonDatabase`, `OrdersRepository`), each appending its own marker to a shared list. `EtalonDatabase` is an abstract Room class: subclass it in the test and override `ordersDao()` plus `wipe()` if `wipe()` is `open`, otherwise extract the ordering into a small `internal suspend fun SessionRepository.signOutSteps()` the test can drive. **Choose the approach that lets the test genuinely fail against the current ordering, and say in your report which you used.**

- [ ] **Step 2: Run the test to watch it fail**

Run: `.\gradlew.bat :core:data:testDebugUnitTest --tests "*SessionSignOutOrderTest*" --no-daemon`
Expected: FAIL, showing `db.wipe` recorded before `orders.clearCache`.

- [ ] **Step 3: Reorder `signOut()`**

In `SessionRepository.kt`, swap the last two calls:

```kotlin
    /**
     * Local sign-out. The epoch bump inside clearCache() must happen BEFORE the
     * database wipe: a refresh already in flight captured the old epoch, and
     * bumping first guarantees its write is dropped instead of landing in the
     * table we just emptied.
     */
    suspend fun signOut() {
        tokens.clear()
        _me.value = null
        prefs.setLastMe(null)
        orders.clearCache()
        db.wipe()
    }
```

- [ ] **Step 4: Make `PushRegistrar` cancellation-safe**

`android/app/src/main/kotlin/uz/etalon/crm/push/PushRegistrar.kt` currently wraps the suspending `await()` in a plain `runCatching`, which swallows `CancellationException`. Import the existing helper and use it:

```kotlin
import uz.etalon.crm.core.data.runCatchingCancellable
```

```kotlin
    suspend fun registerIfPossible() {
        val token = runCatchingCancellable {
            FirebaseMessaging.getInstance().token.await()
        }.getOrNull() ?: return
        devices.register(token, BuildConfig.VERSION_NAME)
    }
```

- [ ] **Step 5: Add short bar labels**

Append to `android/app/src/main/res/values/strings.xml` (the long labels stay — they are what the More screen and any future header should use):

```xml
    <!-- Bottom-bar labels. The full names above wrap on a 411 dp phone with five
         items, so the bar uses these. Change them here if the wording should differ. -->
    <string name="nav_home_short">Бош</string>
    <string name="nav_orders_short">Буюртма</string>
    <string name="nav_calculator_short">Ҳисоб</string>
    <string name="nav_inbox_short">Хабар</string>
    <string name="nav_payments_short">Тўлов</string>
    <string name="nav_production_short">И.Ч.</string>
    <string name="nav_gazoblok_short">Газоблок</string>
    <string name="nav_more_short">Яна</string>
```

In `shell/Destinations.kt` add the second resource id to every constant:

```kotlin
enum class Destination(val labelRes: Int, val shortLabelRes: Int, val requires: String?) {
    HOME(R.string.nav_home, R.string.nav_home_short, null),
    ORDERS(R.string.nav_orders, R.string.nav_orders_short, "order.view"),
    CALCULATOR(R.string.nav_calculator, R.string.nav_calculator_short, "calculator.use"),
    INBOX(R.string.nav_inbox, R.string.nav_inbox_short, "inbox.access"),
    PAYMENTS(R.string.nav_payments, R.string.nav_payments_short, "payment.view"),
    PRODUCTION(R.string.nav_production, R.string.nav_production_short, "inventory.view"),
    GAZOBLOK(R.string.nav_gazoblok, R.string.nav_gazoblok_short, null),
    MORE(R.string.nav_more, R.string.nav_more_short, null),
}
```

In `nav/EtalonNavHost.kt`, the navigation-suite item label switches to the short form (leave every other use of `labelRes` alone):

```kotlin
            item(
                selected = selected,
                onClick = { … unchanged … },
                icon = { Icon(d.icon(), contentDescription = stringResource(d.labelRes)) },
                label = { Text(stringResource(d.shortLabelRes), maxLines = 1) },
            )
```

Note the full label moves onto `contentDescription`, so TalkBack still announces the complete name.

- [ ] **Step 5b: Update `DestinationsTest`**

`android/app/src/test/kotlin/uz/etalon/crm/shell/DestinationsTest.kt` asserts destination identity, not labels, so it should still pass unchanged. Run it; if the enum's new constructor argument broke a fixture, fix the fixture only.

- [ ] **Step 6: Run the affected tests**

Run: `.\gradlew.bat :core:data:testDebugUnitTest :app:testDebugUnitTest :app:assembleDebug --no-daemon`
Expected: all PASS, BUILD SUCCESSFUL.

- [ ] **Step 7: Commit**

```bash
git add android/core/data android/app
git commit -m "Fix(android) · carry-over defects from Phase 1a

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Register the ten missing routes in the OpenAPI contract

The committed contract documents 10 of the 20 routes slice 1b calls. The Kotlin DTOs are written against that document, so the gaps close first. This is the one task that touches `precast-crm/` rather than `android/`.

**Files:**
- Modify: `precast-crm/src/lib/openapi/registry.ts`
- Regenerate: `docs/api/openapi.json` (repo root)
- Test: `precast-crm/tests/openapi.test.ts` (extend the existing path list)

**Interfaces:**
- Consumes: `DispatchCreateSchema`, `DriverUpdateSchema` from `@/lib/validation`; `DeliveryLocationBody` from `@/app/api/orders/[id]/delivery-location/schema`; `ResolveLinkBody` from `@/app/api/geo/resolve-link/schema`; the registry's local helpers `envelope`, `json`, `multipart`, `File`, `idem`, `bearer`, `errors`, `Any`.
- Produces: 10 new paths in `docs/api/openapi.json`, bringing the document to 41 paths.

- [ ] **Step 1: Extend the test's path list**

In `precast-crm/tests/openapi.test.ts`, add these ten entries to the array the first test iterates over:

```ts
      "/api/orders/{id}/loaded-photos/{photoId}",
      "/api/orders/{id}/shipments/{sid}",
      "/api/orders/{id}/dispatch",
      "/api/dispatches/{id}/return",
      "/api/orders/{id}/delivery-location",
      "/api/geo/resolve-link",
      "/api/drivers/{id}",
      "/api/drivers/{id}/deactivate",
      "/api/payments/{id}/handover",
```

That is nine; the tenth path, `/api/drivers/{id}`, carries two methods (GET and PATCH) — add a second test asserting both:

```ts
  it("documents both methods on /api/drivers/{id}", () => {
    const p = doc.paths?.["/api/drivers/{id}"];
    expect(p?.get).toBeDefined();
    expect(p?.patch).toBeDefined();
  });
```

- [ ] **Step 2: Run to watch it fail**

Run (from `precast-crm/`): `npx vitest run tests/openapi.test.ts`
Expected: FAIL listing the missing paths.

- [ ] **Step 3: Register the paths**

In `precast-crm/src/lib/openapi/registry.ts`, extend the validation import with the two extra schemas and add the sibling-schema imports:

```ts
import {
  LoginSchema, ChangePinSchema, DeviceRegisterSchema, ClientCreateSchema, ClientUpdateSchema,
  PlaceOrderSchema, OrderUpdateSchema, PaymentRecordSchema, PaymentConfirmSchema,
  PaymentRejectSchema, CommentCreateSchema, DriverCreateSchema, DriverUpdateSchema,
  DispatchCreateSchema, OrderStatusEnum, OrderPaymentStateEnum, PaymentStatusEnum,
  PaymentMethodEnum, RoleEnum, LanguageEnum, GalleryListSchema,
} from "@/lib/validation";
import { CalculateBatchSchema } from "@/app/api/calculate/batch/schema";
import { DeliveryLocationBody } from "@/app/api/orders/[id]/delivery-location/schema";
import { ResolveLinkBody } from "@/app/api/geo/resolve-link/schema";
```

(Keep whatever the current import list actually is; add only the names that are missing. `GalleryListSchema`/`LanguageEnum` are already imported by the Phase 0 fix wave — do not duplicate them.)

Then append the registrations, after the existing logistics block:

```ts
// ── Phase 1b: logistics, drivers, location ─────────────────────
registry.registerPath({ method: "delete", path: "/api/orders/{id}/loaded-photos/{photoId}", security: bearer,
  request: { params: z.object({ id: z.string(), photoId: z.string() }) },
  responses: { 200: { description: "Deleted", ...json(envelope(z.object({ id: z.string() }))) }, 404: { description: "Photo not found", ...json(ApiError) }, ...errors } });

registry.registerPath({ method: "delete", path: "/api/orders/{id}/shipments/{sid}", security: bearer,
  request: { params: z.object({ id: z.string(), sid: z.string() }) },
  responses: { 200: { description: "Deleted", ...json(envelope(z.object({ deleted: z.literal(true) }))) }, 404: { description: "Shipment not found", ...json(ApiError) }, ...errors } });

registry.registerPath({ method: "post", path: "/api/orders/{id}/dispatch", security: bearer,
  request: { params: z.object({ id: z.string() }), body: json(DispatchCreateSchema) },
  responses: { 201: { description: "Dispatch", ...json(envelope(Any)) }, 409: { description: "Order already has a dispatch", ...json(ApiError) }, 404: { description: "Order not found", ...json(ApiError) }, ...errors } });

registry.registerPath({ method: "patch", path: "/api/dispatches/{id}/return", security: bearer,
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: "Dispatch", ...json(envelope(Any)) }, 404: { description: "Dispatch not found", ...json(ApiError) }, ...errors } });

registry.registerPath({ method: "patch", path: "/api/orders/{id}/delivery-location", security: bearer,
  request: { params: z.object({ id: z.string() }), body: json(DeliveryLocationBody) },
  responses: { 200: { description: "Pin", ...json(envelope(z.object({
    id: z.string(), deliveryLat: z.number().nullable(), deliveryLng: z.number().nullable(),
    deliveryLocationUrl: z.string().nullable(), deliveryLocationLabel: z.string().nullable(),
  }))) }, 404: { description: "Order not found", ...json(ApiError) }, ...errors } });

registry.registerPath({ method: "post", path: "/api/geo/resolve-link", security: bearer,
  request: { body: json(ResolveLinkBody) },
  responses: { 200: { description: "Coordinates", ...json(envelope(z.object({ lat: z.number(), lng: z.number() }))) }, ...errors } });

registry.registerPath({ method: "get", path: "/api/drivers/{id}", security: bearer,
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: "Driver detail", ...json(envelope(Any)) }, 404: { description: "Driver not found", ...json(ApiError) }, ...errors } });

registry.registerPath({ method: "patch", path: "/api/drivers/{id}", security: bearer,
  request: { params: z.object({ id: z.string() }), body: json(DriverUpdateSchema) },
  responses: { 200: { description: "Driver", ...json(envelope(Any)) }, 404: { description: "Driver not found", ...json(ApiError) }, ...errors } });

registry.registerPath({ method: "patch", path: "/api/drivers/{id}/deactivate", security: bearer,
  request: { params: z.object({ id: z.string() }), body: json(z.object({ active: z.boolean().optional() })) },
  responses: { 200: { description: "Driver", ...json(envelope(Any)) }, 404: { description: "Driver not found", ...json(ApiError) }, ...errors } });

registry.registerPath({ method: "post", path: "/api/payments/{id}/handover", security: bearer,
  request: { params: z.object({ id: z.string() }) },
  responses: { 200: { description: "Payment", ...json(envelope(Any)) }, 404: { description: "Payment not found", ...json(ApiError) }, ...errors } });
```

If a helper is named differently in the real file (for example `ApiError` is registered as a component and referenced as a schema rather than spread), follow the file's own existing convention for the already-registered paths and disclose the adaptation.

- [ ] **Step 4: Regenerate and verify**

Run (from `precast-crm/`):
```
npm run openapi:generate
npm run openapi:check
npx vitest run tests/openapi.test.ts
npx tsc --noEmit
```
Expected: the document is rewritten, the staleness check passes, both tests pass, types clean.

- [ ] **Step 5: Commit**

```bash
git add precast-crm/src/lib/openapi/registry.ts precast-crm/tests/openapi.test.ts docs/api/openapi.json
git commit -m "Feat(api) · document the logistics routes the Android app calls

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Image preparation module (`:core:image`)

The server accepts JPEG, PNG and WebP up to 8 MB and rejects HEIC outright, so conversion and downscaling are the client's job. This mirrors `precast-crm/src/lib/image/prepare-upload.ts`: longest edge 1280 px, JPEG quality 0.65, EXIF orientation applied.

**Files:**
- Create: `android/core/image/build.gradle.kts`
- Create: `android/core/image/src/main/kotlin/uz/etalon/crm/core/image/ImagePrep.kt`
- Create: `android/core/image/src/main/kotlin/uz/etalon/crm/core/image/PreparedImage.kt`
- Create: `android/core/image/src/main/kotlin/uz/etalon/crm/core/image/di/ImageModule.kt`
- Modify: `android/settings.gradle.kts`, `android/gradle/libs.versions.toml`
- Test: `android/core/image/src/test/kotlin/uz/etalon/crm/core/image/ImagePrepTest.kt`

**Interfaces:**
- Produces:
  ```kotlin
  data class PreparedImage(val file: File, val width: Int, val height: Int, val bytes: Long)
  interface ImagePrep {
      /** Decode [source], apply EXIF rotation, scale the longest edge to at most
       *  [maxEdge], encode JPEG at [quality], and write it into the app cache. */
      suspend fun prepare(source: Uri, maxEdge: Int = MAX_EDGE, quality: Int = QUALITY): Result<PreparedImage>
      /** Same, for a file the camera already wrote. */
      suspend fun prepare(source: File, maxEdge: Int = MAX_EDGE, quality: Int = QUALITY): Result<PreparedImage>
      companion object { const val MAX_EDGE = 1280; const val QUALITY = 65 }
  }
  class AndroidImagePrep @Inject constructor(@ApplicationContext context: Context) : ImagePrep
  ```
- Consumed by: `:feature:capture` (Task 9) and `:core:data` (Task 6, which stores the prepared file path in the outbox row).

- [ ] **Step 1: Add the dependency and the module**

In `android/gradle/libs.versions.toml` add to `[versions]`:
```toml
exifinterface = "1.4.1"
```
and to `[libraries]`:
```toml
androidx-exifinterface = { module = "androidx.exifinterface:exifinterface", version.ref = "exifinterface" }
```
(Take the latest stable of `androidx.exifinterface:exifinterface` at kickoff; the pinned number above is a floor.)

In `android/settings.gradle.kts` add `":core:image"` to the `include(...)` list of core modules.

Create `android/core/image/build.gradle.kts`:
```kotlin
plugins { id("etalon.android.library"); id("etalon.hilt") }
android { namespace = "uz.etalon.crm.core.image" }
dependencies {
    implementation(libs.androidx.exifinterface)
    implementation(libs.kotlinx.coroutines.android)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testRuntimeOnly(libs.junit.vintage.engine)
}
```

- [ ] **Step 2: Write the failing test**

Create `android/core/image/src/test/kotlin/uz/etalon/crm/core/image/ImagePrepTest.kt`:

```kotlin
package uz.etalon.crm.core.image

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import androidx.test.core.app.ApplicationProvider
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class ImagePrepTest {

    private val context: Context get() = ApplicationProvider.getApplicationContext()

    private fun writeJpeg(w: Int, h: Int, name: String): File {
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val f = File(context.cacheDir, name)
        f.outputStream().use { bmp.compress(Bitmap.CompressFormat.JPEG, 90, it) }
        return f
    }

    private fun sizeOf(f: File): Pair<Int, Int> {
        val o = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(f.absolutePath, o)
        return o.outWidth to o.outHeight
    }

    @Test
    fun `scales the longest edge down to the cap and keeps the aspect ratio`() = runTest {
        val src = writeJpeg(3000, 2000, "big.jpg")
        val out = AndroidImagePrep(context).prepare(src).getOrThrow()
        val (w, h) = sizeOf(out.file)
        assertEquals(1280, w)
        assertEquals(853, h)                       // 2000 * 1280 / 3000, floored
        assertEquals(w, out.width)
        assertEquals(h, out.height)
    }

    @Test
    fun `leaves an already small image at its own size`() = runTest {
        val src = writeJpeg(640, 480, "small.jpg")
        val out = AndroidImagePrep(context).prepare(src).getOrThrow()
        assertEquals(640 to 480, sizeOf(out.file))
    }

    @Test
    fun `writes a jpeg into the cache directory and reports its size`() = runTest {
        val src = writeJpeg(2000, 1000, "wide.jpg")
        val out = AndroidImagePrep(context).prepare(src).getOrThrow()
        assertTrue(out.file.absolutePath.startsWith(context.cacheDir.absolutePath))
        assertTrue(out.file.name.endsWith(".jpg"))
        assertEquals(out.file.length(), out.bytes)
        assertTrue("prepared file should be under the server's 8 MB cap", out.bytes < 8L * 1024 * 1024)
    }

    @Test
    fun `reports a failure instead of throwing when the source cannot be decoded`() = runTest {
        val junk = File(context.cacheDir, "not-an-image.jpg").apply { writeText("hello") }
        val result = AndroidImagePrep(context).prepare(junk)
        assertTrue(result.isFailure)
    }
}
```

- [ ] **Step 3: Run to watch it fail**

Run: `.\gradlew.bat :core:image:testDebugUnitTest --no-daemon`
Expected: compilation FAIL (`AndroidImagePrep` does not exist).

- [ ] **Step 4: Implement**

`PreparedImage.kt`:
```kotlin
package uz.etalon.crm.core.image

import java.io.File

/** A photo that is ready to upload: JPEG, orientation applied, inside the size cap. */
data class PreparedImage(val file: File, val width: Int, val height: Int, val bytes: Long)
```

`ImagePrep.kt`:
```kotlin
package uz.etalon.crm.core.image

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import androidx.exifinterface.media.ExifInterface
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.InputStream
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.max
import kotlin.math.roundToInt

interface ImagePrep {
    suspend fun prepare(source: Uri, maxEdge: Int = MAX_EDGE, quality: Int = QUALITY): Result<PreparedImage>
    suspend fun prepare(source: File, maxEdge: Int = MAX_EDGE, quality: Int = QUALITY): Result<PreparedImage>

    companion object {
        /** Same cap the web uses in prepare-upload.ts. */
        const val MAX_EDGE = 1280
        /** Same JPEG quality the web uses (0.65). */
        const val QUALITY = 65
    }
}

/**
 * Decodes with inSampleSize so a 12 MP camera frame never lands in memory at full
 * size, applies the EXIF rotation the camera recorded, scales the longest edge to
 * the cap, and writes JPEG into the app cache. The server rejects HEIC, so every
 * capture goes through here before it reaches the outbox.
 */
@Singleton
class AndroidImagePrep @Inject constructor(
    @param:ApplicationContext private val context: Context,
) : ImagePrep {

    override suspend fun prepare(source: Uri, maxEdge: Int, quality: Int): Result<PreparedImage> =
        run({ context.contentResolver.openInputStream(source) }, maxEdge, quality)

    override suspend fun prepare(source: File, maxEdge: Int, quality: Int): Result<PreparedImage> =
        run({ source.inputStream() }, maxEdge, quality)

    private suspend fun run(open: () -> InputStream?, maxEdge: Int, quality: Int): Result<PreparedImage> =
        withContext(Dispatchers.IO) {
            runCatching {
                val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                requireNotNull(open()) { "source is not readable" }.use { BitmapFactory.decodeStream(it, null, bounds) }
                require(bounds.outWidth > 0 && bounds.outHeight > 0) { "source is not a decodable image" }

                val longest = max(bounds.outWidth, bounds.outHeight)
                val opts = BitmapFactory.Options().apply {
                    inSampleSize = sampleSizeFor(longest, maxEdge)
                }
                val decoded = requireNotNull(open()) { "source is not readable" }
                    .use { BitmapFactory.decodeStream(it, null, opts) }
                    ?: error("source is not a decodable image")

                val rotation = requireNotNull(open()) { "source is not readable" }
                    .use { ExifInterface(it).rotationDegrees }
                val upright = if (rotation == 0) decoded else decoded.rotate(rotation)
                val scaled = upright.scaleToFit(maxEdge)

                val out = File(context.cacheDir, "upload-${UUID.randomUUID()}.jpg")
                out.outputStream().use { scaled.compress(Bitmap.CompressFormat.JPEG, quality, it) }

                if (scaled !== decoded) scaled.recycle()
                if (upright !== decoded) upright.recycle()
                decoded.recycle()

                PreparedImage(out, scaled.width, scaled.height, out.length())
            }
        }

    /** Largest power-of-two subsample that still leaves the image above the cap. */
    private fun sampleSizeFor(longestEdge: Int, maxEdge: Int): Int {
        var sample = 1
        while (longestEdge / (sample * 2) >= maxEdge) sample *= 2
        return sample
    }

    private fun Bitmap.rotate(degrees: Int): Bitmap =
        Bitmap.createBitmap(this, 0, 0, width, height, Matrix().apply { postRotate(degrees.toFloat()) }, true)

    private fun Bitmap.scaleToFit(maxEdge: Int): Bitmap {
        val longest = max(width, height)
        if (longest <= maxEdge) return this
        val ratio = maxEdge.toDouble() / longest
        val w = (width * ratio).roundToInt().coerceAtLeast(1)
        val h = (height * ratio).roundToInt().coerceAtLeast(1)
        return Bitmap.createScaledBitmap(this, w, h, true)
    }
}
```

Note the test expects `853` for a 3000×2000 source: `2000 × (1280 / 3000) = 853.33` rounds to 853. If `roundToInt` and the sample-size path together produce 854 on the pinned Robolectric, adjust the **test's expectation to the value the real pipeline produces** and say so — the contract is "longest edge is exactly 1280 and the aspect ratio is preserved within a pixel", not a specific rounding mode.

`di/ImageModule.kt`:
```kotlin
package uz.etalon.crm.core.image.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import uz.etalon.crm.core.image.AndroidImagePrep
import uz.etalon.crm.core.image.ImagePrep
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
abstract class ImageModule {
    @Binds @Singleton abstract fun imagePrep(impl: AndroidImagePrep): ImagePrep
}
```

- [ ] **Step 5: Run the tests**

Run: `.\gradlew.bat :core:image:testDebugUnitTest :core:image:assembleDebug --no-daemon`
Expected: 4/4 PASS, BUILD SUCCESSFUL.

- [ ] **Step 6: Commit**

```bash
git add android/core/image android/settings.gradle.kts android/gradle/libs.versions.toml
git commit -m "Feat(android) · image preparation matching the web upload pipeline

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Logistics endpoints and DTOs (`:core:network`)

Seventeen new calls. Four are multipart uploads that carry an `Idempotency-Key`; the rest are ordinary JSON. The existing `OrderDetailDto` also grows the shipment, dispatch and photo fields the cockpit needs but 1a never modelled.

**Files:**
- Modify: `android/core/network/src/main/kotlin/uz/etalon/crm/core/network/EtalonApi.kt`
- Modify: `android/core/network/src/main/kotlin/uz/etalon/crm/core/network/dto/OrderDto.kt`
- Create: `android/core/network/src/main/kotlin/uz/etalon/crm/core/network/dto/LogisticsDto.kt`
- Test: `android/core/network/src/test/kotlin/uz/etalon/crm/core/network/LogisticsApiTest.kt`

**Interfaces:**
- Produces on `EtalonApi`: `loadTruck`, `addLoadedPhoto`, `deleteLoadedPhoto`, `deliveryProof`, `createShipment`, `deleteShipment`, `loadShipment`, `dispatchShipment`, `deliverShipment`, `createDispatch`, `markDispatchReturned`, `setDeliveryLocation`, `resolveMapLink`, `drivers`, `createDriver`, `updateDriver`, `setDriverActive`.
- Produces DTOs: `ShipmentDispatchRequest`, `DispatchCreateRequest`, `DispatchDto`, `DeliveryLocationRequest`, `DeliveryLocationDto`, `ResolveLinkRequest`, `LatLngDto`, `DriverListItemDto`, `DriverCreateRequest`, `DriverUpdateRequest`, `DriverActiveRequest`, `DeletedDto` reuse, `DeletedIdDto`, `DispatchedDto`, `DeliveredDto`.
- Extends `ShipmentDto`, `GalleryPhotoDto`, `OrderDetailDto`.
- Consumed by: Task 6.

- [ ] **Step 1: Write the failing test**

Create `android/core/network/src/test/kotlin/uz/etalon/crm/core/network/LogisticsApiTest.kt`:

```kotlin
package uz.etalon.crm.core.network

import kotlinx.coroutines.test.runTest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import uz.etalon.crm.core.network.dto.DispatchCreateRequest
import uz.etalon.crm.core.network.dto.ShipmentDispatchRequest

class LogisticsApiTest {
    private lateinit var server: MockWebServer
    private lateinit var api: EtalonApi

    @BeforeEach fun setUp() {
        server = MockWebServer().also { it.start() }
        val json = EtalonJson.create()
        api = Retrofit.Builder()
            .baseUrl(server.url("/"))
            .client(OkHttpClient.Builder().addInterceptor(EnvelopeInterceptor(json)).build())
            .addConverterFactory(json.asConverterFactory("application/json".toMediaType()))
            .build()
            .create(EtalonApi::class.java)
    }
    @AfterEach fun tearDown() = server.shutdown()

    private fun ok(body: String) =
        MockResponse().setBody(body).addHeader("Content-Type", "application/json")

    private fun jpegPart(): MultipartBody.Part =
        MultipartBody.Part.createFormData(
            "file", "truck.jpg",
            byteArrayOf(0xFF.toByte(), 0xD8.toByte()).toRequestBody("image/jpeg".toMediaType()),
        )

    private fun textPart(v: String) = v.toRequestBody("text/plain".toMediaType())

    @Test fun `loadTruck posts multipart with the idempotency header`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"loadedPhotoUrl":"/uploads/orders/o1/loaded-1.jpg"}}"""))
        val res = api.loadTruck("o1", jpegPart(), "key-1")
        assertEquals("/uploads/orders/o1/loaded-1.jpg", res.loadedPhotoUrl)
        val rec = server.takeRequest()
        assertEquals("POST", rec.method)
        assertEquals("/api/orders/o1/load", rec.path)
        assertEquals("key-1", rec.getHeader("Idempotency-Key"))
        assertTrue(rec.getHeader("Content-Type")!!.startsWith("multipart/form-data"))
        assertTrue(rec.body.readUtf8().contains("""name="file""""))
    }

    @Test fun `deliveryProof sends every cash field as its own part`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"id":"o1","status":"DELIVERED"}}"""))
        api.deliveryProof(
            id = "o1", file = jpegPart(),
            cashAmount = textPart("1500000"),
            noCashCollected = textPart("false"),
            noCashCollectedNote = textPart(""),
            driverReturned = textPart("true"),
            idempotencyKey = "key-2",
        )
        val body = server.takeRequest().body.readUtf8()
        for (name in listOf("file", "cashAmount", "noCashCollected", "noCashCollectedNote", "driverReturned")) {
            assertTrue("missing part $name", body.contains("""name="$name""""))
        }
    }

    @Test fun `loadShipment sends the beam map and block count as text parts`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"id":"s1","number":1,"status":"LOADED"}}"""))
        api.loadShipment("o1", "s1", jpegPart(), textPart("""{"3.30":5}"""), textPart("120"), "key-3")
        val rec = server.takeRequest()
        assertEquals("/api/orders/o1/shipments/s1/load", rec.path)
        val body = rec.body.readUtf8()
        assertTrue(body.contains("""name="loadedBeams""""))
        assertTrue(body.contains("""{"3.30":5}"""))
        assertTrue(body.contains("""name="loadedBlocks""""))
    }

    @Test fun `dispatchShipment posts json and reads the dispatched flag`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"dispatched":true}}"""))
        val res = api.dispatchShipment("o1", "s1", ShipmentDispatchRequest(driverId = "d1", truckIdentifier = "01A123BC", driverWillCollectCash = true, cashToCollect = 500000.0))
        assertTrue(res.dispatched)
        val rec = server.takeRequest()
        assertEquals("POST", rec.method)
        val sent = rec.body.readUtf8()
        assertTrue(sent.contains(""""driverId":"d1""""))
        assertTrue(sent.contains(""""driverWillCollectCash":true"""))
    }

    @Test fun `createShipment posts with no body and returns the new shipment`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"id":"s2","number":2,"status":"PENDING"}}"""))
        val res = api.createShipment("o1")
        assertEquals(2, res.number)
        assertEquals("POST", server.takeRequest().method)
    }

    @Test fun `deleteShipment and deliverShipment hit the right paths`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"deleted":true}}"""))
        api.deleteShipment("o1", "s1")
        assertEquals("/api/orders/o1/shipments/s1", server.takeRequest().path)
        server.enqueue(ok("""{"ok":true,"data":{"delivered":true}}"""))
        api.deliverShipment("o1", "s1")
        assertEquals("/api/orders/o1/shipments/s1/deliver", server.takeRequest().path)
    }

    @Test fun `createDispatch sends expectedCollection`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"id":"dp1","expectedCollection":"500000.00"}}"""))
        api.createDispatch("o1", DispatchCreateRequest(driverId = "d1", truckIdentifier = null, expectedCollection = 500000.0, notes = null))
        assertTrue(server.takeRequest().body.readUtf8().contains(""""expectedCollection":500000"""))
    }

    @Test fun `setDeliveryLocation sends nulls to clear the pin`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"id":"o1","deliveryLat":null,"deliveryLng":null,"deliveryLocationUrl":null,"deliveryLocationLabel":null}}"""))
        val res = api.setDeliveryLocation("o1", uz.etalon.crm.core.network.dto.DeliveryLocationRequest(null, null, null, null))
        assertEquals(null, res.deliveryLat)
        // explicitNulls = false must NOT drop the required lat/lng keys
        val sent = server.takeRequest().body.readUtf8()
        assertTrue("lat must be sent explicitly as null", sent.contains(""""lat":null"""))
        assertTrue("lng must be sent explicitly as null", sent.contains(""""lng":null"""))
    }

    @Test fun `drivers list is parsed with its derived counts`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":[{"id":"d1","name":"Ҳайдовчи","phone":"998901112233","active":true,"activeDispatchCount":2,"discrepancyCount30d":0,"lastDispatchAt":"2026-09-01T00:00:00.000Z"}]}"""))
        val list = api.drivers(activeOnly = "true")
        assertEquals(1, list.size)
        assertEquals(2, list[0].activeDispatchCount)
        assertEquals("/api/drivers?activeOnly=true", server.takeRequest().path)
    }

    @Test fun `resolveMapLink returns coordinates`() = runTest {
        server.enqueue(ok("""{"ok":true,"data":{"lat":41.31,"lng":69.28}}"""))
        val p = api.resolveMapLink(uz.etalon.crm.core.network.dto.ResolveLinkRequest("https://maps.app.goo.gl/x"))
        assertEquals(41.31, p.lat)
    }
}
```

**Note on the `setDeliveryLocation` assertion:** the shared `Json` sets `explicitNulls = false`, which omits null properties. The server's `DeliveryLocationBody` requires the `lat` and `lng` keys to be present (they may be null) and treats a null in either as "clear the pin". Declare `DeliveryLocationRequest`'s `lat`/`lng` **without default values** so kotlinx must encode them; if `explicitNulls = false` still drops them, annotate the class `@EncodeDefault` will not help — instead give that one request its own `Json` instance with `explicitNulls = true`, exposed as `EtalonJson.createExplicitNulls()`, and pass the body as a pre-encoded `JsonObject`. Pick whichever the pinned kotlinx version actually requires, prove it with this test, and disclose the choice.

- [ ] **Step 2: Run to watch it fail**

Run: `.\gradlew.bat :core:network:testDebugUnitTest --no-daemon`
Expected: compilation FAIL — none of the methods or DTOs exist.

- [ ] **Step 3: Create `dto/LogisticsDto.kt`**

```kotlin
package uz.etalon.crm.core.network.dto

import kotlinx.serialization.Serializable

// ── Shipments ───────────────────────────────────────────────────
/** Body of POST /api/orders/{id}/shipments/{sid}/dispatch. The server reads this
 *  with a bare `await req.json()` — there is no Zod schema, so every field is
 *  optional and unknown keys are ignored. */
@Serializable
data class ShipmentDispatchRequest(
    val driverId: String? = null,
    val truckIdentifier: String? = null,
    val driverWillCollectCash: Boolean = false,
    val cashToCollect: Double? = null,
    val notes: String? = null,
)

@Serializable data class DispatchedDto(val dispatched: Boolean)
@Serializable data class DeliveredDto(val delivered: Boolean)
@Serializable data class DeletedIdDto(val id: String)
@Serializable data class LoadedPhotoDto(val loadedPhotoUrl: String)

// ── Single-truck dispatch ───────────────────────────────────────
/** Body of POST /api/orders/{id}/dispatch (DispatchCreateSchema).
 *  `expectedCollection` is required and coerced to a number server-side. */
@Serializable
data class DispatchCreateRequest(
    val driverId: String? = null,
    val truckIdentifier: String? = null,
    val expectedCollection: Double,
    val notes: String? = null,
)

@Serializable
data class DispatchDto(
    val id: String,
    val driverId: String? = null,
    val truckIdentifier: String? = null,
    val expectedCollection: String = "0",
    val dispatchedAt: String? = null,
    val returnedAt: String? = null,
    val driver: DriverDto? = null,
)

// ── Delivery location ───────────────────────────────────────────
/** Body of PATCH /api/orders/{id}/delivery-location. `lat` and `lng` are
 *  required keys that may be null; a null in either clears all four columns. */
@Serializable
data class DeliveryLocationRequest(
    val lat: Double?,
    val lng: Double?,
    val url: String? = null,
    val label: String? = null,
)

@Serializable
data class DeliveryLocationDto(
    val id: String,
    val deliveryLat: Double? = null,
    val deliveryLng: Double? = null,
    val deliveryLocationUrl: String? = null,
    val deliveryLocationLabel: String? = null,
)

@Serializable data class ResolveLinkRequest(val url: String)
@Serializable data class LatLngDto(val lat: Double, val lng: Double)

// ── Drivers ─────────────────────────────────────────────────────
@Serializable
data class DriverListItemDto(
    val id: String,
    val name: String,
    val phone: String,
    val notes: String? = null,
    val active: Boolean = true,
    val activeDispatchCount: Int = 0,
    val discrepancyCount30d: Int = 0,
    val lastDispatchAt: String? = null,
)

@Serializable data class DriverCreateRequest(val name: String, val phone: String, val notes: String? = null)
@Serializable data class DriverUpdateRequest(val name: String? = null, val phone: String? = null, val notes: String? = null)
@Serializable data class DriverActiveRequest(val active: Boolean)
```

- [ ] **Step 4: Extend `dto/OrderDto.kt`**

Replace the three affected classes (leave every other declaration in the file untouched):

```kotlin
@Serializable
data class ShipmentDto(
    val id: String,
    val number: Int,
    val status: String,
    val loadedBeams: Map<String, Int>? = null,   // keys are two-decimal beam lengths, e.g. "3.30"
    val loadedBlocks: Int? = null,
    val loadedPhotoUrl: String? = null,
    val loadedAt: String? = null,
    val dispatchedAt: String? = null,
    val deliveredAt: String? = null,
    val driverWillCollectCash: Boolean = false,
    val cashToCollect: String? = null,
    val truckIdentifier: String? = null,
    val notes: String? = null,
    val driver: DriverDto? = null,
)

@Serializable
data class GalleryPhotoDto(
    val id: String,
    val url: String,
    val kind: String? = null,
    val uploadedAt: String? = null,
)
```

and add one field to `OrderDetailDto` (keep every existing field and default exactly as it is):

```kotlin
    val dispatch: DispatchDto? = null,
```

- [ ] **Step 5: Extend `EtalonApi.kt`**

Add the imports and the seventeen methods. Keep the nine existing ones unchanged.

```kotlin
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.http.Header
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.Part
import uz.etalon.crm.core.network.dto.*
```

```kotlin
    // ── Camera uploads. Every one of these routes is withIdempotency-wrapped on
    // the server, which is exactly why they are the operations the outbox may
    // queue and retry. The key is a client UUID reused across retries.

    @Multipart
    @POST("/api/orders/{id}/load")
    suspend fun loadTruck(
        @Path("id") id: String,
        @Part file: MultipartBody.Part,
        @Header("Idempotency-Key") idempotencyKey: String,
    ): LoadedPhotoDto

    @Multipart
    @POST("/api/orders/{id}/loaded-photos")
    suspend fun addLoadedPhoto(
        @Path("id") id: String,
        @Part file: MultipartBody.Part,
        @Header("Idempotency-Key") idempotencyKey: String,
    ): GalleryPhotoDto

    @Multipart
    @POST("/api/orders/{id}/delivery-proof")
    suspend fun deliveryProof(
        @Path("id") id: String,
        @Part file: MultipartBody.Part,
        @Part("cashAmount") cashAmount: RequestBody,
        @Part("noCashCollected") noCashCollected: RequestBody,
        @Part("noCashCollectedNote") noCashCollectedNote: RequestBody,
        @Part("driverReturned") driverReturned: RequestBody,
        @Header("Idempotency-Key") idempotencyKey: String,
    ): OrderDetailDto

    @Multipart
    @POST("/api/orders/{id}/shipments/{sid}/load")
    suspend fun loadShipment(
        @Path("id") id: String,
        @Path("sid") sid: String,
        @Part file: MultipartBody.Part,
        @Part("loadedBeams") loadedBeams: RequestBody,
        @Part("loadedBlocks") loadedBlocks: RequestBody,
        @Header("Idempotency-Key") idempotencyKey: String,
    ): ShipmentDto

    // ── Online-only mutations (no server-side idempotency, so never queued)

    @DELETE("/api/orders/{id}/loaded-photos/{photoId}")
    suspend fun deleteLoadedPhoto(@Path("id") id: String, @Path("photoId") photoId: String): DeletedIdDto

    @POST("/api/orders/{id}/shipments")
    suspend fun createShipment(@Path("id") id: String): ShipmentDto

    @DELETE("/api/orders/{id}/shipments/{sid}")
    suspend fun deleteShipment(@Path("id") id: String, @Path("sid") sid: String): DeletedDto

    @POST("/api/orders/{id}/shipments/{sid}/dispatch")
    suspend fun dispatchShipment(
        @Path("id") id: String, @Path("sid") sid: String, @Body body: ShipmentDispatchRequest,
    ): DispatchedDto

    @POST("/api/orders/{id}/shipments/{sid}/deliver")
    suspend fun deliverShipment(@Path("id") id: String, @Path("sid") sid: String): DeliveredDto

    @POST("/api/orders/{id}/dispatch")
    suspend fun createDispatch(@Path("id") id: String, @Body body: DispatchCreateRequest): DispatchDto

    @PATCH("/api/dispatches/{id}/return")
    suspend fun markDispatchReturned(@Path("id") id: String): DispatchDto

    @PATCH("/api/orders/{id}/delivery-location")
    suspend fun setDeliveryLocation(@Path("id") id: String, @Body body: DeliveryLocationRequest): DeliveryLocationDto

    @POST("/api/geo/resolve-link")
    suspend fun resolveMapLink(@Body body: ResolveLinkRequest): LatLngDto

    @GET("/api/drivers")
    suspend fun drivers(@Query("activeOnly") activeOnly: String? = null): List<DriverListItemDto>

    @POST("/api/drivers")
    suspend fun createDriver(@Body body: DriverCreateRequest): DriverListItemDto

    @PATCH("/api/drivers/{id}")
    suspend fun updateDriver(@Path("id") id: String, @Body body: DriverUpdateRequest): DriverListItemDto

    @PATCH("/api/drivers/{id}/deactivate")
    suspend fun setDriverActive(@Path("id") id: String, @Body body: DriverActiveRequest): DriverListItemDto
```

- [ ] **Step 6: Run the tests**

Run: `.\gradlew.bat :core:network:testDebugUnitTest :core:network:assembleDebug --no-daemon`
Expected: all PASS (10 new plus the 15 existing), BUILD SUCCESSFUL.

- [ ] **Step 7: Commit**

```bash
git add android/core/network
git commit -m "Feat(android) · logistics endpoints, multipart uploads and their DTOs

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Outbox storage (`:core:database`)

One table. A row is a photo upload waiting for a network, holding the file it will send and the idempotency key it will re-send on every attempt.

**Files:**
- Create: `android/core/database/src/main/kotlin/uz/etalon/crm/core/database/entity/OutboxEntity.kt`
- Create: `android/core/database/src/main/kotlin/uz/etalon/crm/core/database/dao/OutboxDao.kt`
- Modify: `android/core/database/src/main/kotlin/uz/etalon/crm/core/database/EtalonDatabase.kt`
- Modify: `android/core/database/src/main/kotlin/uz/etalon/crm/core/database/di/DatabaseModule.kt`
- Test: `android/core/database/src/test/kotlin/uz/etalon/crm/core/database/OutboxDaoTest.kt`

**Interfaces:**
- Produces: `OutboxEntity`, `OutboxState` (string constants), `OutboxDao`, `EtalonDatabase.outboxDao()`, database version **2**.
- `EtalonDatabase.wipe()` also clears the outbox — sign-out must not leave one user's photo queued under another user's token. Task 15 makes the sign-out confirmation name the pending count so the loss is never silent.
- Consumed by: Tasks 6 and 7.

- [ ] **Step 1: Write the failing test**

Create `android/core/database/src/test/kotlin/uz/etalon/crm/core/database/OutboxDaoTest.kt`:

```kotlin
package uz.etalon.crm.core.database

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import app.cash.turbine.test
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import uz.etalon.crm.core.database.entity.OutboxEntity
import uz.etalon.crm.core.database.entity.OutboxState

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [36])
class OutboxDaoTest {

    private fun db() = Room.inMemoryDatabaseBuilder(
        ApplicationProvider.getApplicationContext<Context>(), EtalonDatabase::class.java,
    ).allowMainThreadQueries().build()

    private fun row(id: String, orderId: String, state: String = OutboxState.QUEUED, created: Long = 0) =
        OutboxEntity(
            id = id, kind = "LOAD_TRUCK", orderId = orderId, shipmentId = null, paymentId = null,
            filePath = "/data/outbox/$id.jpg", payloadJson = "{}", state = state,
            attempts = 0, lastError = null, createdAt = created, updatedAt = created,
        )

    @Test fun `observeForOrder returns only that order's rows, oldest first`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("b", "o1", created = 2))
        dao.upsert(row("a", "o1", created = 1))
        dao.upsert(row("c", "o2", created = 3))
        dao.observeForOrder("o1").test {
            assertEquals(listOf("a", "b"), awaitItem().map { it.id })
            cancelAndIgnoreRemainingEvents()
        }
    }

    @Test fun `nextQueued skips rows that are already running or failed`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("running", "o1", OutboxState.RUNNING, created = 1))
        dao.upsert(row("failed", "o1", OutboxState.FAILED, created = 2))
        dao.upsert(row("queued", "o1", OutboxState.QUEUED, created = 3))
        assertEquals("queued", dao.nextQueued()?.id)
    }

    @Test fun `markFailed records the message and bumps the attempt count`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("a", "o1"))
        dao.markFailed("a", "Интернет йўқ", 99)
        val after = dao.byId("a")!!
        assertEquals(OutboxState.FAILED, after.state)
        assertEquals("Интернет йўқ", after.lastError)
        assertEquals(1, after.attempts)
        assertEquals(99, after.updatedAt)
    }

    @Test fun `wipe clears the outbox along with the order cache`() = runTest {
        val database = db()
        database.outboxDao().upsert(row("a", "o1"))
        database.wipe()
        assertNull(database.outboxDao().byId("a"))
        assertEquals(0, database.outboxDao().countPending())
    }

    @Test fun `delete removes a single row`() = runTest {
        val dao = db().outboxDao()
        dao.upsert(row("a", "o1")); dao.upsert(row("b", "o1"))
        dao.delete("a")
        assertNull(dao.byId("a"))
        assertEquals(1, dao.countPending())
    }
}
```

- [ ] **Step 2: Run to watch it fail**

Run: `.\gradlew.bat :core:database:testDebugUnitTest --no-daemon`
Expected: compilation FAIL.

- [ ] **Step 3: Create the entity**

```kotlin
package uz.etalon.crm.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** The states an outbox row moves through. Strings, not an enum, so a future
 *  value never needs a Room migration. */
object OutboxState {
    const val QUEUED = "QUEUED"
    const val RUNNING = "RUNNING"
    /** Permanently rejected by the server (a 4xx). The operator must see it and
     *  decide; the worker never retries a FAILED row on its own. */
    const val FAILED = "FAILED"
}

/**
 * One pending upload. `id` doubles as the `Idempotency-Key` sent to the server,
 * so a retry after a dropped connection replays the first response instead of
 * duplicating the delivery proof or the truck photo.
 */
@Entity(tableName = "outbox", indices = [Index("orderId"), Index("state", "createdAt")])
data class OutboxEntity(
    @PrimaryKey val id: String,
    /** OutboxKind name — decides which endpoint the worker calls. */
    val kind: String,
    val orderId: String,
    val shipmentId: String? = null,
    val paymentId: String? = null,
    /** Absolute path of the prepared JPEG, moved out of the cache into files/. */
    val filePath: String? = null,
    /** Kind-specific fields as JSON (cash amount, beam map, note flags). */
    val payloadJson: String,
    val state: String,
    val attempts: Int = 0,
    /** Uzbek message from the last failure, shown to the operator verbatim. */
    val lastError: String? = null,
    val createdAt: Long,
    val updatedAt: Long,
)
```

- [ ] **Step 4: Create the DAO**

```kotlin
package uz.etalon.crm.core.database.dao

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow
import uz.etalon.crm.core.database.entity.OutboxEntity

@Dao
interface OutboxDao {
    @Query("SELECT * FROM outbox ORDER BY createdAt")
    fun observeAll(): Flow<List<OutboxEntity>>

    @Query("SELECT * FROM outbox WHERE orderId = :orderId ORDER BY createdAt")
    fun observeForOrder(orderId: String): Flow<List<OutboxEntity>>

    @Query("SELECT * FROM outbox WHERE id = :id")
    suspend fun byId(id: String): OutboxEntity?

    @Query("SELECT * FROM outbox WHERE state = 'QUEUED' ORDER BY createdAt LIMIT 1")
    suspend fun nextQueued(): OutboxEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: OutboxEntity)

    @Query("DELETE FROM outbox WHERE id = :id")
    suspend fun delete(id: String)

    @Query("UPDATE outbox SET state = 'RUNNING', updatedAt = :at WHERE id = :id")
    suspend fun markRunning(id: String, at: Long)

    @Query("UPDATE outbox SET state = 'QUEUED', updatedAt = :at WHERE id = :id")
    suspend fun markQueued(id: String, at: Long)

    @Query("UPDATE outbox SET state = 'FAILED', lastError = :error, attempts = attempts + 1, updatedAt = :at WHERE id = :id")
    suspend fun markFailed(id: String, error: String, at: Long)

    @Query("SELECT COUNT(*) FROM outbox")
    suspend fun countPending(): Int

    @Query("SELECT COUNT(*) FROM outbox")
    fun observePendingCount(): Flow<Int>

    @Query("DELETE FROM outbox")
    suspend fun clearAll()
}
```

- [ ] **Step 5: Register in the database**

```kotlin
@Database(
    entities = [OrderSummaryEntity::class, OrderDetailEntity::class, OutboxEntity::class],
    version = 2,
    exportSchema = false,
)
abstract class EtalonDatabase : RoomDatabase() {
    abstract fun ordersDao(): OrdersDao
    abstract fun outboxDao(): OutboxDao

    /**
     * Called on sign-out so the next user never sees the previous user's cache.
     * The outbox goes with it: a queued photo belongs to the session that took
     * it, and uploading it under a different token would misattribute the work.
     */
    suspend fun wipe() {
        ordersDao().clearAllSummaries()
        ordersDao().clearAllDetails()
        outboxDao().clearAll()
    }
}
```

The builder already uses `.fallbackToDestructiveMigration(dropAllTables = true)`, so bumping to version 2 needs no migration — the cache is disposable by design. Add the DAO provider to `DatabaseModule`:

```kotlin
    @Provides fun outboxDao(db: EtalonDatabase): OutboxDao = db.outboxDao()
```

- [ ] **Step 6: Run the tests**

Run: `.\gradlew.bat :core:database:testDebugUnitTest :core:database:assembleDebug --no-daemon`
Expected: 5 new plus the 2 existing PASS.

- [ ] **Step 7: Commit**

```bash
git add android/core/database
git commit -m "Feat(android) · outbox table for retry-safe uploads

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Logistics repositories (`:core:data`)

Where the outbox rule becomes code: four operations enqueue, thirteen call the API directly. Nothing here touches WorkManager — Task 7 owns scheduling, and this task exposes a `OutboxScheduler` interface it will implement, so the repositories stay testable on the JVM.

**Files:**
- Create: `android/core/data/src/main/kotlin/uz/etalon/crm/core/data/OutboxRepository.kt`
- Create: `android/core/data/src/main/kotlin/uz/etalon/crm/core/data/LogisticsRepository.kt`
- Create: `android/core/data/src/main/kotlin/uz/etalon/crm/core/data/DriversRepository.kt`
- Create: `android/core/data/src/main/kotlin/uz/etalon/crm/core/data/mapper/LogisticsMappers.kt`
- Modify: `android/core/data/src/main/kotlin/uz/etalon/crm/core/data/mapper/OrderMappers.kt`
- Modify: `android/core/model/src/main/kotlin/uz/etalon/crm/core/model/Order.kt` (shipment and photo fields)
- Create: `android/core/model/src/main/kotlin/uz/etalon/crm/core/model/Logistics.kt`
- Modify: `android/core/data/build.gradle.kts` (depend on `:core:image`)
- Test: `android/core/data/src/test/kotlin/uz/etalon/crm/core/data/OutboxRepositoryTest.kt`, `LogisticsRepositoryTest.kt`

**Interfaces:**
- Produces in `:core:model`:
  ```kotlin
  data class LoadedPhoto(val id: String, val url: String, val kind: String?)
  data class DispatchInfo(val id: String, val driverName: String?, val truckIdentifier: String?,
                          val expectedCollection: Money, val dispatchedAt: Instant?, val returnedAt: Instant?)
  data class Driver(val id: String, val name: String, val phone: String, val notes: String?,
                    val active: Boolean, val activeDispatchCount: Int, val discrepancyCount30d: Int,
                    val lastDispatchAt: Instant?)
  data class DeliveryCash(val amount: Money = Money.ZERO, val noCashCollected: Boolean = false,
                          val note: String = "", val driverReturned: Boolean = false)
  data class LatLng(val lat: Double, val lng: Double)
  enum class OutboxKind { LOAD_TRUCK, ADD_LOADED_PHOTO, DELIVERY_PROOF, LOAD_SHIPMENT }
  data class PendingUpload(val id: String, val kind: OutboxKind, val orderId: String,
                           val shipmentId: String?, val failed: Boolean, val attempts: Int, val error: String?)
  ```
  `ShipmentLine` gains `loadedBeams: Map<String, Int>`, `loadedAt`, `dispatchedAt`, `deliveredAt`, `driverWillCollectCash`, `cashToCollect: Money?`.
  `OrderDetail` gains `loadedPhotos: List<LoadedPhoto>` (keeping `loadedPhotoUrls` as a derived convenience) and `dispatch: DispatchInfo?`.
- Produces in `:core:data`:
  ```kotlin
  interface OutboxScheduler { fun schedule(id: String) }   // implemented in :core:sync
  @Singleton class OutboxRepository @Inject constructor(dao, scheduler, @ApplicationContext context, json) {
      fun observeForOrder(orderId: String): Flow<List<PendingUpload>>
      fun observePendingCount(): Flow<Int>
      suspend fun enqueue(kind: OutboxKind, orderId: String, shipmentId: String? = null,
                          photo: PreparedImage? = null, payload: JsonObject = JsonObject(emptyMap())): String
      suspend fun retry(id: String)
      suspend fun cancel(id: String)
  }
  @Singleton class LogisticsRepository @Inject constructor(api, outbox, orders)
  @Singleton class DriversRepository @Inject constructor(api)
  ```

- [ ] **Step 1: Write the failing tests**

Create `android/core/data/src/test/kotlin/uz/etalon/crm/core/data/OutboxRepositoryTest.kt`:

```kotlin
package uz.etalon.crm.core.data

import app.cash.turbine.test
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.database.dao.OutboxDao
import uz.etalon.crm.core.database.entity.OutboxEntity
import uz.etalon.crm.core.database.entity.OutboxState
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.core.model.OutboxKind
import java.io.File

class FakeOutboxDao : OutboxDao {
    val rows = MutableStateFlow<Map<String, OutboxEntity>>(emptyMap())
    override fun observeAll(): Flow<List<OutboxEntity>> = rows.map { it.values.sortedBy { r -> r.createdAt } }
    override fun observeForOrder(orderId: String) = rows.map { m -> m.values.filter { it.orderId == orderId }.sortedBy { it.createdAt } }
    override suspend fun byId(id: String) = rows.value[id]
    override suspend fun nextQueued() = rows.value.values.filter { it.state == OutboxState.QUEUED }.minByOrNull { it.createdAt }
    override suspend fun upsert(row: OutboxEntity) { rows.value = rows.value + (row.id to row) }
    override suspend fun delete(id: String) { rows.value = rows.value - id }
    override suspend fun markRunning(id: String, at: Long) { patch(id) { it.copy(state = OutboxState.RUNNING, updatedAt = at) } }
    override suspend fun markQueued(id: String, at: Long) { patch(id) { it.copy(state = OutboxState.QUEUED, updatedAt = at) } }
    override suspend fun markFailed(id: String, error: String, at: Long) {
        patch(id) { it.copy(state = OutboxState.FAILED, lastError = error, attempts = it.attempts + 1, updatedAt = at) }
    }
    override suspend fun countPending() = rows.value.size
    override fun observePendingCount(): Flow<Int> = rows.map { it.size }
    override suspend fun clearAll() { rows.value = emptyMap() }
    private inline fun patch(id: String, f: (OutboxEntity) -> OutboxEntity) {
        rows.value[id]?.let { rows.value = rows.value + (id to f(it)) }
    }
}

class RecordingScheduler : OutboxScheduler {
    val scheduled = mutableListOf<String>()
    override fun schedule(id: String) { scheduled += id }
}

class OutboxRepositoryTest {

    private fun repo(dao: OutboxDao, scheduler: OutboxScheduler, dir: File) =
        OutboxRepository(dao, scheduler, dir, kotlinx.serialization.json.Json)

    @Test fun `enqueue moves the photo out of the cache and schedules the upload`(@org.junit.jupiter.api.io.TempDir tmp: File) = runTest {
        val cache = File(tmp, "cache").apply { mkdirs() }
        val outboxDir = File(tmp, "files/outbox")
        val photo = File(cache, "shot.jpg").apply { writeBytes(ByteArray(16) { 7 }) }
        val dao = FakeOutboxDao(); val scheduler = RecordingScheduler()

        val id = repo(dao, scheduler, outboxDir).enqueue(
            kind = OutboxKind.LOAD_TRUCK, orderId = "o1",
            photo = PreparedImage(photo, 1280, 853, photo.length()),
        )

        val row = dao.byId(id)!!
        assertEquals(OutboxKind.LOAD_TRUCK.name, row.kind)
        assertEquals("o1", row.orderId)
        assertEquals(OutboxState.QUEUED, row.state)
        assertFalse("the cache copy must be moved, not left behind", photo.exists())
        assertTrue("the file must live under files/, which the OS will not evict", row.filePath!!.startsWith(outboxDir.absolutePath))
        assertEquals(16, File(row.filePath!!).length())
        assertEquals(listOf(id), scheduler.scheduled)
    }

    @Test fun `the row id is a usable idempotency key`() = runTest {
        val dao = FakeOutboxDao()
        val id = repo(dao, RecordingScheduler(), createTempDir()).enqueue(OutboxKind.ADD_LOADED_PHOTO, "o1")
        assertTrue(id.isNotBlank())
        assertTrue("must fit the server's 128-character cap", id.length <= 128)
    }

    @Test fun `payload survives the round trip`() = runTest {
        val dao = FakeOutboxDao()
        val payload = JsonObject(mapOf("cashAmount" to JsonPrimitive("1500000"), "driverReturned" to JsonPrimitive(true)))
        val id = repo(dao, RecordingScheduler(), createTempDir()).enqueue(OutboxKind.DELIVERY_PROOF, "o1", payload = payload)
        assertTrue(dao.byId(id)!!.payloadJson.contains("1500000"))
    }

    @Test fun `retry moves a failed row back to queued and reschedules it`() = runTest {
        val dao = FakeOutboxDao(); val scheduler = RecordingScheduler()
        val r = repo(dao, scheduler, createTempDir())
        val id = r.enqueue(OutboxKind.LOAD_TRUCK, "o1")
        dao.markFailed(id, "Интернет йўқ", 1)
        scheduler.scheduled.clear()

        r.retry(id)

        assertEquals(OutboxState.QUEUED, dao.byId(id)!!.state)
        assertEquals(listOf(id), scheduler.scheduled)
    }

    @Test fun `cancel deletes the row and its file`(@org.junit.jupiter.api.io.TempDir tmp: File) = runTest {
        val cache = File(tmp, "cache").apply { mkdirs() }
        val photo = File(cache, "shot.jpg").apply { writeBytes(ByteArray(4)) }
        val dao = FakeOutboxDao()
        val r = repo(dao, RecordingScheduler(), File(tmp, "outbox"))
        val id = r.enqueue(OutboxKind.LOAD_TRUCK, "o1", photo = PreparedImage(photo, 1, 1, 4))
        val stored = File(dao.byId(id)!!.filePath!!)

        r.cancel(id)

        assertNull(dao.byId(id))
        assertFalse(stored.exists())
    }

    @Test fun `observeForOrder maps rows to the UI model with the failure flag`() = runTest {
        val dao = FakeOutboxDao()
        val r = repo(dao, RecordingScheduler(), createTempDir())
        val id = r.enqueue(OutboxKind.DELIVERY_PROOF, "o1")
        dao.markFailed(id, "Рухсат йўқ", 5)
        r.observeForOrder("o1").test {
            val item = awaitItem().single()
            assertEquals(OutboxKind.DELIVERY_PROOF, item.kind)
            assertTrue(item.failed)
            assertEquals("Рухсат йўқ", item.error)
            assertEquals(1, item.attempts)
            cancelAndIgnoreRemainingEvents()
        }
    }
}

private fun createTempDir(): File = File(System.getProperty("java.io.tmpdir"), "outbox-${System.nanoTime()}")
```

Create `LogisticsRepositoryTest.kt`:

```kotlin
package uz.etalon.crm.core.data

import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.DeliveryCash
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.model.OutboxKind
import uz.etalon.crm.core.network.dto.*

/** Records what was enqueued and what hit the network, so the queued-versus-online
 *  boundary is asserted rather than assumed. */
private class SpyOutbox : OutboxGateway {
    data class Enqueued(val kind: OutboxKind, val orderId: String, val shipmentId: String?, val payload: String)
    val calls = mutableListOf<Enqueued>()
    override suspend fun enqueue(kind: OutboxKind, orderId: String, shipmentId: String?, photo: uz.etalon.crm.core.image.PreparedImage?, payload: kotlinx.serialization.json.JsonObject): String {
        calls += Enqueued(kind, orderId, shipmentId, payload.toString()); return "outbox-${calls.size}"
    }
}

class LogisticsRepositoryTest {

    @Test fun `loadTruck is queued, never sent directly`() = runTest {
        val outbox = SpyOutbox()
        val api = FailingApi()                       // any direct call fails the test
        val id = LogisticsRepository(api, outbox, NoopOrders()).loadTruck("o1", photo = null).getOrThrow()
        assertEquals("outbox-1", id)
        assertEquals(OutboxKind.LOAD_TRUCK, outbox.calls.single().kind)
    }

    @Test fun `deliveryProof carries the cash fields in its payload`() = runTest {
        val outbox = SpyOutbox()
        LogisticsRepository(FailingApi(), outbox, NoopOrders()).deliveryProof(
            "o1", photo = null,
            cash = DeliveryCash(amount = Money.parse("1500000"), driverReturned = true),
        ).getOrThrow()
        val payload = outbox.calls.single().payload
        assertTrue(payload.contains("1500000"))
        assertTrue(payload.contains("driverReturned"))
    }

    @Test fun `loadShipment formats beam keys to two decimals`() = runTest {
        val outbox = SpyOutbox()
        LogisticsRepository(FailingApi(), outbox, NoopOrders())
            .loadShipment("o1", "s1", photo = null, beams = mapOf("3.3" to 5, "4" to 2), blocks = 120)
            .getOrThrow()
        val payload = outbox.calls.single().payload
        assertTrue("keys must be two-decimal or the server's over-load guard rejects them", payload.contains("3.30"))
        assertTrue(payload.contains("4.00"))
        assertFalse(payload.contains("\"3.3\":"))
    }

    @Test fun `createShipment goes straight to the network and refreshes the order`() = runTest {
        val api = RecordingApi(); val orders = NoopOrders()
        LogisticsRepository(api, SpyOutbox(), orders).createShipment("o1").getOrThrow()
        assertEquals(listOf("createShipment:o1"), api.calls)
        assertEquals(listOf("o1"), orders.refreshed)
    }

    @Test fun `an api failure comes back as a Result failure, not an exception`() = runTest {
        val res = LogisticsRepository(FailingApi(), SpyOutbox(), NoopOrders()).createShipment("o1")
        assertTrue(res.isFailure)
    }
}
```

`FailingApi`, `RecordingApi` and `NoopOrders` are test doubles you write in the same file: `FailingApi` throws `IllegalStateException` from every `EtalonApi` member; `RecordingApi` records the member name plus its id and returns a minimal DTO; `NoopOrders` implements the small `OrdersGateway` seam below and records `refreshDetail` calls. Implementing every `EtalonApi` member is verbose — put both doubles in one `private` file-level class each and let them delegate to a shared `error("unused")` default.

- [ ] **Step 2: Run to watch it fail** — `.\gradlew.bat :core:data:testDebugUnitTest --no-daemon`, compilation FAIL.

- [ ] **Step 3: Extend the domain model**

Create `android/core/model/src/main/kotlin/uz/etalon/crm/core/model/Logistics.kt`:

```kotlin
package uz.etalon.crm.core.model

import java.time.Instant

/** A photo attached to an order, with the id the delete endpoint needs. */
data class LoadedPhoto(val id: String, val url: String, val kind: String?)

/** The single-truck dispatch record, when one exists. */
data class DispatchInfo(
    val id: String,
    val driverName: String?,
    val truckIdentifier: String?,
    val expectedCollection: Money,
    val dispatchedAt: Instant?,
    val returnedAt: Instant?,
) { val isReturned: Boolean get() = returnedAt != null }

data class Driver(
    val id: String,
    val name: String,
    val phone: String,
    val notes: String?,
    val active: Boolean,
    val activeDispatchCount: Int,
    val discrepancyCount30d: Int,
    val lastDispatchAt: Instant?,
)

/** What the operator entered on the delivery-proof screen. */
data class DeliveryCash(
    val amount: Money = Money.ZERO,
    val noCashCollected: Boolean = false,
    val note: String = "",
    val driverReturned: Boolean = false,
)

data class LatLng(val lat: Double, val lng: Double)

/** The four operations the outbox may queue. Each maps to a server route that
 *  Phase 0 wrapped in withIdempotency; nothing else may be queued. */
enum class OutboxKind { LOAD_TRUCK, ADD_LOADED_PHOTO, DELIVERY_PROOF, LOAD_SHIPMENT }

data class PendingUpload(
    val id: String,
    val kind: OutboxKind,
    val orderId: String,
    val shipmentId: String?,
    val failed: Boolean,
    val attempts: Int,
    val error: String?,
)
```

In `Order.kt`, extend `ShipmentLine` and `OrderDetail` (leave every other declaration alone):

```kotlin
data class ShipmentLine(
    val id: String,
    val number: Int,
    val status: ShipmentStatus,
    val loadedBeams: Map<String, Int> = emptyMap(),
    val loadedBlocks: Int?,
    val loadedPhotoUrl: String?,
    val loadedAt: Instant? = null,
    val dispatchedAt: Instant? = null,
    val deliveredAt: Instant? = null,
    val driverWillCollectCash: Boolean = false,
    val cashToCollect: Money? = null,
    val driverName: String?,
    val truckIdentifier: String?,
)
```

and in `OrderDetail` add two properties next to the existing ones:

```kotlin
    val loadedPhotos: List<LoadedPhoto>,
    val dispatch: DispatchInfo?,
```

keeping `loadedPhotoUrls` as a derived value so 1a's screens keep compiling:

```kotlin
    val loadedPhotoUrls: List<String> get() = loadedPhotos.map { it.url }
```

(Remove `loadedPhotoUrls` from the constructor parameter list when you do this, and update `OrderMappers` accordingly.)

- [ ] **Step 4: Extend the mappers**

In `mapper/OrderMappers.kt`, inside `OrderDetailDto.toDomain(...)` replace the shipment, photo and dispatch mapping:

```kotlin
        shipments = shipments.map {
            ShipmentLine(
                id = it.id, number = it.number, status = ShipmentStatus.from(it.status),
                loadedBeams = it.loadedBeams.orEmpty(),
                loadedBlocks = it.loadedBlocks,
                loadedPhotoUrl = MediaUrl.absolute(mediaBase, it.loadedPhotoUrl),
                loadedAt = it.loadedAt?.toInstant(),
                dispatchedAt = it.dispatchedAt?.toInstant(),
                deliveredAt = it.deliveredAt?.toInstant(),
                driverWillCollectCash = it.driverWillCollectCash,
                cashToCollect = it.cashToCollect?.let(Money::parse),
                driverName = it.driver?.name, truckIdentifier = it.truckIdentifier,
            )
        },
        loadedPhotos = galleryPhotos.mapNotNull { p ->
            MediaUrl.absolute(mediaBase, p.url)?.let { LoadedPhoto(p.id, it, p.kind) }
        },
        dispatch = dispatch?.let { d ->
            DispatchInfo(
                id = d.id, driverName = d.driver?.name, truckIdentifier = d.truckIdentifier,
                expectedCollection = Money.parse(d.expectedCollection),
                dispatchedAt = d.dispatchedAt?.toInstant(), returnedAt = d.returnedAt?.toInstant(),
            )
        },
```

Create `mapper/LogisticsMappers.kt`:

```kotlin
package uz.etalon.crm.core.data.mapper

import uz.etalon.crm.core.model.Driver
import uz.etalon.crm.core.model.LatLng
import uz.etalon.crm.core.network.dto.DriverListItemDto
import uz.etalon.crm.core.network.dto.LatLngDto
import java.time.Instant

fun DriverListItemDto.toDomain() = Driver(
    id = id, name = name, phone = phone, notes = notes, active = active,
    activeDispatchCount = activeDispatchCount, discrepancyCount30d = discrepancyCount30d,
    lastDispatchAt = lastDispatchAt?.let(Instant::parse),
)

fun LatLngDto.toDomain() = LatLng(lat, lng)

/**
 * The server's over-load guard builds its per-length totals with
 * `Number(beamLength).toFixed(2)`, so a map keyed "3.3" compares against a total
 * of zero and every positive count is rejected with a 422. Always normalise.
 */
fun normaliseBeamKeys(beams: Map<String, Int>): Map<String, Int> =
    beams.mapKeys { (k, _) -> String.format(java.util.Locale.ROOT, "%.2f", k.toDouble()) }
```

- [ ] **Step 5: Write the repositories**

`OutboxRepository.kt`:

```kotlin
package uz.etalon.crm.core.data

import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import uz.etalon.crm.core.database.dao.OutboxDao
import uz.etalon.crm.core.database.entity.OutboxEntity
import uz.etalon.crm.core.database.entity.OutboxState
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.core.model.OutboxKind
import uz.etalon.crm.core.model.PendingUpload
import java.io.File
import java.util.UUID
import javax.inject.Inject
import javax.inject.Named
import javax.inject.Singleton

/** Implemented in :core:sync so this module never depends on WorkManager. */
interface OutboxScheduler { fun schedule(id: String) }

/** The seam LogisticsRepository talks to, so its tests need no file system. */
interface OutboxGateway {
    suspend fun enqueue(
        kind: OutboxKind, orderId: String, shipmentId: String? = null,
        photo: PreparedImage? = null, payload: JsonObject = JsonObject(emptyMap()),
    ): String
}

@Singleton
class OutboxRepository @Inject constructor(
    private val dao: OutboxDao,
    private val scheduler: OutboxScheduler,
    @param:Named("outboxDir") private val outboxDir: File,
    private val json: Json,
) : OutboxGateway {

    fun observeForOrder(orderId: String): Flow<List<PendingUpload>> =
        dao.observeForOrder(orderId).map { rows -> rows.map { it.toPending() } }

    fun observePendingCount(): Flow<Int> = dao.observePendingCount()

    /**
     * Records the upload and hands scheduling to WorkManager. The prepared photo
     * is moved out of the cache into files/, because the OS may clear the cache
     * while the phone waits for a signal and the photo is the whole point.
     */
    override suspend fun enqueue(
        kind: OutboxKind, orderId: String, shipmentId: String?,
        photo: PreparedImage?, payload: JsonObject,
    ): String {
        val id = UUID.randomUUID().toString()
        val stored = photo?.let { moveIntoOutbox(it.file, id) }
        val now = System.currentTimeMillis()
        dao.upsert(
            OutboxEntity(
                id = id, kind = kind.name, orderId = orderId, shipmentId = shipmentId,
                paymentId = null, filePath = stored?.absolutePath,
                payloadJson = json.encodeToString(JsonObject.serializer(), payload),
                state = OutboxState.QUEUED, attempts = 0, lastError = null,
                createdAt = now, updatedAt = now,
            )
        )
        scheduler.schedule(id)
        return id
    }

    suspend fun retry(id: String) {
        dao.markQueued(id, System.currentTimeMillis())
        scheduler.schedule(id)
    }

    suspend fun cancel(id: String) {
        dao.byId(id)?.filePath?.let { File(it).delete() }
        dao.delete(id)
    }

    private fun moveIntoOutbox(source: File, id: String): File {
        outboxDir.mkdirs()
        val dest = File(outboxDir, "$id.jpg")
        if (!source.renameTo(dest)) {           // renameTo fails across mount points
            source.copyTo(dest, overwrite = true)
            source.delete()
        }
        return dest
    }

    private fun OutboxEntity.toPending() = PendingUpload(
        id = id, kind = OutboxKind.valueOf(kind), orderId = orderId, shipmentId = shipmentId,
        failed = state == OutboxState.FAILED, attempts = attempts, error = lastError,
    )
}
```

Bind `@Named("outboxDir")` in a small Hilt module in `:core:data`:

```kotlin
@Module @InstallIn(SingletonComponent::class)
object OutboxDirModule {
    @Provides @Singleton @Named("outboxDir")
    fun outboxDir(@ApplicationContext ctx: Context): File = File(ctx.filesDir, "outbox")
}
```

and bind `OutboxGateway` to `OutboxRepository` in the same module (`@Binds` needs an abstract class — split it as the codebase already does in `DataStoreModule`).

`LogisticsRepository.kt` — the queued/online split:

```kotlin
package uz.etalon.crm.core.data

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import uz.etalon.crm.core.data.mapper.normaliseBeamKeys
import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.core.model.*
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.*
import javax.inject.Inject
import javax.inject.Singleton

/** Small seam so the repository's tests do not construct OrdersRepository. */
interface OrdersGateway { suspend fun refreshDetail(id: String) }

@Singleton
class LogisticsRepository @Inject constructor(
    private val api: EtalonApi,
    private val outbox: OutboxGateway,
    private val orders: OrdersGateway,
) {
    // ── Queued: the server route is withIdempotency-wrapped ──────

    suspend fun loadTruck(orderId: String, photo: PreparedImage?): Result<String> =
        runCatchingCancellable { outbox.enqueue(OutboxKind.LOAD_TRUCK, orderId, photo = photo) }

    suspend fun addLoadedPhoto(orderId: String, photo: PreparedImage?): Result<String> =
        runCatchingCancellable { outbox.enqueue(OutboxKind.ADD_LOADED_PHOTO, orderId, photo = photo) }

    suspend fun deliveryProof(orderId: String, photo: PreparedImage?, cash: DeliveryCash): Result<String> =
        runCatchingCancellable {
            outbox.enqueue(
                OutboxKind.DELIVERY_PROOF, orderId, photo = photo,
                payload = JsonObject(mapOf(
                    "cashAmount" to JsonPrimitive(cash.amount.amount.toPlainString()),
                    "noCashCollected" to JsonPrimitive(cash.noCashCollected.toString()),
                    "noCashCollectedNote" to JsonPrimitive(cash.note),
                    "driverReturned" to JsonPrimitive(cash.driverReturned.toString()),
                )),
            )
        }

    suspend fun loadShipment(
        orderId: String, shipmentId: String, photo: PreparedImage?,
        beams: Map<String, Int>, blocks: Int,
    ): Result<String> = runCatchingCancellable {
        val normalised = normaliseBeamKeys(beams.filterValues { it > 0 })
        outbox.enqueue(
            OutboxKind.LOAD_SHIPMENT, orderId, shipmentId = shipmentId, photo = photo,
            payload = JsonObject(mapOf(
                "loadedBeams" to JsonObject(normalised.mapValues { JsonPrimitive(it.value) }),
                "loadedBlocks" to JsonPrimitive(blocks),
            )),
        )
    }

    // ── Online only: no server-side idempotency, so never queued ──

    suspend fun createShipment(orderId: String): Result<Unit> = mutate(orderId) { api.createShipment(orderId) }
    suspend fun deleteShipment(orderId: String, shipmentId: String): Result<Unit> = mutate(orderId) { api.deleteShipment(orderId, shipmentId) }
    suspend fun deliverShipment(orderId: String, shipmentId: String): Result<Unit> = mutate(orderId) { api.deliverShipment(orderId, shipmentId) }
    suspend fun deleteLoadedPhoto(orderId: String, photoId: String): Result<Unit> = mutate(orderId) { api.deleteLoadedPhoto(orderId, photoId) }

    suspend fun dispatchShipment(
        orderId: String, shipmentId: String, driverId: String?, truckIdentifier: String?,
        driverWillCollectCash: Boolean, cashToCollect: Money?,
    ): Result<Unit> = mutate(orderId) {
        api.dispatchShipment(orderId, shipmentId, ShipmentDispatchRequest(
            driverId = driverId, truckIdentifier = truckIdentifier,
            driverWillCollectCash = driverWillCollectCash,
            cashToCollect = cashToCollect?.amount?.toDouble(),
        ))
    }

    suspend fun createDispatch(
        orderId: String, driverId: String?, truckIdentifier: String?, expectedCollection: Money, notes: String?,
    ): Result<Unit> = mutate(orderId) {
        api.createDispatch(orderId, DispatchCreateRequest(
            driverId = driverId, truckIdentifier = truckIdentifier,
            expectedCollection = expectedCollection.amount.toDouble(), notes = notes,
        ))
    }

    suspend fun markDispatchReturned(orderId: String, dispatchId: String): Result<Unit> =
        mutate(orderId) { api.markDispatchReturned(dispatchId) }

    suspend fun setDeliveryLocation(
        orderId: String, lat: Double?, lng: Double?, url: String?, label: String?,
    ): Result<Unit> = mutate(orderId) { api.setDeliveryLocation(orderId, DeliveryLocationRequest(lat, lng, url, label)) }

    suspend fun resolveMapLink(url: String): Result<LatLng> =
        runCatchingCancellable { api.resolveMapLink(ResolveLinkRequest(url)).toDomain() }

    /** Runs a write, then pulls the order fresh so the cockpit reflects it. */
    private suspend inline fun mutate(orderId: String, crossinline call: suspend () -> Unit): Result<Unit> =
        runCatchingCancellable { call(); orders.refreshDetail(orderId) }
}
```

Note the `mutate` helper takes a lambda returning `Unit`; the API methods return DTOs, so wrap each call site as `{ api.x(...); Unit }` or make the parameter `suspend () -> Any?`. Use whichever compiles cleanly with an inline reified-free signature and say which.

`DriversRepository.kt`:

```kotlin
package uz.etalon.crm.core.data

import uz.etalon.crm.core.data.mapper.toDomain
import uz.etalon.crm.core.model.Driver
import uz.etalon.crm.core.network.EtalonApi
import uz.etalon.crm.core.network.dto.DriverActiveRequest
import uz.etalon.crm.core.network.dto.DriverCreateRequest
import uz.etalon.crm.core.network.dto.DriverUpdateRequest
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DriversRepository @Inject constructor(private val api: EtalonApi) {
    suspend fun list(activeOnly: Boolean = false): Result<List<Driver>> =
        runCatchingCancellable { api.drivers(if (activeOnly) "true" else null).map { it.toDomain() } }

    suspend fun create(name: String, phone: String, notes: String?): Result<Driver> =
        runCatchingCancellable { api.createDriver(DriverCreateRequest(name, phone, notes)).toDomain() }

    suspend fun update(id: String, name: String?, phone: String?, notes: String?): Result<Driver> =
        runCatchingCancellable { api.updateDriver(id, DriverUpdateRequest(name, phone, notes)).toDomain() }

    suspend fun setActive(id: String, active: Boolean): Result<Driver> =
        runCatchingCancellable { api.setDriverActive(id, DriverActiveRequest(active)).toDomain() }
}
```

Finally add `OrdersRepository` as the production `OrdersGateway` — implement the interface on it (`override suspend fun refreshDetail(id: String)` already matches) and bind it in the module.

- [ ] **Step 6: Add the module dependency**

In `android/core/data/build.gradle.kts` add `implementation(project(":core:image"))`.

- [ ] **Step 7: Run the tests**

Run: `.\gradlew.bat :core:data:testDebugUnitTest :core:model:testDebugUnitTest :core:data:assembleDebug --no-daemon`
Expected: all PASS, BUILD SUCCESSFUL. The 1a `OrderMappersTest` must be updated only where the `OrderDetail` constructor changed; its assertions stay.

- [ ] **Step 8: Commit**

```bash
git add android/core/data android/core/model
git commit -m "Feat(android) · logistics and outbox repositories

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: The upload worker (`:core:sync`)

WorkManager drains the outbox. One worker per row, unique work keyed by the row id, network-constrained, exponential backoff. A 4xx is permanent: the row is marked FAILED with the server's Uzbek message and the operator decides. A 5xx or a dropped connection retries.

**Files:**
- Create: `android/core/sync/build.gradle.kts`
- Create: `android/core/sync/src/main/kotlin/uz/etalon/crm/core/sync/OutboxWorker.kt`
- Create: `android/core/sync/src/main/kotlin/uz/etalon/crm/core/sync/WorkManagerOutboxScheduler.kt`
- Create: `android/core/sync/src/main/kotlin/uz/etalon/crm/core/sync/di/SyncModule.kt`
- Modify: `android/settings.gradle.kts`, `android/gradle/libs.versions.toml`
- Modify: `android/app/build.gradle.kts`, `android/app/src/main/kotlin/uz/etalon/crm/EtalonApp.kt`, `android/app/src/main/AndroidManifest.xml`
- Test: `android/core/sync/src/test/kotlin/uz/etalon/crm/core/sync/OutboxOutcomeTest.kt`

**Interfaces:**
- Produces: `@HiltWorker class OutboxWorker`, `class WorkManagerOutboxScheduler : OutboxScheduler`, and the pure decision function the test drives:
  ```kotlin
  sealed interface OutboxOutcome { data object Done; data object Retry; data class Fail(val message: String) }
  fun outcomeFor(t: Throwable): OutboxOutcome
  ```

- [ ] **Step 1: Add dependencies and the module**

`[versions]`: `workmanager = "2.11.0"`, `hiltWork = "1.4.0"` (take the current stable of `androidx.work:work-runtime-ktx` and `androidx.hilt:hilt-work` at kickoff).
`[libraries]`:
```toml
work-runtime-ktx = { module = "androidx.work:work-runtime-ktx", version.ref = "workmanager" }
hilt-work = { module = "androidx.hilt:hilt-work", version.ref = "hiltWork" }
hilt-androidx-compiler = { module = "androidx.hilt:hilt-compiler", version.ref = "hiltWork" }
work-testing = { module = "androidx.work:work-testing", version.ref = "workmanager" }
```
Add `":core:sync"` to `settings.gradle.kts`.

`android/core/sync/build.gradle.kts`:
```kotlin
plugins { id("etalon.android.library"); id("etalon.hilt"); alias(libs.plugins.kotlin.serialization) }
android { namespace = "uz.etalon.crm.core.sync" }
dependencies {
    implementation(project(":core:data"))
    implementation(project(":core:database"))
    implementation(project(":core:model"))
    implementation(project(":core:network"))
    implementation(libs.work.runtime.ktx)
    implementation(libs.hilt.work)
    ksp(libs.hilt.androidx.compiler)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.okhttp)
}
```

- [ ] **Step 2: Write the failing test**

```kotlin
package uz.etalon.crm.core.sync

import kotlinx.serialization.json.Json
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.network.ApiException
import java.io.IOException

class OutboxOutcomeTest {

    @Test fun `a dropped connection retries`() {
        assertEquals(OutboxOutcome.Retry, outcomeFor(IOException("unexpected end of stream")))
    }

    @Test fun `a server error retries`() {
        assertEquals(OutboxOutcome.Retry, outcomeFor(ApiException(500, "Internal server error")))
        assertEquals(OutboxOutcome.Retry, outcomeFor(ApiException(502, "Сервер хатоси · Server error")))
    }

    @Test fun `rate limiting and timeout retry`() {
        assertEquals(OutboxOutcome.Retry, outcomeFor(ApiException(429, "Too many requests")))
        assertEquals(OutboxOutcome.Retry, outcomeFor(ApiException(408, "Timeout")))
    }

    @Test fun `a rejected upload fails permanently with the Uzbek half of the message`() {
        val out = outcomeFor(ApiException(422, "Расм катта (макс 8 МБ) · Image too large (max 8 MB)"))
        assertTrue(out is OutboxOutcome.Fail)
        assertEquals("Расм катта (макс 8 МБ)", (out as OutboxOutcome.Fail).message)
    }

    @Test fun `a stale status transition fails permanently`() {
        // The order moved on while the photo waited for a signal.
        val out = outcomeFor(ApiException(422, "Order must be PLACED or IN_PRODUCTION to load (current: DELIVERED)"))
        assertTrue(out is OutboxOutcome.Fail)
    }

    @Test fun `a 401 retries so the upload survives a token refresh`() {
        // Signing back in must not lose the photo; the row stays queued.
        assertEquals(OutboxOutcome.Retry, outcomeFor(ApiException(401, "Авторизация талаб қилинади · Authentication required")))
    }
}
```

- [ ] **Step 3: Run to watch it fail** — compilation FAIL.

- [ ] **Step 4: Implement the outcome rule and the worker**

`OutboxWorker.kt`:

```kotlin
package uz.etalon.crm.core.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import uz.etalon.crm.core.data.OrdersRepository
import uz.etalon.crm.core.database.dao.OutboxDao
import uz.etalon.crm.core.database.entity.OutboxEntity
import uz.etalon.crm.core.model.OutboxKind
import uz.etalon.crm.core.network.ApiException
import uz.etalon.crm.core.network.EtalonApi
import java.io.File
import java.io.IOException

sealed interface OutboxOutcome {
    data object Done : OutboxOutcome
    data object Retry : OutboxOutcome
    data class Fail(val message: String) : OutboxOutcome
}

/**
 * Decides what a failed attempt means. Anything the server might answer
 * differently later is retried; anything it rejected on the merits is a
 * permanent failure the operator has to see, because the photo represents a
 * physical event that may now be inconsistent with the order's state.
 */
fun outcomeFor(t: Throwable): OutboxOutcome = when {
    t is ApiException && t.status == 401 -> OutboxOutcome.Retry     // token refresh, not a rejection
    t is ApiException && t.status == 408 -> OutboxOutcome.Retry
    t is ApiException && t.status == 429 -> OutboxOutcome.Retry
    t is ApiException && t.status >= 500 -> OutboxOutcome.Retry
    t is ApiException -> OutboxOutcome.Fail(t.uzbekMessage)
    t is IOException -> OutboxOutcome.Retry
    else -> OutboxOutcome.Fail(t.message ?: "Хатолик")
}

@HiltWorker
class OutboxWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted params: WorkerParameters,
    private val dao: OutboxDao,
    private val api: EtalonApi,
    private val orders: OrdersRepository,
    private val json: Json,
) : CoroutineWorker(appContext, params) {

    override suspend fun doWork(): Result {
        val id = inputData.getString(KEY_ID) ?: return Result.success()
        val row = dao.byId(id) ?: return Result.success()     // cancelled or already done
        dao.markRunning(id, System.currentTimeMillis())

        return try {
            send(row)
            row.filePath?.let { File(it).delete() }
            dao.delete(id)
            orders.refreshDetail(row.orderId)
            Result.success()
        } catch (t: Throwable) {
            when (val outcome = outcomeFor(t)) {
                is OutboxOutcome.Retry -> {
                    dao.markQueued(id, System.currentTimeMillis())
                    Result.retry()
                }
                is OutboxOutcome.Fail -> {
                    dao.markFailed(id, outcome.message, System.currentTimeMillis())
                    Result.failure()
                }
                OutboxOutcome.Done -> Result.success()
            }
        }
    }

    private suspend fun send(row: OutboxEntity) {
        val payload = json.decodeFromString(JsonObject.serializer(), row.payloadJson)
        val part = row.filePath?.let { path ->
            val f = File(path)
            MultipartBody.Part.createFormData("file", f.name, f.asRequestBody(JPEG))
        }
        fun text(key: String, fallback: String = "") =
            (payload[key]?.jsonPrimitive?.content ?: fallback).toRequestBody(PLAIN)

        when (OutboxKind.valueOf(row.kind)) {
            OutboxKind.LOAD_TRUCK -> api.loadTruck(row.orderId, requireNotNull(part), row.id)
            OutboxKind.ADD_LOADED_PHOTO -> api.addLoadedPhoto(row.orderId, requireNotNull(part), row.id)
            OutboxKind.DELIVERY_PROOF -> api.deliveryProof(
                id = row.orderId, file = requireNotNull(part),
                cashAmount = text("cashAmount", "0"),
                noCashCollected = text("noCashCollected", "false"),
                noCashCollectedNote = text("noCashCollectedNote"),
                driverReturned = text("driverReturned", "false"),
                idempotencyKey = row.id,
            )
            OutboxKind.LOAD_SHIPMENT -> api.loadShipment(
                id = row.orderId, sid = requireNotNull(row.shipmentId),
                file = requireNotNull(part),
                loadedBeams = (payload["loadedBeams"]?.toString() ?: "{}").toRequestBody(PLAIN),
                loadedBlocks = text("loadedBlocks", "0"),
                idempotencyKey = row.id,
            )
        }
    }

    companion object {
        const val KEY_ID = "outboxId"
        private val JPEG = "image/jpeg".toMediaType()
        private val PLAIN = "text/plain".toMediaType()
    }
}
```

`WorkManagerOutboxScheduler.kt`:

```kotlin
package uz.etalon.crm.core.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import uz.etalon.crm.core.data.OutboxScheduler
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class WorkManagerOutboxScheduler @Inject constructor(
    @param:ApplicationContext private val context: Context,
) : OutboxScheduler {

    /** Unique work per row: a retry replaces nothing and a duplicate schedule is
     *  a no-op, so the same photo is never uploaded by two workers at once. */
    override fun schedule(id: String) {
        val request = OneTimeWorkRequestBuilder<OutboxWorker>()
            .setInputData(Data.Builder().putString(OutboxWorker.KEY_ID, id).build())
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .addTag(TAG)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork("outbox-$id", ExistingWorkPolicy.KEEP, request)
    }

    companion object { const val TAG = "outbox" }
}
```

`di/SyncModule.kt` binds `OutboxScheduler` to `WorkManagerOutboxScheduler`.

- [ ] **Step 5: Wire WorkManager into the app**

`android/app/build.gradle.kts` gains `implementation(project(":core:sync"))`, `implementation(libs.work.runtime.ktx)`, `implementation(libs.hilt.work)`, `ksp(libs.hilt.androidx.compiler)`.

`EtalonApp.kt` becomes a `Configuration.Provider` so Hilt can build the worker:

```kotlin
@HiltAndroidApp
class EtalonApp : Application(), Configuration.Provider {
    @Inject lateinit var workerFactory: HiltWorkerFactory
    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().setWorkerFactory(workerFactory).build()
}
```

and the manifest must disable WorkManager's default initializer so the custom configuration is used:

```xml
        <provider
            android:name="androidx.startup.InitializationProvider"
            android:authorities="${applicationId}.androidx-startup"
            android:exported="false"
            tools:node="merge">
            <meta-data
                android:name="androidx.work.WorkManagerInitializer"
                android:value="androidx.startup"
                tools:node="remove" />
        </provider>
```

- [ ] **Step 6: Run the tests and build**

Run: `.\gradlew.bat :core:sync:testDebugUnitTest :app:assembleDebug --no-daemon`
Expected: 6/6 PASS, BUILD SUCCESSFUL.

- [ ] **Step 7: Commit**

```bash
git add android/core/sync android/app android/settings.gradle.kts android/gradle/libs.versions.toml
git commit -m "Feat(android) · WorkManager outbox that retries uploads safely

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Components the logistics screens need (`:core:designsystem`)

Six additions. The design system currently has no button, no sheet and no image affordance at all, so every logistics screen would otherwise invent its own.

**Files:**
- Create: `.../components/EtalonButtons.kt`, `StickyActionBar.kt`, `NumericKeypadSheet.kt`, `CountStepper.kt`, `OutboxBanner.kt`, `PhotoStrip.kt`, `Lightbox.kt`
- Modify: `android/core/designsystem/src/main/res/values/strings.xml`
- Modify: `android/core/designsystem/build.gradle.kts` (Coil, for `PhotoStrip`/`Lightbox`)
- Test: `.../src/test/kotlin/uz/etalon/crm/core/designsystem/KeypadInputTest.kt`

**Interfaces:**
- Produces:
  ```kotlin
  @Composable fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier,
                                enabled: Boolean = true, loading: Boolean = false, leading: ImageVector? = null)
  @Composable fun SecondaryButton(...)   // same signature
  @Composable fun DangerButton(...)      // same signature
  @Composable fun StickyActionBar(content: @Composable RowScope.() -> Unit)
  @Composable fun NumericKeypadSheet(title: String, initial: String, suffix: String?,
                                     allowDecimal: Boolean = false,
                                     onConfirm: (String) -> Unit, onDismiss: () -> Unit)
  @Composable fun CountStepper(label: String, value: Int, onChange: (Int) -> Unit, max: Int? = null)
  @Composable fun OutboxBanner(pending: Int, failedMessage: String?, onRetry: () -> Unit, onCancel: () -> Unit)
  @Composable fun PhotoStrip(urls: List<String>, onOpen: (Int) -> Unit, onAdd: (() -> Unit)? = null)
  @Composable fun Lightbox(urls: List<String>, startIndex: Int, onDismiss: () -> Unit)
  // pure, tested:
  fun applyDigit(current: String, digit: Char, allowDecimal: Boolean): String
  fun applyBackspace(current: String): String
  ```

- [ ] **Step 1: Write the failing test**

```kotlin
package uz.etalon.crm.core.designsystem

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.designsystem.components.applyBackspace
import uz.etalon.crm.core.designsystem.components.applyDigit

class KeypadInputTest {
    @Test fun `digits append`() {
        assertEquals("1", applyDigit("", '1', false))
        assertEquals("150", applyDigit("15", '0', false))
    }
    @Test fun `a leading zero is replaced, not stacked`() {
        assertEquals("5", applyDigit("0", '5', false))
        assertEquals("0", applyDigit("0", '0', false))
    }
    @Test fun `a decimal separator is accepted once, and only when allowed`() {
        assertEquals("1,", applyDigit("1", ',', true))
        assertEquals("1,", applyDigit("1,", ',', true))
        assertEquals("1", applyDigit("1", ',', false))
    }
    @Test fun `backspace removes one character and bottoms out at empty`() {
        assertEquals("15", applyBackspace("150"))
        assertEquals("", applyBackspace("1"))
        assertEquals("", applyBackspace(""))
    }
    @Test fun `entry is capped so a slipped finger cannot enter a nonsense amount`() {
        val long = "1".repeat(12)
        assertEquals(long, applyDigit(long, '9', false))
    }
}
```

- [ ] **Step 2: Run to watch it fail** — compilation FAIL.

- [ ] **Step 3: Buttons**

```kotlin
package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors

private val MIN_TOUCH = 48.dp

@Composable
private fun ButtonBody(text: String, loading: Boolean, leading: ImageVector?) {
    if (loading) {
        CircularProgressIndicator(
            modifier = Modifier.size(18.dp), strokeWidth = 2.dp,
            color = LocalContentColor.current,
        )
        Spacer(Modifier.width(10.dp))
    } else if (leading != null) {
        Icon(leading, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(10.dp))
    }
    Text(text, maxLines = 1)
}

/** The one action a screen exists for. Full width, 48 dp, thumb height. */
@Composable
fun PrimaryButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier,
    enabled: Boolean = true, loading: Boolean = false, leading: ImageVector? = null,
) = Button(
    onClick = onClick, enabled = enabled && !loading,
    modifier = modifier.fillMaxWidth().heightIn(min = MIN_TOUCH),
) { ButtonBody(text, loading, leading) }

@Composable
fun SecondaryButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier,
    enabled: Boolean = true, loading: Boolean = false, leading: ImageVector? = null,
) = OutlinedButton(
    onClick = onClick, enabled = enabled && !loading,
    modifier = modifier.fillMaxWidth().heightIn(min = MIN_TOUCH),
) { ButtonBody(text, loading, leading) }

/** Destructive actions: delete a shipment, remove a photo. */
@Composable
fun DangerButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier,
    enabled: Boolean = true, loading: Boolean = false, leading: ImageVector? = null,
) = Button(
    onClick = onClick, enabled = enabled && !loading,
    colors = ButtonDefaults.buttonColors(
        containerColor = MaterialTheme.colorScheme.error,
        contentColor = MaterialTheme.colorScheme.onError,
    ),
    modifier = modifier.fillMaxWidth().heightIn(min = MIN_TOUCH),
) { ButtonBody(text, loading, leading) }
```

- [ ] **Step 4: Sticky bar, keypad, stepper**

`StickyActionBar.kt`:
```kotlin
package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors

/**
 * The bar that carries a screen's next step. Lives in Scaffold's bottomBar slot
 * so it stays in the thumb zone while the content scrolls, and it sits above the
 * navigation-bar inset rather than under it.
 */
@Composable
fun StickyActionBar(content: @Composable RowScope.() -> Unit) {
    Column(Modifier.background(MaterialTheme.colorScheme.surface)) {
        HorizontalDivider(color = LocalEtalonColors.current.border)
        Row(
            Modifier.fillMaxWidth()
                .navigationBarsPadding()
                .padding(horizontal = 16.dp, vertical = 12.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            content = content,
        )
    }
}
```

`NumericKeypadSheet.kt`:
```kotlin
package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.theme.EtalonType

private const val MAX_DIGITS = 12

/** Pure so the entry rules are unit-tested rather than driven through the UI. */
fun applyDigit(current: String, digit: Char, allowDecimal: Boolean): String = when {
    digit == ',' || digit == '.' -> if (!allowDecimal || current.contains(',')) current else "${current.ifEmpty { "0" }},"
    !digit.isDigit() -> current
    current.length >= MAX_DIGITS -> current
    current == "0" -> digit.toString()
    else -> current + digit
}

fun applyBackspace(current: String): String = current.dropLast(1)

/**
 * Amount and count entry without a soft keyboard: the operator is wearing gloves
 * on a truck bed, and the system keyboard's number row is a 6 mm target.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NumericKeypadSheet(
    title: String,
    initial: String,
    suffix: String? = null,
    allowDecimal: Boolean = false,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var value by remember { mutableStateOf(initial) }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.fillMaxWidth().padding(horizontal = 20.dp).padding(bottom = 24.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            SectionLabel(title)
            Row(verticalAlignment = Alignment.Bottom) {
                Text(value.ifEmpty { "0" }, style = EtalonType.monoDisplay, modifier = Modifier.weight(1f))
                if (suffix != null) Text(suffix, style = EtalonType.monoBody, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            val rows = listOf("123", "456", "789", if (allowDecimal) ",0⌫" else " 0⌫")
            rows.forEach { row ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    row.forEach { ch ->
                        when (ch) {
                            ' ' -> Spacer(Modifier.weight(1f).height(60.dp))
                            '⌫' -> FilledTonalIconButton(
                                onClick = { value = applyBackspace(value) },
                                modifier = Modifier.weight(1f).height(60.dp),
                            ) { Icon(Icons.AutoMirrored.Filled.Backspace, contentDescription = stringResource(R.string.action_backspace)) }
                            else -> FilledTonalButton(
                                onClick = { value = applyDigit(value, ch, allowDecimal) },
                                modifier = Modifier.weight(1f).height(60.dp),
                            ) { Text(ch.toString(), style = EtalonType.monoTitle) }
                        }
                    }
                }
            }
            PrimaryButton(stringResource(R.string.action_confirm), onClick = { onConfirm(value.ifEmpty { "0" }) })
        }
    }
}
```

`CountStepper.kt`:
```kotlin
package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.theme.EtalonType

/** Beam and block counts are small integers entered while standing at a truck —
 *  two large targets beat a keypad. [max] shows the order's remaining allowance. */
@Composable
fun CountStepper(label: String, value: Int, onChange: (Int) -> Unit, max: Int? = null) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) {
            Text(label, style = MaterialTheme.typography.bodyMedium)
            if (max != null) {
                Text(
                    stringResource(R.string.stepper_max, max),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
        FilledTonalIconButton(
            onClick = { onChange((value - 1).coerceAtLeast(0)) },
            enabled = value > 0, modifier = Modifier.size(48.dp),
        ) { Icon(Icons.Default.Remove, contentDescription = stringResource(R.string.action_decrease)) }
        Text(
            value.toString(), style = EtalonType.monoTitle, textAlign = TextAlign.Center,
            modifier = Modifier.widthIn(min = 56.dp),
        )
        FilledTonalIconButton(
            onClick = { onChange(value + 1) },
            enabled = max == null || value < max, modifier = Modifier.size(48.dp),
        ) { Icon(Icons.Default.Add, contentDescription = stringResource(R.string.action_increase)) }
    }
}
```

- [ ] **Step 5: Outbox banner, photo strip, lightbox**

`OutboxBanner.kt`:
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
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors

/**
 * Shows the operator that a photo is still on its way, or that the server
 * rejected it. Silence here would look like the upload succeeded.
 */
@Composable
fun OutboxBanner(pending: Int, failedMessage: String?, onRetry: () -> Unit, onCancel: () -> Unit) {
    if (pending == 0 && failedMessage == null) return
    val ext = LocalEtalonColors.current
    val tone = if (failedMessage != null) MaterialTheme.colorScheme.error else ext.warning
    val shape = MaterialTheme.shapes.medium
    Row(
        Modifier.fillMaxWidth().clip(shape).background(tone.copy(alpha = 0.10f))
            .border(1.dp, tone.copy(alpha = 0.30f), shape)
            .padding(horizontal = 12.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                failedMessage ?: pluralStringResource(R.plurals.outbox_pending, pending, pending),
                style = MaterialTheme.typography.bodyMedium, color = tone,
            )
        }
        if (failedMessage != null) {
            TextButton(onClick = onRetry) { Text(stringResource(R.string.action_retry)) }
            TextButton(onClick = onCancel) { Text(stringResource(R.string.action_cancel)) }
        }
    }
}
```

`PhotoStrip.kt` and `Lightbox.kt`:
```kotlin
package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AddAPhoto
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import coil3.compose.AsyncImage
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.theme.LocalEtalonColors

@Composable
fun PhotoStrip(urls: List<String>, onOpen: (Int) -> Unit, onAdd: (() -> Unit)? = null) {
    val ext = LocalEtalonColors.current
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        itemsIndexed(urls) { i, url ->
            AsyncImage(
                model = url,
                contentDescription = stringResource(R.string.photo_n, i + 1),
                contentScale = ContentScale.Crop,
                modifier = Modifier.size(104.dp).clip(MaterialTheme.shapes.medium)
                    .border(1.dp, ext.border, MaterialTheme.shapes.medium)
                    .clickable { onOpen(i) },
            )
        }
        if (onAdd != null) {
            item {
                Box(
                    Modifier.size(104.dp).clip(MaterialTheme.shapes.medium)
                        .border(1.dp, ext.border, MaterialTheme.shapes.medium)
                        .clickable(onClick = onAdd),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Default.AddAPhoto, contentDescription = stringResource(R.string.action_add_photo)) }
            }
        }
    }
}

@Composable
fun Lightbox(urls: List<String>, startIndex: Int, onDismiss: () -> Unit) {
    if (urls.isEmpty()) return
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        Box(Modifier.fillMaxSize().background(Color.Black)) {
            val pager = rememberPagerState(initialPage = startIndex.coerceIn(0, urls.lastIndex)) { urls.size }
            HorizontalPager(state = pager, modifier = Modifier.fillMaxSize()) { page ->
                AsyncImage(
                    model = urls[page], contentDescription = null,
                    contentScale = ContentScale.Fit, modifier = Modifier.fillMaxSize(),
                )
            }
            IconButton(onClick = onDismiss, modifier = Modifier.align(Alignment.TopEnd).padding(12.dp)) {
                Icon(Icons.Default.Close, contentDescription = stringResource(R.string.action_close), tint = Color.White)
            }
        }
    }
}
```

Add `import androidx.compose.foundation.background` and `androidx.compose.foundation.layout.Box` where the compiler asks.

- [ ] **Step 6: Strings and dependency**

Append to `android/core/designsystem/src/main/res/values/strings.xml`:
```xml
    <string name="action_confirm">Тасдиқлаш</string>
    <string name="action_cancel">Бекор қилиш</string>
    <string name="action_close">Ёпиш</string>
    <string name="action_backspace">Ўчириш</string>
    <string name="action_increase">Кўпайтириш</string>
    <string name="action_decrease">Камайтириш</string>
    <string name="action_add_photo">Расм қўшиш</string>
    <string name="photo_n">Расм %1$d</string>
    <string name="stepper_max">Кўпи билан %1$d</string>
    <plurals name="outbox_pending">
        <item quantity="other">%1$d та расм юборилмоқда…</item>
    </plurals>
```
Uzbek has no separate plural form in this context, so `other` alone is correct.

Add to `android/core/designsystem/build.gradle.kts`:
```kotlin
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
```

- [ ] **Step 7: Run** — `.\gradlew.bat :core:designsystem:testDebugUnitTest :core:designsystem:assembleDebug --no-daemon`, all PASS.

- [ ] **Step 8: Commit**

```bash
git add android/core/designsystem
git commit -m "Feat(android) · buttons, keypad, stepper, outbox banner and photo strip

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Photo capture (`:feature:capture`)

A camera-first composable the logistics screens embed. The viewfinder is the screen, because taking the photo is the job. A gallery button opens the Android Photo Picker, which needs no storage permission.

**Files:**
- Create: `android/feature/capture/build.gradle.kts`
- Create: `.../feature/capture/PhotoCapture.kt`, `CaptureState.kt`, `res/values/strings.xml`
- Modify: `android/settings.gradle.kts`, `android/gradle/libs.versions.toml`
- Modify: `android/app/src/main/AndroidManifest.xml` (CAMERA permission)
- Test: `.../src/test/kotlin/uz/etalon/crm/feature/capture/CaptureStateTest.kt`

**Interfaces:**
- Produces:
  ```kotlin
  /** Camera-first capture. Calls [onPhoto] with an already-prepared JPEG. */
  @Composable fun PhotoCapture(onPhoto: (PreparedImage) -> Unit, onCancel: () -> Unit)
  // pure, tested:
  enum class CaptureMode { CAMERA, PICKER_ONLY }
  fun captureModeFor(cameraGranted: Boolean, cameraAvailable: Boolean): CaptureMode
  ```

- [ ] **Step 1: Dependencies and module**

`[versions]`: `camerax = "1.6.0"` (current stable at kickoff).
`[libraries]`:
```toml
camera-core = { module = "androidx.camera:camera-core", version.ref = "camerax" }
camera-camera2 = { module = "androidx.camera:camera-camera2", version.ref = "camerax" }
camera-lifecycle = { module = "androidx.camera:camera-lifecycle", version.ref = "camerax" }
camera-view = { module = "androidx.camera:camera-view", version.ref = "camerax" }
camera-compose = { module = "androidx.camera:camera-compose", version.ref = "camerax" }
```
Add `":feature:capture"` to `settings.gradle.kts`.

`android/feature/capture/build.gradle.kts`:
```kotlin
plugins { id("etalon.android.library"); id("etalon.android.compose"); id("etalon.hilt") }
android { namespace = "uz.etalon.crm.feature.capture" }
dependencies {
    implementation(project(":core:designsystem"))
    implementation(project(":core:image"))
    implementation(libs.camera.core)
    implementation(libs.camera.camera2)
    implementation(libs.camera.lifecycle)
    implementation(libs.camera.view)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.compose.material.icons)
    implementation(libs.kotlinx.coroutines.android)
}
```

In `android/app/src/main/AndroidManifest.xml` add above the existing permissions:
```xml
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera.any" android:required="false" />
```

- [ ] **Step 2: Write the failing test**

```kotlin
package uz.etalon.crm.feature.capture

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class CaptureStateTest {
    @Test fun `the viewfinder is used when the permission is granted and a camera exists`() {
        assertEquals(CaptureMode.CAMERA, captureModeFor(cameraGranted = true, cameraAvailable = true))
    }
    @Test fun `a denied permission falls back to the picker rather than a dead screen`() {
        assertEquals(CaptureMode.PICKER_ONLY, captureModeFor(cameraGranted = false, cameraAvailable = true))
    }
    @Test fun `a device without a camera falls back to the picker`() {
        assertEquals(CaptureMode.PICKER_ONLY, captureModeFor(cameraGranted = true, cameraAvailable = false))
    }
}
```

- [ ] **Step 3: Run to watch it fail.**

- [ ] **Step 4: Implement**

`CaptureState.kt`:
```kotlin
package uz.etalon.crm.feature.capture

enum class CaptureMode { CAMERA, PICKER_ONLY }

/** The screen must always offer a way forward: without a camera or its
 *  permission it becomes a picker instead of a dead end. */
fun captureModeFor(cameraGranted: Boolean, cameraAvailable: Boolean): CaptureMode =
    if (cameraGranted && cameraAvailable) CaptureMode.CAMERA else CaptureMode.PICKER_ONLY
```

`PhotoCapture.kt`:
```kotlin
package uz.etalon.crm.feature.capture

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.PhotoLibrary
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import kotlinx.coroutines.launch
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.image.ImagePrep
import uz.etalon.crm.core.image.PreparedImage
import java.io.File
import java.util.UUID
import java.util.concurrent.Executor
import javax.inject.Inject
import kotlin.coroutines.resume
import kotlin.coroutines.suspendCoroutine

/**
 * Camera-first photo capture. The caller receives an already-prepared JPEG, so
 * no screen has to know about EXIF, scaling or the server's 8 MB cap.
 */
@Composable
fun PhotoCapture(
    imagePrep: ImagePrep,
    onPhoto: (PreparedImage) -> Unit,
    onCancel: () -> Unit,
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()

    var granted by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    val hasCamera = remember { context.packageManager.hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY) }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted = it }

    LaunchedEffect(Unit) {
        if (!granted && hasCamera) permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    val pickerLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        busy = true
        scope.launch {
            imagePrep.prepare(uri)
                .onSuccess { onPhoto(it) }
                .onFailure { error = context.getString(R.string.capture_failed) }
            busy = false
        }
    }

    val imageCapture = remember { ImageCapture.Builder().build() }
    val mode = captureModeFor(granted, hasCamera)

    Scaffold(
        bottomBar = {
            Column(Modifier.navigationBarsPadding().padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                if (error != null) Text(error!!, color = MaterialTheme.colorScheme.error)
                if (mode == CaptureMode.CAMERA) {
                    PrimaryButton(
                        text = stringResource(R.string.capture_take),
                        loading = busy,
                        onClick = {
                            busy = true
                            scope.launch {
                                runCatching { imageCapture.takePhotoTo(context.cacheDir, ContextCompat.getMainExecutor(context)) }
                                    .mapCatching { file -> imagePrep.prepare(file).getOrThrow() }
                                    .onSuccess { onPhoto(it) }
                                    .onFailure { error = context.getString(R.string.capture_failed) }
                                busy = false
                            }
                        },
                    )
                }
                SecondaryButton(
                    text = stringResource(R.string.capture_from_gallery),
                    leading = Icons.Default.PhotoLibrary,
                    onClick = { pickerLauncher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) },
                )
            }
        },
    ) { pad ->
        Box(Modifier.padding(pad).fillMaxSize()) {
            if (mode == CaptureMode.CAMERA) {
                AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { ctx ->
                        PreviewView(ctx).also { view ->
                            val providerFuture = ProcessCameraProvider.getInstance(ctx)
                            providerFuture.addListener({
                                val provider = providerFuture.get()
                                val preview = Preview.Builder().build()
                                    .also { it.surfaceProvider = view.surfaceProvider }
                                runCatching {
                                    provider.unbindAll()
                                    provider.bindToLifecycle(lifecycleOwner, CameraSelector.DEFAULT_BACK_CAMERA, preview, imageCapture)
                                }
                            }, ContextCompat.getMainExecutor(ctx))
                        }
                    },
                )
            } else {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(stringResource(R.string.capture_no_camera), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            IconButton(onClick = onCancel, modifier = Modifier.align(Alignment.TopStart).padding(12.dp)) {
                Icon(Icons.Default.Close, contentDescription = stringResource(R.string.action_close_capture), tint = Color.White)
            }
        }
    }
}

/** Bridges CameraX's callback API into a suspending call. */
private suspend fun ImageCapture.takePhotoTo(dir: File, executor: Executor): File =
    suspendCoroutine { cont ->
        val file = File(dir, "capture-${UUID.randomUUID()}.jpg")
        val options = ImageCapture.OutputFileOptions.Builder(file).build()
        takePicture(options, executor, object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(output: ImageCapture.OutputFileResults) { cont.resume(file) }
            override fun onError(exception: ImageCaptureException) { throw exception }
        })
    }
```

The `onError` path must resume the continuation with a failure rather than throw from a callback thread — use `suspendCancellableCoroutine` and `cont.resumeWithException(exception)`. Fix that when you write it and note it.

`res/values/strings.xml`:
```xml
<resources>
    <string name="capture_take">Расм олиш</string>
    <string name="capture_from_gallery">Галереядан танлаш</string>
    <string name="capture_no_camera">Камера мавжуд эмас. Галереядан танланг.</string>
    <string name="capture_failed">Расмни ўқиб бўлмади. Қайта уриниб кўринг.</string>
    <string name="action_close_capture">Ёпиш</string>
</resources>
```

- [ ] **Step 5: Run** — `.\gradlew.bat :feature:capture:testDebugUnitTest :feature:capture:assembleDebug --no-daemon`.

- [ ] **Step 6: Commit**

```bash
git add android/feature/capture android/settings.gradle.kts android/gradle/libs.versions.toml android/app/src/main/AndroidManifest.xml
git commit -m "Feat(android) · camera-first photo capture with a picker fallback

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Load the truck (`:feature:logistics`, part one)

The single-truck path: photograph the load, review it, queue it. The order advances to LOADED when the upload lands.

**Files:**
- Create: `android/feature/logistics/build.gradle.kts`
- Create: `.../feature/logistics/loadtruck/LoadTruckViewModel.kt`, `loadtruck/LoadTruckScreen.kt`
- Create: `android/feature/logistics/src/main/res/values/strings.xml`
- Modify: `android/settings.gradle.kts`
- Test: `.../src/test/kotlin/uz/etalon/crm/feature/logistics/LoadTruckViewModelTest.kt`

**Interfaces:**
- Produces:
  ```kotlin
  data class LoadTruckUiState(val photo: PreparedImage? = null, val submitting: Boolean = false,
                              val error: String? = null, val done: Boolean = false)
  fun interface LoadTruckUseCase { suspend operator fun invoke(orderId: String, photo: PreparedImage): Result<String> }
  open class LoadTruckViewModel(orderId: String, load: LoadTruckUseCase) : ViewModel()
  @HiltViewModel(assistedFactory = …) class HiltLoadTruckViewModel
  @Composable fun LoadTruckRoute(orderId: String, extraPhoto: Boolean, onDone: () -> Unit, onCancel: () -> Unit)
  ```
  `extraPhoto = true` calls `addLoadedPhoto` instead of `loadTruck`, so the same screen serves both "advance to LOADED" and "add another photo".

- [ ] **Step 1: Module setup**

Add `":feature:logistics"` to `settings.gradle.kts`. `android/feature/logistics/build.gradle.kts`:
```kotlin
plugins { id("etalon.android.library"); id("etalon.android.compose"); id("etalon.hilt"); alias(libs.plugins.roborazzi) }
android { namespace = "uz.etalon.crm.feature.logistics" }
dependencies {
    implementation(project(":core:designsystem"))
    implementation(project(":core:model"))
    implementation(project(":core:ui"))
    implementation(project(":core:data"))
    implementation(project(":core:image"))
    implementation(project(":feature:capture"))
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.hilt.navigation.compose)
    implementation(libs.compose.material.icons)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    testRuntimeOnly(libs.junit.vintage.engine)
}
```

- [ ] **Step 2: Write the failing test**

```kotlin
package uz.etalon.crm.feature.logistics

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.feature.logistics.loadtruck.LoadTruckUseCase
import uz.etalon.crm.feature.logistics.loadtruck.LoadTruckViewModel
import java.io.File

@OptIn(ExperimentalCoroutinesApi::class)
class LoadTruckViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()

    private val photo = PreparedImage(File("/tmp/x.jpg"), 1280, 853, 100)

    @Test fun `submitting without a photo is impossible`() = runTest {
        var calls = 0
        val vm = LoadTruckViewModel("o1", LoadTruckUseCase { _, _ -> calls++; Result.success("ob1") })
        vm.submit()
        advanceUntilIdle()
        assertEquals(0, calls)
        assertNotNull(vm.state.value.error)
    }

    @Test fun `a captured photo is queued and the screen reports done`() = runTest {
        val vm = LoadTruckViewModel("o1", LoadTruckUseCase { id, p ->
            assertEquals("o1", id); assertEquals(photo, p); Result.success("ob1")
        })
        vm.onPhoto(photo)
        vm.submit()
        advanceUntilIdle()
        assertTrue(vm.state.value.done)
        assertFalse(vm.state.value.submitting)
    }

    @Test fun `a failure keeps the photo so the operator can retry without re-shooting`() = runTest {
        val vm = LoadTruckViewModel("o1", LoadTruckUseCase { _, _ -> Result.failure(IllegalStateException("диск тўлди")) })
        vm.onPhoto(photo)
        vm.submit()
        advanceUntilIdle()
        assertFalse(vm.state.value.done)
        assertEquals(photo, vm.state.value.photo)
        assertNotNull(vm.state.value.error)
    }

    @Test fun `retaking clears the previous photo`() = runTest {
        val vm = LoadTruckViewModel("o1", LoadTruckUseCase { _, _ -> Result.success("ob1") })
        vm.onPhoto(photo)
        vm.retake()
        assertNull(vm.state.value.photo)
    }
}
```

- [ ] **Step 3: Run to watch it fail.**

- [ ] **Step 4: Implement the ViewModel**

```kotlin
package uz.etalon.crm.feature.logistics.loadtruck

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import uz.etalon.crm.core.data.LogisticsRepository
import uz.etalon.crm.core.data.toAppError
import uz.etalon.crm.core.image.PreparedImage

data class LoadTruckUiState(
    val photo: PreparedImage? = null,
    val submitting: Boolean = false,
    val error: String? = null,
    val done: Boolean = false,
)

fun interface LoadTruckUseCase {
    suspend operator fun invoke(orderId: String, photo: PreparedImage): Result<String>
}

open class LoadTruckViewModel(
    private val orderId: String,
    private val load: LoadTruckUseCase,
) : ViewModel() {
    private val _state = MutableStateFlow(LoadTruckUiState())
    val state: StateFlow<LoadTruckUiState> = _state.asStateFlow()

    fun onPhoto(p: PreparedImage) = _state.update { it.copy(photo = p, error = null) }
    fun retake() = _state.update { it.copy(photo = null, error = null) }

    fun submit() {
        val photo = _state.value.photo
        if (photo == null) {
            _state.update { it.copy(error = "Аввал расм олинг") }
            return
        }
        if (_state.value.submitting) return
        _state.update { it.copy(submitting = true, error = null) }
        viewModelScope.launch {
            load(orderId, photo).fold(
                onSuccess = { _state.update { s -> s.copy(submitting = false, done = true) } },
                onFailure = { t -> _state.update { s -> s.copy(submitting = false, error = t.toAppError().message) } },
            )
        }
    }
}

@HiltViewModel(assistedFactory = HiltLoadTruckViewModel.Factory::class)
class HiltLoadTruckViewModel @AssistedInject constructor(
    repo: LogisticsRepository,
    @Assisted("orderId") orderId: String,
    @Assisted("extra") extraPhoto: Boolean,
) : LoadTruckViewModel(
    orderId,
    LoadTruckUseCase { id, photo ->
        if (extraPhoto) repo.addLoadedPhoto(id, photo) else repo.loadTruck(id, photo)
    },
) {
    @AssistedFactory
    interface Factory {
        fun create(@Assisted("orderId") orderId: String, @Assisted("extra") extraPhoto: Boolean): HiltLoadTruckViewModel
    }
}
```

- [ ] **Step 5: The screen**

```kotlin
package uz.etalon.crm.feature.logistics.loadtruck

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import uz.etalon.crm.core.designsystem.components.ErrorBanner
import uz.etalon.crm.core.designsystem.components.PrimaryButton
import uz.etalon.crm.core.designsystem.components.SecondaryButton
import uz.etalon.crm.core.designsystem.components.StickyActionBar
import uz.etalon.crm.core.image.ImagePrep
import uz.etalon.crm.feature.capture.PhotoCapture
import uz.etalon.crm.feature.logistics.R
import javax.inject.Inject

@Composable
fun LoadTruckRoute(
    orderId: String,
    extraPhoto: Boolean,
    imagePrep: ImagePrep,
    onDone: () -> Unit,
    onCancel: () -> Unit,
    vm: HiltLoadTruckViewModel = hiltViewModel<HiltLoadTruckViewModel, HiltLoadTruckViewModel.Factory>(
        creationCallback = { it.create(orderId, extraPhoto) },
    ),
) {
    val s by vm.state.collectAsStateWithLifecycle()
    LaunchedEffect(s.done) { if (s.done) onDone() }

    // Camera first: until a photo exists the viewfinder IS the screen.
    if (s.photo == null) {
        PhotoCapture(imagePrep = imagePrep, onPhoto = vm::onPhoto, onCancel = onCancel)
        return
    }

    Scaffold(
        topBar = { TopAppBar(title = { Text(stringResource(if (extraPhoto) R.string.add_photo_title else R.string.load_truck_title)) }) },
        bottomBar = {
            StickyActionBar {
                SecondaryButton(stringResource(R.string.action_retake), onClick = vm::retake, modifier = Modifier.weight(1f))
                PrimaryButton(
                    text = stringResource(if (extraPhoto) R.string.action_attach else R.string.action_mark_loaded),
                    onClick = vm::submit, loading = s.submitting, modifier = Modifier.weight(1f),
                )
            }
        },
    ) { pad ->
        Column(Modifier.padding(pad).padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            if (s.error != null) ErrorBanner(s.error!!)
            AsyncImage(
                model = s.photo!!.file, contentDescription = null, contentScale = ContentScale.Fit,
                modifier = Modifier.fillMaxWidth().weight(1f),
            )
            Text(stringResource(R.string.upload_queued_hint), style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
```

`imagePrep` is passed in rather than injected into the composable so `:feature:capture` stays Hilt-free; the nav entry in Task 15 obtains it from an `@EntryPoint` or, simpler, `LoadTruckRoute` takes it from `hiltViewModel`'s graph via a tiny `@HiltViewModel` holder. **Pick one, keep it consistent across the logistics screens, and disclose it.**

`res/values/strings.xml`:
```xml
<resources>
    <string name="load_truck_title">Юк машинасига юклаш</string>
    <string name="add_photo_title">Расм қўшиш</string>
    <string name="action_retake">Қайта олиш</string>
    <string name="action_mark_loaded">Юкланди деб белгилаш</string>
    <string name="action_attach">Бириктириш</string>
    <string name="upload_queued_hint">Расм навбатга қўйилади ва интернет пайдо бўлганда юборилади.</string>
</resources>
```

- [ ] **Step 6: Run** — `.\gradlew.bat :feature:logistics:testDebugUnitTest :feature:logistics:assembleDebug --no-daemon`, 4/4 PASS.

- [ ] **Step 7: Commit**

```bash
git add android/feature/logistics android/settings.gradle.kts
git commit -m "Feat(android) · load the truck with a photo, queued for upload

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Split shipments (`:feature:logistics`, part two)

A list of trucks for one order, each advancing PENDING → LOADED → DISPATCHED → DELIVERED. Loading a truck records how many beams of each length and how many blocks went on it, capped by what the order still has to give.

**Files:**
- Create: `.../feature/logistics/shipments/ShipmentsViewModel.kt`, `shipments/ShipmentsScreen.kt`, `shipments/ShipmentLoadViewModel.kt`, `shipments/ShipmentLoadScreen.kt`, `shipments/BeamAllowance.kt`
- Modify: `android/feature/logistics/src/main/res/values/strings.xml`
- Test: `.../src/test/kotlin/uz/etalon/crm/feature/logistics/BeamAllowanceTest.kt`, `ShipmentLoadViewModelTest.kt`

**Interfaces:**
- Produces:
  ```kotlin
  /** What this truck may still take, per beam length and for blocks. */
  data class Allowance(val beams: Map<String, Int>, val blocks: Int)
  fun allowanceFor(order: OrderDetail, excludingShipmentId: String?): Allowance
  data class ShipmentLoadUiState(val photo: PreparedImage?, val beams: Map<String, Int>, val blocks: Int,
                                 val allowance: Allowance, val submitting: Boolean, val error: String?, val done: Boolean)
  @Composable fun ShipmentsRoute(orderId: String, onLoadShipment: (String) -> Unit, onDispatch: (String) -> Unit, onBack: () -> Unit)
  @Composable fun ShipmentLoadRoute(orderId: String, shipmentId: String, imagePrep: ImagePrep, onDone: () -> Unit, onCancel: () -> Unit)
  ```

- [ ] **Step 1: Write the failing tests**

```kotlin
package uz.etalon.crm.feature.logistics

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.*
import uz.etalon.crm.feature.logistics.shipments.allowanceFor
import java.math.BigDecimal
import java.time.Instant

class BeamAllowanceTest {

    private fun room(beamLength: String, beams: Int, blocks: Int) = RoomLine(
        name = null, innerWidth = BigDecimal("4.0"), innerLength = BigDecimal("6.0"), pattern = "GB",
        beamLength = BigDecimal(beamLength), beamCount = beams, totalBlocks = blocks,
        billedArea = BigDecimal("24"), subtotal = Money.parse("1000"),
    )

    private fun shipment(id: String, beams: Map<String, Int>, blocks: Int) = ShipmentLine(
        id = id, number = 1, status = ShipmentStatus.LOADED, loadedBeams = beams, loadedBlocks = blocks,
        loadedPhotoUrl = null, driverName = null, truckIdentifier = null,
    )

    private fun order(rooms: List<RoomLine>, shipments: List<ShipmentLine>): OrderDetail =
        detailFixture(rooms = rooms, shipments = shipments)   // small helper in the test file

    @Test fun `an untouched order offers every beam and block it contains`() {
        val o = order(listOf(room("4.30", 10, 200), room("3.30", 6, 120)), emptyList())
        val a = allowanceFor(o, excludingShipmentId = null)
        assertEquals(mapOf("4.30" to 10, "3.30" to 6), a.beams)
        assertEquals(320, a.blocks)
    }

    @Test fun `what another truck already took is subtracted`() {
        val o = order(
            listOf(room("4.30", 10, 200)),
            listOf(shipment("s1", mapOf("4.30" to 4), 50)),
        )
        val a = allowanceFor(o, excludingShipmentId = null)
        assertEquals(mapOf("4.30" to 6), a.beams)
        assertEquals(150, a.blocks)
    }

    @Test fun `re-loading a truck does not count that truck against itself`() {
        val o = order(
            listOf(room("4.30", 10, 200)),
            listOf(shipment("s1", mapOf("4.30" to 4), 50)),
        )
        val a = allowanceFor(o, excludingShipmentId = "s1")
        assertEquals(mapOf("4.30" to 10), a.beams)
        assertEquals(200, a.blocks)
    }

    @Test fun `an over-shipped length reports zero rather than a negative allowance`() {
        val o = order(
            listOf(room("4.30", 5, 100)),
            listOf(shipment("s1", mapOf("4.30" to 9), 130)),
        )
        val a = allowanceFor(o, excludingShipmentId = null)
        assertEquals(0, a.beams["4.30"])
        assertEquals(0, a.blocks)
    }

    @Test fun `beam lengths are keyed to two decimals, matching the server`() {
        val o = order(listOf(room("4.3", 10, 0)), emptyList())
        assertEquals(setOf("4.30"), allowanceFor(o, null).beams.keys)
    }
}
```

Write `detailFixture(...)` in the test file as a small builder that fills every other `OrderDetail` field with a neutral value.

```kotlin
package uz.etalon.crm.feature.logistics

// ShipmentLoadViewModelTest — the same shape as LoadTruckViewModelTest.
// Cases: submit without a photo is refused; a count above the allowance is
// clamped; zero-count lengths are dropped from the payload; success reports done;
// failure keeps the photo and the counts.
```

- [ ] **Step 2: Run to watch it fail.**

- [ ] **Step 3: Implement `BeamAllowance.kt`**

```kotlin
package uz.etalon.crm.feature.logistics.shipments

import uz.etalon.crm.core.model.OrderDetail
import java.util.Locale

data class Allowance(val beams: Map<String, Int>, val blocks: Int)

private fun key(v: java.math.BigDecimal) = String.format(Locale.ROOT, "%.2f", v)

/**
 * What one truck may still take. The server enforces the same arithmetic and
 * answers 422 when it is exceeded, so computing it here turns a rejected upload
 * into a stepper that simply stops.
 */
fun allowanceFor(order: OrderDetail, excludingShipmentId: String?): Allowance {
    val totalBeams = mutableMapOf<String, Int>()
    var totalBlocks = 0
    order.rooms.forEach { r ->
        totalBeams.merge(key(r.beamLength), r.beamCount, Int::plus)
        totalBlocks += r.totalBlocks
    }
    var takenBlocks = 0
    val takenBeams = mutableMapOf<String, Int>()
    order.shipments.filter { it.id != excludingShipmentId }.forEach { s ->
        s.loadedBeams.forEach { (k, v) -> takenBeams.merge(key(java.math.BigDecimal(k)), v, Int::plus) }
        takenBlocks += s.loadedBlocks ?: 0
    }
    return Allowance(
        beams = totalBeams.mapValues { (k, total) -> (total - (takenBeams[k] ?: 0)).coerceAtLeast(0) },
        blocks = (totalBlocks - takenBlocks).coerceAtLeast(0),
    )
}
```

- [ ] **Step 4: The shipments list**

`ShipmentsViewModel` exposes `Resource<OrderDetail>` from `OrdersRepository.detail(orderId)` plus the four online-only actions (`create`, `delete`, `deliver`, and a `refresh`), each surfacing `AppError.message` on failure and disabled while offline. `ShipmentsScreen` renders one `StatusStripeCard` per shipment: the number, a `Chip` for its status, driver and truck when set, the loaded counts, and the single action that its status allows — `PENDING` gives "Юклаш" (navigates to the load screen) and a delete affordance, `LOADED` gives "Жўнатиш" (navigates to dispatch), `DISPATCHED` gives "Етказилди", `DELIVERED` gives nothing. A `PrimaryButton` at the bottom adds a truck, enabled only while the order's status is one the server accepts (`PLACED`, `IN_PRODUCTION`, `DISPATCHED`).

Write it following `OrdersListScreen`'s structure exactly: `Scaffold(topBar =, bottomBar = StickyActionBar { … })`, a `LazyColumn` with 16 dp padding and 12 dp spacing, `ErrorBanner` at the top when the last action failed, `EmptyState` with `Жўнатма йўқ.` when the list is empty.

- [ ] **Step 5: The shipment load screen**

Camera first, exactly like Task 10. Once a photo exists, the screen shows one `CountStepper` per beam length (label `"4,30 м балка"`, `max` from the allowance) plus one for blocks, and a `PrimaryButton` that calls `LogisticsRepository.loadShipment`. The ViewModel drops zero counts before enqueuing so the payload matches what the server expects, and clamps every stepper at the allowance.

```kotlin
    fun setBeam(lengthKey: String, count: Int) = _state.update { s ->
        val cap = s.allowance.beams[lengthKey] ?: 0
        s.copy(beams = s.beams + (lengthKey to count.coerceIn(0, cap)), error = null)
    }

    fun setBlocks(count: Int) = _state.update { s ->
        s.copy(blocks = count.coerceIn(0, s.allowance.blocks), error = null)
    }
```

- [ ] **Step 6: Strings**

```xml
    <string name="shipments_title">Жўнатмалар</string>
    <string name="shipments_empty">Жўнатма йўқ.</string>
    <string name="shipment_n">Жўнатма %1$d</string>
    <string name="action_add_shipment">Жўнатма қўшиш</string>
    <string name="action_load_shipment">Юклаш</string>
    <string name="action_dispatch_shipment">Жўнатиш</string>
    <string name="action_deliver_shipment">Етказилди</string>
    <string name="action_delete_shipment">Ўчириш</string>
    <string name="shipment_load_title">Жўнатмани юклаш</string>
    <string name="beam_length_label">%1$s м балка</string>
    <string name="blocks_label">Блок</string>
    <string name="loaded_summary">%1$d балка · %2$d блок</string>
```

- [ ] **Step 7: Run** — `.\gradlew.bat :feature:logistics:testDebugUnitTest :feature:logistics:assembleDebug --no-daemon`, all PASS.

- [ ] **Step 8: Commit**

```bash
git add android/feature/logistics
git commit -m "Feat(android) · split shipments with per-length load allowances

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Delivery proof (`:feature:logistics`, part three)

Camera first, then the cash the driver actually collected. This is the screen that closes an order, so its numbers matter.

**Files:**
- Create: `.../feature/logistics/delivery/DeliveryProofViewModel.kt`, `delivery/DeliveryProofScreen.kt`
- Modify: `android/feature/logistics/src/main/res/values/strings.xml`
- Test: `.../src/test/kotlin/uz/etalon/crm/feature/logistics/DeliveryProofViewModelTest.kt`

**Interfaces:**
- Produces:
  ```kotlin
  data class DeliveryProofUiState(val photo: PreparedImage? = null, val amountDigits: String = "",
      val noCashCollected: Boolean = false, val note: String = "", val driverReturned: Boolean = false,
      val expected: Money = Money.ZERO, val submitting: Boolean = false, val error: String? = null, val done: Boolean = false) {
      val amount: Money get()
      val shortfall: Money get()
  }
  fun validateDeliveryCash(cash: DeliveryCash): String?   // null when acceptable
  ```
- The three rules the server enforces are mirrored here so the operator is corrected before the photo is queued, not after: `noCashCollected` with a non-zero amount is contradictory; `noCashCollected` needs a note of at least three characters; a negative amount is impossible.

- [ ] **Step 1: Write the failing test**

```kotlin
package uz.etalon.crm.feature.logistics

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.*
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.image.PreparedImage
import uz.etalon.crm.core.model.DeliveryCash
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.feature.logistics.delivery.*
import java.io.File

@OptIn(ExperimentalCoroutinesApi::class)
class DeliveryProofViewModelTest {
    private val dispatcher = StandardTestDispatcher()
    @BeforeEach fun up() = Dispatchers.setMain(dispatcher)
    @AfterEach fun down() = Dispatchers.resetMain()
    private val photo = PreparedImage(File("/tmp/x.jpg"), 1280, 853, 100)

    @Test fun `no cash collected together with an amount is refused`() {
        val msg = validateDeliveryCash(DeliveryCash(amount = Money.parse("1000"), noCashCollected = true, note = "мижоз кейин тўлайди"))
        assertNotNull(msg)
    }

    @Test fun `no cash collected demands a note`() {
        assertNotNull(validateDeliveryCash(DeliveryCash(noCashCollected = true, note = "")))
        assertNotNull(validateDeliveryCash(DeliveryCash(noCashCollected = true, note = "ок")))
        assertNull(validateDeliveryCash(DeliveryCash(noCashCollected = true, note = "мижоз кейин тўлайди")))
    }

    @Test fun `an ordinary cash amount needs no note`() {
        assertNull(validateDeliveryCash(DeliveryCash(amount = Money.parse("1500000"))))
    }

    @Test fun `zero cash with neither flag nor note is allowed`() {
        // The customer paid by transfer earlier; nothing was collected on site.
        assertNull(validateDeliveryCash(DeliveryCash()))
    }

    @Test fun `the keypad drives the amount and the shortfall against what was expected`() {
        val vm = DeliveryProofViewModel("o1", expected = Money.parse("2000000"), submit = { _, _ -> Result.success("ob") })
        vm.setAmountDigits("1500000")
        assertEquals(Money.parse("1500000"), vm.state.value.amount)
        assertEquals(Money.parse("500000"), vm.state.value.shortfall)
    }

    @Test fun `collecting more than expected reports no shortfall`() {
        val vm = DeliveryProofViewModel("o1", expected = Money.parse("1000000"), submit = { _, _ -> Result.success("ob") })
        vm.setAmountDigits("1200000")
        assertEquals(Money.ZERO, vm.state.value.shortfall)
    }

    @Test fun `a validated proof is queued with its cash fields`() = runTest {
        var captured: DeliveryCash? = null
        val vm = DeliveryProofViewModel("o1", Money.ZERO, submit = { _, cash -> captured = cash; Result.success("ob") })
        vm.onPhoto(photo)
        vm.setAmountDigits("750000")
        vm.setDriverReturned(true)
        vm.submit()
        advanceUntilIdle()
        assertTrue(vm.state.value.done)
        assertEquals(Money.parse("750000"), captured!!.amount)
        assertTrue(captured!!.driverReturned)
    }

    @Test fun `an invalid combination never reaches the outbox`() = runTest {
        var calls = 0
        val vm = DeliveryProofViewModel("o1", Money.ZERO, submit = { _, _ -> calls++; Result.success("ob") })
        vm.onPhoto(photo)
        vm.setAmountDigits("1000")
        vm.setNoCashCollected(true)
        vm.submit()
        advanceUntilIdle()
        assertEquals(0, calls)
        assertNotNull(vm.state.value.error)
    }
}
```

- [ ] **Step 2: Run to watch it fail.**

- [ ] **Step 3: Implement**

```kotlin
package uz.etalon.crm.feature.logistics.delivery

import uz.etalon.crm.core.model.DeliveryCash
import uz.etalon.crm.core.model.Money

/**
 * The same three rules the delivery-proof route enforces, applied before the
 * upload is queued. Without this a queued proof could sit for an hour and then
 * be rejected for a note the operator is no longer standing there to write.
 */
fun validateDeliveryCash(cash: DeliveryCash): String? = when {
    cash.amount.isNegative -> "Сумма манфий бўлиши мумкин эмас"
    cash.noCashCollected && !cash.amount.isZero -> "«Нақд олинмади» билан сумма бир вақтда бўлмайди"
    cash.noCashCollected && cash.note.trim().length < 3 -> "Нима учун нақд олинмаганини ёзинг"
    else -> null
}
```

The ViewModel mirrors `LoadTruckViewModel`'s shape: an `open class` taking `orderId`, the order's `expected` collection (from `OrderDetail.dispatch?.expectedCollection`, defaulting to `Money.ZERO`) and a `submit: suspend (PreparedImage, DeliveryCash) -> Result<String>` seam; a `@HiltViewModel(assistedFactory = …)` subclass wires `LogisticsRepository.deliveryProof`. `amount` parses `amountDigits` through `Money.parse`, treating an empty string as `Money.ZERO`; `shortfall` is `(expected - amount).coerceAtLeastZero()`.

The screen: camera first; then the photo, a large `MoneyText` of the amount opening `NumericKeypadSheet` on tap (pre-filled with `expected` so the common case is one tap), the shortfall in the danger colour when non-zero, a "Нақд олинмади" switch that reveals a note field, a "Ҳайдовчи қайтди" switch, and a `StickyActionBar` with retake and "Етказилди".

- [ ] **Step 4: Strings**

```xml
    <string name="delivery_proof_title">Етказиш исботи</string>
    <string name="delivery_cash_label">Олинган нақд</string>
    <string name="delivery_expected">Кутилган: %1$s</string>
    <string name="delivery_shortfall">Кам: %1$s</string>
    <string name="delivery_no_cash">Нақд олинмади</string>
    <string name="delivery_no_cash_note">Сабабини ёзинг</string>
    <string name="delivery_driver_returned">Ҳайдовчи қайтди</string>
    <string name="action_mark_delivered">Етказилди</string>
```

- [ ] **Step 5: Run and commit**

Run: `.\gradlew.bat :feature:logistics:testDebugUnitTest :feature:logistics:assembleDebug --no-daemon`

```bash
git add android/feature/logistics
git commit -m "Feat(android) · delivery proof with the cash the driver collected

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Drivers and dispatch (`:feature:logistics`, part four)

The roster, and the two dispatch paths that use it: one truck for the whole order, or one truck per shipment.

**Files:**
- Create: `.../feature/logistics/drivers/DriversViewModel.kt`, `drivers/DriversScreen.kt`, `drivers/DriverPicker.kt`
- Create: `.../feature/logistics/dispatch/DispatchViewModel.kt`, `dispatch/DispatchScreen.kt`
- Modify: `android/feature/logistics/src/main/res/values/strings.xml`
- Test: `.../src/test/kotlin/uz/etalon/crm/feature/logistics/DriversViewModelTest.kt`, `DispatchViewModelTest.kt`

**Interfaces:**
- Produces:
  ```kotlin
  data class DriversUiState(val drivers: List<Driver>, val activeOnly: Boolean, val loading: Boolean, val error: String?)
  open class DriversViewModel(list: …, create: …, setActive: …) : ViewModel()
  @Composable fun DriversRoute(onBack: () -> Unit)
  @Composable fun DriverPicker(drivers: List<Driver>, selected: String?, onSelect: (String?) -> Unit)
  data class DispatchUiState(val drivers: List<Driver>, val driverId: String?, val truck: String,
      val amountDigits: String, val willCollectCash: Boolean, val submitting: Boolean, val error: String?, val done: Boolean)
  @Composable fun DispatchRoute(orderId: String, shipmentId: String?, onDone: () -> Unit, onCancel: () -> Unit)
  ```
  `shipmentId == null` calls `LogisticsRepository.createDispatch` (whole order, `expectedCollection` required); a non-null id calls `dispatchShipment` (`cashToCollect` optional). Both are online-only.

- [ ] **Step 1: Write the failing tests**

`DriversViewModelTest` covers: the list loads and filters to active only; creating a driver with a blank name is refused before the network is touched; `setActive(false)` moves a driver out of the active filter; an API failure surfaces `AppError.message` and keeps the previous list.

`DispatchViewModelTest` covers:
- whole-order dispatch sends the entered amount as `expectedCollection`
- shipment dispatch sends `driverWillCollectCash = false` and a null `cashToCollect` when the switch is off
- shipment dispatch sends the amount when the switch is on
- submitting twice while the first call is in flight only calls the API once
- a `Conflict` error carrying the code `null` and the message "Бу буюртма учун жўнатма аллақачон мавжуд" (the server's 409 for a second dispatch) is shown verbatim and `done` stays false

Write them in the established shape: `StandardTestDispatcher`, `fun interface` seams, `advanceUntilIdle()`.

- [ ] **Step 2: Run to watch them fail.**

- [ ] **Step 3: Implement**

`DriversScreen` is a list of `StatusStripeCard`s — name, `PhoneLink`-style `tel:` tap, active chip, the two derived counts ("2 та фаол жўнатма", "30 кунда 1 та тафовут") — with a filter switch for active only, an add-driver sheet (name, phone with the `+998` mask, notes) and a per-row activate/deactivate action gated on `driver.manage`. Gate the whole route on `driver.view`; without it the entry is not in the navigation graph at all (Task 15).

`DriverPicker` is a bottom sheet listing active drivers plus a "Ҳайдовчисиз" (no driver) option, since both dispatch endpoints accept a null `driverId`.

`DispatchScreen` is a form, not a camera screen: driver picker, truck identifier field, cash switch, amount via `NumericKeypadSheet`, and a `StickyActionBar` with the single "Жўнатиш" action. It is disabled with «Интернет йўқ» when offline, because neither dispatch route is idempotent and therefore neither may be queued.

- [ ] **Step 4: Strings**

```xml
    <string name="drivers_title">Ҳайдовчилар</string>
    <string name="drivers_empty">Ҳайдовчи йўқ.</string>
    <string name="drivers_active_only">Фақат фаоллар</string>
    <string name="driver_active_dispatches">%1$d та фаол жўнатма</string>
    <string name="driver_discrepancies_30d">30 кунда %1$d та тафовут</string>
    <string name="action_add_driver">Ҳайдовчи қўшиш</string>
    <string name="action_deactivate_driver">Ўчириш</string>
    <string name="action_activate_driver">Фаоллаштириш</string>
    <string name="driver_name">Исм</string>
    <string name="driver_phone">Телефон</string>
    <string name="driver_notes">Изоҳ</string>
    <string name="driver_none">Ҳайдовчисиз</string>
    <string name="dispatch_title">Жўнатиш</string>
    <string name="dispatch_truck">Машина рақами</string>
    <string name="dispatch_will_collect_cash">Ҳайдовчи нақд йиғади</string>
    <string name="dispatch_expected">Кутилган сумма</string>
    <string name="action_dispatch">Жўнатиш</string>
    <string name="offline_action_blocked">Интернет йўқ — бу амал онлайн бажарилади</string>
```

- [ ] **Step 5: Run and commit**

```bash
git add android/feature/logistics
git commit -m "Feat(android) · driver roster and both dispatch paths

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Delivery location (`:feature:logistics`, part five)

Where the truck is going. Three ways to set it, all offline-free: read the phone's own position, paste a Google Maps link the server resolves, or type the coordinates.

**Scope note for the owner:** this task deliberately ships **no embedded map**. The Maps SDK for Android needs its own API key, which is a different credential from the web's `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and does not exist yet. Everything the field user actually needs — standing at the site and saving that spot, or opening the saved spot in whatever maps app the phone has — works without it. Add the map preview in a later slice once a key exists.

**Files:**
- Create: `.../feature/logistics/location/DeliveryLocationViewModel.kt`, `location/DeliveryLocationScreen.kt`, `location/DeviceLocation.kt`
- Modify: `android/app/src/main/AndroidManifest.xml` (location permissions)
- Modify: `android/feature/logistics/src/main/res/values/strings.xml`
- Test: `.../src/test/kotlin/uz/etalon/crm/feature/logistics/DeliveryLocationViewModelTest.kt`

**Interfaces:**
- Produces:
  ```kotlin
  interface DeviceLocation { suspend fun current(): Result<LatLng> }   // platform LocationManager, no Play Services
  data class DeliveryLocationUiState(val lat: Double?, val lng: Double?, val label: String,
      val linkInput: String, val busy: Boolean, val error: String?, val saved: Boolean) {
      val hasPin: Boolean get() = lat != null && lng != null
  }
  fun parseCoordinatePair(input: String): LatLng?   // "41.311, 69.279" typed by hand
  ```

- [ ] **Step 1: Manifest**

```xml
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
```

- [ ] **Step 2: Write the failing test**

```kotlin
package uz.etalon.crm.feature.logistics

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import uz.etalon.crm.feature.logistics.location.parseCoordinatePair

class DeliveryLocationParseTest {
    @Test fun `accepts a comma separated pair with or without spaces`() {
        assertEquals(41.311 to 69.279, parseCoordinatePair("41.311, 69.279")!!.let { it.lat to it.lng })
        assertEquals(41.311 to 69.279, parseCoordinatePair("41.311,69.279")!!.let { it.lat to it.lng })
    }
    @Test fun `accepts a decimal comma, which is what the Uzbek keyboard produces`() {
        // "41,311 69,279" — comma is the decimal separator, space is the pair separator.
        assertEquals(41.311 to 69.279, parseCoordinatePair("41,311 69,279")!!.let { it.lat to it.lng })
    }
    @Test fun `rejects out of range values`() {
        assertNull(parseCoordinatePair("91.0, 10.0"))
        assertNull(parseCoordinatePair("10.0, 181.0"))
    }
    @Test fun `rejects anything that is not a pair`() {
        assertNull(parseCoordinatePair(""))
        assertNull(parseCoordinatePair("41.311"))
        assertNull(parseCoordinatePair("https://maps.app.goo.gl/x"))
    }
}
```

Plus a ViewModel test covering: "use my location" writes the returned pair into the state; a pasted link is sent to `resolveMapLink` and its result becomes the pin; a resolver failure shows the server's Uzbek message and leaves the previous pin alone; saving calls `setDeliveryLocation` with the pin; clearing calls it with two nulls.

- [ ] **Step 3: Implement**

`parseCoordinatePair` normalises a decimal comma only when the string contains exactly two numbers, so `"41,311 69,279"` and `"41.311, 69.279"` both work while `"41,69"` stays ambiguous and is rejected. `DeviceLocation` uses `LocationManager.getCurrentLocation(...)` (available from API 30, and minSdk here is 36) wrapped in `suspendCancellableCoroutine`, requesting `ACCESS_FINE_LOCATION` through the same `rememberLauncherForActivityResult` pattern `MainActivity` already uses.

The screen: the current pin as `formatDecimal(lat, 5), formatDecimal(lng, 5)` in the mono face, a `PrimaryButton` "Менинг жойим", a paste field with a "Ҳал қилиш" action, a manual-entry field, a "Навигация" button firing the existing `geo:` intent, a "Тозалаш" danger action, and a `StickyActionBar` with "Сақлаш".

- [ ] **Step 4: Strings**

```xml
    <string name="location_title">Етказиш жойи</string>
    <string name="location_my_position">Менинг жойим</string>
    <string name="location_paste_link">Харита ҳаволасини қўйинг</string>
    <string name="location_resolve">Ҳал қилиш</string>
    <string name="location_manual">Координаталар (кенглик, узунлик)</string>
    <string name="location_label">Белги (масалан «кўк дарвоза»)</string>
    <string name="location_none">Жой белгиланмаган</string>
    <string name="location_permission_needed">Жойни аниқлаш учун рухсат керак</string>
    <string name="action_clear_location">Тозалаш</string>
    <string name="action_save">Сақлаш</string>
```

- [ ] **Step 5: Run and commit**

```bash
git add android/feature/logistics android/app/src/main/AndroidManifest.xml
git commit -m "Feat(android) · delivery location from the device, a link or coordinates

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: Wire the cockpit (`:feature:orders`, `:app`)

Everything built so far becomes reachable: a sticky bar carrying the order's next step, a shipments card, a photo strip that can add and remove, and the outbox banner that says an upload is still on its way.

**Files:**
- Create: `android/feature/orders/src/main/kotlin/uz/etalon/crm/feature/orders/detail/NextStep.kt`
- Modify: `.../detail/OrderDetailViewModel.kt`, `.../detail/OrderDetailScreen.kt`, `android/feature/orders/build.gradle.kts`, `.../res/values/strings.xml`
- Modify: `android/app/.../nav/Keys.kt`, `nav/EtalonNavHost.kt`, `shell/Destinations.kt`, `shell/MoreScreen.kt`, `app/build.gradle.kts`, `app/res/values/strings.xml`
- Test: `android/feature/orders/src/test/kotlin/uz/etalon/crm/feature/orders/NextStepTest.kt`

**Interfaces:**
- Produces:
  ```kotlin
  sealed interface NextStep {
      data object LoadTruck : NextStep
      data object DeliveryProof : NextStep
      data object ManageShipments : NextStep
      data class Blocked(val reason: String) : NextStep
      data object None : NextStep
  }
  fun nextStepFor(order: OrderDetail, me: Me, pendingUploads: Int): NextStep
  ```
  `OrderDetailViewModel` gains `pending: StateFlow<List<PendingUpload>>` from `OutboxRepository.observeForOrder`, plus `retryUpload(id)`, `cancelUpload(id)` and `deletePhoto(photoId)`.
  New nav keys: `LoadTruck(orderId, extra)`, `Shipments(orderId)`, `ShipmentLoad(orderId, shipmentId)`, `Dispatch(orderId, shipmentId?)`, `DeliveryProof(orderId)`, `DeliveryLocation(orderId)`, `Drivers`.

- [ ] **Step 1: Write the failing test**

```kotlin
package uz.etalon.crm.feature.orders

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.model.*
import uz.etalon.crm.feature.orders.detail.NextStep
import uz.etalon.crm.feature.orders.detail.nextStepFor

class NextStepTest {
    private fun me(vararg p: String) = Me("u", "n", Role.CUSTOM, p.toSet(), false)
    private val editor = me("order.view", "order.edit", "dispatch.create")

    @Test fun `a placed order asks for the truck photo`() {
        assertEquals(NextStep.LoadTruck, nextStepFor(order(OrderStatus.PLACED), editor, 0))
    }

    @Test fun `an in-production order still asks for the truck photo`() {
        assertEquals(NextStep.LoadTruck, nextStepFor(order(OrderStatus.IN_PRODUCTION), editor, 0))
    }

    @Test fun `a loaded order asks for delivery proof`() {
        assertEquals(NextStep.DeliveryProof, nextStepFor(order(OrderStatus.LOADED), editor, 0))
        assertEquals(NextStep.DeliveryProof, nextStepFor(order(OrderStatus.DISPATCHED), editor, 0))
    }

    @Test fun `an order split across trucks routes to the shipment list instead`() {
        val split = order(OrderStatus.PLACED, shipments = listOf(shipment("s1", ShipmentStatus.PENDING)))
        assertEquals(NextStep.ManageShipments, nextStepFor(split, editor, 0))
    }

    @Test fun `a delivered or canceled order has no next step`() {
        assertEquals(NextStep.None, nextStepFor(order(OrderStatus.DELIVERED), editor, 0))
        assertEquals(NextStep.None, nextStepFor(order(OrderStatus.CANCELED), editor, 0))
    }

    @Test fun `a user without order edit is offered nothing`() {
        assertEquals(NextStep.None, nextStepFor(order(OrderStatus.PLACED), me("order.view"), 0))
    }

    @Test fun `a pending upload blocks the action so the same photo is not sent twice`() {
        val step = nextStepFor(order(OrderStatus.PLACED), editor, pendingUploads = 1)
        assertTrue(step is NextStep.Blocked)
    }
}
```

`order(...)` and `shipment(...)` are fixtures in the test file.

- [ ] **Step 2: Run to watch it fail.**

- [ ] **Step 3: Implement `NextStep.kt`**

```kotlin
package uz.etalon.crm.feature.orders.detail

import uz.etalon.crm.core.model.Me
import uz.etalon.crm.core.model.OrderDetail
import uz.etalon.crm.core.model.OrderStatus

sealed interface NextStep {
    data object LoadTruck : NextStep
    data object DeliveryProof : NextStep
    data object ManageShipments : NextStep
    /** The action exists but cannot run right now; [reason] is shown on the bar. */
    data class Blocked(val reason: String) : NextStep
    data object None : NextStep
}

/**
 * The single action the cockpit puts under the operator's thumb.
 *
 * Once an order is split across trucks the whole-order LOAD step no longer
 * applies — the server refuses it and each truck advances on its own — so the
 * bar sends the operator to the shipment list instead.
 */
fun nextStepFor(order: OrderDetail, me: Me, pendingUploads: Int): NextStep {
    if (!me.can("order.edit")) return NextStep.None
    val status = order.summary.status
    if (status == OrderStatus.DELIVERED || status == OrderStatus.CANCELED || status == OrderStatus.DRAFT) return NextStep.None
    if (pendingUploads > 0) return NextStep.Blocked("Юборилмоқда…")
    if (order.shipments.isNotEmpty()) return NextStep.ManageShipments
    return when (status) {
        OrderStatus.PLACED, OrderStatus.IN_PRODUCTION -> NextStep.LoadTruck
        OrderStatus.LOADED, OrderStatus.DISPATCHED -> NextStep.DeliveryProof
        else -> NextStep.None
    }
}
```

- [ ] **Step 4: Extend the detail screen**

`OrderDetailViewModel` injects `OutboxRepository` and `LogisticsRepository` (through the same assisted factory), exposes `pending`, and gains `retryUpload`, `cancelUpload` and `deletePhoto`. `OrderDetailScreen` gains four things and keeps every existing card in its current order:

1. `Scaffold(bottomBar = { … })` — a `StickyActionBar` whose single `PrimaryButton` is labelled and wired from `nextStepFor`: `LoadTruck` → "Юкланди — расм олиш", `DeliveryProof` → "Етказилди — исбот", `ManageShipments` → "Жўнатмалар", `Blocked` → the reason, disabled, `None` → the bar is not rendered at all.
2. An `OutboxBanner` as the first `item` when `pending` is non-empty, above the error banner.
3. A shipments card between the payments card and the rooms card, rendered only when `o.shipments.isNotEmpty()`, listing each truck with its status chip and a row tap that opens the shipment list.
4. The existing photos `item` replaced by `PhotoStrip` with `onAdd` (navigating to `LoadTruck(orderId, extra = true)`, shown only with `order.edit` and only when the status allows another photo) and a long-press that offers deletion. `Lightbox` opens on tap. The strip's URLs come from `o.loadedPhotos` so a delete has the `photoId` it needs.

The header card's navigation icon becomes a tap that opens `DeliveryLocation(orderId)` when the user has `order.edit`, so the pin can be set as well as followed.

- [ ] **Step 5: Nav and shell**

Add to `nav/Keys.kt`:
```kotlin
@Serializable data class LoadTruck(val orderId: String, val extra: Boolean) : Key
@Serializable data class Shipments(val orderId: String) : Key
@Serializable data class ShipmentLoad(val orderId: String, val shipmentId: String) : Key
@Serializable data class Dispatch(val orderId: String, val shipmentId: String? = null) : Key
@Serializable data class DeliveryProof(val orderId: String) : Key
@Serializable data class DeliveryLocation(val orderId: String) : Key
@Serializable data object Drivers : Key
```

Add one `entry<…>` per key inside `SignedInShell`'s `entryProvider`, each popping back with `backStack.removeLastOrNull()` on completion. The entry-decorator list stays exactly as it is — per-entry `ViewModelStore` is what makes the assisted factories work.

`MoreScreen` grows a destination list so anything not on the bar is reachable. For 1b that list is: Ҳайдовчилар (gated on `driver.view`), plus every `Destination` that `destinationsFor(me)` dropped, each routing to its `key()`. Add a `moreDestinationsFor(me: Me): List<Destination>` next to `destinationsFor` returning the allowed set minus what the bar shows, and cover it in `DestinationsTest`.

`app/build.gradle.kts` gains `implementation(project(":feature:logistics"))` and `implementation(project(":feature:capture"))`.

The sign-out confirmation now names pending uploads: `MoreScreen` takes `pendingUploads: Int` and, when it is non-zero, shows an `AlertDialog` reading «%1$d та расм ҳали юборилмаган. Чиқсангиз улар ўчирилади.» before calling `onSignOut`.

- [ ] **Step 6: Run and commit**

Run: `.\gradlew.bat testDebugUnitTest :app:assembleDebug --no-daemon` — the whole project, all PASS.

```bash
git add android/feature/orders android/app
git commit -m "Feat(android) · order cockpit action bar, shipments, photos and outbox

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: Screenshots and end-to-end verification

**Files:**
- Create: `android/feature/logistics/src/test/kotlin/uz/etalon/crm/feature/logistics/LogisticsScreenshotTest.kt`
- Modify: `android/feature/orders/src/test/kotlin/uz/etalon/crm/feature/orders/…` (one new screenshot for the detail bar)
- Baselines committed under each module's `screenshots/`

- [ ] **Step 1: Screenshot tests**

Following `feature/auth`'s existing Roborazzi setup exactly (JUnit 4 runner, `@GraphicsMode(NATIVE)`, `@Config(qualifiers = …)`), capture, in light and dark and at font scale 1.3:
- the delivery-proof screen with a photo, an amount and a shortfall
- the shipment load screen with three beam steppers and a block stepper
- the shipments list with one truck in each of the four states
- the order detail's sticky action bar in its `LoadTruck` and `Blocked` forms

Record with `recordRoborazziDebug`, then `verifyRoborazziDebug` must pass. Open every new PNG and check: Cyrillic renders in both faces, digits stay tabular and aligned, no text clips at 1.3, the chips read in dark.

- [ ] **Step 2: End-to-end on the emulator**

Start the local server (`npm run dev` in `precast-crm/`), boot `anatome_api36`, `installDebug`, and drive with `adb shell input` plus screenshots, reading each one before the next step. Verify and capture:

| # | Check |
|---|---|
| 1 | A PLACED order shows "Юкланди — расм олиш" on the sticky bar |
| 2 | Tapping it opens the viewfinder; the gallery button opens the Photo Picker; picking an image shows the review screen |
| 3 | Confirming queues the upload: the banner reads "1 та расм юборилмоқда…", and within seconds the order shows LOADED with the photo in the strip |
| 4 | **Airplane mode:** queue a second photo, confirm the banner persists and the row survives a force-stop and relaunch; re-enable the network and confirm it uploads without another tap |
| 5 | **Permanent rejection:** with the order already DELIVERED, queue a load photo and confirm the banner turns red with the server's Uzbek message and offers Retry and Cancel |
| 6 | Split path: add a shipment, load it with beam and block counts, confirm the steppers cap at the allowance, dispatch it to a driver with a truck number, mark it delivered |
| 7 | Delivery proof: capture, enter the cash on the keypad, toggle "Ҳайдовчи қайтди", submit, and confirm the order reaches DELIVERED with a payment pending confirmation |
| 8 | Drivers: open from Яна, add a driver, deactivate and reactivate |
| 9 | Delivery location: "Менинг жойим" writes a pin, "Навигация" opens a maps app, "Тозалаш" clears it |
| 10 | Sign out with a queued upload warns before discarding |
| 11 | `adb logcat -d` shows no `FATAL EXCEPTION` for the whole session |

Record every step in the report with its screenshot path. Any defect found is **recorded, not fixed** — the controller decides.

- [ ] **Step 3: Commit**

```bash
git add android/feature/logistics android/feature/orders
git commit -m "Test(android) · screenshots and end-to-end run for the logistics slice

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Self-review

**Spec coverage.** §4.3 offline and sync → Tasks 5, 6, 7 (outbox table, repository, worker) with the queue-only-if-idempotent rule stated in the Global Constraints and enforced by `LogisticsRepository`'s split. §4.5 camera and media pipeline → Tasks 3 and 9 (1280 px, JPEG 0.65, EXIF, Photo Picker). §5.3 order cockpit → Task 15 (sticky next-step bar, shipments card, photo strip, outbox banner). §5.7 logistics → Tasks 10 (load truck, extra photos), 11 (split shipments), 12 (delivery proof with cash), 13 (drivers, both dispatch paths), 14 (delivery pin). §7's Phase 1b line is fully covered. **Deliberately not covered:** payments recording and the confirm queue (slice 1c), home, clients and gallery (slice 1d), and the embedded map (Task 14's scope note — no Maps SDK key exists).

**Placeholder scan.** Tasks 11, 13, 14 and 15 describe several screens in prose rather than full Compose source. That is deliberate and bounded: each names the exact components to use, the exact strings, the exact repository calls and the exact structure to copy (`OrdersListScreen`), and each ships with a fully-written test for the logic that can be wrong. The pure functions every one of those screens depends on — `allowanceFor`, `validateDeliveryCash`, `parseCoordinatePair`, `nextStepFor`, `applyDigit` — are written out in full with their tests. No step says "add error handling" or "write tests for the above".

**Type consistency.** `PreparedImage` (Task 3) flows through `OutboxRepository.enqueue` (Task 6) into `OutboxEntity.filePath` (Task 5) and out through `OutboxWorker.send` (Task 7). `OutboxKind`'s four constants match one-for-one the four multipart methods on `EtalonApi` (Task 4) and the four queued methods on `LogisticsRepository` (Task 6). `OutboxScheduler` is declared in `:core:data` and implemented in `:core:sync`, so no module depends on WorkManager except `:core:sync` and `:app`. `ShipmentLine.loadedBeams` (Task 6) is what `allowanceFor` reads (Task 11). `normaliseBeamKeys` is applied in exactly one place, `LogisticsRepository.loadShipment`, and asserted there. `Money` is the type of every amount that crosses a boundary; only `DispatchCreateRequest.expectedCollection` and `ShipmentDispatchRequest.cashToCollect` become `Double`, at the last moment, because the server's Zod schema coerces a JSON number — flagged here so it is not mistaken for a float creeping into the domain.

**Open risks for the executor to watch.** The `explicitNulls = false` interaction with `DeliveryLocationRequest` (Task 4, Step 1's note) is the one place where the shared `Json` configuration and a server contract disagree; it must be proven by the test, not assumed. CameraX binding on an emulator is unreliable — Task 9's picker path is the escape hatch and Task 16 step 2 should use it if the viewfinder will not start.
