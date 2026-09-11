# Android restyle 1 — Foundation (tokens, fonts, icons, components)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `:core:designsystem` on the Etalon Mobile system so that every later phase composes screens out of finished parts. After this plan the app still does exactly what it did — same routes, same ViewModels, same strings — but every colour, every glyph, every number and every button in it comes from the new system, and a reviewer can look at one screenshot per component and say yes or no before a single screen is redrawn.

**Architecture:** One module changes: `:core:designsystem`. `EtalonColors` becomes a plain `object` of the §1.1 palette (light only, D6); `EtalonTheme` maps `MaterialTheme.colorScheme` onto it so stray M3 components inherit sensibly, and every Etalon component reads `EtalonColors` directly. Thirty-odd Lucide glyphs arrive as XML vector drawables behind an `EtalonIcons` object. `:core:ui`'s `Formatters.kt` moves to thin-space grouping and drops the trailing unit (D8).

The tree must compile at every task boundary while sixteen files still read the old `LocalEtalonColors` and thirty still read `EtalonType.mono*`. **Task 2 therefore creates `theme/LegacyTokens.kt`, a compatibility shim**: `EtalonExtendedColors`, `LocalEtalonColors` and the five `EtalonType.mono*` styles survive with their exact old names and types, but every value is now derived from the new tokens — `success` returns `EtalonColors.green`, `monoBody` returns the new `body` style on Plus Jakarta. Nothing in a feature module is edited to make phase 1 compile, and no new use of a shim symbol may be added by any task in this plan. The shim is deleted by the last task of phase 5, when the last screen that reads it has been redrawn; that deletion is not in scope here. Because the shim re-points the numeric styles onto Plus Jakarta at Task 3, Manrope and JetBrains Mono become unreferenced there and are deleted in Task 12 — after a grep proves it, never before.

Baselines: 45 Roborazzi PNGs exist across five feature modules and every one of them moves the moment the theme changes. **Task 2 re-records all 45 and commits them**, and each later task that moves pixels re-records again at its end, so `verifyRoborazziDebug` is green at every task boundary and the branch is never left red. Task 12 re-records the whole set once more as the phase's interim baseline; phases 2–5 re-record each screen again as they redraw it. The 15 `*_dark.png` baselines become byte-identical twins of their light siblings once `EtalonTheme` ignores `darkTheme` (D6) — they are kept, not deleted, because deleting them means editing feature test files, which phases 2–5 do anyway as each screen is rebuilt.

**Tech Stack:** Kotlin 2.4 / Compose BOM 2026.08.00 / Material3 with a custom theme / Roborazzi 1.73.0 + Robolectric 4.16.1 (JUnit 4 through the vintage engine, as `:feature:payments` does) / JUnit 5 for plain unit tests. compileSdk 37 / minSdk 36 via `AndroidConfig`. **No new dependency.** The font is one OFL `.ttf` resource, the icons are ISC XML drawables.

**Spec:** `docs/superpowers/specs/2026-09-10-android-restyle-design.md` (the owner's decisions D1–D10 — **wins over everything**), `docs/superpowers/specs/2026-09-10-etalon-mobile-design-system-v1.1.md` §1 tokens and §2 components (exact geometry), `docs/android/restyle-prototype/*.png` (rendered truth: `2a-token-sheet.png`, `2b-orders.png`, `2b-home.png`, `2b-order-detail.png`, `3a-calculator.png`).

**Base:** branch `feat/android-restyle`, head `793e9ba`.

---

## Phase split (this plan is the first of five)

| Phase | Scope | Depends on |
|---|---|---|
| **1 (this plan)** | Tokens, theme, fonts, Lucide icons, every component, the number format, the interim baseline re-record | — |
| 2 | Shell + nav wiring (5 cells, D3/D9), Home, Orders, Order detail | 1 |
| 3 | Payments queue, record payment, discrepancies, Clients, client detail/edit, Login, ChangePin | 1 |
| 4 | Calculator 3a — card, rate sheets, D10 relocations, keypad retirement, share image | 1 |
| 5 | The seven logistics screens; delete `LegacyTokens.kt`; drop `libs.compose.material.icons` | 1–4 |

### Explicitly out of scope for phase 1 — do not build these

- **Any screen.** No file under `feature/*/…/*Screen.kt`, `*Route.kt` or `*ViewModel.kt` is edited. If a task seems to need one, the plan is wrong — stop and ask.
- **Nav wiring.** `BottomNav` is built as a component with a data-class contract and a screenshot. `EtalonNavHost.kt`, `Destinations.kt` and the fifth cell (D3) are phase 2.
- **Swapping the 30 `Icons.Default.*` call sites.** Phase 1 *provides* `EtalonIcons`; each screen swaps its own glyphs when its phase redraws it. `libs.compose.material.icons` therefore stays in the build files until phase 5.
- **Dark mode** (D6), a Latin-script variant, `RateSheet`/`RateConfirm` (phase 4 builds them beside the calculator they belong to).

---

## Global Constraints

Copy these into your working notes before you touch anything. Each has cost this project a rebuild at least once.

- **Uzbek Cyrillic for every user-facing string; no string's content changes in this phase.** You may *add* a new string (the spec's short status labels: «Қабул», «Ишлаб чиқ.», «Йўлда»); you may never edit or translate an existing one. Resource names are module-prefixed — `ds_…` in `:core:designsystem`. **Resources merge by name across modules and the nearer-to-app module wins.** This has bitten the project three times.
- **No raw hex outside `EtalonColors.kt`.** No `Color(0x…)`, no `#RRGGBB` in a `.kt` file anywhere else. No Material default colours, no elevation overlays, **no dynamic colour**. Ripple is indigo 12 % on light surfaces and white 12 % on dark ones — nothing else.
- **Light only** (D6). `EtalonTheme` keeps its `darkTheme` parameter so 15 existing test call sites compile, and ignores it.
- **Touch targets ≥ 48 dp** (D7) on every interactive element, while the *visual* height stays what the designer's §2 says. A 36 dp icon button lives inside a 48 dp hit area; a 32 dp chip lives inside a 48 dp hit area.
- **Numbers (D8):** thousands grouped with a **narrow no-break space, U+202F** (ruling R5 — U+2009 THIN SPACE is line-break class BA, so a nine-digit figure breaks at a group boundary and, with `maxLines = 1`, loses its tail); money inside lists carries **no unit**; «UZS» appears only as the small prefix on a KPI/hero figure; `м²` keeps its decimal comma; counts keep «та». Route everything through `:core:ui`'s `Formatters.kt` — **never format inline**.
- **Money is `Money` over `BigDecimal`.** The formatters take `Money`, never `Double`/`Float`/`Long`.
- **No new dependency.** The font and the icons are resources. `OFL.txt` (font) and `LICENSE` (Lucide, ISC) are committed beside them.
- **Nothing functional changes.** No ViewModel, repository, engine, outbox, Room schema, API or permission edit. Renaming a kept component is not allowed either — every public signature in `:core:designsystem` that a feature module calls today keeps working, or the task is wrong.
- **Verification per task:** from `android/`, with `JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"`, run `.\gradlew.bat testDebugUnitTest verifyRoborazziDebug assembleDebug --no-daemon --rerun-tasks`. **`verifyRoborazziDebug` is not optional** — `testDebugUnitTest` alone records nothing and compares nothing. **`--rerun-tasks` is not optional either**: proven in Task 12, a warm `verifyRoborazziDebug` is UP-TO-DATE and compares *nothing* — it printed green with a baseline deleted — and the hex lint only re-runs when its inputs change. The cost is real (about 3 min cold against 12 s of doing nothing) and it is the price of the run meaning anything. When a task legitimately moves pixels, run `.\gradlew.bat recordRoborazziDebug --no-daemon --rerun-tasks` first, **eyeball every changed PNG against the prototype capture**, then verify, then commit the PNGs with the code.
- **Never `git stash`** — the stash stack is shared with other sessions.
- Commit trailer on every commit: `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

### The palette — verbatim §1.1, the only place these numbers may appear

| token | hex | token | hex |
|---|---|---|---|
| page | `#F8F8FA` | ink | `#0F0F17` |
| surface | `#FFFFFF` | ink2 | `#5D5F70` |
| surfaceBorder | `#ECEBF3` | ink3 | `#A7A6AE` |
| navy | `#1B2033` | green | `#22B07D` |
| navy2 | `#262B40` | greenBg | `#E6F7F0` |
| indigo | `#5646EE` | red | `#E5484D` |
| indigoPressed | `#4A3AD9` | redBg | `#FDECEC` |
| indigoPanel | `#625BB8` | onDark | `#FFFFFF` |
| indigoTile | `#7770CC` | onDarkMuted | white 72 % |
| indigoTint | `#8A82F1` | onDarkDivider | white 18 % |
| lavender | `#C2BCFF` | debtOnDark | `#FF8A8E` |
| lavenderBg | `#EDEBFF` | paidOnDark | `#5CD6A6` |

Avatar palette, indexed by `name.sumOf { it.code } % 7`: `#5646EE #8A82F1 #625BB8 #E5BBAD #22B07D #7770CC #F0A868`.

### The type scale — verbatim §1.2, Plus Jakarta Sans

`displayTitle` 28/800 −0.02em · `headline` 22/800 −0.01em · `kpi` 24/700 −0.02em (unit prefix 14/500 at 50 %) · `amountLg` 30/800 −0.02em · `titleSm` 16/800 −0.01em · `sectionTitle` 14/700 · `body` 13/500 · `rowTitle` 13/700 · `rowAmount` 13/700 · `label` 12/600 · `meta` 11/400 · `tag` 10/600 (10.5 on panels) · `caption` 10/600. `tnum` on every style.

### Shape, spacing, elevation — verbatim §1.3–§1.5

Radii: xs 6 · sm 8 · md 10 · lg 12 · xl 16 · xxl 18 · sheet 22 · pill 50 %. Nesting: navy(22, pad 10) → indigoPanel(18, pad 16/14) → tile(12, pad 10/12).
Spacing: 4-pt grid; header margin 20; card margin 16; card padding 14×16; row padding 9–10 vertical / 8 horizontal, gap 10; section gap 12–16; bottom content padding 100 under the floating nav, 150–170 above a sticky bar.
Elevation: flat with hairlines. Shadows only on the primary button `0 6 16 rgba(86,70,238,.30)`, the floating nav `0 10 30 rgba(27,32,51,.28)`, and toast / confirm sheet `0 12 32 rgba(27,32,51,.30)`.

---

## File structure

**`:core:designsystem`** — `core/designsystem/`

- `build.gradle.kts` — modify (roborazzi plugin + test deps, Task 2).
- `src/main/res/font/plusjakartasans.ttf` — new (Task 3); `manrope_*.ttf`, `jetbrainsmono_*.ttf` — deleted (Task 12).
- `src/main/assets/font/OFL.txt`, `src/main/assets/icon/LICENSE-lucide.txt` — new licence files.
- `src/main/res/drawable/ic_lu_*.xml` — 36 new vector drawables (Task 5).
- `src/main/res/values/strings.xml` — modify (three `ds_status_*_short`, a few `ds_cd_*` content descriptions).
- `src/main/kotlin/uz/etalon/crm/core/designsystem/theme/`
  - `EtalonColors.kt` — **rewritten** (Task 1). The only file in the repo allowed to contain a colour literal.
  - `EtalonDimens.kt` — new (Task 1): `EtalonShapes`, `EtalonSpace`, `EtalonElevation`, `Modifier.etalonShadow`.
  - `EtalonTheme.kt` — rewritten (Task 2).
  - `EtalonTypography.kt` — rewritten (Task 3).
  - `LegacyTokens.kt` — new (Task 2), deleted in phase 5.
- `src/main/kotlin/uz/etalon/crm/core/designsystem/icon/EtalonIcons.kt` — new (Task 5).
- `src/main/kotlin/uz/etalon/crm/core/designsystem/components/`
  - new: `Avatar.kt`, `StatusTag.kt`, `MonthHeader.kt`, `SearchField.kt`, `EtalonFilterChip.kt`, `SegmentedControl.kt`, `KpiCard.kt`, `ProgressCard.kt`, `StepTimeline.kt`, `OrderRow.kt`, `NavySheet.kt`, `DetailPanel.kt`, `FormCard.kt`, `ConfirmSheet.kt`, `Toast.kt`, `BottomNav.kt`.
  - rewritten: `EtalonButtons.kt` (+ `EtalonIconButton`), `StatusChip.kt` (becomes shims over `StatusTag`), `MoneyText.kt`.
  - restyled in place: `CountStepper.kt`, `CustodyChain.kt`, `DriverPicker.kt`, `EmptyState.kt`, `ErrorBanner.kt`, `Lightbox.kt`, `NoticeBanner.kt`, `NumericKeypadSheet.kt`, `OutboxBanner.kt`, `PhotoStrip.kt`, `RegionPicker.kt`, `SectionLabel.kt`, `StatusStripeCard.kt`, `StickyActionBar.kt`.
- `src/test/kotlin/uz/etalon/crm/core/designsystem/` — new: `AvatarPaletteTest.kt`, `NoRawHexTest.kt`, `IconRenderTest.kt`, `TokenSheetScreenshotTest.kt`, and one `*ScreenshotTest.kt` per component task.
- `screenshots/` — new directory, one `ds_*_light.png` per component.

**`:core:ui`** — `core/ui/src/main/kotlin/uz/etalon/crm/core/ui/format/Formatters.kt` and its test (Task 4).

**Baselines re-recorded (not authored):** `feature/{auth,calculator,logistics,orders,payments}/screenshots/*.png` — 45 files.

**Not touched by any task in this plan:** everything else.

---

## Task 1: the palette, the shapes, the spacing and the shadows

**Files:** rewrite `core/designsystem/src/main/kotlin/uz/etalon/crm/core/designsystem/theme/EtalonColors.kt`; create `.../theme/EtalonDimens.kt`; create `core/designsystem/src/test/kotlin/uz/etalon/crm/core/designsystem/AvatarPaletteTest.kt`.

**Interfaces consumed:** nothing but Compose.
**Interfaces produced:**

```kotlin
object EtalonColors {                       // uz.etalon.crm.core.designsystem.theme
    val page: Color; val surface: Color; val surfaceBorder: Color
    val navy: Color; val navy2: Color
    val indigo: Color; val indigoPressed: Color; val indigoPanel: Color; val indigoTile: Color; val indigoTint: Color
    val lavender: Color; val lavenderBg: Color
    val ink: Color; val ink2: Color; val ink3: Color
    val green: Color; val greenBg: Color; val red: Color; val redBg: Color
    val onDark: Color; val onDarkMuted: Color; val onDarkDivider: Color
    val debtOnDark: Color; val paidOnDark: Color
    val avatarPalette: List<Color>
    fun avatarColor(name: String): Color
}
object EtalonShapes {                       // uz.etalon.crm.core.designsystem.theme
    val xs: RoundedCornerShape; val sm: …; val md: …; val lg: …; val xl: …; val xxl: …
    val sheet: RoundedCornerShape; val sheetTop: RoundedCornerShape; val pill: RoundedCornerShape
    val material: Shapes                    // handed to MaterialTheme in Task 2
}
object EtalonSpace { val xs; sm; md; lg; xl: Dp; val cardPadV; cardPadH; rowPadV; rowPadH; rowGap: Dp
                     val underNav: Dp; val underStickyBar: Dp; val hairline: Dp }
object EtalonElevation { val primaryButton; val floatingNav; val overlay: Dp }
fun Modifier.etalonShadow(elevation: Dp, shape: Shape, color: Color): Modifier
```

- [ ] **Step 1: Write the new `EtalonColors.kt`.** Replace the whole file — the old `EtalonExtendedColors`, `LocalEtalonColors`, `LightColorScheme`, `DarkColorScheme`, `LightExtended`, `DarkExtended` all move to `LegacyTokens.kt` in Task 2, so this file ends up holding nothing but values.

```kotlin
package uz.etalon.crm.core.designsystem.theme

import androidx.compose.ui.graphics.Color

/**
 * Etalon Mobile §1.1, light only (design decision D6). **This is the only file in the repo that
 * may contain a colour literal** — `NoRawHexTest` fails the build otherwise. Every component reads
 * these directly; `MaterialTheme.colorScheme` is mapped onto them in [EtalonTheme] only so that a
 * stray M3 component inherits something sensible.
 */
object EtalonColors {
    val page = Color(0xFFF8F8FA)
    val surface = Color(0xFFFFFFFF)
    /** 1 dp hairline on every white surface — the system has no card shadows. */
    val surfaceBorder = Color(0xFFECEBF3)

    val navy = Color(0xFF1B2033)
    val navy2 = Color(0xFF262B40)

    val indigo = Color(0xFF5646EE)
    val indigoPressed = Color(0xFF4A3AD9)
    val indigoPanel = Color(0xFF625BB8)
    val indigoTile = Color(0xFF7770CC)
    val indigoTint = Color(0xFF8A82F1)

    val lavender = Color(0xFFC2BCFF)
    val lavenderBg = Color(0xFFEDEBFF)

    val ink = Color(0xFF0F0F17)
    val ink2 = Color(0xFF5D5F70)
    val ink3 = Color(0xFFA7A6AE)

    val green = Color(0xFF22B07D)
    val greenBg = Color(0xFFE6F7F0)
    val red = Color(0xFFE5484D)
    val redBg = Color(0xFFFDECEC)

    val onDark = Color(0xFFFFFFFF)
    val onDarkMuted = Color(0xFFFFFFFF).copy(alpha = 0.72f)
    val onDarkDivider = Color(0xFFFFFFFF).copy(alpha = 0.18f)
    /** Debt and "paid" on a navy row read at a different weight than on white. */
    val debtOnDark = Color(0xFFFF8A8E)
    val paidOnDark = Color(0xFF5CD6A6)

    /** Seven avatar fills, §1.1. Index is deterministic per client name — see [avatarColor]. */
    val avatarPalette = listOf(
        Color(0xFF5646EE), Color(0xFF8A82F1), Color(0xFF625BB8), Color(0xFFE5BBAD),
        Color(0xFF22B07D), Color(0xFF7770CC), Color(0xFFF0A868),
    )

    /**
     * The prototype's rule, verbatim: sum of char codes mod 7. It must stay exactly this — the
     * same client has to keep the same colour on the phone, in the share image and in whatever
     * renders next, and any "better" hash silently repaints every avatar in the app.
     * Char codes are non-negative, so the remainder is too.
     */
    fun avatarColor(name: String): Color = avatarPalette[name.sumOf { it.code } % avatarPalette.size]
}
```

- [ ] **Step 2: Create `EtalonDimens.kt`** — shapes (§1.3), spacing (§1.4) and the three shadows (§1.5).

```kotlin
package uz.etalon.crm.core.designsystem.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/** §1.3. Nesting rule: navy(sheet, pad 10) → indigoPanel(xxl, pad 16/14) → tile(lg, pad 10/12). */
object EtalonShapes {
    val xs = RoundedCornerShape(6.dp)      // status tags in rows
    val sm = RoundedCornerShape(8.dp)      // 22 dp tinted icon squares, chips on a panel
    val md = RoundedCornerShape(10.dp)     // square icon buttons, form inputs
    val lg = RoundedCornerShape(12.dp)     // tiles inside panels, row highlight
    val xl = RoundedCornerShape(16.dp)     // white cards, KPI cards
    val xxl = RoundedCornerShape(18.dp)    // indigoPanel inside navy
    val sheet = RoundedCornerShape(22.dp)  // navy sheets and outer panels
    /** A list sheet that runs to the bottom edge rounds its top corners only. */
    val sheetTop = RoundedCornerShape(topStart = 22.dp, topEnd = 22.dp)
    val pill = RoundedCornerShape(percent = 50)
    val toast = RoundedCornerShape(14.dp)

    /** What [uz.etalon.crm.core.designsystem.theme.EtalonTheme] hands to MaterialTheme. */
    val material = Shapes(extraSmall = xs, small = sm, medium = md, large = lg, extraLarge = xl)
}

/** §1.4, a 4-pt grid. Names are roles, not sizes, wherever the spec gives a role. */
object EtalonSpace {
    val xs = 4.dp; val sm = 8.dp; val md = 12.dp; val lg = 16.dp; val xl = 20.dp
    /** Screen horizontal margin: 20 for headers, 16 for cards and sheets. */
    val headerMargin = 20.dp; val cardMargin = 16.dp
    val cardPadV = 14.dp; val cardPadH = 16.dp
    val rowPadV = 10.dp; val rowPadH = 8.dp; val rowGap = 10.dp
    val hairline = 1.dp
    /** Content padding under the floating nav, and under a sticky action bar as well. */
    val underNav = 100.dp; val underStickyBar = 160.dp
    /** D7: visual size may be smaller, the hit area may not. */
    val minTouch = 48.dp
}

/**
 * §1.5 — the system is flat: hairline borders, not shadows. These three are the only exceptions,
 * and the dp values are Compose's nearest reading of the designer's CSS blurs
 * (`0 6 16 rgba(86,70,238,.30)`, `0 10 30 rgba(27,32,51,.28)`, `0 12 32 rgba(27,32,51,.30)`).
 */
object EtalonElevation {
    val primaryButton = 8.dp
    val floatingNav = 16.dp
    val overlay = 20.dp
}

/**
 * Compose derives shadow alpha from the elevation, so the designer's `.28`–`.30` arrives as the
 * spot/ambient colour rather than a literal alpha. Always pass the shape — a shadow drawn on the
 * wrong outline is the one bug that survives every screenshot review at thumbnail size.
 */
fun Modifier.etalonShadow(elevation: Dp, shape: Shape, color: Color): Modifier =
    shadow(elevation = elevation, shape = shape, ambientColor = color, spotColor = color)
```

- [ ] **Step 3: Pin the avatar hash with a test.** `core/designsystem/src/test/kotlin/uz/etalon/crm/core/designsystem/AvatarPaletteTest.kt` — JUnit 5, no Robolectric.

```kotlin
package uz.etalon.crm.core.designsystem

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import uz.etalon.crm.core.designsystem.theme.EtalonColors

class AvatarPaletteTest {
    @Test fun `the palette is the seven colours of the spec, in order`() {
        assertEquals(7, EtalonColors.avatarPalette.size)
        assertEquals(EtalonColors.indigo, EtalonColors.avatarPalette[0])
        assertEquals(EtalonColors.indigoTint, EtalonColors.avatarPalette[1])
        assertEquals(EtalonColors.indigoPanel, EtalonColors.avatarPalette[2])
        assertEquals(EtalonColors.green, EtalonColors.avatarPalette[4])
        assertEquals(EtalonColors.indigoTile, EtalonColors.avatarPalette[5])
    }

    @Test fun `a client keeps the same colour whatever renders it`() {
        // Sum of char codes mod 7 — recomputed here by hand so a "better" hash cannot slip in.
        val name = "Yusupov & Sons"
        val expected = EtalonColors.avatarPalette[name.sumOf { it.code } % 7]
        assertEquals(expected, EtalonColors.avatarColor(name))
        assertEquals(EtalonColors.avatarColor(name), EtalonColors.avatarColor(name))
    }

    @Test fun `Cyrillic names index inside the palette too`() {
        // Cyrillic code points are far above ASCII; the modulo must still land in range.
        listOf("Раҳимов Аброр", "Каримов", "Тошкент Tower LLC", "", "  ").forEach {
            assertTrue(EtalonColors.avatarPalette.contains(EtalonColors.avatarColor(it)))
        }
    }
}
```

- [ ] **Step 4: Verify.** The tree does **not** compile yet — `EtalonTheme.kt` and 16 feature files still reference `LightColorScheme`/`LocalEtalonColors`, which this task deleted. That is expected and it is why Task 2 is the next commit and not a later one. Run `.\gradlew.bat :core:designsystem:compileDebugKotlin --no-daemon` only to confirm the two new files are syntactically sound, then go straight to Task 2 and commit the two tasks' work **together** as one commit, `Feat(android) · the Etalon Mobile palette, shapes and spacing`. **Do not commit a non-compiling tree on its own.**

---

## Task 2: the theme, the compatibility shim, and the first full re-record

**Files:** rewrite `core/designsystem/src/main/kotlin/uz/etalon/crm/core/designsystem/theme/EtalonTheme.kt`; create `.../theme/LegacyTokens.kt`; modify `core/designsystem/build.gradle.kts`; re-record `feature/{auth,calculator,logistics,orders,payments}/screenshots/*.png` (45 files).

**Interfaces consumed:** `EtalonColors`, `EtalonShapes` (Task 1).
**Interfaces produced:**

```kotlin
@Composable fun EtalonTheme(darkTheme: Boolean = false, content: @Composable () -> Unit)   // param ignored (D6)
@Composable fun etalonRipple(onDark: Boolean = false): Indication                          // indigo 12% / white 12%
// shim, LegacyTokens.kt — deleted in phase 5, no new use allowed:
@Deprecated data class EtalonExtendedColors(…15 fields, unchanged names…)
@Deprecated val LocalEtalonColors: ProvidableCompositionLocal<EtalonExtendedColors>
```

- [ ] **Step 1: Write the shim, `theme/LegacyTokens.kt`.** Same names, same types, new values. Nothing here holds a colour literal — every field forwards to a token.

```kotlin
package uz.etalon.crm.core.designsystem.theme

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/**
 * **Temporary.** Sixteen feature files still read `LocalEtalonColors` and thirty read
 * `EtalonType.mono*`; they are restyled one screen at a time in phases 2–5, and this file is what
 * keeps the tree compiling in between. Every field is now a view onto [EtalonColors], so a screen
 * that has not been redrawn yet is already wearing the new palette.
 *
 * **Do not add a new use of anything in this file.** The last task of phase 5 deletes it, and that
 * deletion must be a pure removal — if it turns into a refactor, this rule was broken.
 */
@Deprecated("Restyle the caller onto EtalonColors; this shim is deleted at the end of phase 5.")
@Immutable
data class EtalonExtendedColors(
    val success: Color, val warning: Color, val gold: Color, val danger: Color,
    val border: Color, val borderStrong: Color, val textTertiary: Color, val surfaceHover: Color,
    val paper: Color, val ink: Color, val paperSurface: Color, val paperLine: Color, val paperMuted: Color,
    val accentGreen: Color, val terracotta: Color,
)

/**
 * The old tone vocabulary mapped onto the new palette, following design §5.1's status semantics:
 * paid/positive → green, in-production and partial → the indigo family, dispatched → indigo,
 * rejected/overdue → red, and every neutral surface value → its §1.1 equivalent.
 */
@Suppress("DEPRECATION")
internal val LegacyExtended = EtalonExtendedColors(
    success = EtalonColors.green,
    warning = EtalonColors.indigo,
    gold = EtalonColors.indigo,
    danger = EtalonColors.red,
    border = EtalonColors.surfaceBorder,
    borderStrong = EtalonColors.surfaceBorder,
    textTertiary = EtalonColors.ink3,
    surfaceHover = EtalonColors.lavenderBg,
    paper = EtalonColors.page,
    ink = EtalonColors.ink,
    paperSurface = EtalonColors.surface,
    paperLine = EtalonColors.surfaceBorder,
    paperMuted = EtalonColors.ink2,
    accentGreen = EtalonColors.green,
    terracotta = EtalonColors.red,
)

@Suppress("DEPRECATION")
@Deprecated("Read EtalonColors directly; this composition local is deleted at the end of phase 5.")
val LocalEtalonColors = staticCompositionLocalOf { LegacyExtended }
```

- [ ] **Step 2: Rewrite `EtalonTheme.kt`.** One light scheme, mapped onto the tokens; dynamic colour is not imported, let alone called; the ripple is provided once for the whole tree.

```kotlin
package uz.etalon.crm.core.designsystem.theme

import androidx.compose.foundation.Indication
import androidx.compose.foundation.LocalIndication
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.material3.ripple
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider

/**
 * §1.1 mapped onto M3 so that any Material component we have not replaced yet inherits something
 * sensible. Etalon components do **not** read this — they read [EtalonColors] directly.
 * Dynamic colour is deliberately absent: the brand is fixed and the owner signed off these exact
 * hexes. Elevation overlays never appear because every surface here is the same white.
 */
private val EtalonColorScheme: ColorScheme = lightColorScheme(
    primary = EtalonColors.indigo, onPrimary = EtalonColors.onDark,
    primaryContainer = EtalonColors.lavenderBg, onPrimaryContainer = EtalonColors.indigo,
    secondary = EtalonColors.indigoPanel, onSecondary = EtalonColors.onDark,
    background = EtalonColors.page, onBackground = EtalonColors.ink,
    surface = EtalonColors.surface, onSurface = EtalonColors.ink,
    surfaceVariant = EtalonColors.lavenderBg, onSurfaceVariant = EtalonColors.ink2,
    surfaceContainer = EtalonColors.surface, surfaceContainerHigh = EtalonColors.surface,
    surfaceContainerHighest = EtalonColors.surface, surfaceContainerLow = EtalonColors.page,
    outline = EtalonColors.surfaceBorder, outlineVariant = EtalonColors.surfaceBorder,
    error = EtalonColors.red, onError = EtalonColors.onDark,
    errorContainer = EtalonColors.redBg, onErrorContainer = EtalonColors.red,
    scrim = EtalonColors.navy,
)

/** §5: indigo 12 % on light, white 12 % on dark. 12 % is M3's own pressed alpha, so passing the
 *  colour is the whole configuration. Components sitting on navy or indigoPanel pass `onDark = true`. */
@Composable
fun etalonRipple(onDark: Boolean = false): Indication =
    ripple(color = if (onDark) EtalonColors.onDark else EtalonColors.indigo)

/**
 * @param darkTheme accepted and **ignored** — the restyle is light only (design decision D6).
 * The parameter survives because fifteen screenshot tests still pass it; phases 2–5 drop those
 * call sites as they redraw each screen.
 */
@Composable
@Suppress("UNUSED_PARAMETER", "DEPRECATION")
fun EtalonTheme(darkTheme: Boolean = false, content: @Composable () -> Unit) {
    CompositionLocalProvider(
        LocalEtalonColors provides LegacyExtended,
        LocalIndication provides etalonRipple(),
    ) {
        MaterialTheme(
            colorScheme = EtalonColorScheme,
            typography = EtalonTypography,
            shapes = EtalonShapes.material,
            content = content,
        )
    }
}
```

- [ ] **Step 3: Give `:core:designsystem` a screenshot harness.** Every later task adds a component screenshot, so wire Roborazzi now, copying `:feature:payments`'s block verbatim. In `core/designsystem/build.gradle.kts`:

```kotlin
plugins { id("etalon.android.library"); id("etalon.android.compose"); alias(libs.plugins.roborazzi) }
android { namespace = "uz.etalon.crm.core.designsystem" }
dependencies {
    implementation(project(":core:model"))
    implementation(project(":core:ui"))
    implementation(libs.compose.material.icons)
    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    // Component baselines live beside the components (see core/designsystem/screenshots/), so the
    // reviewer can reject one part without opening a screen. JUnit 4 via the vintage engine, the
    // same shape :feature:payments uses.
    testImplementation(libs.roborazzi)
    testImplementation(libs.roborazzi.compose)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    testRuntimeOnly(libs.junit.vintage.engine)
}
```

- [ ] **Step 4: Compile the whole tree.** `.\gradlew.bat assembleDebug --no-daemon`. Every module must build. If a feature file fails on a name this task did not preserve, **restore the name in the shim** — do not edit the feature file.

- [ ] **Step 5: Re-record all 45 baselines.** `.\gradlew.bat recordRoborazziDebug --no-daemon`, then `git status --short` — expect exactly 45 modified PNGs and no new ones. Open `feature/orders/screenshots/order_card_light.png` and `feature/payments/screenshots/record_sheet_light.png` and confirm the page is now `#F8F8FA`, cards are white with a hairline, and the primary button is indigo. Every `*_dark.png` is now identical to its `*_light.png` sibling — that is D6, not a bug.

- [ ] **Step 6: Verify and commit Tasks 1+2 together.** `.\gradlew.bat testDebugUnitTest verifyRoborazziDebug assembleDebug --no-daemon`. Commit with subject `Feat(android) · the Etalon Mobile palette, shapes and spacing` and the trailer.
---

## Task 3: Plus Jakarta Sans and the §1.2 type scale

**Files:** add `core/designsystem/src/main/res/font/plusjakartasans.ttf` and `core/designsystem/src/main/assets/font/OFL.txt`; rewrite `core/designsystem/src/main/kotlin/uz/etalon/crm/core/designsystem/theme/EtalonTypography.kt`; re-record 45 baselines.

**Interfaces consumed:** `EtalonColors` (Task 1).
**Interfaces produced:**

```kotlin
val PlusJakarta: FontFamily
object EtalonType {                                   // every style carries fontFeatureSettings = "tnum"
    val displayTitle; val headline; val kpi; val kpiUnit; val amountLg; val titleSm
    val sectionTitle; val body; val rowTitle; val rowAmount; val label; val meta
    val tag; val tagPanel; val caption: TextStyle
    // shim, deleted in phase 5:
    @Deprecated val mono; val monoLabel; val monoBody; val monoTitle; val monoDisplay: TextStyle
}
val EtalonTypography: Typography                      // M3 slots, all on PlusJakarta
```

- [ ] **Step 1: Fetch the font and its licence.** From `android/core/designsystem/src/main/res/font/`:

```
curl -sSL -o plusjakartasans.ttf "https://raw.githubusercontent.com/google/fonts/main/ofl/plusjakartasans/PlusJakartaSans%5Bwght%5D.ttf"
curl -sSL -o OFL.txt "https://raw.githubusercontent.com/google/fonts/main/ofl/plusjakartasans/OFL.txt"
```

This is the **variable** face — one 176 KB file covering weight 200–800, which is why the bundle shrinks even while gaining three weights. Confirm the size is ~176 KB and that `OFL.txt` opens with "Copyright 2020 The Plus Jakarta Sans Project Authors". Android resource names forbid the `[wght]` in the upstream filename, hence the rename. `OFL.txt` sits in `res/font/` deliberately: it travels with the file it licenses, and aapt ignores a `.txt` there.

- [ ] **Step 2: Rewrite `EtalonTypography.kt`.** Five weights instantiated out of the one variable file, and the whole §1.2 scale on top.

```kotlin
package uz.etalon.crm.core.designsystem.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import uz.etalon.crm.core.designsystem.R

private fun pj(weight: Int) = Font(
    resId = R.font.plusjakartasans,
    weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
)

/** §1.2 — 400/500/600/700/800 cut from the one variable file (OFL, see assets/font/OFL.txt). */
val PlusJakarta = FontFamily(pj(400), pj(500), pj(600), pj(700), pj(800))

/**
 * `tnum` on every style, not only the numeric ones: it costs nothing on Cyrillic glyphs and it
 * removes the whole class of bug where a figure jiggles because it happens to be rendered by a
 * style somebody forgot to mark. Design decision D8 makes tabular figures the default everywhere.
 */
private val Base = TextStyle(fontFamily = PlusJakarta, fontFeatureSettings = "tnum")

object EtalonType {
    val displayTitle = Base.copy(fontSize = 28.sp, fontWeight = FontWeight.W800, letterSpacing = (-0.02).em)
    val headline = Base.copy(fontSize = 22.sp, fontWeight = FontWeight.W800, letterSpacing = (-0.01).em)
    val kpi = Base.copy(fontSize = 24.sp, fontWeight = FontWeight.W700, letterSpacing = (-0.02).em)
    /** The «UZS» in front of a KPI figure: 14/500 at 50 % opacity — the opacity is applied by the
     *  component, not baked in, so the same style works on light and on navy. */
    val kpiUnit = Base.copy(fontSize = 14.sp, fontWeight = FontWeight.W500)
    val amountLg = Base.copy(fontSize = 30.sp, fontWeight = FontWeight.W800, letterSpacing = (-0.02).em)
    val titleSm = Base.copy(fontSize = 16.sp, fontWeight = FontWeight.W800, letterSpacing = (-0.01).em)
    val sectionTitle = Base.copy(fontSize = 14.sp, fontWeight = FontWeight.W700)
    val body = Base.copy(fontSize = 13.sp, fontWeight = FontWeight.W500)
    val rowTitle = Base.copy(fontSize = 13.sp, fontWeight = FontWeight.W700)
    val rowAmount = Base.copy(fontSize = 13.sp, fontWeight = FontWeight.W700)
    val label = Base.copy(fontSize = 12.sp, fontWeight = FontWeight.W600)
    val meta = Base.copy(fontSize = 11.sp, fontWeight = FontWeight.W400)
    val tag = Base.copy(fontSize = 10.sp, fontWeight = FontWeight.W600)
    /** §2: a tag sitting on an indigo panel is set half a point larger. */
    val tagPanel = Base.copy(fontSize = 10.5.sp, fontWeight = FontWeight.W600)
    val caption = Base.copy(fontSize = 10.sp, fontWeight = FontWeight.W600)

    // ── Shim. Thirty files still name these; phases 2–5 move them onto the scale above and the
    // last task of phase 5 deletes the five lines. Re-pointing them here is what makes Manrope
    // and JetBrains Mono unreferenced, so Task 12 can delete the seven old font files. ─────────
    @Deprecated("Use EtalonType.body", ReplaceWith("body")) val mono = body
    @Deprecated("Use EtalonType.label", ReplaceWith("label")) val monoLabel = label
    @Deprecated("Use EtalonType.body", ReplaceWith("body")) val monoBody = body
    @Deprecated("Use EtalonType.headline", ReplaceWith("headline")) val monoTitle = headline
    @Deprecated("Use EtalonType.amountLg", ReplaceWith("amountLg")) val monoDisplay = amountLg
}

/** M3 slots, so a Material component we have not replaced yet is at least on the right face. */
val EtalonTypography = Typography(
    headlineLarge = EtalonType.displayTitle,
    headlineMedium = EtalonType.headline,
    titleLarge = EtalonType.titleSm,
    titleMedium = EtalonType.sectionTitle,
    titleSmall = EtalonType.label,
    bodyLarge = EtalonType.body,
    bodyMedium = EtalonType.body,
    bodySmall = EtalonType.meta,
    labelLarge = EtalonType.rowTitle,
    labelMedium = EtalonType.label,
    labelSmall = EtalonType.caption,
)
```

- [ ] **Step 3: Prove the five weights are actually different.** A variable font that fails to apply its axis renders every weight as Regular, and a screenshot review will not catch it reliably at 10 sp. Create `core/designsystem/src/test/kotlin/uz/etalon/crm/core/designsystem/FontWeightTest.kt`:

```kotlin
package uz.etalon.crm.core.designsystem

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import uz.etalon.crm.core.designsystem.theme.EtalonTheme
import uz.etalon.crm.core.designsystem.theme.EtalonType

/** The variable axis either applies or the whole app silently renders at weight 400. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36])
class FontWeightTest {
    @get:Rule val rule = createComposeRule()

    @Test fun `800 is measurably wider than 400 at the same size`() {
        rule.setContent {
            EtalonTheme {
                Column {
                    Text("Буюртмалар", style = EtalonType.meta, modifier = androidx.compose.ui.Modifier.testTag("w400"))
                    Text("Буюртмалар", style = EtalonType.meta.copy(fontWeight = androidx.compose.ui.text.font.FontWeight.W800), modifier = androidx.compose.ui.Modifier.testTag("w800"))
                }
            }
        }
        val light = rule.onNodeWithTag("w400").fetchSemanticsNode().size.width
        val heavy = rule.onNodeWithTag("w800").fetchSemanticsNode().size.width
        assertTrue("weight axis did not apply: $light vs $heavy", heavy > light)
    }
}
```

**If this test fails**, the axis is not being applied under Robolectric and the fallback is static faces — do not improvise. Delete `plusjakartasans.ttf`, fetch the five statics from the upstream OFL project into the same directory, and change `pj()` to a plain `Font(resId, weight)` over the five resources:

```
curl -sSL -o plusjakartasans_regular.ttf   "https://raw.githubusercontent.com/tokotype/PlusJakartaSans/master/fonts/ttf/PlusJakartaSans-Regular.ttf"
curl -sSL -o plusjakartasans_medium.ttf    "https://raw.githubusercontent.com/tokotype/PlusJakartaSans/master/fonts/ttf/PlusJakartaSans-Medium.ttf"
curl -sSL -o plusjakartasans_semibold.ttf  "https://raw.githubusercontent.com/tokotype/PlusJakartaSans/master/fonts/ttf/PlusJakartaSans-SemiBold.ttf"
curl -sSL -o plusjakartasans_bold.ttf      "https://raw.githubusercontent.com/tokotype/PlusJakartaSans/master/fonts/ttf/PlusJakartaSans-Bold.ttf"
curl -sSL -o plusjakartasans_extrabold.ttf "https://raw.githubusercontent.com/tokotype/PlusJakartaSans/master/fonts/ttf/PlusJakartaSans-ExtraBold.ttf"
```

Same project, same OFL, ~129 KB each. Keep `OFL.txt`. Note the swap in the commit message so the next reader knows why five files sit there instead of one.

- [ ] **Step 4: Re-record and eyeball.** `.\gradlew.bat recordRoborazziDebug --no-daemon`. Every one of the 45 moves — Plus Jakarta's metrics differ from Manrope's and the numbers are no longer monospaced. Open `feature/orders/screenshots/order_card_light.png` and check against `docs/android/restyle-prototype/2b-orders.png`: the client name should read as a heavy 13 sp, the amount right-aligned and still column-aligned across rows.

- [ ] **Step 5: Verify and commit.** `.\gradlew.bat testDebugUnitTest verifyRoborazziDebug assembleDebug --no-daemon`. Subject: `Feat(android) · Plus Jakarta Sans and the §1.2 type scale`.

---

## Task 4: numbers — thin space, no unit in lists, «UZS» only on heroes (D8)

**Files:** modify `core/ui/src/main/kotlin/uz/etalon/crm/core/ui/format/Formatters.kt` and `core/ui/src/test/kotlin/uz/etalon/crm/core/ui/format/FormattersTest.kt`; rewrite `core/designsystem/src/main/kotlin/uz/etalon/crm/core/designsystem/components/MoneyText.kt`; re-record 45 baselines.

**Interfaces consumed:** `Money` (`:core:model`), `EtalonType`, `EtalonColors`.
**Interfaces produced:**

```kotlin
// :core:ui — plain Kotlin, the module has no Compose dependency and must not gain one
const val MONEY_UNIT: String = "UZS"
fun formatMoney(m: Money): String        // "542 200 000"        — thin spaces, NO unit
fun formatMoneyHero(m: Money): String    // "UZS 542 200 000"    — unit + thin space + figure
fun formatArea(m2: BigDecimal): String   // "78,7 м²"
fun formatCount(n: Int): String          // "12 та"
fun formatMeters(v: Double, decimals: Int = 2): String
fun formatWeightKg(kg: Double): String
fun formatPercent(v: BigDecimal, decimals: Int = 2): String
// unchanged: formatDecimal, formatPhone, formatDate, formatDateTime, formatScheduleDate, formatAddressLine
// :core:designsystem
@Composable fun MoneyText(money: Money, modifier: Modifier = Modifier, style: TextStyle = EtalonType.rowAmount, color: Color = EtalonColors.ink)
@Composable fun MoneyHeroText(money: Money, modifier: Modifier = Modifier, style: TextStyle = EtalonType.kpi, color: Color = EtalonColors.ink, onDark: Boolean = false)
@Composable fun AreaText(m2: BigDecimal, …)   // signature unchanged
@Composable fun CountText(n: Int, …)          // signature unchanged
```

- [ ] **Step 1: Change the separator and drop the suffix.** In `Formatters.kt`, replace the `NBSP` constant and `formatMoney`, and add the hero form. Leave every other function's body alone — they all group through `groupThousands`, so they inherit the new separator for free.

```kotlin
// U+2009 THIN SPACE. **Type it as the Kotlin escape** (backslash-u-2-0-0-9), never as the literal
// character — it is invisible in a diff and the next reader cannot tell it from a plain space.
// Design decision D8 replaced the old U+00A0: at 10–13 sp a full space between groups reads as
// two separate numbers on a phone row, and the prototype the owner signed off uses the thin one.
// It is still unbreakable in practice — Compose does not break inside a run of digits and spaces
// of this width — so a nine-digit total cannot wrap mid-number.
private const val THIN = ' '

private fun groupThousands(whole: String): String {
    val neg = whole.startsWith("-")
    val digits = whole.trimStart('-')
    val sb = StringBuilder()
    digits.reversed().forEachIndexed { i, c -> if (i > 0 && i % 3 == 0) sb.append(THIN); sb.append(c) }
    return (if (neg) "-" else "") + sb.reverse()
}

/** The currency, for the one place it is written: a hero figure. */
const val MONEY_UNIT = "UZS"

/**
 * Money as it appears in a list, a row or a total: grouped digits and **nothing else** (D8).
 * The unit is dropped because every figure on those screens is UZS and repeating it eleven times
 * down a column is what made the old rows unreadable at 13 sp.
 */
fun formatMoney(m: Money): String = groupThousands(m.roundedWhole().toPlainString())

/**
 * The KPI / confirm-sheet form: «UZS 53 268 760». Callers that can style two runs separately
 * should use `MoneyHeroText` instead — it renders the prefix at 14/500 and 50 % opacity, which a
 * plain string cannot. This exists for the places that need one string: content descriptions,
 * the share image's canvas, a toast.
 */
fun formatMoneyHero(m: Money): String = "$MONEY_UNIT$THIN${formatMoney(m)}"
```

- [ ] **Step 2: Update every assertion in `FormattersTest.kt`.** The three money cases and the weight case assert the old separator and suffix; the area/count/meters cases assert only single-group values and pass unchanged. Replace the money test and the weight test with:

```kotlin
    @Test fun `money is grouped with a thin space and carries no unit`() {
        // U+2009. D8: the unit belongs on hero figures only, so a list row shows digits alone.
        assertEquals("542 200 000", formatMoney(Money.parse("542200000.00")))
        assertEquals("0", formatMoney(Money.ZERO))
        assertEquals("1 250 001", formatMoney(Money.parse("1250000.50")))  // half-away-from-zero
        assertEquals("-4 340 840", formatMoney(Money.parse("-4340840.00")))
    }

    @Test fun `a hero figure carries the unit as a prefix`() {
        assertEquals("UZS 53 268 760", formatMoneyHero(Money.parse("53268760.00")))
        assertEquals("UZS 0", formatMoneyHero(Money.ZERO))
    }

    @Test fun `weight is grouped with a thin space and кг`() {
        assertEquals("12 240 кг", formatWeightKg(12240.0))
    }
```

The expected strings above contain real U+2009 characters — copy them verbatim, or write them as `"542 200 000"` if your editor is likely to normalise whitespace on save. Then run `.\gradlew.bat :core:ui:testDebugUnitTest --no-daemon` and fix any remaining assertion that still spells U+00A0 — `formatArea`, `formatCount` and `formatPercent` group through the same helper, so a four-digit case anywhere in the file will fail until its expectation is updated.

- [ ] **Step 3: Audit the call sites.** `grep -rn "formatMoney(" --include=*.kt android/feature android/app android/core` gives 38 hits; `grep -rn "UZS" --include=*.kt android/feature android/app` gives the literals. Confirm — and this is the whole audit, because the answer is already known and must stay true — that **no call site concatenates its own unit**: every «UZS» in the tree is either a `suffix = "UZS"` on a numeric *input* field (`RecordPaymentScreen`, `ConfirmSheet`, `DispatchScreen`, `DeliveryProofScreen`, `TotalsSheet` — keypad suffixes, which stay) or a comment. If you find a `formatMoney(x) + " UZS"`, that is a phase-1 fix; if you find a *screen* that now needs the hero form, that is **not** a phase-1 fix — note it for the phase that redraws that screen.

- [ ] **Step 4: Rewrite `MoneyText.kt`** onto the new type and add the hero renderer.

```kotlin
package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.layout.Row
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.Money
import uz.etalon.crm.core.ui.format.MONEY_UNIT
import uz.etalon.crm.core.ui.format.formatArea
import uz.etalon.crm.core.ui.format.formatCount
import uz.etalon.crm.core.ui.format.formatMoney
import java.math.BigDecimal

/** A figure in a row or a total: grouped digits, no unit (D8). */
@Composable
fun MoneyText(money: Money, modifier: Modifier = Modifier, style: TextStyle = EtalonType.rowAmount, color: Color = EtalonColors.ink) =
    Text(formatMoney(money), modifier = modifier, style = style, color = color, maxLines = 1)

/**
 * A KPI or confirm-sheet figure: «UZS» at 14/500 and half opacity, then the number. Two runs, not
 * one string, because the prefix has to be visually quiet — see `2b-home.png` and `3a-calculator.png`.
 */
@Composable
fun MoneyHeroText(
    money: Money, modifier: Modifier = Modifier,
    style: TextStyle = EtalonType.kpi, color: Color = EtalonColors.ink, onDark: Boolean = false,
) = Row(modifier, verticalAlignment = Alignment.Alignment.Bottom) {
    Text(
        MONEY_UNIT, style = EtalonType.kpiUnit,
        color = (if (onDark) EtalonColors.onDark else color).copy(alpha = 0.5f),
    )
    Text(formatMoney(money), style = style, color = if (onDark) EtalonColors.onDark else color, maxLines = 1, modifier = Modifier.padding(start = 6.dp))
}

@Composable
fun AreaText(m2: BigDecimal, modifier: Modifier = Modifier, style: TextStyle = EtalonType.body, color: Color = EtalonColors.ink2) =
    Text(formatArea(m2), modifier = modifier, style = style, color = color, maxLines = 1)

@Composable
fun CountText(n: Int, modifier: Modifier = Modifier, style: TextStyle = EtalonType.body, color: Color = EtalonColors.ink2) =
    Text(formatCount(n), modifier = modifier, style = style, color = color, maxLines = 1)
```

Fix the two mechanical slips as you type: the import list needs `androidx.compose.foundation.layout.padding`, and the alignment is `Alignment.Bottom`.

- [ ] **Step 5: Screenshot the three.** `core/designsystem/src/test/kotlin/uz/etalon/crm/core/designsystem/MoneyTextScreenshotTest.kt`, capturing a column of `MoneyHeroText` (53 268 760), `MoneyText` (6 210 000), `AreaText` (78,7), `CountText` (13) on `EtalonColors.page` to `screenshots/ds_money_text_light.png`. Use the `PaymentScreenshotTest` shape: `@RunWith(RobolectricTestRunner::class)`, `@GraphicsMode(NATIVE)`, `@Config(sdk = [36], qualifiers = "w411dp-h891dp")`, `rule.onRoot().captureRoboImage(...)`.

- [ ] **Step 6: Re-record, verify, commit.** `recordRoborazziDebug`, then the standard command. Subject: `Feat(android) · thin-space numbers, «UZS» only on hero figures`.

---

## Task 5: Lucide icons as vector drawables

**Files:** add 36 `core/designsystem/src/main/res/drawable/ic_lu_*.xml`; add `core/designsystem/src/main/assets/icon/LICENSE-lucide.txt`; create `core/designsystem/src/main/kotlin/uz/etalon/crm/core/designsystem/icon/EtalonIcons.kt`; create `core/designsystem/src/test/kotlin/uz/etalon/crm/core/designsystem/IconRenderTest.kt`.

**Interfaces consumed:** `EtalonColors`.
**Interfaces produced:**

```kotlin
object EtalonIcons {                  // uz.etalon.crm.core.designsystem.icon — @DrawableRes Ints
    val ArrowLeft; ArrowUpRight; Bell; Box; Calculator; Camera; Check; ChevronDown; ChevronRight
    val ChevronUp; CircleAlert; CloudUpload; Delete; Ellipsis; EllipsisVertical; Factory
    val GripHorizontal; House; Images; MessageCircle; Minus; Navigation; Package; Pencil; Phone
    val Plus; Save; Search; Send; SlidersHorizontal; Trash; TrendingUp; User; Users; Wallet; X: Int
}
@Composable fun EtalonIcon(@DrawableRes id: Int, contentDescription: String?, modifier: Modifier = Modifier, size: Dp = 18.dp, tint: Color = EtalonColors.ink)
```

Sizes, §1.6: **20 dp** in the nav, **18 dp** in header buttons, **16 dp** inline, **12 dp** inside a tinted square. Stroke is 2 units in a 24-unit viewport, so it scales with the glyph exactly as the prototype's SVG does.

**The mapping — every Material icon in the tree today.** Nothing in this task edits a call site; the "used by" column is where each glyph lands when its screen is redrawn in phases 2–5.

| Material icon (in use) | Lucide file | drawable | used by |
|---|---|---|---|
| `AutoMirrored.Filled.ArrowBack` ×8 | `arrow-left` | `ic_lu_arrow_left` | ClientDetail, DeliveryLocation, Discrepancies, Dispatch, Drivers, OrderDetail, RecordPayment, Shipments |
| `AutoMirrored.Filled.Backspace` ×2 | `delete` | `ic_lu_delete` | NumericKeypadSheet, PinPad |
| `Default.AccountBalanceWallet` | `wallet` | `ic_lu_wallet` | EtalonNavHost (Тўлов cell) |
| `Default.Add` ×2 | `plus` | `ic_lu_plus` | CalculatorScreen, CountStepper |
| `Default.AddAPhoto` | `camera` | `ic_lu_camera` | PhotoStrip |
| `Default.ArrowDropDown`, `Default.ExpandMore` | `chevron-down` | `ic_lu_chevron_down` | RegionPicker, RoomCard |
| `Default.Calculate` | `calculator` | `ic_lu_calculator` | EtalonNavHost (Ҳисоб cell, D3) |
| `Default.Call` ×3 | `phone` | `ic_lu_phone` | ClientDetail, Drivers, OrderDetail |
| `Default.ChatBubble` | `message-circle` | `ic_lu_message_circle` | EtalonNavHost (Inbox) |
| `Default.Close` ×2 | `x` | `ic_lu_x` | Lightbox, PhotoCapture |
| `Default.CloudUpload` | `cloud-upload` | `ic_lu_cloud_upload` | PhotoStrip |
| `Default.DragHandle` | `grip-horizontal` | `ic_lu_grip_horizontal` | RoomCard |
| `Default.Edit` ×2 | `pencil` | `ic_lu_pencil` | ClientBar, ClientDetail |
| `Default.ExpandLess` | `chevron-up` | `ic_lu_chevron_up` | RoomCard |
| `Default.Factory` | `factory` | `ic_lu_factory` | EtalonNavHost (Production) |
| `Default.Home` | `house` | `ic_lu_house` | EtalonNavHost (Бош cell) |
| `Default.Inventory2` | `package` | `ic_lu_package` | EtalonNavHost (Буюртма cell) |
| `Default.MoreHoriz` | `ellipsis` | `ic_lu_ellipsis` | EtalonNavHost (Яна), SummarySheet ⋯ (D10) |
| `Default.MoreVert` | `ellipsis-vertical` | `ic_lu_ellipsis_vertical` | RoomCard |
| `Default.Navigation`, `Filled.Navigation` ×3 | `navigation` | `ic_lu_navigation` | OrderDetail, DeliveryLocation |
| `Default.People` | `users` | `ic_lu_users` | EtalonNavHost (Мижоз cell) |
| `Default.PhotoLibrary` | `images` | `ic_lu_images` | PhotoCapture |
| `Default.Remove` | `minus` | `ic_lu_minus` | CountStepper |
| `Default.Search` ×3 | `search` | `ic_lu_search` | ClientsScreen, OrdersListScreen, RegionPicker |
| `Default.ViewInAr` | `box` | `ic_lu_box` | EtalonNavHost (Gazoblok) |
| `Filled.ChevronRight` | `chevron-right` | `ic_lu_chevron_right` | CustodyChain, ClientRow |
| `Filled.Person` ×2 | `user` | `ic_lu_user` | DispatchScreen, RecordPaymentScreen |
| `Filled.Share` | `send` | `ic_lu_send` | TotalsSheet «Юбориш» |

**Eight more the phase-1 components themselves need** (they have no Material predecessor because the components are new): `bell` → IconButton with badge on Home's app bar · `sliders-horizontal` → the Orders filter button · `arrow-up-right` → RoomTile · `check` → Toast and the «Бош балка» checkbox · `circle-alert` → the Қарздорлик KpiCard · `trending-up` → the Ҳафталик тушум KpiCard delta · `trash` → the room delete button (Lucide has no `trash-2`; the file is `trash.svg`) · `save` → the SummarySheet's «Лойиҳани сақлаш».

36 drawables, covering all 30 usages plus the eight, with `chevron-down` and `navigation` each serving two.

- [ ] **Step 1: Fetch the licence.** `curl -sSL -o android/core/designsystem/src/main/assets/icon/LICENSE-lucide.txt "https://raw.githubusercontent.com/lucide-icons/lucide/main/LICENSE"` — it must open with "ISC License" and "Copyright (c) 2026 Lucide Icons and Contributors". aapt ignores a `.txt` in `drawable/`; keeping it there means the licence cannot drift away from the files it covers.

- [ ] **Step 2: Learn the conversion on one full example.** Fetch `https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/arrow-left.svg`; it holds two `<path>`s: `m12 19-7-7 7-7` and `M19 12H5`. The drawable, `ic_lu_arrow_left.xml`, is that verbatim inside the standard wrapper:

```xml
<?xml version="1.0" encoding="utf-8"?>
<!-- Lucide "arrow-left", ISC — see LICENSE-lucide.txt. 24-unit viewport, 2-unit stroke,
     round caps and joins. strokeColor is a placeholder: every render goes through EtalonIcon,
     which tints it. -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp"
    android:height="24dp"
    android:viewportWidth="24"
    android:viewportHeight="24">
    <path
        android:pathData="m12 19-7-7 7-7"
        android:fillColor="#00000000"
        android:strokeColor="#FF000000"
        android:strokeWidth="2"
        android:strokeLineCap="round"
        android:strokeLineJoin="round" />
    <path
        android:pathData="M19 12H5"
        android:fillColor="#00000000"
        android:strokeColor="#FF000000"
        android:strokeWidth="2"
        android:strokeLineCap="round"
        android:strokeLineJoin="round" />
</vector>
```

Every one of the 36 is that file with the `pathData` swapped. The `#FF000000` is not a design colour and is not what the hex-lint checks (it scans `.kt` only) — it is the placeholder `Icon`'s tint replaces.

- [ ] **Step 3: Convert the primitives VectorDrawable does not have.** Lucide uses `<circle>`, `<rect>`, `<line>`, `<polyline>` and `<polygon>`; `pathData` accepts none of them. The four rules, each with a worked case from an icon in this set:

| SVG | pathData | worked example |
|---|---|---|
| `<line x1 y1 x2 y2>` | `M{x1},{y1} L{x2},{y2}` | `calculator`'s `<line x1="8" x2="16" y1="6" y2="6"/>` → `M8,6 L16,6` |
| `<polyline points>` | `M p₀ L p₁ L p₂ …` | `package`'s `points="3.29 7 12 12 20.71 7"` → `M3.29,7 L12,12 L20.71,7` |
| `<polygon points>` | `M p₀ L p₁ … Z` | `navigation`'s `points="3 11 22 2 13 21 11 13 3 11"` → `M3,11 L22,2 L13,21 L11,13 Z` |
| `<circle cx cy r>` | two half-arcs from the left extreme | `search`'s `cx=11 cy=11 r=8` → `M3,11 a8,8 0 1,0 16,0 a8,8 0 1,0 -16,0` |
| `<rect x y width height rx>` | corner arcs | `calculator`'s `x=4 y=2 w=16 h=20 rx=2` → `M6,2 h12 a2,2 0 0 1 2,2 v16 a2,2 0 0 1 -2,2 h-12 a2,2 0 0 1 -2,-2 v-16 a2,2 0 0 1 2,-2 z` |

The circle rule in general: start at `(cx−r, cy)`, then `a{r},{r} 0 1,0 {2r},0` and `a{r},{r} 0 1,0 -{2r},0`. A radius-1 circle (`ellipsis`, `grip-horizontal`) converts the same way and stays *stroked*, not filled — the 2-unit stroke is what makes it read as a dot, exactly as in the SVG. The one exception in this set is `images`, whose `<circle cx="13" cy="7" r="1" fill="currentColor"/>` **is** filled: give that path `android:fillColor="#FF000000"` and no stroke.

- [ ] **Step 4: Write the 36 files.** Fetch each with `curl -sSL "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/<name>.svg"` and transcribe. These are the primitives each file should contain — if a fetch disagrees with this list, Lucide has changed upstream since the plan was written: take what you fetched, and say so in the commit message.

```
arrow-left        m12 19-7-7 7-7 · M19 12H5
arrow-up-right    M7 7h10v10 · M7 17 17 7
bell              M10.268 21a2 2 0 0 0 3.464 0 · M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326
box               M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z · m3.3 7 8.7 5 8.7-5 · M12 22V12
calculator        rect(4,2,16,20,rx2) · line(8,6→16,6) · line(16,14→16,18) · M16 10h.01 · M12 10h.01 · M8 10h.01 · M12 14h.01 · M8 14h.01 · M12 18h.01 · M8 18h.01
camera            M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z · circle(12,13,r3)
check             M20 6 9 17l-5-5
chevron-down      m6 9 6 6 6-6
chevron-right     m9 18 6-6-6-6
chevron-up        m18 15-6-6-6 6
circle-alert      circle(12,12,r10) · line(12,8→12,12) · line(12,16→12.01,16)
cloud-upload      M12 13v8 · M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242 · m8 17 4-4 4 4
delete            M10 5a2 2 0 0 0-1.344.519l-6.328 5.74a1 1 0 0 0 0 1.481l6.328 5.741A2 2 0 0 0 10 19h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2z · m12 9 6 6 · m18 9-6 6
ellipsis          circle(12,12,r1) · circle(19,12,r1) · circle(5,12,r1)
ellipsis-vertical circle(12,12,r1) · circle(12,5,r1) · circle(12,19,r1)
factory           M12 16h.01 · M16 16h.01 · M3 19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5a.5.5 0 0 0-.769-.422l-4.462 2.844A.5.5 0 0 1 15 10.5v-2a.5.5 0 0 0-.769-.422L9.77 10.922A.5.5 0 0 1 9 10.5V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z · M8 16h.01
grip-horizontal   circle(12,9,r1) · circle(19,9,r1) · circle(5,9,r1) · circle(12,15,r1) · circle(19,15,r1) · circle(5,15,r1)
house             M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8 · M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z
images            m22 11-1.296-1.296a2.4 2.4 0 0 0-3.408 0L11 16 · M4 8a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2 · circle(13,7,r1) FILLED · rect(8,2,14,14,rx2)
message-circle    M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719
minus             M5 12h14
navigation        polygon(3 11 22 2 13 21 11 13 3 11)
package           M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z · M12 22V12 · polyline(3.29 7 12 12 20.71 7) · m7.5 4.27 9 5.15
pencil            M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z · m15 5 4 4
phone             M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384
plus              M5 12h14 · M12 5v14
save              M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z · M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7 · M7 3v4a1 1 0 0 0 1 1h7
search            m21 21-4.34-4.34 · circle(11,11,r8)
send              M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z · m21.854 2.147-10.94 10.939
sliders-horizontal M10 5H3 · M12 19H3 · M14 3v4 · M16 17v4 · M21 12h-9 · M21 19h-5 · M21 5h-7 · M8 10v4 · M8 12H3
trash             M10 11v6 · M14 11v6 · M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 · M3 6h18 · M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2
trending-up       M16 7h6v6 · m22 7-8.5 8.5-5-5L2 17
user              M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 · circle(12,7,r4)
users             M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 · M16 3.128a4 4 0 0 1 0 7.744 · M22 21v-2a4 4 0 0 0-3-3.87 · circle(9,7,r4)
wallet            M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1 · M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4
x                 M18 6 6 18 · m6 6 12 12
```

- [ ] **Step 5: Write `icon/EtalonIcons.kt`.**

```kotlin
package uz.etalon.crm.core.designsystem.icon

import androidx.annotation.DrawableRes
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.foundation.layout.size
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.theme.EtalonColors

/**
 * Lucide (ISC — see assets/icon/LICENSE-lucide.txt), 2-unit stroke in a 24-unit viewport,
 * round caps. Ints rather than ImageVectors: a drawable reference costs nothing to hold and the
 * whole set can be listed in a test. §1.6 sizes: 20 nav · 18 header · 16 inline · 12 in a square.
 */
object EtalonIcons {
    val ArrowLeft = R.drawable.ic_lu_arrow_left
    val ArrowUpRight = R.drawable.ic_lu_arrow_up_right
    val Bell = R.drawable.ic_lu_bell
    val Box = R.drawable.ic_lu_box
    val Calculator = R.drawable.ic_lu_calculator
    val Camera = R.drawable.ic_lu_camera
    val Check = R.drawable.ic_lu_check
    val ChevronDown = R.drawable.ic_lu_chevron_down
    val ChevronRight = R.drawable.ic_lu_chevron_right
    val ChevronUp = R.drawable.ic_lu_chevron_up
    val CircleAlert = R.drawable.ic_lu_circle_alert
    val CloudUpload = R.drawable.ic_lu_cloud_upload
    val Delete = R.drawable.ic_lu_delete
    val Ellipsis = R.drawable.ic_lu_ellipsis
    val EllipsisVertical = R.drawable.ic_lu_ellipsis_vertical
    val Factory = R.drawable.ic_lu_factory
    val GripHorizontal = R.drawable.ic_lu_grip_horizontal
    val House = R.drawable.ic_lu_house
    val Images = R.drawable.ic_lu_images
    val MessageCircle = R.drawable.ic_lu_message_circle
    val Minus = R.drawable.ic_lu_minus
    val Navigation = R.drawable.ic_lu_navigation
    val Package = R.drawable.ic_lu_package
    val Pencil = R.drawable.ic_lu_pencil
    val Phone = R.drawable.ic_lu_phone
    val Plus = R.drawable.ic_lu_plus
    val Save = R.drawable.ic_lu_save
    val Search = R.drawable.ic_lu_search
    val Send = R.drawable.ic_lu_send
    val SlidersHorizontal = R.drawable.ic_lu_sliders_horizontal
    val Trash = R.drawable.ic_lu_trash
    val TrendingUp = R.drawable.ic_lu_trending_up
    val User = R.drawable.ic_lu_user
    val Users = R.drawable.ic_lu_users
    val Wallet = R.drawable.ic_lu_wallet
    val X = R.drawable.ic_lu_x

    /** Every glyph, for the render test and the token sheet. */
    val all: List<Pair<String, Int>> = listOf(
        "arrow-left" to ArrowLeft, "arrow-up-right" to ArrowUpRight, "bell" to Bell, "box" to Box,
        "calculator" to Calculator, "camera" to Camera, "check" to Check, "chevron-down" to ChevronDown,
        "chevron-right" to ChevronRight, "chevron-up" to ChevronUp, "circle-alert" to CircleAlert,
        "cloud-upload" to CloudUpload, "delete" to Delete, "ellipsis" to Ellipsis,
        "ellipsis-vertical" to EllipsisVertical, "factory" to Factory, "grip-horizontal" to GripHorizontal,
        "house" to House, "images" to Images, "message-circle" to MessageCircle, "minus" to Minus,
        "navigation" to Navigation, "package" to Package, "pencil" to Pencil, "phone" to Phone,
        "plus" to Plus, "save" to Save, "search" to Search, "send" to Send,
        "sliders-horizontal" to SlidersHorizontal, "trash" to Trash, "trending-up" to TrendingUp,
        "user" to User, "users" to Users, "wallet" to Wallet, "x" to X,
    )
}

@Composable
fun EtalonIcon(
    @DrawableRes id: Int, contentDescription: String?,
    modifier: Modifier = Modifier, size: Dp = 18.dp, tint: Color = EtalonColors.ink,
) = Icon(painterResource(id), contentDescription, modifier.size(size), tint)
```

- [ ] **Step 6: Screenshot every glyph at every size.** `IconRenderTest.kt` — a grid of `EtalonIcons.all` rendered at 20, 18, 16 and 12 dp on `EtalonColors.page`, tinted `EtalonColors.ink`, captured to `screenshots/ds_icons_light.png`. This is the review artefact for design risk §10 "Lucide fidelity": a glyph that failed to convert shows up as a blank cell or a filled blob, and a stroke that vanished at 12 dp is visible in the last row.

- [ ] **Step 7: Verify and commit.** Standard command; `recordRoborazziDebug` first for the new baseline only (no existing baseline moves — nothing consumes these yet). Subject: `Feat(android) · Lucide icons as vector drawables`.
---

## Task 6: the four buttons, the icon button, and the avatar

**Files:** rewrite `core/designsystem/src/main/kotlin/uz/etalon/crm/core/designsystem/components/EtalonButtons.kt`; create `.../components/Avatar.kt`; create `core/designsystem/src/test/kotlin/uz/etalon/crm/core/designsystem/ButtonsScreenshotTest.kt`; re-record 45 baselines.

**Interfaces consumed:** `EtalonColors`, `EtalonShapes`, `EtalonSpace`, `EtalonElevation`, `Modifier.etalonShadow`, `etalonRipple`, `EtalonType`, `EtalonIcon`.
**Interfaces produced:**

```kotlin
// signatures of the first three are source-compatible with what 19/16/5 feature files call today
@Composable fun PrimaryButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, loading: Boolean = false, leading: ImageVector? = null, leadingIcon: Int? = null, compact: Boolean = false)
@Composable fun SecondaryButton(… same parameters …)
@Composable fun DangerButton(… same parameters …)
@Composable fun DarkButton(text: String? = null, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true, leadingIcon: Int? = null)     // on navy
@Composable fun InverseButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true)                                     // on navy
@Composable fun EtalonIconButton(icon: Int, contentDescription: String?, onClick: () -> Unit, modifier: Modifier = Modifier, onDark: Boolean = false, badge: Boolean = false, size: Dp = 40.dp, shape: Shape = EtalonShapes.pill, tint: Color? = null)
@Composable fun Avatar(name: String, modifier: Modifier = Modifier, size: Dp = 36.dp, onPanel: Boolean = false)
fun avatarInitials(name: String): String
```

Geometry, §2: primary/secondary h46 (h36 compact), pill, 13/700; primary indigo + shadow, pressed `indigoPressed`, disabled `lavenderBg` with indigo at 50 %; secondary white + hairline, ink, pressed `lavenderBg`; DarkButton navy2 on navy; InverseButton white with navy text; IconButton 36–40 dp, `md` or pill, white + hairline on light / navy2 on dark, optional 7 dp red badge dot with a 1.5 dp white ring at top-right. Avatar 34–36 circle, palette fill, 12/700 initials, and a 2 dp white-35 % ring when it sits on `indigoPanel`. **All of them inside a 48 dp hit area (D7).**

- [ ] **Step 1: Rewrite `EtalonButtons.kt`.**

```kotlin
package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.icon.EtalonIcon
import uz.etalon.crm.core.designsystem.theme.*

private val H_REGULAR = 46.dp
private val H_COMPACT = 36.dp

/**
 * The one shape every button in the system has. `selectable`/`clickable` is used rather than M3's
 * `Button` so the container, the ripple and the pressed fill are ours — M3's own colours,
 * elevation overlay and 40 dp minimum are all things this system does not want.
 */
@Composable
private fun EtalonButtonBase(
    onClick: () -> Unit, enabled: Boolean, modifier: Modifier,
    height: Dp, shape: Shape, fill: Color, pressedFill: Color, border: Color?,
    onDark: Boolean, shadow: Color? = null, content: @Composable RowScope.() -> Unit,
) {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    Row(
        modifier
            // §1.5: the primary button carries the system's only button shadow, and a disabled one
            // must not float — hence the colour is passed, not assumed. Shadow first in the chain.
            .then(if (shadow != null) Modifier.etalonShadow(EtalonElevation.primaryButton, shape, shadow) else Modifier)
            // D7: the visual height may drop to 36, the touch target may not.
            .defaultMinSize(minHeight = EtalonSpace.minTouch)
            .height(height)
            .clip(shape)
            .background(if (pressed && enabled) pressedFill else fill)
            .then(if (border != null) Modifier.border(EtalonSpace.hairline, border, shape) else Modifier)
            .selectable(
                selected = false, enabled = enabled, role = Role.Button,
                interactionSource = interaction, indication = etalonRipple(onDark), onClick = onClick,
            )
            .padding(horizontal = 18.dp),
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

@Composable
private fun RowScope.ButtonBody(text: String?, loading: Boolean, leading: ImageVector?, leadingIcon: Int?, color: Color) {
    when {
        loading -> { CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = color); Spacer(Modifier.width(10.dp)) }
        leadingIcon != null -> { EtalonIcon(leadingIcon, null, size = 18.dp, tint = color); if (text != null) Spacer(Modifier.width(10.dp)) }
        // Kept for the feature screens that still pass a Material vector; phases 2–5 move each of
        // them to `leadingIcon` as they are redrawn.
        leading != null -> { Icon(leading, null, Modifier.size(18.dp), tint = color); if (text != null) Spacer(Modifier.width(10.dp)) }
    }
    if (text != null) Text(text, style = EtalonType.rowTitle, color = color, maxLines = 1)
}

/** The one action a screen exists for. Indigo pill, the system's only coloured shadow. */
@Composable
fun PrimaryButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier,
    enabled: Boolean = true, loading: Boolean = false,
    leading: ImageVector? = null, leadingIcon: Int? = null, compact: Boolean = false,
) {
    val on = enabled && !loading
    EtalonButtonBase(
        onClick = onClick, enabled = on,
        modifier = if (compact) modifier else modifier.fillMaxWidth(),
        height = if (compact) H_COMPACT else H_REGULAR,
        shape = EtalonShapes.pill,
        fill = if (on) EtalonColors.indigo else EtalonColors.lavenderBg,
        pressedFill = EtalonColors.indigoPressed,
        border = null, onDark = true,
        shadow = if (on) EtalonColors.indigo else null,
    ) { ButtonBody(text, loading, leading, leadingIcon, if (on) EtalonColors.onDark else EtalonColors.indigo.copy(alpha = 0.5f)) }
}

@Composable
fun SecondaryButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier,
    enabled: Boolean = true, loading: Boolean = false,
    leading: ImageVector? = null, leadingIcon: Int? = null, compact: Boolean = false,
) = EtalonButtonBase(
    onClick = onClick, enabled = enabled && !loading,
    modifier = if (compact) modifier else modifier.fillMaxWidth(),
    height = if (compact) H_COMPACT else H_REGULAR,
    shape = EtalonShapes.pill,
    fill = EtalonColors.surface, pressedFill = EtalonColors.lavenderBg,
    border = EtalonColors.surfaceBorder, onDark = false,
) { ButtonBody(text, loading, leading, leadingIcon, if (enabled) EtalonColors.ink else EtalonColors.ink3) }

/** Destructive: delete a shipment, remove a photo. Not in §2 — kept because five feature files
 *  call it and deleting a payment-adjacent action is exactly where a red button earns its keep. */
@Composable
fun DangerButton(
    text: String, onClick: () -> Unit, modifier: Modifier = Modifier,
    enabled: Boolean = true, loading: Boolean = false,
    leading: ImageVector? = null, leadingIcon: Int? = null, compact: Boolean = false,
) = EtalonButtonBase(
    onClick = onClick, enabled = enabled && !loading,
    modifier = if (compact) modifier else modifier.fillMaxWidth(),
    height = if (compact) H_COMPACT else H_REGULAR,
    shape = EtalonShapes.pill,
    fill = if (enabled) EtalonColors.red else EtalonColors.redBg, pressedFill = EtalonColors.red,
    border = null, onDark = true,
) { ButtonBody(text, loading, leading, leadingIcon, if (enabled) EtalonColors.onDark else EtalonColors.red) }

/** On navy: the quiet half of a pair («Рад этиш», the two icon actions on the summary sheet). */
@Composable
fun DarkButton(
    text: String? = null, onClick: () -> Unit, modifier: Modifier = Modifier,
    enabled: Boolean = true, leadingIcon: Int? = null,
) = EtalonButtonBase(
    onClick = onClick, enabled = enabled, modifier = modifier, height = H_REGULAR, shape = EtalonShapes.pill,
    fill = EtalonColors.navy2, pressedFill = EtalonColors.navy, border = null, onDark = true,
) { ButtonBody(text, false, null, leadingIcon, EtalonColors.onDark) }

/** On navy: the affirmative half — white pill, navy text. Give it `Modifier.weight(1f)`. */
@Composable
fun InverseButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) =
    EtalonButtonBase(
        onClick = onClick, enabled = enabled, modifier = modifier, height = H_REGULAR, shape = EtalonShapes.pill,
        fill = EtalonColors.surface, pressedFill = EtalonColors.lavenderBg, border = null, onDark = false,
    ) { ButtonBody(text, false, null, null, if (enabled) EtalonColors.navy else EtalonColors.ink3) }
```

One thing to hold in mind as you type: `.defaultMinSize(minHeight = 48.dp).height(36.dp)` still measures 36 dp — `height` is an exact constraint and wins. A regular button is 46 dp and needs nothing; a **compact** one is genuinely 36 dp tall, so D7's hit area comes from its parent. Every call site that places a compact button must give it `Modifier.heightIn(min = EtalonSpace.minTouch)` on the surrounding row rather than inflating the visual — the header pair in `2b-orders.png` is 36 dp tall and must stay so.

- [ ] **Step 2: `EtalonIconButton`, in the same file.**

```kotlin
/**
 * 36–40 dp square or pill. On light: white with a hairline. On dark: navy2, no border.
 * [badge] is the unread dot from `2b-home.png` — 7 dp red with a 1.5 dp ring in the surface
 * colour, so it reads as a hole punched in the button rather than a sticker on top of it.
 */
@Composable
fun EtalonIconButton(
    icon: Int, contentDescription: String?, onClick: () -> Unit, modifier: Modifier = Modifier,
    onDark: Boolean = false, badge: Boolean = false, size: Dp = 40.dp,
    shape: Shape = EtalonShapes.pill, tint: Color? = null,
) = Box(modifier.size(EtalonSpace.minTouch), contentAlignment = Alignment.Center) {
    Box(
        Modifier
            .size(size).clip(shape)
            .background(if (onDark) EtalonColors.navy2 else EtalonColors.surface)
            .then(if (onDark) Modifier else Modifier.border(EtalonSpace.hairline, EtalonColors.surfaceBorder, shape))
            .clickable(indication = etalonRipple(onDark), interactionSource = remember { MutableInteractionSource() }, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) { EtalonIcon(icon, contentDescription, size = 18.dp, tint = tint ?: if (onDark) EtalonColors.onDark else EtalonColors.ink) }
    if (badge) Box(
        Modifier.align(Alignment.TopEnd).offset(x = (-2).dp, y = 2.dp)
            .size(10.dp).clip(EtalonShapes.pill)
            .background(if (onDark) EtalonColors.navy2 else EtalonColors.surface)
            .padding(1.5.dp).clip(EtalonShapes.pill).background(EtalonColors.red),
    )
}
```

`clickable` needs `androidx.compose.foundation.clickable`; the badge's outer/inner pair is how a ring is drawn without a border modifier (7 dp dot + 1.5 dp ring = 10 dp).

- [ ] **Step 3: Create `components/Avatar.kt`.**

```kotlin
package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonType

/**
 * §2: the first letters of the first two words, uppercased; `&` is not a word.
 * «Yusupov & Sons» → YS, «Раҳимов Аброр Тоҳирович» → РА, «Каримов» → К.
 */
fun avatarInitials(name: String): String =
    name.split(' ', '\t', '\n').map { it.trim() }.filter { it.isNotEmpty() && it != "&" }
        .take(2).mapNotNull { it.firstOrNull()?.uppercaseChar() }.joinToString("")

/** @param onPanel adds the 2 dp white-35 % ring the spec asks for on an indigoPanel. */
@Composable
fun Avatar(name: String, modifier: Modifier = Modifier, size: Dp = 36.dp, onPanel: Boolean = false) = Box(
    modifier.size(size).clip(EtalonShapes.pill)
        .background(EtalonColors.avatarColor(name))
        .then(if (onPanel) Modifier.border(2.dp, EtalonColors.onDark.copy(alpha = 0.35f), EtalonShapes.pill) else Modifier),
    contentAlignment = Alignment.Center,
) {
    Text(avatarInitials(name), style = EtalonType.label.copy(fontSize = 12.sp, fontWeight = FontWeight.W700), color = EtalonColors.onDark, maxLines = 1)
}
```

- [ ] **Step 4: Pin the initials rule.** Add to `AvatarPaletteTest.kt`:

```kotlin
    @Test fun `initials are the first letters of the first two words, ampersand ignored`() {
        assertEquals("YS", avatarInitials("Yusupov & Sons"))
        assertEquals("РА", avatarInitials("Раҳимов Аброр Тоҳирович"))
        assertEquals("К", avatarInitials("Каримов"))
        assertEquals("TT", avatarInitials("Tashkent Tower LLC"))
        assertEquals("", avatarInitials("   "))
    }
```

- [ ] **Step 5: Screenshot the set.** `ButtonsScreenshotTest.kt` → `screenshots/ds_buttons_light.png`: a column on `EtalonColors.page` holding Primary (enabled / disabled / loading / compact with `leadingIcon = EtalonIcons.Plus`), Secondary, Danger, an `EtalonIconButton` row (pill, `md`, with `badge = true`), and an Avatar row of five different client names — then a navy `Box` holding DarkButton + InverseButton side by side and an Avatar with `onPanel = true`. Compare against `2b-orders.png` (the «+ Янги» compact primary) and `2b-order-detail.png` (the sticky pair).

- [ ] **Step 6: Re-record, verify, commit.** Nineteen feature files draw a PrimaryButton, so most of the 45 move. Subject: `Feat(android) · the four buttons, the icon button and the avatar`.

---

## Task 7: StatusTag — three palettes, seven order statuses, both payment triads

**Files:** rewrite `core/designsystem/src/main/kotlin/uz/etalon/crm/core/designsystem/components/StatusChip.kt`; create `.../components/StatusTag.kt`, `.../components/MonthHeader.kt`; modify `core/designsystem/src/main/res/values/strings.xml`; create `.../test/…/StatusTagScreenshotTest.kt`; modify `StatusChipMappingTest.kt`; re-record 45 baselines.

**Interfaces consumed:** `EtalonColors`, `EtalonType`, `EtalonShapes`, `:core:model` enums.
**Interfaces produced:**

```kotlin
enum class TagSurface { ROW_ON_NAVY, ROW_ON_LIGHT, PANEL_ON_INDIGO }
@Composable fun StatusTag(status: OrderStatus, surface: TagSurface = TagSurface.ROW_ON_LIGHT, short: Boolean = false, modifier: Modifier = Modifier)
@Composable fun PaymentStateTag(state: PaymentState, surface: TagSurface = TagSurface.ROW_ON_LIGHT, modifier: Modifier = Modifier)
@Composable fun PaymentStatusTag(status: PaymentStatus, surface: TagSurface = TagSurface.ROW_ON_LIGHT, modifier: Modifier = Modifier)
@Composable fun ShipmentStatusTag(status: ShipmentStatus, surface: TagSurface = TagSurface.ROW_ON_LIGHT, modifier: Modifier = Modifier)
@Composable fun DiscrepancyStatusTag(status: DiscrepancyStatus, surface: TagSurface = TagSurface.ROW_ON_LIGHT, modifier: Modifier = Modifier)
@Composable fun DriverStatusTag(active: Boolean, surface: TagSurface = TagSurface.ROW_ON_LIGHT, modifier: Modifier = Modifier)
@Composable fun MonthHeader(label: String, total: Money?, onDark: Boolean = true, modifier: Modifier = Modifier)
// unchanged, now delegating: StatusChip, PaymentChip, ShipmentStatusChip, DriverStatusChip,
// PaymentStatusChip, DiscrepancyStatusChip, Chip, ChipTone, and all twelve tone/label functions
```

**The palette table — design §5.1 over designer §2, because the app has seven statuses and the spec drew four.**

| status | on navy (bg / fg) | on light (bg / fg) | on indigoPanel (bg / fg) |
|---|---|---|---|
| DRAFT | navy2 / onDark | surfaceBorder / ink2 | white 18 % / onDark |
| PLACED | navy2 / onDark | `surfaceBorder` / ink2 | white 18 % / onDark |
| IN_PRODUCTION | navy2 / lavender | lavenderBg / indigo | onDark / indigo |
| LOADED | navy2 / lavender | lavenderBg / indigo | onDark / indigo |
| DISPATCHED | indigo / onDark | indigo / onDark | navy / onDark |
| DELIVERED | navy2 / ink3 | greenBg / green | green / onDark |
| CANCELED | navy2 / debtOnDark | redBg / red | red / onDark |
| UNKNOWN | navy2 / onDark | surfaceBorder / ink2 | white 18 % / onDark |

Payment triad — order level (`PaymentState`): FULLY_PAID = the DELIVERED row, PARTIALLY_PAID = the IN_PRODUCTION row, AWAITING_PAYMENT/UNKNOWN = the PLACED row.
Payment triad — single payment (`PaymentStatus`): CONFIRMED = DELIVERED, PENDING_CONFIRMATION = **IN_PRODUCTION** (it is work waiting in the owner's queue, not an unpaid order — the existing `paymentStatusTone` KDoc explains why the two pendings differ, and that distinction survives this restyle), REJECTED = CANCELED, UNKNOWN = PLACED.
`ShipmentStatus` reuses PENDING→PLACED, LOADED→IN_PRODUCTION, DISPATCHED→DISPATCHED, DELIVERED→DELIVERED. `DiscrepancyStatus`: OPEN→CANCELED, RESOLVED_RECOVERED→DELIVERED, RESOLVED_DISCOUNT→IN_PRODUCTION, RESOLVED_WRITEOFF→PLACED, DISPUTED→IN_PRODUCTION. `driverActive`: true→DELIVERED, false→PLACED.

- [ ] **Step 1: Add the three short labels.** In `core/designsystem/src/main/res/values/strings.xml`, beside the existing status strings — **new names, existing strings untouched**:

```xml
    <!-- Row-sized forms from the prototype (2b-orders.png); the full words above are unchanged
         and stay in use on panels and detail screens. -->
    <string name="ds_status_placed_short">Қабул</string>
    <string name="ds_status_in_production_short">Ишлаб чиқ.</string>
    <string name="ds_status_dispatched_short">Йўлда</string>
```

- [ ] **Step 2: Create `StatusTag.kt`.** One private palette function, one private renderer, six public entry points.

```kotlin
package uz.etalon.crm.core.designsystem.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import uz.etalon.crm.core.designsystem.R
import uz.etalon.crm.core.designsystem.theme.EtalonColors
import uz.etalon.crm.core.designsystem.theme.EtalonShapes
import uz.etalon.crm.core.designsystem.theme.EtalonType
import uz.etalon.crm.core.model.*

/** Which of the three §2 palettes a tag is drawn in. */
enum class TagSurface { ROW_ON_NAVY, ROW_ON_LIGHT, PANEL_ON_INDIGO }

/** The five semantic families every status in the app collapses into (design §5.1). */
internal enum class TagFamily { NEUTRAL, LAVENDER, INDIGO, GREEN, RED }

internal fun OrderStatus.family() = when (this) {
    OrderStatus.DRAFT, OrderStatus.PLACED, OrderStatus.UNKNOWN -> TagFamily.NEUTRAL
    OrderStatus.IN_PRODUCTION, OrderStatus.LOADED -> TagFamily.LAVENDER
    OrderStatus.DISPATCHED -> TagFamily.INDIGO
    OrderStatus.DELIVERED -> TagFamily.GREEN
    OrderStatus.CANCELED -> TagFamily.RED
}

private fun colours(f: TagFamily, s: TagSurface): Pair<Color, Color> = when (s) {
    TagSurface.ROW_ON_NAVY -> when (f) {
        TagFamily.NEUTRAL -> EtalonColors.navy2 to EtalonColors.onDark
        TagFamily.LAVENDER -> EtalonColors.navy2 to EtalonColors.lavender
        TagFamily.INDIGO -> EtalonColors.indigo to EtalonColors.onDark
        TagFamily.GREEN -> EtalonColors.navy2 to EtalonColors.ink3
        TagFamily.RED -> EtalonColors.navy2 to EtalonColors.debtOnDark
    }
    TagSurface.ROW_ON_LIGHT -> when (f) {
        TagFamily.NEUTRAL -> EtalonColors.surfaceBorder to EtalonColors.ink2
        TagFamily.LAVENDER -> EtalonColors.lavenderBg to EtalonColors.indigo
        TagFamily.INDIGO -> EtalonColors.indigo to EtalonColors.onDark
        TagFamily.GREEN -> EtalonColors.greenBg to EtalonColors.green
        TagFamily.RED -> EtalonColors.redBg to EtalonColors.red
    }
    TagSurface.PANEL_ON_INDIGO -> when (f) {
        TagFamily.NEUTRAL -> EtalonColors.onDark.copy(alpha = 0.18f) to EtalonColors.onDark
        TagFamily.LAVENDER -> EtalonColors.onDark to EtalonColors.indigo
        TagFamily.INDIGO -> EtalonColors.navy to EtalonColors.onDark
        TagFamily.GREEN -> EtalonColors.green to EtalonColors.onDark
        TagFamily.RED -> EtalonColors.red to EtalonColors.onDark
    }
}

@Composable
private fun Tag(family: TagFamily, text: String, surface: TagSurface, modifier: Modifier) {
    val (bg, fg) = colours(family, surface)
    Text(
        text = text,
        style = if (surface == TagSurface.PANEL_ON_INDIGO) EtalonType.tagPanel else EtalonType.tag,
        color = fg, maxLines = 1,
        modifier = modifier.clip(EtalonShapes.xs).background(bg).padding(horizontal = 7.dp, vertical = 2.dp),
    )
}

/** @param short uses the row-sized wording from the prototype where one exists. */
@Composable
fun StatusTag(status: OrderStatus, surface: TagSurface = TagSurface.ROW_ON_LIGHT, short: Boolean = false, modifier: Modifier = Modifier) =
    Tag(status.family(), stringResource(if (short) orderStatusShortLabel(status) else orderStatusLabel(status)), surface, modifier)

@Composable
fun PaymentStateTag(state: PaymentState, surface: TagSurface = TagSurface.ROW_ON_LIGHT, modifier: Modifier = Modifier) =
    Tag(
        when (state) {
            PaymentState.FULLY_PAID -> TagFamily.GREEN
            PaymentState.PARTIALLY_PAID -> TagFamily.LAVENDER
            PaymentState.AWAITING_PAYMENT, PaymentState.UNKNOWN -> TagFamily.NEUTRAL
        },
        stringResource(paymentStateLabel(state)), surface, modifier,
    )

@Composable
fun PaymentStatusTag(status: PaymentStatus, surface: TagSurface = TagSurface.ROW_ON_LIGHT, modifier: Modifier = Modifier) =
    Tag(
        when (status) {
            PaymentStatus.CONFIRMED -> TagFamily.GREEN
            // Deliberately the lavender family, not the neutral one — a recorded payment in the
            // owner's queue is work waiting to be done. See `paymentStatusTone`'s KDoc.
            PaymentStatus.PENDING_CONFIRMATION -> TagFamily.LAVENDER
            PaymentStatus.REJECTED -> TagFamily.RED
            PaymentStatus.UNKNOWN -> TagFamily.NEUTRAL
        },
        stringResource(paymentStatusLabel(status)), surface, modifier,
    )
```

Write `ShipmentStatusTag`, `DiscrepancyStatusTag` and `DriverStatusTag` the same way, from the mapping table above, reusing the existing `*Label` functions.

- [ ] **Step 3: Add the short-label lookup and turn the old chips into shims.** In `StatusChip.kt`, keep every `*Tone`/`*Label` function exactly as it is (`StatusChipMappingTest` asserts them, and features import them), add:

```kotlin
/** Row-sized wording; falls back to the full label where the prototype has no short form. */
fun orderStatusShortLabel(s: OrderStatus): Int = when (s) {
    OrderStatus.PLACED -> R.string.ds_status_placed_short
    OrderStatus.IN_PRODUCTION -> R.string.ds_status_in_production_short
    OrderStatus.DISPATCHED -> R.string.ds_status_dispatched_short
    else -> orderStatusLabel(s)
}
```

and replace the six `@Composable fun *Chip` bodies plus `Chip` and `toneColor` so they delegate:

```kotlin
/** @deprecated Call [StatusTag] and friends; these six survive so twelve feature files compile
 *  until their screens are redrawn in phases 2–5. */
@Composable fun StatusChip(status: OrderStatus, modifier: Modifier = Modifier) = StatusTag(status, TagSurface.ROW_ON_LIGHT, modifier = modifier)
@Composable fun PaymentChip(state: PaymentState, modifier: Modifier = Modifier) = PaymentStateTag(state, TagSurface.ROW_ON_LIGHT, modifier)
// … and the same for ShipmentStatusChip, DriverStatusChip, PaymentStatusChip, DiscrepancyStatusChip

/** The old free-form chip, on the new palette: no more uppercase, no more 14 %-tint-and-border. */
@Composable fun Chip(tone: ChipTone, text: String, modifier: Modifier = Modifier) =
    Tag(tone.family(), text, TagSurface.ROW_ON_LIGHT, modifier)

internal fun ChipTone.family() = when (this) {
    ChipTone.PRIMARY, ChipTone.WARNING, ChipTone.GOLD -> TagFamily.LAVENDER
    ChipTone.SUCCESS -> TagFamily.GREEN
    ChipTone.DANGER -> TagFamily.RED
    ChipTone.NEUTRAL -> TagFamily.NEUTRAL
}
```

`toneColor` keeps working through `LegacyExtended`; leave it. Do **not** delete `ChipTone` — nine feature files name it.

- [ ] **Step 4: Create `MonthHeader.kt`** — §2: 10.5/600 ink3, label left, month sum right, padding 12 top / 10 bottom / 6 sides.

```kotlin
@Composable
fun MonthHeader(label: String, total: Money?, onDark: Boolean = true, modifier: Modifier = Modifier) = Row(
    modifier.fillMaxWidth().padding(start = 6.dp, end = 6.dp, top = 12.dp, bottom = 10.dp),
    horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically,
) {
    val c = if (onDark) EtalonColors.onDarkMuted else EtalonColors.ink3
    Text(label, style = EtalonType.tagPanel, color = c)
    if (total != null) MoneyText(total, style = EtalonType.tagPanel, color = c)
}
```

- [ ] **Step 5: Screenshot all three palettes.** `StatusTagScreenshotTest.kt` → `screenshots/ds_status_tag_light.png`: three blocks — one on `EtalonColors.page`, one on `EtalonColors.navy`, one on `EtalonColors.indigoPanel` — each showing all **seven** order statuses (long and short), the three `PaymentState`s and the three `PaymentStatus`es, plus a `MonthHeader("Сентябрь 2026", Money.parse("49483340.00"))` on navy. This single image is the reviewer's whole check on design §5.1; compare it against the row tags in `2b-orders.png` and the panel tag in `2b-order-detail.png`.

- [ ] **Step 6: Re-record, verify, commit.** Subject: `Feat(android) · StatusTag in its three palettes, and the month header`.
---

## Task 8: search field, filter chip, segmented control, bottom nav

**Files:** create `core/designsystem/src/main/kotlin/uz/etalon/crm/core/designsystem/components/SearchField.kt`, `.../EtalonFilterChip.kt`, `.../SegmentedControl.kt`, `.../BottomNav.kt`; modify `core/designsystem/src/main/res/values/strings.xml`; create `.../test/…/ControlsScreenshotTest.kt`, `.../test/…/BottomNavScreenshotTest.kt`.

**Interfaces consumed:** `EtalonColors`, `EtalonShapes`, `EtalonType`, `EtalonSpace`, `EtalonElevation`, `EtalonIcon`, `EtalonIcons`, `etalonRipple`.
**Interfaces produced:**

```kotlin
@Composable fun SearchField(value: String, onValueChange: (String) -> Unit, placeholder: String, modifier: Modifier = Modifier, onClear: (() -> Unit)? = null)
@Composable fun EtalonFilterChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, count: Int? = null)
data class SegmentItem(val label: String, val count: Int? = null)
@Composable fun SegmentedControl(items: List<SegmentItem>, selectedIndex: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier, onNavy: Boolean = true)
data class BottomNavItem(@DrawableRes val icon: Int, val label: String, val contentDescription: String)
@Composable fun BottomNav(items: List<BottomNavItem>, selectedIndex: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier)
@Composable fun BottomNavScrim(modifier: Modifier = Modifier)      // the 40 % white→page gradient under the bar
```

Geometry, §2 and §4: SearchField h40 pill, white, hairline, 16 dp search icon in ink3, 13 sp text, placeholder ink3. FilterChip h32 pill 12/600, idle white/hairline/ink, selected navy/onDark, count badge at 60 % opacity, 6 dp gaps, 20 dp edge inset. SegmentedControl: navy2 track on navy (navy track on light), 3–4 dp padding, pill items h28–32 at 11/600, active white with navy text, inactive onDark 70 %, count badge 55 %. BottomNav: floating navy pill, **h60**, 16 dp side margin, 12 dp above the gesture inset, 6 dp inner padding, **five equal cells (D3)**; active = white pill with navy icon, a 6 dp indigo dot and a 12/600 label; inactive = 20 dp icon only at onDark 62 %; the `floatingNav` shadow.

- [ ] **Step 1: `SearchField.kt`.** A `BasicTextField` — M3's `TextField` brings its own container, indicator line and 56 dp minimum, none of which this design wants.

```kotlin
@Composable
fun SearchField(
    value: String, onValueChange: (String) -> Unit, placeholder: String,
    modifier: Modifier = Modifier, onClear: (() -> Unit)? = null,
) = Row(
    modifier.fillMaxWidth().heightIn(min = EtalonSpace.minTouch).height(40.dp)
        .clip(EtalonShapes.pill).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.pill)
        .padding(horizontal = 14.dp),
    verticalAlignment = Alignment.CenterVertically,
) {
    EtalonIcon(EtalonIcons.Search, null, size = 16.dp, tint = EtalonColors.ink3)
    Box(Modifier.weight(1f).padding(start = 10.dp)) {
        if (value.isEmpty()) Text(placeholder, style = EtalonType.body, color = EtalonColors.ink3, maxLines = 1)
        BasicTextField(
            value = value, onValueChange = onValueChange, singleLine = true,
            textStyle = EtalonType.body.copy(color = EtalonColors.ink),
            cursorBrush = SolidColor(EtalonColors.indigo),
            modifier = Modifier.fillMaxWidth(),
        )
    }
    if (value.isNotEmpty() && onClear != null) {
        EtalonIconButton(EtalonIcons.X, stringResource(R.string.ds_region_clear), onClear, size = 24.dp)
    }
}
```

The 40 dp visual inside a 48 dp minimum is D7 again: `heightIn` before `height` sets the touch floor while the pill still measures 40.

- [ ] **Step 2: `EtalonFilterChip.kt`.** Named with the `Etalon` prefix because `androidx.compose.material3.FilterChip` is on the classpath and an unprefixed name would shadow it in every file that imports both.

```kotlin
@Composable
fun EtalonFilterChip(label: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, count: Int? = null) {
    val fg = if (selected) EtalonColors.onDark else EtalonColors.ink
    Row(
        modifier.heightIn(min = EtalonSpace.minTouch).height(32.dp).clip(EtalonShapes.pill)
            .background(if (selected) EtalonColors.navy else EtalonColors.surface)
            .then(if (selected) Modifier else Modifier.border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.pill))
            .clickable(indication = etalonRipple(selected), interactionSource = remember { MutableInteractionSource() }, onClick = onClick)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = EtalonType.label, color = fg, maxLines = 1)
        // §2: the count rides at 60 % of the label's own colour, never as a second pill.
        if (count != null) Text("$count", style = EtalonType.label, color = fg.copy(alpha = 0.6f), modifier = Modifier.padding(start = 6.dp))
    }
}
```

A row of these is a `LazyRow` at the call site with `horizontalArrangement = Arrangement.spacedBy(6.dp)` and `contentPadding = PaddingValues(horizontal = 20.dp)` — that is phase 2's job, not this task's; the chip itself must not assume a parent.

- [ ] **Step 3: `SegmentedControl.kt`.**

```kotlin
data class SegmentItem(val label: String, val count: Int? = null)

/** @param onNavy the track sits on a navy sheet (navy2 track); false = on a light page (navy track). */
@Composable
fun SegmentedControl(
    items: List<SegmentItem>, selectedIndex: Int, onSelect: (Int) -> Unit,
    modifier: Modifier = Modifier, onNavy: Boolean = true,
) = Row(
    modifier.clip(EtalonShapes.pill).background(if (onNavy) EtalonColors.navy2 else EtalonColors.navy).padding(4.dp),
    verticalAlignment = Alignment.CenterVertically,
) {
    items.forEachIndexed { i, item ->
        val active = i == selectedIndex
        val fg = if (active) EtalonColors.navy else EtalonColors.onDark.copy(alpha = 0.7f)
        Row(
            Modifier.heightIn(min = EtalonSpace.minTouch).height(30.dp).clip(EtalonShapes.pill)
                .then(if (active) Modifier.background(EtalonColors.surface) else Modifier)
                .clickable(indication = etalonRipple(!active), interactionSource = remember { MutableInteractionSource() }) { onSelect(i) }
                .padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(item.label, style = EtalonType.meta.copy(fontWeight = FontWeight.W600), color = fg, maxLines = 1)
            if (item.count != null) Text("${item.count}", style = EtalonType.meta.copy(fontWeight = FontWeight.W600), color = fg.copy(alpha = 0.55f), modifier = Modifier.padding(start = 5.dp))
        }
    }
}
```

- [ ] **Step 4: `BottomNav.kt` — the component only. No wiring, no `Destination`, no permissions; phase 2 supplies the list.**

```kotlin
package uz.etalon.crm.core.designsystem.components

/**
 * §4 / design decision D3: a floating navy pill with **five** cells — Бош · Буюртма · Ҳисоб ·
 * Тўлов · Мижоз. Five, not four: the calculator earned a permanent slot and there is no «Яна».
 * The caller passes whatever the signed-in role may see, so a driver's bar may be shorter; the
 * cells stay equal-width whatever the count.
 *
 * The active label is what decides whether five cells fit on a 360 dp phone — design risk §10.
 * `BottomNavScreenshotTest` renders it at 360 dp with «Буюртма» active for exactly that reason.
 */
@Composable
fun BottomNav(items: List<BottomNavItem>, selectedIndex: Int, onSelect: (Int) -> Unit, modifier: Modifier = Modifier) = Row(
    modifier
        .fillMaxWidth()
        .padding(horizontal = 16.dp)
        .navigationBarsPadding()
        .padding(bottom = 12.dp)
        .etalonShadow(EtalonElevation.floatingNav, EtalonShapes.pill, EtalonColors.navy)
        .clip(EtalonShapes.pill).background(EtalonColors.navy)
        .height(60.dp).padding(6.dp),
    verticalAlignment = Alignment.CenterVertically,
) {
    items.forEachIndexed { i, item ->
        val active = i == selectedIndex
        Row(
            Modifier.weight(1f).fillMaxHeight().clip(EtalonShapes.pill)
                .then(if (active) Modifier.background(EtalonColors.surface) else Modifier)
                .clickable(indication = etalonRipple(!active), interactionSource = remember { MutableInteractionSource() }) { onSelect(i) },
            horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
        ) {
            if (active) {
                Box(Modifier.size(6.dp).clip(EtalonShapes.pill).background(EtalonColors.indigo))
                Spacer(Modifier.width(6.dp))
                EtalonIcon(item.icon, item.contentDescription, size = 20.dp, tint = EtalonColors.navy)
                Spacer(Modifier.width(6.dp))
                Text(item.label, style = EtalonType.label, color = EtalonColors.navy, maxLines = 1)
            } else {
                EtalonIcon(item.icon, item.contentDescription, size = 20.dp, tint = EtalonColors.onDark.copy(alpha = 0.62f))
            }
        }
    }
}

/** The 40 % white→page gradient the page draws beneath the floating bar (§4), so a row scrolling
 *  under the pill fades instead of being sliced. Placed by the screen, above its content. */
@Composable
fun BottomNavScrim(modifier: Modifier = Modifier) = Box(
    modifier.fillMaxWidth().height(EtalonSpace.underNav).background(
        Brush.verticalGradient(listOf(EtalonColors.page.copy(alpha = 0f), EtalonColors.page)),
    ),
)
```

- [ ] **Step 5: Measure the five cells at 360 dp.** `BottomNavScreenshotTest.kt` captures two baselines: `screenshots/ds_bottom_nav_light.png` at `qualifiers = "w411dp-h891dp"` and `screenshots/ds_bottom_nav_360_light.png` at `qualifiers = "w360dp-h800dp"`, both with the five real labels and «Буюртма» (the longest) active. **If the active label ellipsizes at 360 dp, stop and report it** — the fix is a design decision (shorter labels, or the label only on the active cell at a smaller size), and design §10 says the owner reviews it. Do not silently shrink the type.

- [ ] **Step 6: Screenshot the other three.** `ControlsScreenshotTest.kt` → `screenshots/ds_controls_light.png`: a `SearchField` empty and filled, a chip row (Барчаси 9 / Қабул 1 / Ишлаб чиқариш 1 / Йўлда, second selected), a `SegmentedControl` on navy (Барчаси 9 / Қарз 6 / Тўланган 3) and one on light. Compare with `2b-orders.png`.

- [ ] **Step 7: Verify and commit.** No existing baseline moves — nothing consumes these yet. Standard command; `recordRoborazziDebug` for the three new files only. Subject: `Feat(android) · search field, filter chip, segmented control, bottom nav`.

---

## Task 9: KpiCard with its sparkline, ProgressCard, StepTimeline

**Files:** create `core/designsystem/src/main/kotlin/uz/etalon/crm/core/designsystem/components/KpiCard.kt`, `.../ProgressCard.kt`, `.../StepTimeline.kt`; create `.../test/…/KpiCardScreenshotTest.kt`.

**Interfaces consumed:** `EtalonColors`, `EtalonShapes`, `EtalonType`, `MoneyHeroText`, `EtalonIcon`, `Money`.
**Interfaces produced:**

```kotlin
enum class KpiAccent { RED, GREEN, INDIGO }
@Composable fun KpiCard(label: String, value: String, unit: String? = null, accent: KpiAccent, icon: Int, footnote: String? = null, footnotePositive: Boolean? = null, bars: List<Float> = emptyList(), currentBar: Int = -1, modifier: Modifier = Modifier)
@Composable fun KpiMoneyCard(label: String, value: Money, accent: KpiAccent, icon: Int, footnote: String? = null, footnotePositive: Boolean? = null, bars: List<Float> = emptyList(), currentBar: Int = -1, modifier: Modifier = Modifier)
@Composable fun ProgressCard(label: String, fraction: Float, percentText: String, paidLabel: String, remainingLabel: String, settled: Boolean, modifier: Modifier = Modifier)
data class TimelineStep(val label: String, val caption: String?, val state: StepState)
enum class StepState { DONE, CURRENT, UPCOMING }
@Composable fun StepTimeline(steps: List<TimelineStep>, modifier: Modifier = Modifier)
```

Geometry, §2: KpiCard w210 × auto, white, `xl`, padding 14×16; header row = 12/600 ink2 label + a 22 dp tinted square (`sm` radius) holding a 12 dp icon — redBg/red, greenBg/green, lavenderBg/indigo; value in `kpi` with the «UZS» prefix where it is money; footnote 11/600 in the accent colour; optional sparkline h44, 5 dp gaps, bars rounded 4 dp top / 2 dp bottom, `lavender` idle and `indigo` for `currentBar`. ProgressCard: white `xl`, label + right-hand percentage (red while there is debt, green when settled), an 8 dp pill track in `lavenderBg` with an indigo fill, footer «Тўланган X · Қолди Y». StepTimeline: four columns, 5 dp pill bars — navy done, indigo current, `lavenderBg` upcoming — a 10/600 label and a 10 sp ink3 caption or a ✓.

- [ ] **Step 1: `KpiCard.kt`.**

```kotlin
enum class KpiAccent { RED, GREEN, INDIGO }

private fun KpiAccent.fg() = when (this) { KpiAccent.RED -> EtalonColors.red; KpiAccent.GREEN -> EtalonColors.green; KpiAccent.INDIGO -> EtalonColors.indigo }
private fun KpiAccent.bg() = when (this) { KpiAccent.RED -> EtalonColors.redBg; KpiAccent.GREEN -> EtalonColors.greenBg; KpiAccent.INDIGO -> EtalonColors.lavenderBg }

@Composable
fun KpiCard(
    label: String, value: String, unit: String? = null, accent: KpiAccent, icon: Int,
    footnote: String? = null, footnotePositive: Boolean? = null,
    bars: List<Float> = emptyList(), currentBar: Int = -1, modifier: Modifier = Modifier,
) = Column(
    modifier.width(210.dp).clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .padding(horizontal = 16.dp, vertical = 14.dp),
) {
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
        Text(label, style = EtalonType.label, color = EtalonColors.ink2, maxLines = 1)
        Box(Modifier.size(22.dp).clip(EtalonShapes.sm).background(accent.bg()), Alignment.Center) {
            EtalonIcon(icon, null, size = 12.dp, tint = accent.fg())
        }
    }
    Spacer(Modifier.height(8.dp))
    Row(verticalAlignment = Alignment.Bottom) {
        if (unit != null) Text(unit, style = EtalonType.kpiUnit, color = EtalonColors.ink.copy(alpha = 0.5f), modifier = Modifier.padding(end = 6.dp))
        Text(value, style = EtalonType.kpi, color = EtalonColors.ink, maxLines = 1)
    }
    if (footnote != null) {
        Spacer(Modifier.height(4.dp))
        Text(
            footnote, style = EtalonType.meta.copy(fontWeight = FontWeight.W600), maxLines = 1,
            color = when (footnotePositive) { true -> EtalonColors.green; false -> EtalonColors.red; null -> EtalonColors.ink2 },
        )
    }
    if (bars.isNotEmpty()) {
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth().height(44.dp), Arrangement.spacedBy(5.dp), Alignment.Bottom) {
            bars.forEachIndexed { i, h ->
                Box(
                    Modifier.weight(1f)
                        // A zero-height bar is invisible and reads as missing data rather than a
                        // quiet month, so every bar keeps a 4 dp floor.
                        .fillMaxHeight(h.coerceIn(0f, 1f).coerceAtLeast(0.09f))
                        .clip(RoundedCornerShape(topStart = 4.dp, topEnd = 4.dp, bottomStart = 2.dp, bottomEnd = 2.dp))
                        .background(if (i == currentBar) EtalonColors.indigo else EtalonColors.lavender),
                )
            }
        }
    }
}

/** The money form: «UZS» prefix at 14/500, 50 % — the figure on `2b-home.png`. */
@Composable
fun KpiMoneyCard(label: String, value: Money, accent: KpiAccent, icon: Int, footnote: String? = null, footnotePositive: Boolean? = null, bars: List<Float> = emptyList(), currentBar: Int = -1, modifier: Modifier = Modifier) =
    KpiCard(label, formatMoney(value), MONEY_UNIT, accent, icon, footnote, footnotePositive, bars, currentBar, modifier)
```

`fillMaxHeight(fraction)` inside a fixed-height `Row` is what gives the sparkline its proportions without a custom layout; the `Alignment.Bottom` on the row is what makes the bars grow upward.

- [ ] **Step 2: `ProgressCard.kt`.**

```kotlin
@Composable
fun ProgressCard(
    label: String, fraction: Float, percentText: String,
    paidLabel: String, remainingLabel: String, settled: Boolean, modifier: Modifier = Modifier,
) = Column(
    modifier.fillMaxWidth().clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .padding(horizontal = 16.dp, vertical = 14.dp),
) {
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
        Text(label, style = EtalonType.label, color = EtalonColors.ink2)
        Text(percentText, style = EtalonType.label, color = if (settled) EtalonColors.green else EtalonColors.red)
    }
    Spacer(Modifier.height(10.dp))
    Box(Modifier.fillMaxWidth().height(8.dp).clip(EtalonShapes.pill).background(EtalonColors.lavenderBg)) {
        // A settled order still draws a full indigo bar — the colour that says "paid" is the
        // percentage above it, not the track, which stays the progress colour everywhere.
        Box(Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).fillMaxHeight().clip(EtalonShapes.pill).background(EtalonColors.indigo))
    }
    Spacer(Modifier.height(10.dp))
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween) {
        Text(paidLabel, style = EtalonType.meta, color = EtalonColors.ink2, maxLines = 1)
        Text(remainingLabel, style = EtalonType.meta, color = if (settled) EtalonColors.green else EtalonColors.red, maxLines = 1)
    }
}
```

The two footer strings arrive already composed («Тўланган 6 000 000», «Қолди 7 350 000») because the words are the screen's, not the component's — no user-facing string is invented here.

- [ ] **Step 3: `StepTimeline.kt`.**

```kotlin
enum class StepState { DONE, CURRENT, UPCOMING }
data class TimelineStep(val label: String, val caption: String?, val state: StepState)

@Composable
fun StepTimeline(steps: List<TimelineStep>, modifier: Modifier = Modifier) =
    Row(modifier.fillMaxWidth(), Arrangement.spacedBy(6.dp)) {
        steps.forEach { s ->
            Column(Modifier.weight(1f)) {
                Box(
                    Modifier.fillMaxWidth().height(5.dp).clip(EtalonShapes.pill).background(
                        when (s.state) {
                            StepState.DONE -> EtalonColors.navy
                            StepState.CURRENT -> EtalonColors.indigo
                            StepState.UPCOMING -> EtalonColors.lavenderBg
                        },
                    ),
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    s.label, style = EtalonType.caption, maxLines = 1,
                    color = if (s.state == StepState.UPCOMING) EtalonColors.ink3 else EtalonColors.ink,
                )
                if (s.caption != null) Text(s.caption, style = EtalonType.caption.copy(fontWeight = FontWeight.W400), color = EtalonColors.ink3, maxLines = 1)
            }
        }
    }
```

- [ ] **Step 4: Screenshot.** `KpiCardScreenshotTest.kt` → `screenshots/ds_kpi_light.png`: the three Home cards side by side (Қарздорлик red + sparkline, Ҳафталик тушум green + delta + sparkline, Ишлаб чиқаришда indigo), a `ProgressCard` at 45 % with debt and a second at 100 % settled, and the four-step timeline from `2b-order-detail.png` (Қабул done · Ишлаб чиқ. done · Йўлда current · Етказилди upcoming). Compare with `2b-home.png` and `2b-order-detail.png`.

- [ ] **Step 5: Verify and commit.** No existing baseline moves. Subject: `Feat(android) · KPI card, progress card, step timeline`.
---

## Task 10: OrderRow, NavySheet, DetailPanel with its tiles

**Files:** create `core/designsystem/src/main/kotlin/uz/etalon/crm/core/designsystem/components/OrderRow.kt`, `.../NavySheet.kt`, `.../DetailPanel.kt`; create `.../test/…/OrderRowScreenshotTest.kt`, `.../test/…/DetailPanelScreenshotTest.kt`.

**Interfaces consumed:** `Avatar`, `StatusTag`/`TagSurface`, `MoneyText`, `MonthHeader`, `EtalonIconButton`, `EtalonIcons`, tokens.
**Interfaces produced:**

```kotlin
@Composable fun OrderRow(clientName: String, status: OrderStatus, metaLine: String, total: Money, debt: Money?, paidLabel: String, debtLabel: (Money) -> String, onDark: Boolean = true, onClick: () -> Unit, modifier: Modifier = Modifier)
@Composable fun NavySheet(title: String, modifier: Modifier = Modifier, trailing: @Composable (RowScope.() -> Unit)? = null, fillsToBottom: Boolean = true, content: @Composable ColumnScope.() -> Unit)
@Composable fun DetailPanel(caption: String, headline: String, statusTag: @Composable () -> Unit, clientName: String, addressLine: String?, tiles: @Composable FlowRowScope.() -> Unit, totals: @Composable RowScope.() -> Unit, onBack: () -> Unit, dateLabel: String, onCall: (() -> Unit)?, modifier: Modifier = Modifier)
@Composable fun RoomTile(areaText: String, caption: String, onOpen: (() -> Unit)? = null, modifier: Modifier = Modifier)
@Composable fun AddTile(label: String, onClick: () -> Unit, modifier: Modifier = Modifier)
@Composable fun PanelTotal(caption: String, value: String, valueColor: Color = EtalonColors.onDark, modifier: Modifier = Modifier)
```

Geometry, §2: OrderRow is a `[36 avatar | text | trailing]` grid, h≈54, radius `lg`, row padding 9–10 × 8 with a 10 dp gap; the title is `rowTitle` and ellipsizes, the meta line is a StatusTag plus `№ 09−0003 · 78,7 м²` at 11 sp ink3; the trailing block is right-aligned with the amount in `rowAmount` above a 10.5/600 debt line — `қолди …` in red, or the paid word in green. On navy the row presses to indigo and the debt colours become `debtOnDark`/`paidOnDark`. NavySheet is navy with 22 dp top corners, a sticky header holding the section title and an optional trailing slot, and 10 dp side padding on its rows. DetailPanel is the navy(22, pad 10) → indigoPanel(18, pad 16/14) nest, with a 2-column tile grid, a dashed AddTile (1 dp, white 40 %, min height 58), a divider and a three-column totals row.

- [ ] **Step 1: `OrderRow.kt`.** The row takes strings for everything the *screen* words, and `Money` for everything that is money — so no Uzbek copy is invented inside the design system.

```kotlin
/**
 * @param metaLine already composed by the caller, e.g. "№ 09−0003 · 78,7 м²".
 * @param debt the server's `remaining` (it counts write-offs) — null or zero renders [paidLabel].
 * @param debtLabel the caller's wording, e.g. `{ "қолди ${formatMoney(it)}" }`.
 */
@Composable
fun OrderRow(
    clientName: String, status: OrderStatus, metaLine: String,
    total: Money, debt: Money?, paidLabel: String, debtLabel: (Money) -> String,
    onDark: Boolean = true, onClick: () -> Unit, modifier: Modifier = Modifier,
) {
    val hasDebt = debt != null && debt.amount.signum() > 0
    Row(
        modifier.fillMaxWidth().heightIn(min = EtalonSpace.minTouch).clip(EtalonShapes.lg)
            .clickable(indication = etalonRipple(onDark), interactionSource = remember { MutableInteractionSource() }, onClick = onClick)
            .padding(horizontal = EtalonSpace.rowPadH, vertical = EtalonSpace.rowPadV),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Avatar(clientName, size = 36.dp)
        Spacer(Modifier.width(EtalonSpace.rowGap))
        Column(Modifier.weight(1f)) {
            Text(
                clientName, style = EtalonType.rowTitle, maxLines = 1, overflow = TextOverflow.Ellipsis,
                color = if (onDark) EtalonColors.onDark else EtalonColors.ink,
            )
            Spacer(Modifier.height(3.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                StatusTag(status, if (onDark) TagSurface.ROW_ON_NAVY else TagSurface.ROW_ON_LIGHT, short = true)
                Spacer(Modifier.width(6.dp))
                Text(
                    metaLine, style = EtalonType.meta, maxLines = 1, overflow = TextOverflow.Ellipsis,
                    color = if (onDark) EtalonColors.onDarkMuted else EtalonColors.ink3,
                )
            }
        }
        Spacer(Modifier.width(EtalonSpace.rowGap))
        Column(horizontalAlignment = Alignment.End) {
            MoneyText(total, style = EtalonType.rowAmount, color = if (onDark) EtalonColors.onDark else EtalonColors.ink)
            Spacer(Modifier.height(2.dp))
            Text(
                if (hasDebt) debtLabel(debt!!) else paidLabel,
                style = EtalonType.tagPanel, maxLines = 1,
                color = when {
                    hasDebt && onDark -> EtalonColors.debtOnDark
                    hasDebt -> EtalonColors.red
                    onDark -> EtalonColors.paidOnDark
                    else -> EtalonColors.green
                },
            )
        }
    }
}
```

- [ ] **Step 2: `NavySheet.kt`.**

```kotlin
/**
 * The navy list surface from `2b-orders.png` and Home's «Бугунги етказиш».
 * @param fillsToBottom true for a list that runs off the bottom of the screen (22 dp top corners
 *        only, §1.3); false for a card floating in the page (all four corners).
 */
@Composable
fun NavySheet(
    title: String, modifier: Modifier = Modifier,
    trailing: @Composable (RowScope.() -> Unit)? = null,
    fillsToBottom: Boolean = true,
    content: @Composable ColumnScope.() -> Unit,
) = Column(
    modifier.fillMaxWidth().clip(if (fillsToBottom) EtalonShapes.sheetTop else EtalonShapes.sheet)
        .background(EtalonColors.navy).padding(horizontal = 10.dp).padding(top = 14.dp, bottom = 10.dp),
) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 6.dp, vertical = 2.dp),
        Arrangement.SpaceBetween, Alignment.CenterVertically,
    ) {
        Text(title, style = EtalonType.sectionTitle, color = EtalonColors.onDark)
        if (trailing != null) Row(verticalAlignment = Alignment.CenterVertically, content = trailing)
    }
    Spacer(Modifier.height(8.dp))
    content()
}
```

The header is "sticky" in the §2 sense — it is the first child of the sheet and the *rows* scroll under it, which the screen arranges by putting its `LazyColumn` inside `content`. Nothing here scrolls; a component that owns a scroll container cannot be composed into one.

- [ ] **Step 3: `DetailPanel.kt`** — the nest, the tiles and the totals.

```kotlin
@Composable
fun RoomTile(areaText: String, caption: String, onOpen: (() -> Unit)? = null, modifier: Modifier = Modifier) = Column(
    modifier.clip(EtalonShapes.lg).background(EtalonColors.indigoTile)
        .then(if (onOpen != null) Modifier.clickable(indication = etalonRipple(true), interactionSource = remember { MutableInteractionSource() }, onClick = onOpen) else Modifier)
        .padding(horizontal = 12.dp, vertical = 10.dp),
) {
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.Top) {
        Text(areaText, style = EtalonType.titleSm.copy(fontWeight = FontWeight.W700), color = EtalonColors.onDark, maxLines = 1)
        if (onOpen != null) EtalonIcon(EtalonIcons.ArrowUpRight, null, size = 12.dp, tint = EtalonColors.onDarkMuted)
    }
    Spacer(Modifier.height(2.dp))
    Text(caption, style = EtalonType.caption.copy(fontWeight = FontWeight.W400), color = EtalonColors.onDarkMuted, maxLines = 1)
}

/** 1 dp dashed white-40 % border, min height 58 (§2). Compose has no dashed border modifier —
 *  the dash comes from a `drawBehind` stroke with a `PathEffect`. */
@Composable
fun AddTile(label: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val stroke = EtalonColors.onDark.copy(alpha = 0.40f)
    Box(
        modifier.heightIn(min = 58.dp).clip(EtalonShapes.lg)
            .drawBehind {
                drawRoundRect(
                    color = stroke, style = Stroke(width = 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 5.dp.toPx()))),
                    cornerRadius = CornerRadius(12.dp.toPx()),
                )
            }
            .clickable(indication = etalonRipple(true), interactionSource = remember { MutableInteractionSource() }, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            EtalonIcon(EtalonIcons.Plus, null, size = 12.dp, tint = EtalonColors.onDark)
            Spacer(Modifier.width(6.dp))
            Text(label, style = EtalonType.caption, color = EtalonColors.onDark, maxLines = 1)
        }
    }
}

@Composable
fun PanelTotal(caption: String, value: String, valueColor: Color = EtalonColors.onDark, modifier: Modifier = Modifier) = Column(modifier) {
    Text(caption, style = EtalonType.caption.copy(fontWeight = FontWeight.W400), color = EtalonColors.onDarkMuted, maxLines = 1)
    Spacer(Modifier.height(3.dp))
    Text(value, style = EtalonType.rowTitle, color = valueColor, maxLines = 1)
}

/**
 * navy(22, pad 10) → indigoPanel(18, pad 16/14), §1.3's nesting rule made concrete.
 * @param tiles a `FlowRow` of [RoomTile]s and one [AddTile]; the caller supplies them so the panel
 *        does not need to know what a room is.
 */
@Composable
fun DetailPanel(
    caption: String, headline: String, statusTag: @Composable () -> Unit,
    clientName: String, addressLine: String?,
    tiles: @Composable FlowRowScope.() -> Unit, totals: @Composable RowScope.() -> Unit,
    onBack: () -> Unit, dateLabel: String, onCall: (() -> Unit)?, modifier: Modifier = Modifier,
) = Column(
    modifier.fillMaxWidth().clip(EtalonShapes.sheet).background(EtalonColors.navy).padding(10.dp),
) {
    Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, Alignment.CenterVertically) {
        EtalonIconButton(EtalonIcons.ArrowLeft, stringResource(R.string.ds_cd_back), onBack, onDark = true)
        Text(dateLabel, style = EtalonType.label, color = EtalonColors.onDarkMuted, maxLines = 1)
        if (onCall != null) EtalonIconButton(EtalonIcons.Phone, stringResource(R.string.ds_cd_call), onCall, onDark = true)
        else Spacer(Modifier.size(EtalonSpace.minTouch))
    }
    Spacer(Modifier.height(6.dp))
    Column(
        Modifier.fillMaxWidth().clip(EtalonShapes.xxl).background(EtalonColors.indigoPanel)
            .padding(horizontal = 14.dp, vertical = 16.dp),
    ) {
        Text(caption, style = EtalonType.caption.copy(fontWeight = FontWeight.W400), color = EtalonColors.onDarkMuted)
        Spacer(Modifier.height(4.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(headline, style = EtalonType.headline, color = EtalonColors.onDark)
            Spacer(Modifier.width(10.dp))
            statusTag()
        }
        Spacer(Modifier.height(12.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Avatar(clientName, size = 34.dp, onPanel = true)
            Spacer(Modifier.width(10.dp))
            Column(Modifier.weight(1f)) {
                Text(clientName, style = EtalonType.rowTitle, color = EtalonColors.onDark, maxLines = 1, overflow = TextOverflow.Ellipsis)
                if (addressLine != null) Text(addressLine, style = EtalonType.meta, color = EtalonColors.onDarkMuted, maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
        Spacer(Modifier.height(12.dp))
        FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp), maxItemsInEachRow = 2, content = tiles)
        Spacer(Modifier.height(14.dp))
        HorizontalDivider(color = EtalonColors.onDarkDivider, thickness = EtalonSpace.hairline)
        Spacer(Modifier.height(12.dp))
        Row(Modifier.fillMaxWidth(), Arrangement.SpaceBetween, content = totals)
    }
}
```

`FlowRow`/`FlowRowScope` are `androidx.compose.foundation.layout` and no longer experimental in this BOM; if the compiler still asks, opt in at the function rather than the file. A `RoomTile` inside the flow needs `Modifier.weight(1f)` from the caller to make two equal columns — that is why the tiles are a slot.

- [ ] **Step 4: Add the two content descriptions** to `core/designsystem/src/main/res/values/strings.xml`: `ds_cd_back` = «Орқага», `ds_cd_call` = «Қўнғироқ қилиш». Both are new names; nothing existing is touched.

- [ ] **Step 5: Screenshot.** `OrderRowScreenshotTest.kt` → `screenshots/ds_order_row_light.png`: a NavySheet titled «Рўйхат» with a `SegmentedControl` trailing, a `MonthHeader`, and five OrderRows covering DELIVERED-and-paid, DISPATCHED-with-debt, IN_PRODUCTION, PLACED and CANCELED, plus the same five in the light variant inside a white card. `DetailPanelScreenshotTest.kt` → `screenshots/ds_detail_panel_light.png`: the panel from `2b-order-detail.png` — «# 09−0003» with a DISPATCHED panel tag, three RoomTiles, one AddTile, three totals. Both are direct comparisons with the prototype captures; hold them side by side before you commit.

- [ ] **Step 6: Verify and commit.** No existing baseline moves. Subject: `Feat(android) · order row, navy sheet, detail panel`.

---

## Task 11: FormCard, ConfirmSheet, Toast — and the fourteen kept components

**Files:** create `core/designsystem/src/main/kotlin/uz/etalon/crm/core/designsystem/components/FormCard.kt`, `.../ConfirmSheet.kt`, `.../Toast.kt`; modify `CountStepper.kt`, `CustodyChain.kt`, `DriverPicker.kt`, `EmptyState.kt`, `ErrorBanner.kt`, `Lightbox.kt`, `NoticeBanner.kt`, `NumericKeypadSheet.kt`, `OutboxBanner.kt`, `PhotoStrip.kt`, `RegionPicker.kt`, `SectionLabel.kt`, `StatusStripeCard.kt`, `StickyActionBar.kt`; create `.../test/…/FormCardScreenshotTest.kt`, `.../test/…/KeptComponentsScreenshotTest.kt`; re-record 45 baselines.

**Interfaces consumed:** everything from Tasks 1–10.
**Interfaces produced:**

```kotlin
@Composable fun FormCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit)
@Composable fun FormField(label: String, modifier: Modifier = Modifier, content: @Composable () -> Unit)   // draws its own hairline divider
@Composable fun ConfirmSheet(caption: String, amount: Money, meta: String?, tiles: @Composable RowScope.() -> Unit, dismissText: String, confirmText: String, onDismiss: () -> Unit, onConfirm: () -> Unit, confirmEnabled: Boolean = true)
@Composable fun EtalonToast(message: String, visible: Boolean, modifier: Modifier = Modifier)
// every kept component keeps its exact current signature — see the list below
```

**The fourteen kept components keep their signatures. Not one of them may be renamed** — 25 feature files call `EmptyState`, 24 call `ErrorBanner`, 11 call `StickyActionBar`. Restyling means changing what is inside the function, never what it is called or what it takes.

| component | what changes |
|---|---|
| `EmptyState(text, modifier)` | text → `EtalonType.body` on `EtalonColors.ink3`, centred, no icon |
| `ErrorBanner(message, onRetry, modifier)` | `redBg` fill, `md` radius, no border; message `body` in `red`; retry as a compact `SecondaryButton` |
| `NoticeBanner(message, modifier)` | `lavenderBg` fill, `md` radius, message `body` in `indigo` |
| `OutboxBanner(pending, failedMessage, onRetry, onCancel)` | same shape as NoticeBanner; the failed variant on `redBg`; buttons compact |
| `SectionLabel(text, modifier)` | `EtalonType.sectionTitle` in `ink`, **no more `.uppercase()`** — the system sets section titles in sentence case |
| `StatusStripeCard(stripe, modifier, onClick, content)` | white `xl` card + hairline; the 3 dp stripe stays (it is a real signal on the payments queue) |
| `StickyActionBar(content)` | white→page gradient scrim above it, 16 dp side padding, `navigationBarsPadding()`, content spaced 8 dp |
| `PhotoStrip(…)` | thumbnails `lg`, hairline; the add tile becomes an `AddTile`-styled square with `EtalonIcons.Camera` |
| `Lightbox(photos, startIndex, onDismiss)` | scrim `navy` at 55 %, close as `EtalonIconButton(EtalonIcons.X, onDark = true)` |
| `CountStepper(label, value, onChange, max)` | page-bg cell, `md`, hairline, h40; −/+ as `EtalonIconButton`s with `EtalonIcons.Minus`/`Plus`; value `titleSm` |
| `CustodyChain(chain, modifier)` | stage avatars → `Avatar`; the chevron → `EtalonIcons.ChevronRight` in ink3 |
| `DriverPicker(drivers, selected, onSelect)` | rows as `OrderRow`-shaped light rows with an `Avatar`; selected row `lavenderBg` |
| `RegionField` / `RegionPickerSheet` | field as a `FormField` row with `EtalonIcons.ChevronDown`; sheet white `sheet`, `SearchField` at the top |
| `NumericKeypad` / `NumericKeypadSheet` | keys `md` on `page` with a hairline, digits `titleSm`; backspace `EtalonIcons.Delete`; sheet white with 22 dp top corners. **Still used by payments and logistics — D4 retires it from the calculator only, in phase 4.** |

- [ ] **Step 1: `FormCard.kt`** — §2: white `xl`, padding 14 horizontal / 6 vertical, fields stacked at 10 dp vertical padding with a hairline between, label 11/600 ink2 above a 15/600 ink value, borderless input.

```kotlin
@Composable
fun FormCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) = Column(
    modifier.fillMaxWidth().clip(EtalonShapes.xl).background(EtalonColors.surface)
        .border(EtalonSpace.hairline, EtalonColors.surfaceBorder, EtalonShapes.xl)
        .padding(horizontal = 14.dp, vertical = 6.dp),
    content = content,
)

/** One stacked field. The divider is drawn *below* each field and hidden on the last one by the
 *  card's own padding — simpler than asking every caller to know its index. */
@Composable
fun FormField(label: String, modifier: Modifier = Modifier, content: @Composable () -> Unit) = Column(modifier.fillMaxWidth()) {
    Column(Modifier.fillMaxWidth().padding(vertical = 10.dp)) {
        Text(label, style = EtalonType.meta.copy(fontWeight = FontWeight.W600), color = EtalonColors.ink2)
        Spacer(Modifier.height(4.dp))
        content()
    }
    HorizontalDivider(color = EtalonColors.surfaceBorder, thickness = EtalonSpace.hairline)
}
```

The value slot is deliberately a slot: a `FormField` may hold a `BasicTextField`, a picker row or plain text, and the design system must not decide which. Style the text at 15/600 ink at the call site with `EtalonType.titleSm.copy(fontWeight = FontWeight.W600, fontSize = 15.sp)`.

- [ ] **Step 2: `ConfirmSheet.kt`** — §2's modal: scrim `navy` at 55 %, sheet inset 10 dp on all sides, navy(22, pad 10) → indigoPanel(18), `amountLg` with the «UZS» prefix, two tiles, and a DarkButton + InverseButton footer.

```kotlin
@Composable
fun ConfirmSheet(
    caption: String, amount: Money, meta: String?,
    tiles: @Composable RowScope.() -> Unit,
    dismissText: String, confirmText: String,
    onDismiss: () -> Unit, onConfirm: () -> Unit, confirmEnabled: Boolean = true,
) = Box(Modifier.fillMaxSize().background(EtalonColors.navy.copy(alpha = 0.55f)).clickable(indication = null, interactionSource = remember { MutableInteractionSource() }, onClick = onDismiss), Alignment.Center) {
    Column(
        Modifier.padding(10.dp).fillMaxWidth()
            .etalonShadow(EtalonElevation.overlay, EtalonShapes.sheet, EtalonColors.navy)
            .clip(EtalonShapes.sheet).background(EtalonColors.navy).padding(10.dp)
            // The sheet swallows taps so the scrim's dismiss does not fire through it.
            .clickable(indication = null, interactionSource = remember { MutableInteractionSource() }) {},
    ) {
        Column(Modifier.fillMaxWidth().clip(EtalonShapes.xxl).background(EtalonColors.indigoPanel).padding(horizontal = 14.dp, vertical = 16.dp)) {
            Text(caption, style = EtalonType.caption.copy(fontWeight = FontWeight.W400), color = EtalonColors.onDarkMuted)
            Spacer(Modifier.height(8.dp))
            MoneyHeroText(amount, style = EtalonType.amountLg, onDark = true)
            if (meta != null) { Spacer(Modifier.height(6.dp)); Text(meta, style = EtalonType.meta, color = EtalonColors.onDarkMuted) }
            Spacer(Modifier.height(14.dp))
            Row(Modifier.fillMaxWidth(), Arrangement.spacedBy(8.dp), content = tiles)
        }
        Spacer(Modifier.height(10.dp))
        Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp, vertical = 2.dp), Arrangement.spacedBy(8.dp)) {
            DarkButton(dismissText, onDismiss, Modifier.weight(1f))
            InverseButton(confirmText, onConfirm, Modifier.weight(1f), enabled = confirmEnabled)
        }
    }
}
```

- [ ] **Step 3: `Toast.kt`** — navy, radius 14, 12.5/600 onDark, a 20 dp green check circle, sitting 96 dp above the bottom with 16 dp side margins; §1.7 gives it 200 ms in, 200 ms out and a 2600 ms life.

```kotlin
const val TOAST_DURATION_MS = 2600L

@Composable
fun EtalonToast(message: String, visible: Boolean, modifier: Modifier = Modifier) = AnimatedVisibility(
    visible = visible, enter = fadeIn(tween(200)) + slideInVertically(tween(200)) { it / 2 },
    exit = fadeOut(tween(200)), modifier = modifier,
) {
    Row(
        Modifier.padding(horizontal = 16.dp).padding(bottom = 96.dp)
            .etalonShadow(EtalonElevation.overlay, EtalonShapes.toast, EtalonColors.navy)
            .clip(EtalonShapes.toast).background(EtalonColors.navy).padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(20.dp).clip(EtalonShapes.pill).background(EtalonColors.green), Alignment.Center) {
            EtalonIcon(EtalonIcons.Check, null, size = 12.dp, tint = EtalonColors.onDark)
        }
        Spacer(Modifier.width(10.dp))
        Text(message, style = EtalonType.label.copy(fontSize = 12.5.sp), color = EtalonColors.onDark)
    }
}
```

`TOAST_DURATION_MS` is exported rather than owned: the *screen* decides when its toast stops, because only the screen knows whether the action behind it finished. Phase 2 wires it.

- [ ] **Step 4: Restyle the fourteen, one at a time, in the order of the table above.** After each one, `grep` the file for `LocalEtalonColors`, `EtalonType.mono`, `MaterialTheme.colorScheme` and `MaterialTheme.shapes` — a restyled component must reference **none** of them. When all fourteen are done:

```
grep -rn "LocalEtalonColors\|EtalonType\.mono\|MaterialTheme\.colorScheme\|MaterialTheme\.shapes" android/core/designsystem/src/main
```

must return **only** `LegacyTokens.kt`, `EtalonTheme.kt` and `EtalonTypography.kt` — the three files that define the shim. Anything else means a component was missed.

- [ ] **Step 5: Screenshot.** `FormCardScreenshotTest.kt` → `screenshots/ds_form_card_light.png` (a four-field client form, a ConfirmSheet over a page, a toast). `KeptComponentsScreenshotTest.kt` → `screenshots/ds_kept_light.png` (EmptyState, ErrorBanner with retry, NoticeBanner, OutboxBanner in both states, SectionLabel, CountStepper, StickyActionBar with two buttons, NumericKeypad). Compare the ConfirmSheet against `2b-payments.png`.

- [ ] **Step 6: Re-record, verify, commit.** All fourteen are on live screens, so most of the 45 move again. Subject: `Feat(android) · form card, confirm sheet, toast, and the kept components restyled`.

---

## Task 12: the token sheet, the hex lint, the old fonts, and the interim baselines

**Files:** create `core/designsystem/src/test/kotlin/uz/etalon/crm/core/designsystem/TokenSheetScreenshotTest.kt`, `.../NoRawHexTest.kt`; delete `core/designsystem/src/main/res/font/manrope_*.ttf` (4) and `jetbrainsmono_*.ttf` (3); re-record all 45 baselines.

**Interfaces consumed:** everything.
**Interfaces produced:** `screenshots/ds_token_sheet_light.png` — the review artefact for the whole phase.

- [ ] **Step 1: The token sheet.** One screenshot laid out like `docs/android/restyle-prototype/2a-token-sheet.png`: a **COLOR** block of labelled swatches in the spec's order (page, surface, surfaceBorder, navy, navy2, indigo, indigoPressed, indigoPanel, indigoTile, indigoTint, lavender, lavenderBg, ink, ink2, ink3, green, greenBg, red, redBg, debtOnDark, paidOnDark) plus the seven avatar colours; a **TYPE** block showing every `EtalonType` style rendered with its own name and a sample figure `53 268 760` so the tabular alignment is visible down the column; and a **SHAPE** row of the eight radii. Capture to `screenshots/ds_token_sheet_light.png`.

```kotlin
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [36], qualifiers = "w411dp-h1600dp")
class TokenSheetScreenshotTest {
    @get:Rule val rule = createComposeRule()

    private val swatches = listOf(
        "page" to EtalonColors.page, "surface" to EtalonColors.surface, "surfaceBorder" to EtalonColors.surfaceBorder,
        "navy" to EtalonColors.navy, "navy2" to EtalonColors.navy2,
        "indigo" to EtalonColors.indigo, "indigoPressed" to EtalonColors.indigoPressed,
        "indigoPanel" to EtalonColors.indigoPanel, "indigoTile" to EtalonColors.indigoTile,
        "indigoTint" to EtalonColors.indigoTint, "lavender" to EtalonColors.lavender,
        "lavenderBg" to EtalonColors.lavenderBg, "ink" to EtalonColors.ink, "ink2" to EtalonColors.ink2,
        "ink3" to EtalonColors.ink3, "green" to EtalonColors.green, "greenBg" to EtalonColors.greenBg,
        "red" to EtalonColors.red, "redBg" to EtalonColors.redBg,
        "debtOnDark" to EtalonColors.debtOnDark, "paidOnDark" to EtalonColors.paidOnDark,
    )

    private val styles = listOf(
        "displayTitle" to EtalonType.displayTitle, "headline" to EtalonType.headline,
        "kpi" to EtalonType.kpi, "amountLg" to EtalonType.amountLg, "titleSm" to EtalonType.titleSm,
        "sectionTitle" to EtalonType.sectionTitle, "body" to EtalonType.body,
        "rowTitle" to EtalonType.rowTitle, "rowAmount" to EtalonType.rowAmount,
        "label" to EtalonType.label, "meta" to EtalonType.meta, "tag" to EtalonType.tag,
        "caption" to EtalonType.caption,
    )

    @Test fun tokenSheet() {
        rule.setContent {
            EtalonTheme {
                Column(Modifier.fillMaxSize().background(EtalonColors.page).padding(16.dp)) {
                    Text("COLOR", style = EtalonType.sectionTitle, color = EtalonColors.ink2)
                    swatches.chunked(2).forEach { pair ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 3.dp), Arrangement.spacedBy(10.dp)) {
                            pair.forEach { (name, c) ->
                                Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                                    Box(Modifier.size(22.dp).clip(EtalonShapes.sm).background(c).border(1.dp, EtalonColors.surfaceBorder, EtalonShapes.sm))
                                    Spacer(Modifier.width(8.dp))
                                    Text(name, style = EtalonType.label, color = EtalonColors.ink)
                                }
                            }
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    Text("TYPE · PLUS JAKARTA SANS", style = EtalonType.sectionTitle, color = EtalonColors.ink2)
                    styles.forEach { (name, s) ->
                        Row(Modifier.fillMaxWidth().padding(vertical = 2.dp), Arrangement.SpaceBetween, Alignment.Bottom) {
                            Text(name, style = EtalonType.meta, color = EtalonColors.ink3)
                            Text("53 268 760", style = s, color = EtalonColors.ink)
                        }
                    }
                    Spacer(Modifier.height(16.dp))
                    Text("SHAPE", style = EtalonType.sectionTitle, color = EtalonColors.ink2)
                    Row(Modifier.fillMaxWidth().padding(top = 8.dp), Arrangement.spacedBy(8.dp)) {
                        listOf(EtalonShapes.xs, EtalonShapes.sm, EtalonShapes.md, EtalonShapes.lg, EtalonShapes.xl, EtalonShapes.xxl, EtalonShapes.sheet, EtalonShapes.pill).forEach {
                            Box(Modifier.weight(1f).height(40.dp).clip(it).background(EtalonColors.lavenderBg))
                        }
                    }
                }
            }
        }
        rule.onRoot().captureRoboImage("screenshots/ds_token_sheet_light.png")
    }
}
```

The figure in the TYPE column must be written with real U+2009 separators, so the sheet also proves the thin space renders at every size.

- [ ] **Step 2: The hex lint.** A plain JUnit 5 test — no Robolectric, it only reads files.

```kotlin
package uz.etalon.crm.core.designsystem

import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.File

/**
 * Design §8 / acceptance: every colour in the app resolves to a token. A `Color(0x…)` anywhere but
 * `EtalonColors.kt` is a colour that no theme change can reach, and this project has already
 * shipped one design system whose "tokens" were half bypassed by literals.
 *
 * Vector drawables are exempt by construction: their `#FF000000` stroke is a placeholder that
 * `EtalonIcon`'s tint replaces, and this test reads `.kt` files only.
 */
class NoRawHexTest {
    private val allowed = setOf("EtalonColors.kt")

    private fun repoRoot(): File =
        generateSequence(File(".").absoluteFile) { it.parentFile }
            .first { File(it, "settings.gradle.kts").exists() }

    @Test fun `no colour literal lives outside EtalonColors`() {
        val rx = Regex("""Color\(\s*0x[0-9A-Fa-f]{6,8}|Color\.(Red|Green|Blue|Yellow|Magenta|Cyan|LightGray|DarkGray|Gray)\b""")
        val offenders = repoRoot().walkTopDown()
            .filter { it.isFile && it.extension == "kt" }
            .filterNot { it.path.contains("${File.separator}build${File.separator}") }
            .filterNot { it.name in allowed }
            .filter { rx.containsMatchIn(it.readText()) }
            .map { it.relativeTo(repoRoot()).path }
            .toList()
        assertTrue(offenders.isEmpty(), "raw colour literals outside EtalonColors.kt:\n${offenders.joinToString("\n")}")
    }
}
```

`Color.White` and `Color.Black` are **not** in the pattern on purpose: `Color.White.copy(alpha = …)` is how an on-dark overlay is written and banning it would push people back to hex. `Color.Transparent` likewise. Run it and confirm it passes with zero offenders — as of `793e9ba` the tree already has none, so a failure here means this phase introduced one.

- [ ] **Step 3: Delete the old fonts — after proving nothing reads them.**

```
grep -rn "Manrope\|JetBrainsMono\|MonoNumeric\|R.font.manrope\|R.font.jetbrainsmono" android/app/src android/core android/feature --include=*.kt
```

must return nothing. Only then:

```
git rm android/core/designsystem/src/main/res/font/manrope_regular.ttf android/core/designsystem/src/main/res/font/manrope_medium.ttf android/core/designsystem/src/main/res/font/manrope_semibold.ttf android/core/designsystem/src/main/res/font/manrope_bold.ttf android/core/designsystem/src/main/res/font/jetbrainsmono_regular.ttf android/core/designsystem/src/main/res/font/jetbrainsmono_medium.ttf android/core/designsystem/src/main/res/font/jetbrainsmono_bold.ttf
```

If the grep returns a hit, **stop**: something still references the old faces and deleting them breaks the build. Fix the reference first — inside `:core:designsystem` only; a hit in a feature module means Task 3's shim did not do its job.

- [ ] **Step 4: The interim re-record.** `.\gradlew.bat recordRoborazziDebug --no-daemon`, then review the full set: `git status --short android/feature | wc -l` should show the modified PNGs, and every one of them must be opened. This is the phase's acceptance gate, so read them against the prototype: page `#F8F8FA`, white cards with a hairline and no shadow, Plus Jakarta throughout, thin-space figures with no «UZS» in a list, Lucide glyphs nowhere yet (the screens still hold Material icons — that is correct until each screen's phase). **Anything that looks wrong is a bug in a phase-1 component, not something for phase 2 to fix.**

State plainly in the commit body that these 45 are an interim baseline: phases 2–5 re-record each screen again as they redraw it, and the `*_dark.png` twins disappear as their tests are rewritten.

- [ ] **Step 5: Verify and commit.** `.\gradlew.bat testDebugUnitTest verifyRoborazziDebug assembleDebug --no-daemon` — the whole thing, from a clean `--no-daemon` run. Subject: `Feat(android) · token sheet, hex lint, and the interim baselines`.

---

## Self-review

Before calling phase 1 done, check each of these and fix what fails — do not defer any of them to phase 2.

**Scope.**
- [ ] `git diff --stat 793e9ba..HEAD` touches `android/core/designsystem`, `android/core/ui` and `android/feature/*/screenshots` — **and nothing else**. A `.kt` file under `feature/*/src` in that list means the plan was broken.
- [ ] No ViewModel, repository, DAO, entity, migration, API interface, permission string or route was edited. No Room schema JSON was added.
- [ ] No user-facing string's *content* changed. `git diff 793e9ba..HEAD -- "*/values/strings.xml"` shows additions only (`ds_status_*_short`, `ds_cd_back`, `ds_cd_call`) — no modified or deleted lines.

**Tokens and the rules that bind them.**
- [ ] `NoRawHexTest` passes, and `EtalonColors.kt` is the only file it exempts.
- [ ] `grep -rn "LocalEtalonColors\|EtalonType\.mono" android/core/designsystem/src/main` returns only the three shim-defining files.
- [ ] No `isSystemInDarkTheme()`, no `darkColorScheme(`, no `dynamicLightColorScheme` anywhere in `:core:designsystem`.
- [ ] Every one of the 21 palette tokens and all 13 type styles appears on `ds_token_sheet_light.png`, and the swatches match the §1.1 table hex for hex.

**D-decisions.**
- [ ] D6: `EtalonTheme(darkTheme = true)` renders identically to `darkTheme = false` — the 15 `*_dark.png` baselines are byte-identical to their light twins.
- [ ] D7: every interactive component measures ≥ 48 dp in its hit dimension. Check the compact PrimaryButton, the 32 dp FilterChip, the 30 dp segment and the 40 dp IconButton.
- [ ] D8: `formatMoney` returns no unit; `formatMoneyHero` and `MoneyHeroText` are the only places «UZS» appears; every grouped figure uses U+202F (ruling R5 — written in Kotlin as the escape backslash-u-2-0-2-F). `grep -rn $' ' android/core/ui/src` returns nothing.
- [ ] D3: `BottomNav` renders five cells without ellipsizing «Буюртма» at 360 dp — or the failure was reported to the owner rather than papered over.

**Fonts and icons.**
- [ ] `FontWeightTest` passes and the seven old `.ttf` files are gone; `res/font/` holds the five Plus Jakarta static weights only (the resource merger rejects non-font files there), and `src/main/assets/font/OFL.txt` ships the licence.
- [ ] All 36 glyphs render at 20/18/16/12 dp on `ds_icons_light.png` — no blank cell, no filled blob where a stroke belongs. `LICENSE-lucide.txt` is committed.
- [ ] Every one of the 30 Material icons in use has a row in the mapping table, and `EtalonIcons` exposes the glyph it names.

**Components.**
- [ ] Every component in design §3's table exists, in `:core:designsystem`, with a screenshot: PrimaryButton, SecondaryButton, DarkButton, InverseButton, IconButton, Avatar, SearchField, FilterChip, SegmentedControl, StatusTag ×3 palettes, KpiCard, OrderRow, MonthHeader, NavySheet, DetailPanel, RoomTile, AddTile, ProgressCard, StepTimeline, BottomNav, Toast, ConfirmSheet, FormCard.
- [ ] StatusTag covers all **seven** order statuses (plus UNKNOWN) and **both** payment triads, in all three surfaces.
- [ ] Not one kept component was renamed, and no feature module needed an edit to compile. If one did, it is listed in the phase's final commit body with the one line that changed.

**Green.**
- [ ] From `android/`, with `JAVA_HOME` set: `.\gradlew.bat testDebugUnitTest verifyRoborazziDebug assembleDebug --no-daemon` passes from a cold start, at HEAD, with a clean working tree.
- [ ] The 987 existing Android unit tests are still green, and none was weakened to get there — the only test files edited are `FormattersTest.kt` (D8) and `StatusChipMappingTest.kt` (if a tone name moved).
- [ ] Every commit in the phase carries the `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` trailer, and `git stash` was never used.
