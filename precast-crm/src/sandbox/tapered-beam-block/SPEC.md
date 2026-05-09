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

### 3.2 Row count
```
N_theoretical = length / S
N_practical   = floor(N_theoretical)
```
If a remainder exists, either a partial final row is added or the edge strip absorbs the difference (see §3.7).

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

### 3.5 Beam length at row n (n = 0 is the start side)
```
W_n = width1 + (C_r × n)
```

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
ΔW  = 0.20 m
C_r = (0.20 / 5.70) × 0.58 = 0.0204 m  (2.04 cm/row)
N   = 5.70 / 0.58 ≈ 9.83 → 10 rows
```
**Strategy:** one beam size at 3.90 m. Edge compensation: 20 cm absorbed across rows via cut blocks or edge concrete.

### Example 2 — Medium taper (3 groups)
```
width1 = 3.75 m,  width2 = 4.45 m,  length = 8.70 m
ΔW  = 0.70 m
C_r = (0.70 / 8.70) × 0.58 = 0.0467 m  (4.67 cm/row)
N   = 8.70 / 0.58 = 15 rows
```
**Strategy:** 3 beam groups — 3.90 m, 4.15 m, 4.45 m. Three stopper settings; efficient for prestressing-bed batching.

### Example 3 — Extreme wedge (hybrid)
```
width1 = 5.00 m,  width2 = 2.00 m,  length = 1.60 m
ΔW  = −3.00 m
C_r = (−3.00 / 1.60) × 0.58 = −1.0875 m
N   = 1.60 / 0.58 ≈ 2.76 rows
```
**Warning:** extreme taper, only ~3 rows. Hybrid slab required.
**Strategy:** beams at 5.00 m and 3.90 m; final wedge poured monolithically.

## 11. Behavior Rules

- Practical construction logic > theoretical perfection
- Grouped beam lengths > per-row custom beams
- Minimize production complexity first
- Use edge infill where it's economically favorable
- Aggressive tapers → hybrid systems
- Every output must include: **taper per row, row count, production strategy, installation strategy**

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
