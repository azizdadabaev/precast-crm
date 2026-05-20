# EtalonSlabs — Precast Calculation Logic & Blender Addon Checklist

**For:** The Claude session building / auditing the Blender addon (`calculate_slab()`)  
**Source of truth:** `precast-crm/src/services/calculation-engine.ts` — every formula below is copied verbatim from that file. If anything in the addon disagrees with this document, **the CRM is always right**.

---

## 1. Physical Constants (factory-fixed, not user-editable)

```
PITCH           = 0.58   m    beam center-to-center spacing
BEAM_WIDTH      = 0.12   m    beam width along the length axis
BLOCK_LENGTH    = 0.20   m    block length along the beam axis
BLOCK_VISIBLE   = 0.45   m    visible block width between two beams (perpendicular to beam)
TOPPING_THICK   = 0.05   m    concrete topping thickness
DEFAULT_BEARING = 0.15   m    default wall bearing on each side
```

---

## 2. Inputs (what the CRM sends to Blender via the bridge)

The CRM sends **resolved, authoritative values** — the addon must trust them verbatim, not re-derive:

| Field | Type | Meaning |
|---|---|---|
| `inner_width` | float m | Inside-wall to inside-wall, **perpendicular** to beams |
| `inner_length` | float m | Inside-wall to inside-wall, **parallel** to beams |
| `bearing` | float m | How far beams sit on each wall (default 0.15) |
| `correction` | float m | Length adjustment applied **before** pitch math (positive or negative) |
| `pattern` | "GB"\|"BGB"\|"GBG" | **Resolved pattern** — already post-auto-pick and post-force_start_beam. Trust this. |
| `pitches` | int | **Resolved pitch count** — already post-auto-pick and post-bump. Trust this. |
| `extra_beams` | int | Manual extra beams. **This is the effective count after any GBG→GB conversion consumed one.** |
| `force_start_beam` | bool | Whether the start-beam toggle was set by the operator |
| `slab_length` | float m | CRM-computed monolith length. **Render this verbatim; do not re-derive.** |

> **Protocol v2 rule:** The CRM resolves everything before sending. Do NOT run your own auto-pick or pitch-bump logic. Do NOT re-derive `pattern` from `inner_length + correction`. The CRM's values are what's on the invoice — any divergence means the PDF lies to the customer.

---

## 3. Step-by-Step Calculation Pipeline

### Step 1 — Beam length
```
beam_length = inner_width + 2 × bearing
```
Round to 3 decimal places.

### Step 2 — Blocks per row
```
blocks_per_row = CEIL(inner_width / BLOCK_LENGTH)    -- CEIL, not FLOOR or ROUND
```

### Step 3 — Effective length & pitches (informational only — CRM already resolved)
```
effective_length = inner_length + correction          -- round3
pitches          = FLOOR(effective_length / PITCH)    -- CRM already bumped if needed
remainder        = effective_length − pitches × PITCH -- informational
```
**The addon receives the already-bumped `pitches`. Use it directly.**

### Step 4 — Pattern → counts and visual extension

| Pattern | beam_count_base | block_rows | slab extension |
|---|---|---|---|
| **GB** | `pitches` | `pitches` | 0 m |
| **BGB** | `pitches + 1` | `pitches` | `BEAM_WIDTH` (0.12 m) |
| **GBG** | `pitches` | `pitches + 1` | `BLOCK_VISIBLE` (0.45 m) |

```
beam_count  = beam_count_base + extra_beams           -- effective_extra_beams already applied
block_rows  = see table above
total_blocks = blocks_per_row × block_rows
```

### Step 5 — Three lengths (critical — each has a different job)

```
slab_length     = pitches × PITCH + extension                  -- visual/physical span
billed_length   = pitches × PITCH + pattern_billed_extension   -- used for m² billing
monolith_length = slab_length + extra_beams × BEAM_WIDTH       -- what the UI shows as "Slab L"
```

Where:
```
pattern_billed_extension = BLOCK_VISIBLE (0.45 m)  if pattern == "GBG"
                         = 0                        if pattern == "GB" or "BGB"
```

> **GBG billing rule (the tricky one):** For GBG, the closing block row's 0.45 m is **folded into `billed_length`** and billed at the m² rate. It is **NOT** a separate per-block line item. This is different from BGB where the closing beam IS a separate per-meter charge.

### Step 6 — Areas
```
billed_area   = beam_length × billed_length    -- round3 — what m² rate applies to
monolith_area = beam_length × monolith_length  -- round3 — display only
```

### Step 7 — Concrete topping volume
```
concrete_volume = beam_length × slab_length × TOPPING_THICKNESS  -- round3
```
Note: uses `slab_length`, not `monolith_length` — extra beams don't contribute to topping.

---

## 4. Auto-Pick Logic (for reference — do NOT re-run in addon)

The CRM's auto-pick uses these exact thresholds on `remainder`:
```
R = 0              → GB  at pitches     (exact fit)
R ≤ 0.20           → BGB at pitches     (small gap → add closing beam)
R ≤ 0.45           → GBG at pitches     (medium gap → add closing block row)
R > 0.45           → GB  at pitches+1   (large gap → round up full pitch)
```
Comparison uses a `1e-9` epsilon to absorb floating-point noise:
- `R ≤ 1e-9` → GB (treat as zero)
- `R ≤ 0.20 + 1e-9` → BGB
- `R ≤ 0.45 + 1e-9` → GBG
- else → GB at pitches+1

---

## 5. force_start_beam / extra_beams Interaction (critical for GBG)

This is the most complex part — the GBG case in particular.

### Promotion rules (applied before counting):

**GBG + start beam (either `force_start_beam=true` OR `extra_beams ≥ 1`):**
- The slab is promoted to **GB at pitches+1**
- `pitches += 1`; `pattern` becomes `"GB"`
- If the start beam came from `extra_beams` (not `force_start_beam`), one extra is consumed: `effective_extra_beams -= 1`
- **Result:** a normal alternating GB slab one pitch longer; no pattern extension, no GBG closing block row

**GB + `force_start_beam=true`:**
- Promoted to **BGB at same pitches** (closing beam added)
- `pattern` becomes `"BGB"`

**BGB + `force_start_beam=true`:**
- No-op — already starts with a beam

### What "extra_beams" in the bridge payload means:
The CRM sends the **effective** extra beam count after any GBG→GB conversion has consumed one. So if the operator entered `extra_beams=2` on a GBG room and the start-beam logic consumed one, the bridge payload has `extra_beams=1` and `pattern="GB"`. The addon should never second-guess this.

---

## 6. Pricing Rules

### m² price tiers (by beam_length):
| beam_length ≤ | UZS/m² |
|---|---|
| 4.30 m | 140 000 |
| 5.30 m | 160 000 |
| 6.30 m | 180 000 |
| 7.30 m | 200 000 |
| 8.30 m | 230 000 |
| > 8.30 m | 230 000 (clamped to last tier) |

### Extra-beam price tiers (by beam_length):
| beam_length ≤ | UZS/m |
|---|---|
| 4.30 m | 60 000 |
| 5.30 m | 70 000 |
| 6.30 m | 80 000 |
| 7.30 m | 100 000 |
| 8.30 m | 120 000 |
| > 8.30 m | 120 000 (clamped) |

Tier lookup uses `beam_length ≤ max + 1e-9` (epsilon).

### Cost components:
```
m2_cost                = billed_area × m2_price                              -- round2
pattern_extra_cost     = beam_length × extra_beam_price_per_m    if BGB
                       = 0                                        if GB or GBG
manual_extra_beams_cost = effective_extra_beams × beam_length × extra_beam_price_per_m  -- round2
subtotal               = m2_cost + pattern_extra_cost + manual_extra_beams_cost
```

> **GBG pattern_extra_cost is 0** — the closing block row is covered by the expanded `billed_length`. Only BGB pays a separate closing-beam fee.

---

## 7. Rounding Convention

The CRM uses **round-half-away-from-zero** (not JS banker's rounding):
```python
def round_n(n, decimals):
    f = 10 ** decimals
    return math.copysign(round(abs(n) * f) / f, n)
```
- Lengths (m): round to 3 decimal places
- Areas (m²): round to 3 decimal places  
- Costs (UZS): round to 2 decimal places

---

## 8. Extras-Only Mode (length=0)

When `inner_length=0` and `extra_beams ≥ 1`, the operator is billing standalone beams (edge beams, balcony reinforcement) with no underlying slab:
- No pitch math, no pattern, no m² billing
- `beam_count = extra_beams`; `block_rows = 0`; `total_blocks = 0`
- `slab_length = extra_beams × BEAM_WIDTH`
- `subtotal = extra_beams × beam_length × extra_beam_price_per_m`
- All pitch/area/m²-rate fields are 0 / N/A — render as em-dashes

---

## 9. Blender Addon Checklist — Verify Every Item

### 9.1 Constants
- [ ] `PITCH = 0.58` (not 0.6, not 0.57)
- [ ] `BEAM_WIDTH = 0.12`
- [ ] `BLOCK_VISIBLE = 0.45` (used only in GBG extension)
- [ ] `BLOCK_LENGTH = 0.20` (used for `blocks_per_row = CEIL(inner_width / 0.20)`)
- [ ] `DEFAULT_BEARING = 0.15`

### 9.2 Protocol v2 — trust the CRM
- [ ] Addon does NOT run its own auto-pick (`autoPickPattern`) — uses `pattern` from payload verbatim
- [ ] Addon does NOT re-derive `pitches` from `effective_length / PITCH` — uses `pitches` from payload verbatim
- [ ] Addon does NOT re-run `force_start_beam` / GBG→GB promotion — that's already been applied; `pattern` and `pitches` reflect the result
- [ ] `slab_length` from payload is rendered verbatim on the PDF (field name on the PDF: "Slab L" / "Монолит узунлиги")

### 9.3 Pattern → counts
- [ ] GB: `beam_count = pitches + extra_beams`, `block_rows = pitches`, extension = 0
- [ ] BGB: `beam_count = pitches + 1 + extra_beams`, `block_rows = pitches`, extension = `BEAM_WIDTH` (0.12)
- [ ] GBG: `beam_count = pitches + extra_beams`, `block_rows = pitches + 1`, extension = `BLOCK_VISIBLE` (0.45)
- [ ] `total_blocks = blocks_per_row × block_rows` (CEIL for blocks_per_row)

### 9.4 Length calculations — the most error-prone area
- [ ] **slab_length** = `pitches × PITCH + extension` (extension is 0/0.12/0.45 per pattern)
- [ ] **billed_length** = `pitches × PITCH + (0.45 if GBG else 0)` — GBG adds BLOCK_VISIBLE to the billed length
- [ ] **monolith_length** = `slab_length + extra_beams × BEAM_WIDTH`
- [ ] GBG `billed_length` includes the 0.45 m closing block row — it is NOT charged separately
- [ ] BGB `billed_length` does NOT include the 0.12 m closing beam (that's `pattern_extra_cost`)
- [ ] PDF shows `monolith_length` as "Slab L" (same as CRM's Монолит узунлиги column)

### 9.5 GBG billing rule — the most commonly wrong thing
- [ ] `pattern_extra_cost = 0` for GBG (closing block row is m²-billed, not per-block)
- [ ] `billed_area` for GBG = `beam_length × (pitches × PITCH + 0.45)` — the 0.45 is IN the billed area
- [ ] `m2_cost` for GBG uses the expanded `billed_area` above
- [ ] Block count for GBG includes the extra row (`block_rows = pitches + 1`) — blocks are counted physically but NOT billed separately in GBG

### 9.6 BGB billing rule
- [ ] `pattern_extra_cost = beam_length × extra_beam_price_per_m` (1 closing beam charged per-meter)
- [ ] `billed_length` for BGB = `pitches × PITCH` (the 0.12 m beam is NOT in billed_length)
- [ ] `billed_area` for BGB = `beam_length × pitches × PITCH`

### 9.7 Extra beams
- [ ] `manual_extra_beams_cost = effective_extra_beams × beam_length × extra_beam_price_per_m`
- [ ] Extra beams **extend monolith_length** by `extra_beams × BEAM_WIDTH`
- [ ] Extra beams are NOT included in `billed_length` (they go in `manual_extra_beams_cost` instead)
- [ ] `subtotal = m2_cost + pattern_extra_cost + manual_extra_beams_cost`

### 9.8 Pricing tiers
- [ ] Tier lookup is by `beam_length`, not `inner_width` or `inner_length`
- [ ] Comparison includes epsilon: `beam_length ≤ tier_max + 1e-9`
- [ ] Both m² tiers AND extra-beam tiers clamp to the last tier if `beam_length > 8.30`

### 9.9 Rounding
- [ ] All length/area results rounded to **3 decimal places**
- [ ] All cost results rounded to **2 decimal places**
- [ ] Rounding is **half-away-from-zero** (Python: `round()` is fine; avoid banker's rounding)

### 9.10 PDF column correspondence
The PDF table must show these columns in this order, matching CRM labels:

| PDF column | CRM field | CRM label |
|---|---|---|
| Name | `name` | Хона |
| W | `inner_width` | Эни |
| L | `inner_length` | Бўйи |
| Pattern | `pattern` | Шаблон |
| Beam Len | `beam_length` | Балка |
| Blks/Row | `blocks_per_row` | Ғ/қатор |
| Total Blks | `total_blocks` | Жами Ғ |
| Beams | `beam_count` | Балка (count) |
| Slab L | `monolith_length` | Монолит узунлиги |
| Area | `monolith_area` | Майдон |
| m² Rate | `m2_price` | м² нархи |
| Subtotal | `subtotal` | Сумма |

---

## 10. Concrete Verification Test Cases

Run these exact inputs through `calculate_slab()` and verify the addon produces the same numbers.

### Test 1 — Basic GB (exact fit)
```
Input:  inner_width=6, inner_length=5, bearing=0.15, correction=0
        pattern auto → effective_length=5.000, pitches=8, R=0.36 → GBG

Wait — 5.0 / 0.58 = 8.620..., floor=8, R=5.0−8×0.58=5.0−4.64=0.36
0.36 ≤ 0.45 → GBG at pitches=8
```
Expected (GBG):
```
beam_length  = 6.00 + 2×0.15 = 6.30 m
blocks_per_row = CEIL(6.0/0.2) = 30
pitches = 8
beam_count_base = 8 (GBG)
block_rows = 9 (GBG: pitches+1)
total_blocks = 30×9 = 270
slab_length = 8×0.58 + 0.45 = 4.640 + 0.45 = 5.090 m
billed_length = 8×0.58 + 0.45 = 5.090 m  (GBG: BLOCK_VISIBLE in billed_length)
monolith_length = 5.090 + 0×0.12 = 5.090 m (no extra beams, same as slab_length in this case)

Wait — that doesn't match the screenshot showing 5.22m. Let me re-check.
The screenshot shows room: W=6, L=5, bearing=0.15, correction=0.2, pattern=Г-Б(auto), beam=6.3
effective_length = 5 + 0.2 = 5.2
pitches = floor(5.2/0.58) = floor(8.965) = 8  (NOT 9!)
R = 5.2 - 8×0.58 = 5.2 - 4.64 = 0.56
0.56 > 0.45 → GB at pitches+1 = 9

So it's GB at 9 pitches.
```

### Test 1 — Хона 1 from screenshot (GB, correction=0.2)
```
Input:  inner_width=6, inner_length=5, bearing=0.15, correction=0.2
        effective_length = 5.2
        pitches = FLOOR(5.2/0.58) = 8, R = 5.2 - 4.64 = 0.56 > 0.45 → GB at pitches+1=9
        pattern = GB, pitches = 9
```
Expected:
```
beam_length   = 6 + 2×0.15 = 6.30 m
blocks_per_row = CEIL(6.0/0.2) = 30
beam_count    = 9 (GB: pitches, no extras)
block_rows    = 9 (GB)
total_blocks  = 270
slab_length   = 9×0.58 + 0 = 5.220 m
billed_length = 9×0.58 = 5.220 m
monolith_length = 5.220 + 0×0.12 = 5.220 m       ← matches "5,22m" in screenshot
billed_area   = 6.30 × 5.220 = 32.886 → 32.886 m²  ← matches "32,89m²" (rounding)
m2_price      = 180 000 (beam_length 6.30 ≤ 6.30+eps → tier 3)
m2_cost       = 32.886 × 180000 = 5 919 480         ← matches "5 919 480"
subtotal      = 5 919 480
```

### Test 2 — Хона 2 from screenshot (GB, beam 5.3)
```
Input:  inner_width=5, inner_length=9, bearing=0.15, correction=0.2
        effective_length = 9.2
        pitches = FLOOR(9.2/0.58) = 15, R = 9.2 - 8.70 = 0.50 > 0.45 → GB at 16
        pattern = GB, pitches = 16
```
Expected:
```
beam_length   = 5 + 2×0.15 = 5.30 m
blocks_per_row = CEIL(5.0/0.2) = 25
beam_count    = 16
block_rows    = 16
total_blocks  = 400
slab_length   = 16×0.58 = 9.280 m                  ← matches "9,28m"
billed_length = 9.280 m
monolith_length = 9.280 m
billed_area   = 5.30 × 9.280 = 49.184 → 49.184 m²  ← matches "49,18m²"
m2_price      = 160 000 (beam_length 5.30 ≤ 5.30+eps → tier 2)
m2_cost       = 49.184 × 160 000 = 7 869 440        ← matches "7 869 440"
subtotal      = 7 869 440
```

### Test 3 — GBG pattern (no extra beams)
```
Input:  inner_width=4, inner_length=3, bearing=0.15, correction=0
        effective_length = 3.0
        pitches = FLOOR(3.0/0.58) = 5, R = 3.0 - 2.90 = 0.10 ≤ 0.20 → BGB at 5
        pattern = BGB, pitches = 5
```

### Test 3 (revised) — Pure GBG
```
Input:  inner_width=4, inner_length=3, bearing=0.15, correction=0.15
        effective_length = 3.15
        pitches = FLOOR(3.15/0.58) = 5, R = 3.15 - 2.90 = 0.25 → 0.20 < R ≤ 0.45 → GBG
        pattern = GBG, pitches = 5
```
Expected:
```
beam_length   = 4 + 2×0.15 = 4.30 m
blocks_per_row = CEIL(4.0/0.2) = 20
beam_count    = 5 (GBG: pitches, no extras)
block_rows    = 6 (GBG: pitches + 1)
total_blocks  = 120
extension     = BLOCK_VISIBLE = 0.45
slab_length   = 5×0.58 + 0.45 = 2.90 + 0.45 = 3.350 m
billed_length = 5×0.58 + 0.45 = 3.350 m         (GBG: BLOCK_VISIBLE IN billed_length)
monolith_length = 3.350 m
billed_area   = 4.30 × 3.350 = 14.405 m²
m2_price      = 140 000 (beam_length 4.30 ≤ 4.30+eps → tier 1)
m2_cost       = 14.405 × 140 000 = 2 016 700
pattern_extra_cost = 0                           (GBG: zero — folded into m²)
subtotal      = 2 016 700
```
**Verify:** block_rows=6 (not 5), pattern_extra_cost=0 (not beam_length×extra_tier).

### Test 4 — GBG + 1 extra beam (extra_beams does NOT consume GBG promotion unless force_start_beam is false... wait)

Actually: GBG + extra_beams≥1 DOES trigger the GBG→GB promotion (consumes 1 extra beam):
```
Input:  same as Test 3 (GBG chosen), extra_beams=1, force_start_beam=false
        GBG + extra_beams≥1 → promoted to GB at pitches+1=6, effective_extra_beams=0
        pattern = GB, pitches = 6
```
Expected:
```
beam_count    = 6 + 0 = 6
block_rows    = 6
total_blocks  = 20×6 = 120
slab_length   = 6×0.58 = 3.480 m
billed_length = 3.480 m
monolith_length = 3.480 m                       (effective_extra_beams=0)
billed_area   = 4.30 × 3.480 = 14.964 m²
m2_cost       = 14.964 × 140 000 = 2 094 960
pattern_extra_cost = 0
manual_extra_beams_cost = 0                     (effective_extra_beams=0)
subtotal      = 2 094 960
```
**Critical:** extra_beams=1 input → effective_extra_beams=0 in result. The CRM sends `extra_beams=0` and `pattern="GB"` and `pitches=6` in this case. Addon sees a plain GB-6 room with no extras.

### Test 5 — GBG + 2 extra beams
```
Input:  GBG chosen (same setup), extra_beams=2, force_start_beam=false
        GBG + extra_beams≥1 → GB at pitches+1=6, effective_extra_beams=1
```
Expected:
```
beam_count    = 6 + 1 = 7
block_rows    = 6
slab_length   = 6×0.58 = 3.480 m
monolith_length = 3.480 + 1×0.12 = 3.600 m
billed_area   = 4.30 × 3.480 = 14.964 m²
m2_cost       = 14.964 × 140 000 = 2 094 960
manual_extra_beams_cost = 1 × 4.30 × 60 000 = 258 000
subtotal      = 2 352 960
```
The CRM sends `extra_beams=1`, `pattern="GB"`, `pitches=6`.

---

## 11. Summary: What the Blender Addon Must NOT Do

1. **Do NOT run auto-pick** — `pattern` is already resolved.
2. **Do NOT bump pitches** — `pitches` is already bumped (for R>0.45 case or GBG→GB case).
3. **Do NOT re-apply force_start_beam** — the `pattern` in the payload already reflects the promotion result.
4. **Do NOT charge GBG's closing block row separately** — it is m²-billed via `billed_length += BLOCK_VISIBLE`.
5. **Do NOT include extra_beams in billed_area** — extras go in `manual_extra_beams_cost` only.
6. **Do NOT use inner_width directly for beam_length** — always `inner_width + 2 × bearing`.

---

*This document is auto-generated from `precast-crm/src/services/calculation-engine.ts` and `normalize-rooms.ts`. When the CRM engine changes, update this document in the same commit.*
