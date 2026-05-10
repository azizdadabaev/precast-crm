# Tapered Beam-and-Block — Sandbox

> **Sandbox, not production.** This module is an isolated playground for
> prototyping tapered-slab math. It does not feed orders, projects, or
> persistence. Do not use its numbers for real planning until merged
> into the main engine.

## What this is

Engine + UI for trapezoidal / irregular-quadrilateral beam-and-block
slabs (ETALON TBM "Yig'ma Monolit"). Computes per-row beam length
progression, beam-length grouping (1–4 SKUs), and hybrid-slab
detection. Block math is intentionally coarse here; precise block
counts live in the production engine.

The canonical math is in [`SPEC.md`](./SPEC.md) (verbatim copy of the
SKILL.md spec). Implementation references `§N` markers throughout to
make the math traceable.

## How to open the page

1. Log in as `ADMIN` (e.g. `admin@precast.local` / `admin123`).
2. Navigate to **Тажриба · Sandbox · Tapered** in the sidebar
   (visible only to ADMIN).
3. Or visit `/sandbox/tapered` directly.

Use the "Show worked example ▾" dropdown to load any of the three §10
worked examples — the inputs auto-fill and the calculation runs.

## How to run the tests

```
npm test
```

Sandbox tests live next to their source under
`src/sandbox/tapered-beam-block/engine/__tests__/`. The Vitest config
includes both the project `tests/` folder and this sandbox path —
sandbox tests are auto-discovered alongside the rest.

To run only the sandbox suites:

```
npx vitest run src/sandbox
```

## How to fully remove the feature

Five reverts restore the project to its pre-sandbox state:

1. **Delete the sandbox folder:**
   `src/sandbox/tapered-beam-block/`
2. **Delete the route file:**
   `src/app/(app)/sandbox/tapered/page.tsx` (and remove the empty
   `src/app/(app)/sandbox/` directory).
3. **Revert the sidebar entry** in `src/components/sidebar.tsx`:
   - Remove `FlaskConical` from the `lucide-react` named-import block.
   - Remove the appended `{ href: "/sandbox/tapered", … }` line.
4. **Revert the Vitest config** in `vitest.config.ts`: remove the
   `"src/sandbox/**/__tests__/*.test.ts"` entry from `include`.
5. **Revert the HANDOFF.md "Sandbox modules" line.**
6. **Revert the bridge-import block** in
   `src/app/(app)/calculations/page.tsx`: remove the
   `localStorage.getItem("calc:bridge-import:v1")` block at the top
   of the restore `useEffect`. The block is purely additive and
   safe to leave in place (it's a no-op when the bridge key is
   absent), but for true zero-residue removal, drop it.

After these steps the production app and tests are unchanged.

## Files in this module

```
src/sandbox/tapered-beam-block/
├── README.md          ← you are here
├── SPEC.md            ← canonical math (§-references throughout the engine)
├── engine/
│   ├── types.ts            Public type surface
│   ├── helpers.ts          Rounding + [VERIFY §12] sentinel constants
│   ├── grouping.ts         §4.1 / §4.2 / §4.3 decision logic
│   ├── validation.ts       §8 validators (return errors[]/warnings[])
│   ├── compute-taper.ts    Main entry: computeTaper(input)
│   ├── index.ts            Barrel export
│   └── __tests__/          Vitest specs
└── ui/
    ├── TaperedCalculatorPage.tsx  Top-level page
    ├── TaperedInputs.tsx          Input form + irregular toggle
    ├── TaperedResults.tsx         §9 report rendering
    ├── ExampleLoader.tsx          §10 example pre-fill dropdown
    └── RectangularNotice.tsx      §0 routing guard message
```

## Constraints honored

- Pure engine — no DB, no I/O, no React in `engine/`. The engine
  never throws; validation produces structured `errors[]`/`warnings[]`.
- `[VERIFY §12]` sentinels (max producible beam length, allowable
  span, topping thickness, beam-stock step, waste allowances, block
  catalog) are placeholders. Any calculation that depends on one
  surfaces a warning. Replace once factory engineering provides
  confirmed values.
- Production engine helpers (`round3`, `roundN`) are **copied** into
  `helpers.ts`, not imported, so the sandbox stays severable.
- No new runtime dependencies. UI uses only existing shadcn primitives.
