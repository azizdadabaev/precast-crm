# Android — Readiness slice (signing, CI, install route, push) — Implementation Plan (DRAFT for the owner's approval)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **HARD-GATE: this plan runs only after the owner approves it** — it touches secrets handling, CI, and the store-less distribution route.

**Goal:** Turn the restyled app into something the owner can put on phones: a signed release APK built by CI on every push to `main`, a documented install route, the two owner-side items done once (keystore, Firebase project), the leftover engineering carries closed, and push notifications enabled the day `google-services.json` lands.

**Architecture:** Signing reads its secrets from `local.properties`/environment locally and from GitHub Actions secrets in CI — never from the repo. One workflow builds and verifies (`testDebugUnitTest verifyRoborazziDebug` + the web `golden:check`/`openapi:check`), then assembles a signed release APK as an artifact. The FCM plugin line is uncommented in the last task, guarded so a missing `google-services.json` still builds.

**Tech Stack:** Gradle (Kotlin DSL), GitHub Actions (`ubuntu-latest`, JDK 17, Android SDK via `android-actions/setup-android`), `keytool`, Firebase Cloud Messaging (deps already present).

**Spec:** the owner's readiness answers (2026-09-10): distribution = **direct APK sideloaded** (CI builds the signed APK on `main`; Play / Firebase App Distribution later); keystore = **none exists, generate one**, kept OUTSIDE the repo, passwords via `local.properties`/env locally and GitHub secrets in CI, backed up by the owner; Firebase = **the owner creates the project on instructions** and drops `google-services.json` into `android/app/` (git-ignored); remote = GitHub `azizdadabaev/precast-crm`. Facts (2026-09-14): `app/build.gradle.kts` has `versionCode 1`/`versionName 0.1.0`, a minified release type with NO `signingConfig`, firebase BOM + messaging deps and a commented `google-services` plugin line; no `.github/workflows`; `android/.gitignore` already ignores `local.properties`, `*.keystore`, `*.jks`, `app/google-services.json`.

## Global Constraints

- **No secret in the repo, ever**: keystore file, its passwords, `google-services.json`, `local.properties` stay ignored; the plan's own text carries no real values; CI secrets are referenced by name only (`ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`).
- The debug build keeps targeting the LOCAL dev server; only the signed release targets production — the install route document says so in Uzbek and in English.
- `versionCode` increments per release build (CI derives it from the run number; local builds keep 1); `versionName` `0.1.0` → `1.0.0` at the first sideload.
- Every existing test stays green; `verifyRoborazziDebug` runs in CI with `--rerun-tasks` (the warm-verify trap).
- Never push from the agent's session; the workflow file is committed on the branch and lands on `main` through the owner's merge.

## Rulings (proposed — the owner confirms)

- **R1 — Keystore generation is the OWNER's action**, run from the instructions in Task 1 on their machine (`keytool -genkeypair …`), stored outside the repo, backed up (losing it forces every phone to reinstall). The agent never generates or sees the passwords.
- **R2 — CI signs from a base64 secret** (`ANDROID_KEYSTORE_B64` decoded to a temp file at build time); local release builds sign from `local.properties` keys `etalon.keystore.path/password/alias/keyPassword`; both feed one `signingConfigs.release` block; when absent, `assembleRelease` still builds unsigned with a clear Gradle warning.
- **R3 — One workflow, two jobs**: `verify` (Android unit + screenshot verify; web `npm test` + `golden:check` + `openapi:check`) on every push/PR; `release-apk` on `main` only, after `verify`, uploading `app-release.apk` as an artifact and attaching it to a GitHub Release tagged `android-v<versionName>+<run>`.
- **R4 — Install route** = a one-page document (`docs/android/INSTALL.md`, Uzbek + English): download the APK from the Release, allow "install unknown apps" once, install, sign in; the debug/release server distinction; how updates arrive (a new Release; the app does not self-update).
- **R5 — Push last**: the FCM task runs only when `android/app/google-services.json` exists on the owner's machine; the plugin is applied conditionally (`if (file("google-services.json").exists())`) so CI without the file still builds; the token registration path (`SessionPrefs.fcmToken` → the web's device-token route) is already in place — verify, do not rewrite.
- **R6 — Carries closed here** (from phases 3–6): `ds_account_sheet_light` needs a Roborazzi harness in `:app` (add the plugin to `:app` with the Hilt test-application pattern); app locale `uz-Cyrl` via `AppCompatDelegate.setApplicationLocales` so the M3 pickers' month header and weekday initials read Uzbek; «Калькуляторда очиш» gates on a non-empty draft with a `ConfirmSheet`; the history carve-out keeps Latin-script operator free text (strip the known English prefix, keep the tail).

---

### Task 1: Signing config + the owner's keystore instructions

**Files:** `android/app/build.gradle.kts` (`signingConfigs.release` reading `local.properties`/env; `buildTypes.release.signingConfig` when configured; `versionCode` from `ANDROID_VERSION_CODE` env when set), `android/local.properties.example` (key names only), `docs/android/SIGNING.md` (the owner's `keytool` command with placeholders, where to store the file, the backup rule, the four CI secret names and how to set them in GitHub).
- [ ] Failing check: `assembleRelease` with the four keys present in `local.properties` produces a signed APK (`apksigner verify`), without them an unsigned one with a warning — a Gradle test or a documented manual check.
- [ ] Implement; commit `Build(android) · release signing from local.properties or the environment; keystore instructions`.

### Task 2: GitHub Actions — verify on every push, signed APK on main

**Files:** `.github/workflows/android.yml` (`verify` + `release-apk` jobs, JDK 17, Gradle cache, `--no-daemon --rerun-tasks`, Roborazzi verify), `.github/workflows/web.yml` (or one file: `npm ci`, `npm test`, `npm run golden:check`, `npm run openapi:check` — check the exact script names in `precast-crm/package.json`), `docs/android/CI.md`.
- [ ] The workflow must pass on the branch's HEAD (the agent cannot run Actions; it runs the same commands locally and lints the YAML with `actionlint` if available, else by inspection); commit `CI · verify Android and web; build the signed release APK on main`.

### Task 3: Install route + version bump

**Files:** `docs/android/INSTALL.md` (R4, Uzbek + English), `android/app/build.gradle.kts` (`versionName 1.0.0`), the in-app «Ҳақида»/version line if one exists (grep; else the account sheet gains a `versionName` meta line — small, with a baseline).
- [ ] Commit `Docs(android) · install route; version 1.0.0`.

### Task 4: Carries — `:app` Roborazzi harness, app locale, re-open gate, Latin free text

**Files:** `android/app/build.gradle.kts` (+ Roborazzi/Robolectric test deps, the Hilt test-application), `app/src/test/.../AccountSheetScreenshotTest.kt` (`ds_account_sheet_light`), `MainActivity`/`EtalonApp` (`AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags("uz-Cyrl-UZ"))` + `res/values-uz-rUZ`? — the app's strings are already Uzbek in `values/`; the locale call only affects platform pickers; add the `appcompat` dependency if absent), `feature/home/.../HomeViewModel.kt` + `OutboxSheet.kt` (re-open gate on a non-empty draft via `ConfirmSheet`), `feature/orders/.../EventLabels.kt` (Latin free text kept: strip the known English prefix, keep the tail; tests with «chek yo'q»).
- [ ] Baselines: `ds_account_sheet_light`, the pickers' month header at last in Uzbek (an orders-list picker frame), `home_outbox_reopen_confirm_light`; commit `Feat(android) · app locale, account-sheet frame, re-open gate, Latin free text in the history`.

### Task 5: Push — enable FCM when `google-services.json` exists

**Files:** `android/app/build.gradle.kts` (conditional `google-services` plugin), `docs/android/PUSH.md` (the owner's Firebase steps: create the project, add the Android app with `uz.etalon.crm`, download `google-services.json` to `android/app/`, the server's FCM server key/service account where the web's push route expects it — read `precast-crm/src/lib/push*.ts`), verify the token registration end to end on the emulator with the file present (the owner provides it; if absent the task documents and stops).
- [ ] Commit `Build(android) · Firebase plugin applied when google-services.json is present; push instructions`.

### Task 6: Close — verification, the owner's first sideload

- [ ] Standard command; web checks; the workflow YAML linted; `INSTALL.md` walked once by the agent on the emulator with the RELEASE build against… **no — the release build targets production; the agent never signs in to production.** The release APK is only built and `apksigner`-verified; the first real install is the owner's.
- [ ] Handoff: the four CI secrets set (owner), the keystore backed up (owner), the merge of `feat/android-restyle` into `main` (owner; a fast-forward from `9cdd15c`'s line — verify `main` is still an ancestor).

## Self-review
- Coverage of the owner's answers: sideload (T2/T3), keystore generated by the owner (T1), Firebase last (T5), GitHub Actions (T2). Carries (R6) in T4. Nothing here reads production data.
- Open points for the owner: whether `INSTALL.md` should be Uzbek-only; whether to bump to 1.0.0 now; the service-account route for push on the server (read `precast-crm/src/lib/push*.ts` first).
