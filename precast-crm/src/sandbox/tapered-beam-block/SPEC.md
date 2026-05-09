---
name: etalon-tbm-tapered-beam-block
description: Use ONLY for tapered, trapezoidal, or irregular-quadrilateral beam-and-block slab calculations (ETALON TBM "Yig'ma Monolit" prestressed system). Computes beam row count, taper progression per row, beam length grouping strategy, hybrid-slab detection, and production/installation guidance for precast prestressed T-beams at 580 mm centers. Do NOT use for rectangular rooms — those use a simpler single-beam-length workflow and should be handled separately.
---

# ETALON TBM — Tapered Beam & Block Calculation Skill

## 0. Scope & Routing Rule (READ FIRST)

This skill applies **only** to slabs where the two beam-direction widths differ:

- Trapezoidal slabs (`width1 ≠ width2`)
- Irregular quadrilaterals (`length1 ≠ length2`)
- Any geometry producing a non-zero `ΔW`

**If the user describes a rectangular room** (`width1 == width2` and a single span), do NOT run this skill's taper logic. Instead respond:

> "This room is rectangular, not tapered. The taper-grouping skill doesn't apply here — a rectangular slab uses one beam length across all rows. Want me to run a straight rectangular take-off instead?"

Then wait for confirmation before proceeding with any other workflow.

## 1. Purpose

Calculate, for tapered precast prestressed beam-and-block floors:

- Number of beam rows at 580 mm centers
- Beam length progression per row
- Optimal beam-length grouping (1–4 SKUs) for factory production
- Hybrid-slab detection (where monolithic concrete replaces beams)
- Edge compensation strategy
- Bill of materials and installation notes

Output is for **quotation, manufacturing planning, and contractor support** — not structural certification.

## 2. Inputs

### 2.1 Geometry (required for taper math)

| Parameter | Description | Unit | Required | Range |
|---|---|---|---|---|
| `width1` | Beam length at start side | m | Yes | 1.0–12.0 |
| `width2` | Beam length at end side | m | Yes (for taper) | 1.0–12.0 |
| `length` | Distance along which rows repeat | m | Yes | 1.0–30.0 |
| `length1` | Side A (irregular only) | m | Optional | 1.0–30.0 |
| `length2` | Side B (irregular only) | m | Optional | 1.0–30.0 |
| `shape_type` | `trapezoidal` / `irregular` | text | Optional | auto-detected |

### 2.2 System

| Parameter | Default |
|---|---|
| `beam_spacing` | **580 mm** |
| `beam_type` | Standard TBM prestressed T-beam |
| `block_type` | Standard hollow hourdi |
| `topping_thickness` | [VERIFY] |
| `ring_beam` | true |

### 2.3 Structural inputs — [VERIFY, currently not enforced]

`live_load`, `dead_load`, `load_class`, `concrete_grade` — accept if provided but flag that this skill performs geometric/material estimation, not structural design.

## 3. Calculation Logic

### 3.1 Constants
```
S = 0.58 m   (beam center spacing)
```

### 3.2 Row count and beam count
```
N_theoretical  = length / S
N_pitches_raw  = floor(N_theoretical)
R              = length − N_pitches_raw × S      (remainder)

if R > 0.45:
    N_pitches  = N_pitches_raw + 1               (§15 bump)
else:
    N_pitches  = N_pitches_raw

N_beams        = N_pitches + 1                   (one beam at each pitch boundary,
                                                  including both walls)
L_covered      = N_pitches × S                   (length over which interpolation runs)
```

The bump rule is borrowed verbatim from the production engine's
`autoPickPattern`. The tapered engine doesn't apply patterns — it just
needs the **pitch** count so its **beam** count covers from `width1`
(at position 0) to `width2` (at position `L_covered`) inclusive.

Edge cases: when `R ≤ 0.45`, the slab edge between `L_covered` and
`length` is absorbed by edge compensation (see §3.7). When `R > 0.45`,
the bump extends `L_covered` past `length` by ≤ 0.13 m — also absorbed
by bearing + edge compensation.

### 3.3 Taper magnitude
```
ΔW = width2 − width1
```

### 3.4 Per-metre and per-row change
```
C_m = ΔW / length              (change per metre)
C_r = C_m × 0.58               (change per row)
    = (ΔW / length) × 0.58
```
Sign convention: `C_r > 0` → widening; `C_r < 0` → narrowing.

### 3.5 Inner width at beam n (n = 0 is the start-side wall)
```
W_n = width1 + (width2 − width1) × (n × S / L_covered)    for n = 0..N_pitches
```

Endpoint contract — non-negotiable:
```
W_0           = width1   (always)
W_{N_pitches} = width2   (always)
```
Linear interpolation between, monotonic in the sign of (`width2 − width1`).
The array length is `N_pitches + 1 = N_beams`. The previous
formulation `W_n = width1 + C_r × n for n = 0..N_practical−1` produced
`N_practical` widths and missed the closing beam at `width2`; that was
the §15 bug, fixed here.

### 3.6 Irregular quadrilateral — effective length
When `length1 ≠ length2`:
```
L_effective = (length1 + length2) / 2
```
Substitute `L_effective` for `length` in §3.4.

### 3.7 Edge compensation
When a stock beam is larger than the row's actual width:
```
E = W_stock − W_actual
```
Compensate via: edge concrete pour, ring beam, cut blocks, or triangular infill strip — choose whichever minimizes site cutting.

## 4. Beam Grouping Decision Rules

Two checks run in parallel; **the more restrictive result wins**.

### 4.1 By total taper magnitude (`|ΔW|`)

| `|ΔW|` | Strategy | Group count |
|---|---|---|
| ≤ 0.25 m | Single beam size; absorb taper at edge | 1 |
| 0.25 – 0.50 m | Grouped lengths | 2 |
| 0.50 – 0.80 m | Grouped lengths | 3 |
| > 0.80 m | Grouped lengths **or** hybrid slab | 4 (or hybrid) |

### 4.2 By per-row change (`|C_r|`)

| `|C_r|` | Severity | Action |
|---|---|---|
| < 0.03 m (< 3 cm) | Small | Single stock beam size |
| 0.03 – 0.12 m | Medium | Grouped beam strategy |
| ≥ 0.12 m | Extreme | Wedge geometry → hybrid recommended |

### 4.3 Hybrid slab detection

Trigger hybrid (beam-block + monolithic wedge) when **any** of:

- `|C_r| > 0.50 m`
- `N_practical < 4`
- Geometry would require a unique beam every row

## 5. Production Optimization Priorities

In order:

1. Minimize stopper adjustments on the prestressing bed
2. Minimize prestressing interruptions
3. Minimize SKU count
4. Minimize site cutting
5. Maintain installer simplicity

Always prefer grouped lengths over per-row custom beams.

## 6. Reference Data

### 6.1 Production (known)

| Item | Value |
|---|---|
| Blocks per cycle | 7 |
| Cycle time | 25 s |
| Cement per block | ~2.5 kg |
| Vibration motors | 2 × 5.5 kW |

### 6.2 Block dimensions

- Hollow hourdi, approx **500 × 100 × 200 mm** [VERIFY catalog]

### 6.3 Beam catalog — [VERIFY]

Heights, widths, wire counts, capacities, self-weight: not yet populated. Ask the user or flag missing if a calculation depends on these.

### 6.4 Waste allowances — [VERIFY]

Suggested placeholders until confirmed:

| Material | Allowance |
|---|---|
| Blocks | 3–7 % |
| Concrete | 5 % |
| Beams | 0–2 % |

## 7. Standards & Assumptions

- Ribbed slab action with composite topping
- Edge ring beams present
- Simply supported beams
- Contractor cuts edge blocks on site
- Market: Uzbekistan / CIS, drawing on Eurocode 2, Polish, and Italian laterocemento practice
- **Not formally code-certified** — flag this in any output that resembles a structural deliverable

## 8. Validations

| Condition | Response |
|---|---|
| Any dimension ≤ 0 | Reject |
| `beam_spacing ≤ 0` | Reject |
| `width > max producible beam length` [VERIFY] | Reject, request structural review |
| `|C_r| > 0.50 m` | Warn: "Extreme taper — hybrid slab recommended" |
| `N_practical < 3` | Warn: "Geometry too short for practical taper distribution" |
| Every row needs unique beam | Reject; force grouped strategy |
| Beam span exceeds known capacity [VERIFY] | Reject; request structural verification |

## 9. Output Format

```markdown
# Beam & Block Calculation Report

## Input
- Width 1: …
- Width 2: …
- Length: …
- Beam spacing: 580 mm

## Geometry Results
- Total taper (ΔW): …
- Change per row (C_r): …
- Practical row count (N): …

## Beam Strategy
- Recommended grouping: …
- Beam lengths: …
- Production notes: …

## Installation Notes
- Edge compensation: …
- Hybrid zones: …
- Recommended layout: …

## Material Summary
- Beam quantity: …
- Approx block quantity: …
- Concrete notes: …
```

## 10. Worked Examples

### Example 1 — Mild trapezoid (single beam)
```
width1 = 3.70 m,  width2 = 3.90 m,  length = 5.70 m
ΔW         = 0.20 m
C_r        = (0.20 / 5.70) × 0.58 = 0.0204 m  (2.04 cm/row, reported)
floor(L/S) = 9   →  R = 5.70 − 9 × 0.58 = 0.48
R > 0.45  →  bump (§15)  →  N_pitches = 10
N_beams    = 11
L_covered  = 5.80 m
W_0  = 3.700  (= width1)
W_10 = 3.900  (= width2)
```
**Strategy:** one beam size at 3.90 m, qty = 11. Edge compensation: 20 cm absorbed across rows via cut blocks or edge concrete.

### Example 2 — Medium taper (3 groups)
```
width1 = 3.75 m,  width2 = 4.45 m,  length = 8.70 m
ΔW         = 0.70 m
C_r        = (0.70 / 8.70) × 0.58 = 0.0467 m  (4.67 cm/row, reported)
floor(L/S) = 15  →  R = 0.00  →  no bump  →  N_pitches = 15
N_beams    = 16
L_covered  = 8.70 m
W_0  = 3.750  (= width1)
W_15 = 4.450  (= width2)
```
**Strategy:** 3 beam groups, total qty = 16. Three stopper settings; efficient for prestressing-bed batching.

### Example 3 — Extreme wedge (hybrid)
```
width1 = 5.00 m,  width2 = 2.00 m,  length = 1.60 m
ΔW         = −3.00 m
C_r        = (−3.00 / 1.60) × 0.58 = −1.0875 m
floor(L/S) = 2   →  R = 1.60 − 2 × 0.58 = 0.44
R ≤ 0.45  →  no bump  →  N_pitches = 2
N_beams    = 3
L_covered  = 1.16 m  (slab edge at 1.60 m absorbed by edge compensation)
W_0 = 5.000  (= width1)
W_2 = 2.000  (= width2)
```
**Warning:** extreme |C_r|, only 3 beams. Hybrid slab required.
**Strategy:** beam-block portion uses 2 groups; final wedge poured monolithically.

## 11. Behavior Rules

- Practical construction logic > theoretical perfection
- Grouped beam lengths > per-row custom beams
- Minimize production complexity first
- Use edge infill where it's economically favorable
- Aggressive tapers → hybrid systems
- **The first and last beams sit at the slab walls** (positions 0 and `L_covered`). Inner widths there equal `width1` and `width2` exactly — the engine guarantees this for every input.
- **When `R > 0.45`, covered length is extended by one pitch** (§15) so the far wall has a beam, instead of leaving 45+ cm of slab unsupported.
- Every output must include: **taper per row, row count (= pitches), beam count (= pitches + 1), production strategy, installation strategy**

## 12. Open Items to Verify

Items marked `[VERIFY]` above:

- Topping thickness default
- Structural input enforcement (live/dead loads, concrete grade)
- Full beam catalog (heights, widths, wire counts, capacities, self-weight)
- Maximum producible beam length
- Beam span capacity thresholds
- Block catalog beyond the 500×100×200 mm hourdi
- Confirmed waste allowances
- Formal standards reference (Eurocode clause numbers, local Uzbek norms)

## 15. Bump rule (mirrors production engine `autoPickPattern`)

The remainder `R = length − floor(length / S) × S` decides whether the
practical pitch count is kept or bumped:

| `R` band         | Action       | Production engine equivalent |
| ---------------- | ------------ | ---------------------------- |
| `R = 0`          | no bump      | GB at `floor(L/S)` exactly   |
| `R ≤ 0.20`       | no bump      | BGB pattern (extra beam, no extra pitch) |
| `R ≤ 0.45`       | no bump      | GBG pattern (extra block row, no extra pitch) |
| `R > 0.45`       | **+1 pitch** | GB at `floor(L/S) + 1`       |

The tapered engine uses ONLY the pitch decision — it doesn't apply
patterns. The bump exists because tapered-slab geometry breaks down
visibly when there's no closing beam at `width2`: a slab with
`R = 0.52` would otherwise have ≥ 45 cm of unsupported far edge.
Edge compensation can absorb up to ≤ 0.45 m, so the rule is "if more
than that, add a pitch and let the bearing absorb the small over-extend
on the far end" (the production engine's exact stance).

The previous tapered-engine implementation used `Math.ceil(rowsRaw − ε)`
which always bumped on any non-zero remainder. That was inconsistent
with production and over-counted beams for `R ∈ (0, 0.45]`.

### Reference
Constants `SMALL_REMAINDER = 0.20` and `MEDIUM_REMAINDER = 0.45` are
copied from `src/services/calculation-engine.ts` per SPEC §0
(sandbox stays self-contained — do not import from production).
