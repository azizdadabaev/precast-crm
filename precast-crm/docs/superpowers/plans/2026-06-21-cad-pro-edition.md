# CAD Drawing Tool — Track 7 "Pro Edition" (10 advanced features)

> From a 5-domain agent review (CAD precision · vector editor · architectural ·
> collaboration · visualization). Goal: take the drawing tool from "functional"
> to a professional drawing app. Execute in dependency order; each step ends with
> tsc + (where pure) vitest + compile-check + commit; interactive steps get a
> live click-test before moving on.

## Build order (foundations gate 4+ features — do them first)

### Foundation A — Stable room IDs  *(S)*
`RoomShape` gains `id: string`, minted on creation, **preserved on edit**
(`onActiveChange` must spread the existing room), migrated by `normalizeDrawing`.
Unblocks: multi-select identity, version diff (#8), components, comments.
- [ ] `geometry.ts` RoomShape `{ id, points, closed }`; `newRoomId()`. DrawRoomDialog/RoomCanvas/normalizeDrawing mint/preserve. tsc + test + commit.

### Foundation B — Global undo/redo across rooms  *(M–L)*
Lift the per-room `undoStack`/`redoStack` (wiped on room switch today) to the
parent that owns `rooms[]`. Snapshot/patch the whole `rooms[]`; coalesce drags;
`beginTransaction`/`commitTransaction` bracket multi-room edits.
Prerequisite for: constraints (#1), booleans (#3), group transform (#4).
- [ ] Move history to DrawRoomDialog; RoomCanvas emits intent only. Preserve first-move deferral. Ctrl+Z/Y → parent. Commit.

### Foundation C — Multi-select model  *(M)*
`selectedIndices: Set<number>` in DrawRoomDialog; marquee rubber-band in
RoomCanvas (reuse rect press-drag); shift-click add/remove. Render group bbox.
Prerequisite for: #3, #4, align/distribute, layers.
- [ ] Selection state + marquee + group-move (drag group body). Commit.

## The 10 features (dependency-ordered)

### 4. Group transform gizmo  *(XL)* — needs B, C
Shared bbox gizmo over the selection: 8 scale handles + rotate ring + mirror,
all about the **group centroid**. `translate/rotate/mirror/scalePolygon(center)`.
- [ ] `scalePolygon` in geometry.ts; gizmo overlay + handle drag → group atomic edit (one undo). Commit + live test.

### 6. Double-line walls (thickness)  *(L)* — independent
`RoomShape.wallThickCm`; outer = drawn polygon, inner = inward `offsetPolygon`.
Beams span the inner (clear) loop; render wall poché band; dim reference toggle.
Reuses `offset.ts`. Touches DrawRoomDialog decompose feed.
- [ ] inner-loop offset + feed engine + render band. Commit + test.

### 5. Openings-aware slab (voids + door/window)  *(XL)* — needs hole-aware fill
`RoomShape.holes: Pt[][]` + `openings[]`. Multi-loop `scanCrossingsX`/decompose;
voids deduct area/beams/blocks + flag trimmer beams. Void tool + opening tool.
- [ ] multi-loop fill engine + BoM deduction + tools. Commit + test.

### 3. Boolean operations (union/subtract/intersect/exclude)  *(XL)* — needs C, holes
`polygon-clipping` wrapper in `lib/cad/boolean.ts`; re-snap to grid; subtract→hole
(reuses #5's hole plumbing). Toolbar enabled at selection ≥ 2.
- [ ] boolean.ts + group-undo replace. Commit + test.

### 2. Object-snap tracking + construction geometry  *(L)* — extends snap.ts
Acquire anchors → polar/ortho tracking rays → virtual-intersection snap; plus
infinite xlines/rays/centerlines as non-printing snap sources.
- [ ] `trackAnchors` + ray intersection in snap.ts; `construction.ts`; render. Commit + test.

### 1. Parametric geometric constraint solver  *(XL)* — needs B
`lib/cad/constraints.ts`: coincident/parallel/perp/equal/symmetric/H/V +
dimensional params. Gauss-Newton least-squares solve with minimal-perturbation
drag + DOF analysis. Wire into the drag path.
- [ ] solver core + tests + drag integration + glyphs. Commit + test.

### 9. Sheet/print layout + vector PDF  *(L)* — needs a print theme
Paper space (A4/A3) at named scale (1:50/1:100) + title block + scale bar;
vector PDF via `jspdf` + `svg2pdf.js`. Decouple paper transform from view.
Precursor: centralize colors into a THEME with a `print` (clean linework) mode.
- [ ] THEME + print mode; `sheet.ts` compose; PDF export. Commit + test.

### 10. 3D / axonometric extruded preview  *(L)* — read-only, lazy three.js
`Room3D.tsx` (dynamic import): `THREE.Shape`+`ExtrudeGeometry` slab/walls;
beams as `InstancedMesh` from `scanBeamsToOverlay`; OrbitControls + ortho preset.
- [ ] lazy 3D view toggle. Commit + visual check.

### 8. Versioned drawing history  *(M–L)* — needs A
`DrawingVersion` model (append-only) captured **before** the save `deleteMany`;
named snapshots, geometry diff (by room id), restore.
- [ ] schema + capture-on-save + history UI + diff/restore. Commit + test.

### 7. Real-time multiplayer co-editing  *(XL)* — heaviest; new infra
Yjs CRDT over `rooms[]`; geometry-aware merge re-validated via `isValidOutline`;
Hocuspocus/y-websocket sidecar in Docker + Postgres persistence; presence cursors.
**Needs infra decisions (new container, deps, deploy) — sequence last.**
- [ ] Yjs binding + WS server + presence + validation. Multi-step.

## Cross-cutting
- New libs to add later: `polygon-clipping` (#3), `jspdf`+`svg2pdf.js` (#9), `three` (#10), `yjs`+`@hocuspocus/server` (#7).
- Per-frame localStorage write during drags should be debounced (perf) before #4/#7 make drags heavier — fold into Foundation B.
- Each interactive feature is gated on a live click-test (headless can't verify interaction).
