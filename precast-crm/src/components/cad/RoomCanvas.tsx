"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";
import { Button } from "@/components/ui/button";
import {
  Undo2,
  Redo2,
  Maximize2,
  Crosshair,
  Eraser,
  Trash2,
  CornerUpLeft,
  PenLine,
  MousePointer2,
  Square as SquareIcon,
  Ruler,
  RotateCcw,
  RotateCw,
  FlipHorizontal2,
  FlipVertical2,
  ImageDown,
  FileDown,
} from "lucide-react";
import {
  type Pt,
  type Rect,
  type RoomShape,
  type BeamArrow,
  type BeamDir,
  type BeamKind,
  bayLabelLines,
  perpDimension,
  blockCellBudget,
  snapToGrid,
  setEdgeLength,
  nearestEdge,
  insertVertex,
  deleteVertex,
  moveEdgeParallel,
  edgeDragOffset,
  wouldSelfIntersect,
  wouldCollapseEdge,
  drawStepWouldCross,
  canClose,
  orthoVertexMove,
  isValidOutline,
  fitView,
  bbox,
  edgeOutwardNormal,
  edgeBearingDeg,
  setEdgeBearing,
  rectFromCorners,
  pointFromPolar,
  interiorAngleDeg,
  translatePolygon,
  rotatePolygon,
  mirrorPolygonX,
  mirrorPolygonY,
  pointInPolygon,
  dimStyleForEdge,
  dimLabelAngleDeg,
  dimensionOffsetLevels,
  overallDimensions,
  perimeter,
  floorAreaCm2,
  formatLengthCm,
  formatLengthDual,
  formatAreaCm2,
  bayPalette,
  scaleBar,
  BEARING_CM,
} from "@/lib/cad/geometry";
import { visibleGridLines } from "@/lib/cad/grid";
import { offsetPolygonOutward } from "@/lib/cad/offset";
import { ROOM_PRESETS } from "@/lib/cad/presets";
import {
  computeSnap,
  DEFAULT_SNAP_SETTINGS,
  type SnapSettings,
  type SnapResult,
  type SnapType,
} from "@/lib/cad/snap";

interface RoomCanvasProps {
  /** The ACTIVE room's outline (cm). The canvas edits one room at a time. */
  points: Pt[];
  /** Whether the active room's loop is closed (controlled by the parent so it
   *  can manage the rooms list). */
  closed: boolean;
  /** Atomic update of the active room's outline + closed state. */
  onActiveChange: (points: Pt[], closed: boolean) => void;
  /** The active room index. Changing it resets the local undo/redo history so a
   *  stale snapshot can't be applied to a different room. */
  activeKey?: number;
  /** Other rooms of the floor plan, rendered as a read-only backdrop and
   *  clickable to make one active. `index` is its position in the parent's
   *  rooms[]; `label` is its display number. */
  backgroundRooms?: Array<{ points: Pt[]; closed: boolean; label: string; index: number }>;
  /** Activate a background room (the operator clicked it to edit it). */
  onPickBackgroundRoom?: (roomsIndex: number) => void;
  /** Start a NEW room of the floor plan (＋ Room button, a preset, or a click on
   *  empty grid once the active room is closed). The optional seed places the
   *  first point or drops a preset outline; the parent mints the room id. */
  onRequestNewRoom?: (seed?: Omit<RoomShape, "id">) => void;
  /** Initial grid step in cm (default 10). User can change it via the controls. */
  gridCm?: number;
  /** Optional decomposed bays to overlay (translucent). */
  bays?: Rect[];
  /**
   * Optional per-bay beam/block visual (from `beamLayout`). Index-aligned
   * with `bays`: beam strips render filled in the bay's palette colour, block
   * cells render as a thin tinted grid, a centre arrow shows the beam-run
   * direction, and a label chip shows the bay's beam count + length. All rects
   * + arrow points are in cm inside their bay.
   */
  beamLayers?: Array<{
    beams: Rect[];
    /** Per-beam structural/extra kind, index-aligned with `beams`. Manual extras
     *  render hatched so they read as add-on line items past the pitch grid. */
    beamKinds?: BeamKind[];
    /** Bearing seats (small rects at each beam end) — drawn hatched on top of
     *  the strip ends so the wall-rest portion of the beam_length is visible. */
    bearings?: Rect[];
    blockCells: Rect[];
    /** Per-block-cell kind, index-aligned with `blockCells`: "cut" filler is
     *  drawn hatched so partial make-up modules read distinctly from full ones. */
    blockKinds?: ("full" | "cut")[];
    blockCellsCapped?: boolean;
    arrow?: BeamArrow;
    beamDir?: BeamDir;
    beamCount?: number;
    beamLengthCm?: number;
    /** Per-beam length (cm), index-aligned with `beams`. When present each beam
     *  is tagged with its own length (the varying tapered/scan case); otherwise
     *  every beam falls back to the single `beamLengthCm`. */
    beamLengthsCm?: number[];
    /** Engine pattern (GB/BGB/GBG) — shown in the legend. */
    pattern?: string;
    /** Total blocks in this bay (for the bay label tally). */
    totalBlocks?: number;
    /** Manual extra beams folded into beamCount (drawn past the run). */
    extraBeams?: number;
    /** Pitched-run depth (cm) the structural run fills — feeds the perp dimension. */
    pitchExtentCm?: number;
    /** True when the engine's pitch count didn't fit the drawn bay, so beams were
     *  clamped (drawing not at true scale; counts unaffected). Flagged in the legend. */
    pitchOverflow?: boolean;
  }>;
  /** Override the <svg> sizing classes (default `w-full max-w-[680px]`). The
   *  calculator's full-view dialog passes a larger size to enlarge the surface. */
  svgClassName?: string;
  /** Fill mode: the canvas grows to fill its parent column (responsive viewBox,
   *  measured via ResizeObserver) instead of the fixed 680px square. Used by the
   *  calculator's full-view dialog so the grid occupies the whole drawing area. */
  fill?: boolean;
}

// ── Base cm→px mapping. A view transform (zoom/pan) is applied on top. ──
const BASE_SCALE = 0.6; // px per cm at zoom = 1
const MARGIN = 24; // px padding around the cm origin (in world/base space)
// Default (non-fill) canvas size. In `fill` mode the viewBox is sized to the
// measured container so the drawing surface occupies the whole column.
const INIT_W = 680;
const INIT_H = 680;

// Click-to-close / drag pick radius, in px (screen space).
const HIT_PX = 12;
// Edge-insert pick radius, in px.
const EDGE_HIT_PX = 8;
// Width (px) of the transparent grab line along each wall body (select + slide).
const EDGE_BODY_HIT_PX = 14;
// ── Dimensioning (CAD dimension lines), all in screen px ──
// How far OUTSIDE the shape the dimension line sits, from the edge.
const DIM_OFFSET_PX = 26;
// Length of the little extension-line stub past the dimension line.
const DIM_EXT_OVERSHOOT_PX = 6;
// Small gap between the shape edge and where the extension line begins.
const DIM_EXT_GAP_PX = 3;
// Arrowhead size (length × half-width) for the dimension-line tips.
const DIM_ARROW_LEN = 8;
const DIM_ARROW_HALF = 3;
// Dimension text font size (px) + the per-character half-width estimate used to
// size the inline text gap / decide inline-vs-outside placement. ~6 px/char at
// fontSize 12 is a safe over-estimate for the digits + "m"/"cm" glyphs we emit.
const DIM_FONT_PX = 12;
const DIM_CHAR_HALF_PX = 3.4;
// Below this on-screen edge length we drop the dimension line and arrows and
// just float a bare number, to avoid an unreadable tangle of overlapping marks.
const DIM_MIN_EDGE_PX = 22;
// How far apart (px) successive stacking LEVELS of parallel dimension lines sit.
// dimensionOffsetLevels gives each edge a level; level k draws at
// DIM_OFFSET_PX + k·DIM_LEVEL_STEP_PX so collinear/overlapping dims never overlap.
const DIM_LEVEL_STEP_PX = 22;
// Overall (extents) dimension line offset past the deepest per-edge dim band.
const DIM_OVERALL_GAP_PX = 24;

/** Approximate half the rendered width (px) of a dimension label string. */
const dimTextHalfPx = (label: string) =>
  Math.max(10, label.length * DIM_CHAR_HALF_PX);

// Zoom limits + wheel sensitivity.
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 6;

// Reject a draw step shorter than this (cm) so we never append a hairline edge.
const MIN_DRAW_STEP_CM = 1;

// Grid-size options offered in the controls bar (cm).
const GRID_OPTIONS = [5, 10, 25, 50] as const;

interface View {
  zoom: number;
  /** Pan offset in screen/px (added after zoom). */
  tx: number;
  ty: number;
}

// ── Drawing tool mode. "draw" appends vertices + closes loops; "select" is the
// CAD arrow tool — select / move / edit existing rooms without drawing new
// geometry; "rect" click-drags an axis-aligned room box; "measure" is a
// display-only tape that never touches the room outline. ──
type Tool = "draw" | "select" | "rect" | "measure";

const IDENTITY: View = { zoom: 1, tx: 0, ty: 0 };

/**
 * Controlled SVG drawing surface for a rectilinear room outline. Points are in
 * CENTIMETRES; screen uses y-down. Draw mode: click empty canvas to append an
 * ortho-snapped, (optionally) grid-snapped vertex. Close by clicking near the
 * first point or the Close button. Once closed, vertices are draggable handles,
 * edges are clickable to type an exact length, an edge body can be clicked to
 * insert a vertex, and a selected vertex can be nudged with the arrow keys or
 * deleted. The view supports mouse-wheel zoom and middle/space drag pan, and a
 * local undo/redo history of all outline edits.
 */

// ── Toolbar presentation primitives (the "drafting console" chrome). Pure
// presentational; all behaviour stays in RoomCanvas. ──
const TB_SEP = "mx-1 h-6 w-px shrink-0 bg-slate-200/70";

function TbIcon({
  onClick,
  disabled,
  title,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:pointer-events-none disabled:opacity-35"
    >
      {children}
    </button>
  );
}

function TbChip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={
        "rounded-md px-1.5 py-0.5 text-[11px] font-medium leading-none transition-colors " +
        (active
          ? "bg-sky-600 text-white shadow-sm"
          : "bg-white text-slate-500 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-700")
      }
    >
      {children}
    </button>
  );
}

export function RoomCanvas({
  points,
  closed,
  onActiveChange,
  activeKey,
  backgroundRooms,
  onPickBackgroundRoom,
  onRequestNewRoom,
  gridCm = 10,
  bays,
  beamLayers,
  svgClassName,
  fill = false,
}: RoomCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  // In fill mode the viewBox tracks the measured container so the surface is
  // never letterboxed; otherwise it's the fixed square.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<{ w: number; h: number }>({ w: INIT_W, h: INIT_H });
  useEffect(() => {
    if (!fill) return;
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        if (width > 1 && height > 1) {
          setMeasured({ w: Math.round(width), h: Math.round(height) });
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fill]);
  const SVG_W = fill ? measured.w : INIT_W;
  const SVG_H = fill ? measured.h : INIT_H;
  // Active tool: draw (append vertices), select (CAD arrow — edit existing
  // rooms), rectangle-room, or tape measure.
  const [tool, setTool] = useState<Tool>("draw");
  // Draw + select share the room-editing interactions (drag vertex, slide wall,
  // move room, select edge/vertex). Only `draw` also appends new geometry.
  const isEditTool = tool === "draw" || tool === "select";
  // `closed` (the active room's loop state) is controlled by the parent now, so
  // the canvas can manage a whole floor plan of rooms. It arrives via props.

  // ── Rectangle tool: press-drag corner A → release corner B. `rectStart` holds
  // the snapped first corner (cm) during the drag; `rectEnd` the live snapped
  // second corner (for the dashed preview + W×H readout). Null when idle. ──
  const [rectStart, setRectStart] = useState<Pt | null>(null);
  const [rectEnd, setRectEnd] = useState<Pt | null>(null);

  // ── Tape measure: a display-only chain of snapped points (cm). NEVER mutates
  // `points`. `measureDone` freezes the rubber-band after a double-click/Enter
  // finish, keeping the chain visible until cleared. ──
  const [measurePts, setMeasurePts] = useState<Pt[]>([]);
  const [measureDone, setMeasureDone] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  // Selected vertex (for keyboard nudge / delete). Distinct from drag.
  const [selVertex, setSelVertex] = useState<number | null>(null);
  // Live cursor position in cm (for the in-progress rubber-band + readout).
  const [cursor, setCursor] = useState<Pt | null>(null);
  // Hover state: a vertex index, or a candidate edge-insert point.
  const [hoverVertex, setHoverVertex] = useState<number | null>(null);
  const [edgeInsert, setEdgeInsert] = useState<{ index: number; at: Pt } | null>(null);

  // CAD controls: live grid size + the CAD snap engine's per-type settings.
  // Seeded from the `gridCm` prop; the grid-size select keeps driving gridStepCm.
  const [grid, setGrid] = useState<number>(gridCm);
  const [snapSettings, setSnapSettings] = useState<SnapSettings>({
    ...DEFAULT_SNAP_SETTINGS,
    gridStepCm: gridCm,
  });
  // Ortho mode keeps the outline rectilinear: a dragged/nudged vertex carries its
  // two neighbours so both incident edges stay axis-aligned (the invariant the
  // bay decomposition relies on). On by default; can be toggled off for free moves.
  const [ortho, setOrtho] = useState(true);
  // Show interior-angle dimension arcs at each vertex when the loop is closed.
  // Tapered/angled corners read their exact degrees; on by default.
  const [showAngles, setShowAngles] = useState(true);
  const step = grid; // grid step == snap step (they move together by design).
  // Keep the snap engine's grid step locked to the visible grid-size select.
  useEffect(() => {
    setSnapSettings((s) => (s.gridStepCm === grid ? s : { ...s, gridStepCm: grid }));
  }, [grid]);
  // Live snap result (point + type + guides) for the current draw/drag, rendered
  // as a typed marker + dashed guide lines. Null when nothing is snapping.
  const [snapResult, setSnapResult] = useState<SnapResult | null>(null);
  // Toggle one snap type in the toolbar.
  const toggleSnap = (key: keyof SnapSettings) => (checked: boolean) =>
    setSnapSettings((s) => ({ ...s, [key]: checked }));

  // Selected edge (index of points[i] → points[i+1]) + its draft length text.
  const [selEdge, setSelEdge] = useState<number | null>(null);
  const [lenInput, setLenInput] = useState("");
  // Draft bearing (deg) text for the selected edge's exact-angle field.
  const [angleInput, setAngleInput] = useState("");
  // True only when the selection came from the DIMENSION (click/double-click) — the
  // inline length editor opens then. Selecting via the edge BODY (for a slide) sets
  // this false, so the body-select highlights the wall without popping the editor.
  const [lenEditing, setLenEditing] = useState(false);
  // Edge whose dimension the pointer is over — drives a visible hover affordance
  // (the dim line + label brighten) so click-to-type-length is discoverable.
  const [hoverEdge, setHoverEdge] = useState<number | null>(null);
  // Edge whose BODY (the wall segment itself) the pointer is over — highlights the
  // wall + shows a square midpoint handle so "grab a wall and slide it" is
  // discoverable. Distinct from hoverEdge (which is the dimension line/label).
  const [hoverEdgeBody, setHoverEdgeBody] = useState<number | null>(null);
  // ── Direct distance/angle entry (CAD "DDE") while drawing. The user types an
  // exact Length (cm) and optionally an absolute Angle (deg); on Enter the next
  // vertex is placed precisely — by the typed angle if given, else along the
  // current snapped rubber-band direction. `ddeInvalid` flags a rejected entry
  // (too short / would cross) so the field can show a subtle error state. ──
  const [ddeLen, setDdeLen] = useState("");
  const [ddeAngle, setDdeAngle] = useState("");
  const [ddeInvalid, setDdeInvalid] = useState(false);
  const ddeLenRef = useRef<HTMLInputElement>(null);

  // Edge currently being slid PARALLEL to itself (CAD wall-drag), or null.
  const [edgeDragIdx, setEdgeDragIdx] = useState<number | null>(null);
  // Live signed offset (cm) + new length of the wall being dragged, for the readout.
  const [edgeDragInfo, setEdgeDragInfo] = useState<{ offset: number; lenCm: number } | null>(null);

  // ── Whole-room MOVE drag (Transform → Move): press inside the polygon interior
  // (not on a vertex/edge handle) and drag to translate the entire room. Active
  // while `shapeDragIdx` is set (a sentinel — there's only one room). The live
  // snapped offset (cm) drives the readout; `cursor` is the SVG-level interior
  // hover that flips the cursor to "move". ──
  const [shapeDragIdx, setShapeDragIdx] = useState<boolean>(false);
  const [shapeDragInfo, setShapeDragInfo] = useState<{ dx: number; dy: number } | null>(null);
  // Pointer over the room interior (drives the "move" cursor when idle in draw mode).
  const [hoverInterior, setHoverInterior] = useState(false);
  // Typed rotation angle (deg) for the "Apply" rotate-by field.
  const [rotInput, setRotInput] = useState("");

  // ── View transform (zoom + pan) ──
  const [view, setView] = useState<View>(IDENTITY);
  const panRef = useRef<{ sx: number; sy: number; tx: number; ty: number } | null>(null);
  const [panning, setPanning] = useState(false);
  // Space-held = pan-arm: left-drag pans (classic CAD), shown as a grab cursor.
  const [spaceHeld, setSpaceHeld] = useState(false);

  // ── Undo / redo history of the outline (points + closed). Local to the editor;
  // the parent stays the single source of truth for the *current* value. ──
  const undoStack = useRef<Array<{ points: Pt[]; closed: boolean }>>([]);
  const redoStack = useRef<Array<{ points: Pt[]; closed: boolean }>>([]);
  const [histTick, setHistTick] = useState(0); // re-render when stacks change

  const pushHistory = useCallback(
    (prevPoints: Pt[], prevClosed: boolean) => {
      undoStack.current.push({ points: prevPoints, closed: prevClosed });
      if (undoStack.current.length > 100) undoStack.current.shift();
      redoStack.current = [];
      setHistTick((t) => t + 1);
    },
    [],
  );

  /** Commit an outline change, recording the *previous* state for undo. */
  const commit = useCallback(
    (nextPoints: Pt[], nextClosed?: boolean) => {
      pushHistory(points, closed);
      onActiveChange(nextPoints, nextClosed ?? closed);
    },
    [points, closed, onActiveChange, pushHistory],
  );

  // Switching the active room must drop the local undo/redo history so an undo
  // can't apply a snapshot from a different room.
  useEffect(() => {
    undoStack.current = [];
    redoStack.current = [];
    setHistTick((t) => t + 1);
  }, [activeKey]);

  // Grid-snap a point when the Grid snap toggle is on (used for edge-insert).
  const maybeSnap = (p: Pt): Pt => (snapSettings.grid ? snapToGrid(p, step) : p);

  // Switch the active tool. Non-destructive (keeps `points`), but always cancels
  // any in-flight rect drag and clears the tape measurement so a stale chain
  // never lingers under a different tool.
  const switchTool = (next: Tool) => {
    setTool(next);
    setRectStart(null);
    setRectEnd(null);
    setMeasurePts([]);
    setMeasureDone(false);
  };

  // Other rooms of the floor plan, as snap sources so the active room's
  // vertices/edges lock onto adjacent rooms' corners + walls (cross-room snap).
  const extraLoops = (backgroundRooms ?? []).map((r) => ({
    points: r.points,
    closed: r.closed,
  }));

  // Snap a free cm point through the full CAD snap engine (object/grid/align),
  // without a polar anchor — used by the rect corners + the measure chain.
  const snapPoint = (raw: Pt): SnapResult =>
    computeSnap({
      cursor: raw,
      points,
      closed,
      origin: null,
      excludeIndex: null,
      tolCm: pxToCm(10),
      settings: snapSettings,
      extraLoops,
    });

  // World (base) space → screen px applies the view transform last.
  const cmToPx = useCallback(
    (p: Pt): { x: number; y: number } => ({
      x: (MARGIN + p.x * BASE_SCALE) * view.zoom + view.tx,
      y: (MARGIN + p.y * BASE_SCALE) * view.zoom + view.ty,
    }),
    [view],
  );

  /** Convert a mouse event to cm coords in the SVG's user space (inverts view). */
  const eventToCm = useCallback(
    (e: { clientX: number; clientY: number }): Pt => {
      const svg = svgRef.current!;
      const rect = svg.getBoundingClientRect();
      // pointer → viewBox user units → world (un-zoom/pan) → cm.
      const ux = ((e.clientX - rect.left) / rect.width) * SVG_W;
      const uy = ((e.clientY - rect.top) / rect.height) * SVG_H;
      const wx = (ux - view.tx) / view.zoom;
      const wy = (uy - view.ty) / view.zoom;
      return { x: (wx - MARGIN) / BASE_SCALE, y: (wy - MARGIN) / BASE_SCALE };
    },
    [view, SVG_W, SVG_H],
  );

  const distPx = useCallback(
    (a: Pt, b: Pt): number => {
      const pa = cmToPx(a);
      const pb = cmToPx(b);
      return Math.hypot(pa.x - pb.x, pa.y - pb.y);
    },
    [cmToPx],
  );

  // pixels → cm at the current zoom, for converting hit radii into world tol.
  const pxToCm = (px: number) => px / (BASE_SCALE * view.zoom);

  // Set when a mousedown lands on an edge-body grab line, so the subsequent
  // bubbled click on the SVG is swallowed (it would otherwise clear the selection).
  const edgeClickGuard = useRef(false);

  // ── Click / draw ──
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (panning || spaceHeld || dragIdx !== null) return;
    // A click that began on an edge-body grab line bubbles up to the SVG; swallow
    // it here so selecting/sliding a wall doesn't immediately clear the selection.
    if (edgeClickGuard.current) {
      edgeClickGuard.current = false;
      return;
    }

    // ── Tape measure: append a snapped point to the (display-only) chain. ──
    if (tool === "measure") {
      const at = snapPoint(eventToCm(e)).point;
      setMeasurePts((pts) => (measureDone ? [at] : [...pts, at]));
      setMeasureDone(false);
      return;
    }

    // The rectangle tool is driven entirely by press-drag-release (handleDown /
    // handleMove / endDrag); a stray click does nothing to the outline.
    if (tool === "rect") return;

    // SELECT (CAD arrow) mode never draws: a click reaching the canvas is empty
    // space, so just clear the selection. Vertex / edge / room interactions are
    // handled by their own elements (which stopPropagation).
    if (tool === "select") {
      setSelVertex(null);
      setSelEdge(null);
      setEdgeInsert(null);
      return;
    }

    const raw = eventToCm(e);

    if (!closed) {
      // Close affordance: click near the first vertex finalizes the loop —
      // but only when the resulting loop is geometrically valid (non-degenerate
      // closing edge + no self-crossing).
      if (points.length >= 3 && distPx(raw, points[0]) <= HIT_PX) {
        if (canClose(points)) {
          commit(points, true);
          setCursor(null);
        }
        return;
      }
      // Re-anchor: clicking a vertex you already placed (other than the first —
      // which closes — and the current tip) rewinds the chain to it and continues
      // drawing from there, instead of dropping a duplicate/invisible point on top.
      for (let k = 1; k < points.length - 1; k++) {
        if (distPx(raw, points[k]) <= HIT_PX) {
          commit(points.slice(0, k + 1));
          setCursor(null);
          return;
        }
      }
      const prev = points[points.length - 1];
      // CAD snap engine: hard object snaps (endpoint/mid/edge/perp/intersection)
      // beat soft constraints (polar tracking off `prev`, axis alignment), then
      // grid. `prev` is the polar anchor while drawing.
      const result = computeSnap({
        cursor: raw,
        points,
        closed,
        origin: prev ?? null,
        excludeIndex: null,
        tolCm: pxToCm(10),
        settings: snapSettings,
        extraLoops,
      });
      const cand = result.point;
      // Reject a zero-length / hairline step (clicking on/at the last vertex).
      if (prev && Math.hypot(cand.x - prev.x, cand.y - prev.y) < MIN_DRAW_STEP_CM) return;
      // Reject a step that would fold the in-progress path over itself.
      if (drawStepWouldCross(points, cand)) return;
      commit([...points, cand]);
      return;
    }

    // Closed active room: edge-body / vertex / background-room clicks are handled
    // by their own handlers (stopPropagation). A click reaching the canvas is
    // empty grid. Outside the active room → start a NEW room of the floor plan,
    // seeded with this snapped point so the operator just keeps drawing; inside
    // the active room → just clear the selection.
    setSelVertex(null);
    setSelEdge(null);
    setEdgeInsert(null);
    if (onRequestNewRoom && tool === "draw" && !pointInPolygon(raw, points)) {
      onRequestNewRoom({ points: [snapPoint(raw).point], closed: false });
    }
  };

  // ── Direct distance/angle entry (DDE) commit ──
  // Resolve the next vertex from the typed Length (cm) + optional Angle (deg):
  //  - Angle given → absolute bearing.
  //  - Angle blank → the CURRENT rubber-band direction (cursor → prev), polar-
  //    snapped exactly as the preview is, so "type a length, Enter" walks along
  //    the direction the user is already aiming. Falls back to the previous edge's
  //    bearing when the cursor hasn't moved off `prev` yet.
  // Applies the same guards as a draw click; on success commits + clears, else
  // flags an invalid state and keeps the field.
  const commitDde = () => {
    if (closed || points.length < 1) return;
    const lengthCm = Number(ddeLen);
    if (!Number.isFinite(lengthCm) || lengthCm < MIN_DRAW_STEP_CM) {
      setDdeInvalid(true);
      return;
    }
    const prev = points[points.length - 1];
    const angleTxt = ddeAngle.trim();
    let bearingDeg: number;
    if (angleTxt !== "") {
      const a = Number(angleTxt);
      if (!Number.isFinite(a)) {
        setDdeInvalid(true);
        return;
      }
      bearingDeg = a;
    } else {
      // Use the current snapped rubber-band direction (polar-snapped if polar on).
      const dir = ddeDirectionBearing(prev);
      if (dir === null) {
        setDdeInvalid(true);
        return;
      }
      bearingDeg = dir;
    }
    const p = pointFromPolar(prev, lengthCm, bearingDeg);
    if (drawStepWouldCross(points, p)) {
      setDdeInvalid(true);
      return;
    }
    commit([...points, p]);
    setDdeLen("");
    setDdeAngle("");
    setDdeInvalid(false);
    // Return focus to the canvas so drawing continues with keyboard/mouse.
    svgRef.current?.focus();
  };

  // Current draw DIRECTION as an absolute bearing (deg), polar-snapped the same
  // way the rubber-band preview is. Returns null when there's no cursor and no
  // previous edge to fall back to.
  const ddeDirectionBearing = (prev: Pt): number | null => {
    if (cursor) {
      const dx = cursor.x - prev.x;
      const dy = cursor.y - prev.y;
      if (Math.hypot(dx, dy) > 1e-6) {
        let ang = Math.atan2(dy, dx);
        // Mirror the snap engine's polar tracking: round to the polar step.
        if (snapSettings.polar && snapSettings.polarStepDeg > 0) {
          const stepRad = (snapSettings.polarStepDeg * Math.PI) / 180;
          ang = Math.round(ang / stepRad) * stepRad;
        }
        return (ang * 180) / Math.PI;
      }
    }
    // No live direction yet: fall back to the previous edge's bearing.
    if (points.length >= 2) {
      const p0 = points[points.length - 2];
      if (Math.hypot(prev.x - p0.x, prev.y - p0.y) > 1e-6) {
        return (Math.atan2(prev.y - p0.y, prev.x - p0.x) * 180) / Math.PI;
      }
    }
    return null;
  };

  // ── Vertex drag ──
  // Snapshot of the outline at drag-start, pushed to undo on the FIRST real move
  // (so a click that doesn't move a vertex leaves no spurious undo entry).
  const dragStart = useRef<{ points: Pt[]; closed: boolean } | null>(null);
  const dragMoved = useRef(false);

  // Edge (parallel) drag: snapshot of the outline + the cursor (cm) at drag-start.
  // History is pushed on the FIRST real move (mirrors the vertex-drag pattern).
  const edgeDragStart = useRef<{ points: Pt[]; closed: boolean; cursor: Pt } | null>(null);
  const edgeDragMoved = useRef(false);

  // Whole-room move: snapshot of the outline + the press cursor (cm) at drag-start.
  // History is pushed on the FIRST real (non-zero) move (mirrors the vertex/edge
  // pattern), so a press that doesn't move leaves no spurious undo entry.
  const moveDragStart = useRef<{ points: Pt[]; closed: boolean; cursor: Pt } | null>(null);
  const moveDragMoved = useRef(false);

  // Grid step in cm the offset snaps to while edge-dragging (when Grid snap is on).
  // mousedown on an edge body / its midpoint handle starts sliding that wall.
  const handleEdgeDown = (i: number) => (e: React.MouseEvent) => {
    if (e.button !== 0 || spaceHeld) return;
    // Wall select/slide/insert is an edit interaction (draw or select tool).
    if (!isEditTool) return;
    e.stopPropagation(); // never let an edge-body grab fall through to canvas pan
    edgeClickGuard.current = true; // swallow the bubbled click on the SVG below
    // Alt-click on the edge body INSERTS a vertex (plain click/drag = select/slide).
    if (e.altKey) {
      const at = maybeSnap(eventToCm(e));
      const next = insertVertex(points, i, at);
      if (next !== points) {
        commit(next);
        setSelVertex(i + 1);
        setSelEdge(null);
      }
      setEdgeInsert(null);
      return;
    }
    setEdgeDragIdx(i);
    setSelEdge(i);
    setSelVertex(null);
    setLenEditing(false); // body-select highlights the wall; no length editor
    setEdgeInsert(null);
    edgeDragStart.current = { points, closed, cursor: eventToCm(e) };
    edgeDragMoved.current = false;
  };

  const handleVertexDown = (i: number) => (e: React.MouseEvent) => {
    // Vertex dragging is an edit interaction (draw or select tool). In
    // rect/measure mode DON'T stop propagation — let the press reach the canvas
    // so the rect drag starts / the measure click registers over a handle.
    if (!isEditTool) return;
    // While drawing (open loop), the START vertex is the CLOSE target — never
    // grab it as a drag handle, so the press/click reaches the close affordance.
    if (!closed && i === 0 && points.length >= 3) return;
    e.stopPropagation();
    if (e.button !== 0) return;
    setDragIdx(i);
    setSelVertex(i);
    setSelEdge(null);
    // Defer the undo snapshot to the first actual move (see handleMove).
    dragStart.current = { points, closed };
    dragMoved.current = false;
  };

  const handleMove = (e: React.MouseEvent) => {
    // Pan takes priority. Capture the pan anchor into a LOCAL before setView so
    // the functional updater never dereferences panRef.current — React may replay
    // the update after the pan ended (endDrag nulls the ref), which would throw.
    const pan = panRef.current;
    if (pan) {
      const svg = svgRef.current!;
      const rect = svg.getBoundingClientRect();
      const sx = ((e.clientX - rect.left) / rect.width) * SVG_W;
      const sy = ((e.clientY - rect.top) / rect.height) * SVG_H;
      setView((v) => ({
        ...v,
        tx: pan.tx + (sx - pan.sx),
        ty: pan.ty + (sy - pan.sy),
      }));
      return;
    }

    const cm = eventToCm(e);
    setCursor(cm);

    // ── Rectangle tool: live preview of corner B (snapped) while dragging, plus
    // the snap marker so the corner lands on grid/vertices cleanly. ──
    if (tool === "rect") {
      const res = snapPoint(cm);
      setSnapResult(res);
      if (rectStart) setRectEnd(res.point);
      return;
    }

    // ── Tape measure: just track the snapped cursor for the rubber-band + marker.
    if (tool === "measure") {
      setSnapResult(snapPoint(cm));
      return;
    }

    // ── Whole-room MOVE drag: translate the entire room by the snapped cursor
    // delta from the press point. Live via onChange; history captured on the first
    // real move (mirrors the vertex/edge-drag pattern). ──
    if (shapeDragIdx && moveDragStart.current) {
      const base = moveDragStart.current;
      let dx = cm.x - base.cursor.x;
      let dy = cm.y - base.cursor.y;
      // Snap the translation to the grid step so the moved room lands clean.
      if (snapSettings.grid && step > 0) {
        dx = Math.round(dx / step) * step;
        dy = Math.round(dy / step) * step;
      }
      setShapeDragInfo({ dx, dy });
      // No-op move (snapped delta 0) on the first frame → don't churn history.
      if (dx === 0 && dy === 0 && !moveDragMoved.current) return;
      if (!moveDragMoved.current) {
        pushHistory(base.points, base.closed);
        moveDragMoved.current = true;
      }
      onActiveChange(translatePolygon(base.points, dx, dy), closed); // live; history already captured
      return;
    }

    // ── Parallel edge (wall) drag: slide the edge along its outward normal. ──
    if (edgeDragIdx !== null && edgeDragStart.current) {
      const base = edgeDragStart.current;
      const i = edgeDragIdx;
      const delta = { x: cm.x - base.cursor.x, y: cm.y - base.cursor.y };
      let offset = edgeDragOffset(base.points, i, delta, base.closed);
      // Snap the slide distance to the grid step so a dragged wall lands clean.
      if (snapSettings.grid && step > 0) offset = Math.round(offset / step) * step;
      const next = moveEdgeParallel(base.points, i, offset, base.closed);
      // Reject a slide that collapses an edge or folds the outline over itself.
      if (!isValidOutline(next, base.closed)) return;
      // Live length readout for the dragged edge.
      const a = next[i];
      const b = next[(i + 1) % next.length];
      setEdgeDragInfo({ offset, lenCm: Math.hypot(b.x - a.x, b.y - a.y) });
      // No-op move (snapped offset 0) on the very first frame → don't churn history.
      if (offset === 0 && !edgeDragMoved.current) return;
      if (!edgeDragMoved.current) {
        pushHistory(base.points, base.closed);
        edgeDragMoved.current = true;
      }
      onActiveChange(next, closed); // live drag bypasses commit (history captured on first move)
      return;
    }

    if (dragIdx !== null) {
      // CAD snap engine for the drag: object snaps + alignment guides off the
      // OTHER vertices (the dragged one is excluded), then grid. No polar anchor.
      const result = computeSnap({
        cursor: cm,
        points,
        closed,
        origin: null,
        excludeIndex: dragIdx,
        tolCm: pxToCm(10),
        settings: snapSettings,
        extraLoops,
      });
      const target = result.point;
      setSnapResult(result);
      // Ortho move drags the two neighbours so both incident edges stay axis-
      // aligned; validate the WHOLE candidate (it shifts >1 vertex). Free move
      // checks just the single-vertex collapse/intersection guards.
      let next: Pt[];
      if (ortho) {
        next = orthoVertexMove(points, dragIdx, target, closed);
        if (!isValidOutline(next, closed)) return;
      } else {
        if (wouldCollapseEdge(points, dragIdx, target, closed)) return;
        if (closed && wouldSelfIntersect(points, dragIdx, target, true)) return;
        next = points.slice();
        next[dragIdx] = target;
      }
      // No-op move (snapped to the same spot) → don't churn history or state.
      const cur = points[dragIdx];
      if (next[dragIdx].x === cur.x && next[dragIdx].y === cur.y && !dragMoved.current) {
        return;
      }
      // Record the pre-drag state once, on the first real move.
      if (!dragMoved.current && dragStart.current) {
        pushHistory(dragStart.current.points, dragStart.current.closed);
        dragMoved.current = true;
      }
      onActiveChange(next, closed); // live drag bypasses commit (history captured on first move)
      return;
    }

    // Hover detection (closed only): vertex first, then edge body for insert.
    if (closed) {
      let hv: number | null = null;
      for (let i = 0; i < points.length; i++) {
        if (distPx(cm, points[i]) <= HIT_PX) {
          hv = i;
          break;
        }
      }
      setHoverVertex(hv);
      // Nearest edge body under the cursor: drives the wall-slide hover highlight
      // + midpoint handle, and (only while Alt is held) the insert-vertex "+".
      const ne = hv === null ? nearestEdge(points, cm, pxToCm(EDGE_HIT_PX), true) : null;
      setHoverEdgeBody(ne ? ne.index : null);
      setEdgeInsert(ne && e.altKey ? ne : null);
      // Interior (clear of vertex/edge handles) → "move" cursor affordance.
      setHoverInterior(isEditTool && isInteriorPress(cm));
    } else if (tool === "draw" && points.length > 0) {
      // While drawing, preview the snap (marker + polar/alignment guides) for the
      // next point, anchored at the last placed vertex.
      const prev = points[points.length - 1];
      setSnapResult(
        computeSnap({
          cursor: cm,
          points,
          closed,
          origin: prev ?? null,
          excludeIndex: null,
          tolCm: pxToCm(10),
          settings: snapSettings,
          extraLoops,
        }),
      );
    }
  };

  const endDrag = () => {
    // ── Rectangle tool: release builds the 4-corner box and REPLACES the room
    // (one polygon). commit() records undo, so it's reversible. A degenerate
    // (near-zero) drag yields [] and is ignored. After creating we return to
    // "draw" so the new room is immediately editable. ──
    if (tool === "rect" && rectStart && rectEnd) {
      const rect = rectFromCorners(rectStart, rectEnd);
      setRectStart(null);
      setRectEnd(null);
      setSnapResult(null);
      if (rect.length === 4) {
        commit(rect, true);
        setSelEdge(null);
        setSelVertex(null);
        setTool("draw");
      }
      return;
    }
    setDragIdx(null);
    setEdgeDragIdx(null);
    setEdgeDragInfo(null);
    edgeDragStart.current = null;
    edgeDragMoved.current = false;
    // End a whole-room move drag.
    setShapeDragIdx(false);
    setShapeDragInfo(null);
    moveDragStart.current = null;
    moveDragMoved.current = false;
    setSnapResult(null);
    if (panRef.current) {
      panRef.current = null;
      setPanning(false);
    }
  };

  const handleLeave = () => {
    // Cancel an in-flight rectangle drag without committing (pointer left canvas).
    if (tool === "rect") {
      setRectStart(null);
      setRectEnd(null);
    }
    endDrag();
    setCursor(null);
    setHoverVertex(null);
    setHoverEdgeBody(null);
    setEdgeInsert(null);
    setSnapResult(null);
    setHoverEdge(null);
    setHoverInterior(false);
  };

  // ── Pan: middle-button, alt+left, or space-held left drag ──
  const handleDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && (e.altKey || spaceHeld))) {
      e.preventDefault();
      const svg = svgRef.current!;
      const rect = svg.getBoundingClientRect();
      const sx = ((e.clientX - rect.left) / rect.width) * SVG_W;
      const sy = ((e.clientY - rect.top) / rect.height) * SVG_H;
      panRef.current = { sx, sy, tx: view.tx, ty: view.ty };
      setPanning(true);
      return;
    }
    // ── Rectangle tool: a plain left-press anchors corner A (snapped). The drag
    // builds the box; release commits it. Pan (handled above) still wins. ──
    if (tool === "rect" && e.button === 0) {
      const a = snapPoint(eventToCm(e)).point;
      setRectStart(a);
      setRectEnd(a);
      return;
    }

    // ── Whole-room MOVE drag (draw mode, closed room). A left-press that REACHES
    // the SVG has already fallen through the vertex-handle / edge-body grab lines
    // (they stopPropagation). To be safe we re-confirm the press is clearly in the
    // interior AND not within a vertex / edge-body pick radius, then start dragging
    // the whole room. Hit ordering: vertex handle > edge body > interior move. ──
    if (
      isEditTool &&
      e.button === 0 &&
      closed &&
      points.length >= 3 &&
      isInteriorPress(eventToCm(e))
    ) {
      setShapeDragIdx(true);
      setSelVertex(null);
      setSelEdge(null);
      setEdgeInsert(null);
      moveDragStart.current = { points, closed, cursor: eventToCm(e) };
      moveDragMoved.current = false;
      setShapeDragInfo({ dx: 0, dy: 0 });
    }
  };

  // True when a press at cm `p` lands clearly inside the room interior and is NOT
  // within the vertex-handle or edge-body pick radius — the condition for starting
  // a whole-room move instead of clobbering a vertex/edge interaction.
  const isInteriorPress = (p: Pt): boolean => {
    if (!closed || points.length < 3) return false;
    if (!pointInPolygon(p, points)) return false;
    // Within a vertex handle? (vertex > everything)
    for (const v of points) {
      if (distPx(p, v) <= HIT_PX) return false;
    }
    // Within an edge body's grab band? (edge body > interior move)
    if (nearestEdge(points, p, pxToCm(EDGE_BODY_HIT_PX / 2), true)) return false;
    return true;
  };

  // ── Wheel zoom, centred on the cursor (keeps the point under the mouse fixed) ──
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const sx = ((e.clientX - rect.left) / rect.width) * SVG_W;
    const sy = ((e.clientY - rect.top) / rect.height) * SVG_H;
    setView((v) => {
      const factor = Math.exp(-e.deltaY * 0.0015);
      const zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, v.zoom * factor));
      const k = zoom / v.zoom;
      // Keep (sx,sy) anchored: s = world*zoom + t  ⇒  t' = s - (s - t)*k.
      return { zoom, tx: sx - (sx - v.tx) * k, ty: sy - (sy - v.ty) * k };
    });
  };

  const resetView = () => setView(IDENTITY);

  // Frame an arbitrary outline (its world-space bbox) in the viewport.
  // World px = cm×BASE_SCALE + MARGIN; we hand fitView that box + the SVG size.
  const framePoints = (pts: Pt[]) => {
    if (pts.length < 2) return;
    const bb = bbox(pts);
    const worldBox = {
      x: MARGIN + bb.x * BASE_SCALE,
      y: MARGIN + bb.y * BASE_SCALE,
      w: bb.w * BASE_SCALE,
      h: bb.h * BASE_SCALE,
    };
    // Pad generously so the per-edge dimension band AND the overall (extents)
    // dimensions outside it stay on-canvas after a fit.
    setView(fitView(worldBox, SVG_W, SVG_H, 96, MIN_ZOOM, MAX_ZOOM));
  };

  // Zoom-to-fit the current drawn outline.
  const fitToShape = () => framePoints(points);

  // ── Room-shape presets ──
  // Drop a ready-made rectilinear outline (L / T / U / notch) the operator can
  // edit immediately — far faster than hand-placing every vertex. Replaces the
  // current outline (recorded for undo via commit), lands in draw/edit mode so
  // vertices + walls are interactive at once, and frames the new shape.
  const insertPreset = (pts: Pt[]) => {
    switchTool("draw");
    setSelEdge(null);
    setSelVertex(null);
    setEdgeInsert(null);
    // In the multi-room floor plan a preset is a NEW room; fall back to replacing
    // the active outline if the parent doesn't manage a rooms list.
    if (onRequestNewRoom) onRequestNewRoom({ points: pts, closed: true });
    else commit(pts, true);
    framePoints(pts);
  };

  // ── Export helpers ──
  // Shared: clone the live <svg>, stamp it with explicit size + xmlns, insert an
  // opaque white background rect, and serialize to an SVG string. Returns null
  // if the SVG ref is not yet mounted. This string is the source for both the
  // PNG rasterizer and the direct SVG download.
  const buildSheetSvgString = useCallback((): string | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("width", String(SVG_W));
    clone.setAttribute("height", String(SVG_H));
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", "0");
    bg.setAttribute("y", "0");
    bg.setAttribute("width", String(SVG_W));
    bg.setAttribute("height", String(SVG_H));
    bg.setAttribute("fill", "#ffffff");
    clone.insertBefore(bg, clone.firstChild);
    return new XMLSerializer().serializeToString(clone);
  }, [SVG_W, SVG_H]);

  // Export the current drawing (dimensions + beam/block overlay) to a PNG and
  // download it — a CAD-style sheet the operator can hand the client. The
  // current zoom/pan is baked into the rendered nodes, so "Fit" first frames
  // the whole room before exporting.
  const exportPng = useCallback(() => {
    const xml = buildSheetSvgString();
    if (!xml) return;
    const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      // Target ~4K on the long edge for a crisp, print-ready CAD sheet.
      const scale = Math.max(2, Math.ceil(3840 / Math.max(SVG_W, SVG_H)));
      const canvas = document.createElement("canvas");
      canvas.width = SVG_W * scale;
      canvas.height = SVG_H * scale;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((png) => {
          if (png) {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(png);
            a.download = "room-drawing.png";
            a.click();
            URL.revokeObjectURL(a.href);
          }
        }, "image/png");
      }
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [buildSheetSvgString, SVG_W, SVG_H]);

  // Export the current drawing as a vector SVG file — lossless and
  // resolution-independent; useful for further editing in Inkscape / Illustrator.
  const exportSvg = useCallback(() => {
    const xml = buildSheetSvgString();
    if (!xml) return;
    const blob = new Blob([xml], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "room-drawing.svg";
    a.click();
    URL.revokeObjectURL(url);
  }, [buildSheetSvgString]);

  // ── Toolbar actions ──
  const clear = () => {
    if (!points.length && !closed) return;
    pushHistory(points, closed);
    setDragIdx(null);
    setSelEdge(null);
    setSelVertex(null);
    setCursor(null);
    setEdgeInsert(null);
    setHoverVertex(null);
    setSnapResult(null);
    setDdeLen("");
    setDdeAngle("");
    setDdeInvalid(false);
    dragStart.current = null;
    dragMoved.current = false;
    onActiveChange([], false);
  };

  // Robust close: only finalize a loop that is non-degenerate + non-crossing.
  const closeOk = !closed && canClose(points);
  const close = () => {
    if (closeOk) commit(points, true);
  };

  // Remove the last placed point while drawing (in-draw step-back, like CAD).
  const undoLastPoint = () => {
    if (closed || points.length === 0) return;
    commit(points.slice(0, -1));
  };

  const undo = () => {
    const snap = undoStack.current.pop();
    if (!snap) return;
    redoStack.current.push({ points, closed });
    setSelEdge(null);
    setSelVertex(null);
    setHistTick((t) => t + 1);
    onActiveChange(snap.points, snap.closed);
  };

  const redo = () => {
    const snap = redoStack.current.pop();
    if (!snap) return;
    undoStack.current.push({ points, closed });
    setSelEdge(null);
    setSelVertex(null);
    setHistTick((t) => t + 1);
    onActiveChange(snap.points, snap.closed);
  };

  const deleteSelected = () => {
    if (selVertex === null) return;
    const next = deleteVertex(points, selVertex, closed);
    if (next === points) return; // refused (would drop below a valid loop)
    commit(next);
    setSelVertex(null);
    setSelEdge(null);
    setEdgeInsert(null);
  };

  // ── Keyboard: Escape, arrow nudge, delete, undo/redo, close ──
  // Bound to the SVG (it is focusable via tabIndex) so it doesn't hijack the
  // page; the length <input> handles its own keys and stops propagation.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Space arms pan mode (left-drag pans). Don't scroll the page.
    if (e.key === " " || e.code === "Space") {
      e.preventDefault();
      setSpaceHeld(true);
      return;
    }

    const meta = e.ctrlKey || e.metaKey;
    if (meta && e.key.toLowerCase() === "z") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (meta && e.key.toLowerCase() === "y") {
      e.preventDefault();
      redo();
      return;
    }

    // ── Tape measure keys: Esc clears the chain; Enter finishes it (freezes the
    // rubber-band, keeps the marks visible until cleared). ──
    if (tool === "measure" && measurePts.length > 0) {
      if (e.key === "Escape") {
        e.preventDefault();
        setMeasurePts([]);
        setMeasureDone(false);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        setMeasureDone(true);
        return;
      }
    }

    if (e.key === "Escape") {
      e.preventDefault();
      if (!closed && points.length > 0) {
        // Cancel the in-progress draw entirely.
        clear();
      } else {
        setSelVertex(null);
        setSelEdge(null);
        setEdgeInsert(null);
        setHoverVertex(null);
      }
      return;
    }

    // While drawing, Backspace steps back one placed point (Delete too, since
    // there's no vertex selection during a draw). Once closed, Delete/Backspace
    // removes the selected vertex.
    if (!closed && (e.key === "Backspace" || e.key === "Delete")) {
      e.preventDefault();
      undoLastPoint();
      return;
    }
    if (closed && (e.key === "Delete" || e.key === "Backspace") && selVertex !== null) {
      e.preventDefault();
      deleteSelected();
      return;
    }

    if (e.key === "Enter" && closeOk) {
      e.preventDefault();
      close();
      return;
    }

    // "F" frames the drawn shape; "0" resets the view (CAD view shortcuts).
    if (!meta && (e.key === "f" || e.key === "F")) {
      e.preventDefault();
      fitToShape();
      return;
    }
    if (!meta && e.key === "0") {
      e.preventDefault();
      resetView();
      return;
    }

    // Arrow-key nudge of the selected vertex by one grid step.
    if (selVertex !== null && e.key.startsWith("Arrow")) {
      e.preventDefault();
      const d = e.shiftKey ? step * 5 : step;
      const dx = e.key === "ArrowLeft" ? -d : e.key === "ArrowRight" ? d : 0;
      const dy = e.key === "ArrowUp" ? -d : e.key === "ArrowDown" ? d : 0;
      if (dx === 0 && dy === 0) return;
      const p = points[selVertex];
      const target = { x: p.x + dx, y: p.y + dy };
      let next: Pt[];
      if (ortho) {
        next = orthoVertexMove(points, selVertex, target, closed);
        if (!isValidOutline(next, closed)) return;
      } else {
        if (wouldCollapseEdge(points, selVertex, target, closed)) return;
        if (closed && wouldSelfIntersect(points, selVertex, target, true)) return;
        next = points.slice();
        next[selVertex] = target;
      }
      commit(next);
      return;
    }

    // ── DDE auto-activate: while DRAWING with a previous point, typing a digit or
    // "." (when no input is focused) starts the distance entry CAD-style: focus
    // the Length field and seed it with that character. Reached only AFTER all
    // existing shortcuts (Esc/Backspace/arrows/f/0/Ctrl+Z/Space/Enter) have had
    // their turn and returned, so none are clobbered. ──
    if (
      !closed &&
      points.length >= 1 &&
      !meta &&
      !e.altKey &&
      (/^[0-9]$/.test(e.key) || e.key === ".")
    ) {
      e.preventDefault();
      const seed = e.key;
      setDdeInvalid(false);
      setDdeLen(seed);
      // Focus + move the caret to the end after React paints the seeded value.
      requestAnimationFrame(() => {
        const el = ddeLenRef.current;
        if (el) {
          el.focus();
          const end = el.value.length;
          el.setSelectionRange(end, end);
        }
      });
    }
  };

  // Release space → leave pan-arm (and end any in-flight pan).
  const handleKeyUp = (e: React.KeyboardEvent) => {
    if (e.key === " " || e.code === "Space") {
      setSpaceHeld(false);
      if (panRef.current) {
        panRef.current = null;
        setPanning(false);
      }
    }
  };

  // ── Edge selection + keyboard length entry ──
  const edgeCount = closed ? points.length : Math.max(0, points.length - 1);

  const edgeLenCm = (i: number): number => {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    return Math.round(Math.hypot(b.x - a.x, b.y - a.y));
  };

  // Current bearing (deg, 1-decimal) of edge i, for seeding the angle field.
  const edgeBearing = (i: number): number =>
    Math.round(edgeBearingDeg(points, i, closed) * 10) / 10;

  const selectEdge = (i: number) => (e: React.MouseEvent) => {
    // Edge-length editing is an edit interaction (draw or select tool); in
    // rect/measure mode let the click fall through to the canvas.
    if (!isEditTool) return;
    e.stopPropagation();
    setSelEdge(i);
    setSelVertex(null);
    setLenInput(String(edgeLenCm(i)));
    setAngleInput(String(edgeBearing(i)));
    setLenEditing(true); // dimension click → open the inline length editor
  };

  const applyLen = () => {
    if (selEdge === null) return;
    const next = Number(lenInput);
    if (Number.isFinite(next) && next > 0) {
      commit(setEdgeLength(points, selEdge, next));
    }
  };

  // Rotate the selected edge to an absolute bearing (deg), rejecting a result
  // that self-intersects or collapses an edge. Used by the Angle field + mirrors.
  const applyBearing = (deg: number) => {
    if (selEdge === null || !Number.isFinite(deg)) return;
    const next = setEdgeBearing(points, selEdge, deg, closed);
    if (next === points) return;
    if (!isValidOutline(next, closed)) return; // would fold / collapse — reject
    commit(next);
    setAngleInput(String(Math.round(deg * 10) / 10));
  };

  const applyAngle = () => {
    if (selEdge === null) return;
    const deg = Number(angleInput);
    if (Number.isFinite(deg)) applyBearing(deg);
  };

  // Mirror ↔ : reflect the edge's bearing about the VERTICAL axis (180 − b);
  // Mirror ↕ : reflect about the HORIZONTAL axis (−b). Both turn one chamfer
  // into its mirror so a tapered room's two slants can be made symmetric.
  const mirrorH = () => {
    if (selEdge === null) return;
    applyBearing(180 - edgeBearingDeg(points, selEdge, closed));
  };
  const mirrorV = () => {
    if (selEdge === null) return;
    applyBearing(-edgeBearingDeg(points, selEdge, closed));
  };

  // ── Whole-room TRANSFORM actions (Transform toolbar group). All operate on the
  // CLOSED room about its bbox centre, so the shape stays in place on screen, and
  // go through commit() for undo. Enabled only when `canTransform`. ──
  const canTransform = closed && points.length >= 3;

  // Rotate the whole room by `deg` (clockwise-positive) about the bbox centre.
  const rotateRoom = (deg: number) => {
    if (!canTransform || !Number.isFinite(deg)) return;
    commit(rotatePolygon(points, deg));
  };
  const applyRotInput = () => {
    const deg = Number(rotInput);
    if (Number.isFinite(deg) && deg !== 0) rotateRoom(deg);
  };
  // Mirror the whole room horizontally / vertically about the bbox centre.
  const mirrorRoomX = () => {
    if (!canTransform) return;
    commit(mirrorPolygonX(points));
  };
  const mirrorRoomY = () => {
    if (!canTransform) return;
    commit(mirrorPolygonY(points));
  };

  const canUndo = undoStack.current.length > 0;
  const canRedo = redoStack.current.length > 0;
  void histTick; // referenced to tie re-render to history changes

  // ── Infinite CAD grid: recomputed every render from the live view so it ALWAYS
  // fills the whole viewport at any zoom/pan (no bare bands). visibleGridLines
  // returns SCREEN-px segments (the view transform is baked in), so they render
  // directly — NOT inside a scene <g transform>. ──
  const vg = visibleGridLines({
    zoom: view.zoom,
    tx: view.tx,
    ty: view.ty,
    wPx: SVG_W,
    hPx: SVG_H,
    baseScale: BASE_SCALE,
    marginPx: MARGIN,
    stepCm: grid,
    majorEvery: 5,
  });
  const gridNodes = (
    <g style={{ pointerEvents: "none" }}>
      {vg.minor.map((l, i) => (
        <line key={`gn${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#e9eff6" strokeWidth={1} />
      ))}
      {vg.major.map((l, i) => (
        <line key={`gm${i}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#d4e0ec" strokeWidth={1.25} />
      ))}
      {vg.axisX !== null && (
        <line x1={vg.axisX} y1={0} x2={vg.axisX} y2={SVG_H} stroke="#a9bccd" strokeWidth={1.5} />
      )}
      {vg.axisY !== null && (
        <line x1={0} y1={vg.axisY} x2={SVG_W} y2={vg.axisY} stroke="#a9bccd" strokeWidth={1.5} />
      )}
    </g>
  );

  // ── Ring-beam band: the drawn outline is the INNER clear span; beams overrun
  // ~BEARING_CM onto a concrete ring beam / foundation around it. Offset the
  // outline outward and fill the ring (even-odd: outer path minus inner path)
  // with a concrete hatch so the bearing seats visibly rest on it. ──
  const ringBeamPts =
    closed && points.length >= 3 ? offsetPolygonOutward(points, BEARING_CM) : null;
  const ringBandPath = ringBeamPts
    ? (() => {
        const toPath = (pts: Pt[]) =>
          pts
            .map((p, i) => {
              const s = cmToPx(p);
              return `${i === 0 ? "M" : "L"}${s.x},${s.y}`;
            })
            .join(" ") + " Z";
        return `${toPath(ringBeamPts)} ${toPath(points)}`;
      })()
    : null;

  // Vertex/point screen positions (used for handles + close-band visuals).
  const pxPts = points.map(cmToPx);
  const pathPts = pxPts.map((p) => `${p.x},${p.y}`).join(" ");

  // ── Edge-body interaction layer (closed only): a transparent thick hit line
  // ALONG each actual wall segment. Click selects the edge; drag (or grab the
  // square midpoint handle) slides the wall parallel to itself; Alt-click inserts
  // a vertex. Hover highlights the wall (sky) + reveals the midpoint handle so the
  // "grab a wall and slide it" affordance is discoverable. ──
  const edgeBodyNodes: React.ReactNode[] = [];
  if (closed && points.length >= 3 && dragIdx === null) {
    for (let i = 0; i < points.length; i++) {
      const pa = pxPts[i];
      const pb = pxPts[(i + 1) % points.length];
      const active = edgeDragIdx === i;
      const hot = active || hoverEdgeBody === i || selEdge === i;
      const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
      edgeBodyNodes.push(
        <g key={`ebody${i}`}>
          {/* Visible highlight of the wall when hovered / selected / dragging. */}
          {hot && (
            <line
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              stroke={active ? "#0369a1" : "#38bdf8"}
              strokeWidth={active ? 3.5 : 3}
              strokeLinecap="round"
              style={{ pointerEvents: "none" }}
            />
          )}
          {/* Transparent grab line along the wall: click=select, drag=slide. */}
          <line
            x1={pa.x}
            y1={pa.y}
            x2={pb.x}
            y2={pb.y}
            stroke="transparent"
            strokeWidth={EDGE_BODY_HIT_PX}
            style={{ cursor: edgeDragIdx !== null ? "grabbing" : "move" }}
            onMouseDown={handleEdgeDown(i)}
            onMouseEnter={() => setHoverEdgeBody(i)}
            onMouseLeave={() => setHoverEdgeBody((h) => (h === i ? null : h))}
          />
          {/* Square midpoint handle — the explicit "slide this wall" grip. */}
          {hot && (
            <rect
              x={mid.x - 4}
              y={mid.y - 4}
              width={8}
              height={8}
              rx={1}
              fill={active ? "#0369a1" : "#fff"}
              stroke={active ? "#0369a1" : "#0284c7"}
              strokeWidth={1.5}
              style={{ cursor: edgeDragIdx !== null ? "grabbing" : "move" }}
              onMouseDown={handleEdgeDown(i)}
            />
          )}
        </g>,
      );
    }
  }

  // Rubber-band: preview the next ortho-snapped edge while drawing. Turns red
  // when the step is invalid (would self-cross), and the snap-to-close ring
  // glows green only when the loop can actually be closed here.
  let rubber: React.ReactNode = null;
  if (!closed && cursor && points.length > 0) {
    const prev = points[points.length - 1];
    // Preview the SAME candidate the click would place (snap engine), so the
    // rubber-band line ends exactly where the next vertex lands.
    let cand = computeSnap({
      cursor,
      points,
      closed,
      origin: prev ?? null,
      excludeIndex: null,
      tolCm: pxToCm(10),
      settings: snapSettings,
      extraLoops,
    }).point;
    // DDE preview: when a Length is typed, place the preview tip at that exact
    // distance — along the typed Angle if given, else along the snapped cursor
    // direction — so the rubber-band shows where Enter will commit.
    const ddeLenNum = Number(ddeLen);
    if (ddeLen.trim() !== "" && Number.isFinite(ddeLenNum) && ddeLenNum >= MIN_DRAW_STEP_CM) {
      const angleTxt = ddeAngle.trim();
      let bearing: number | null;
      if (angleTxt !== "") {
        const a = Number(angleTxt);
        bearing = Number.isFinite(a) ? a : null;
      } else {
        bearing = ddeDirectionBearing(prev);
      }
      if (bearing !== null) cand = pointFromPolar(prev, ddeLenNum, bearing);
    }
    const pa = cmToPx(prev);
    const pb = cmToPx(cand);
    const nearClose =
      points.length >= 3 && distPx(cursor, points[0]) <= HIT_PX;
    const closeValid = nearClose && canClose(points);
    // Invalid if the proposed step crosses the path or is a hairline (but not
    // while we're hovering the close target — that's a finalize, not a step).
    const stepLen = Math.hypot(cand.x - prev.x, cand.y - prev.y);
    const invalid =
      !nearClose && (stepLen < MIN_DRAW_STEP_CM || drawStepWouldCross(points, cand));
    const stroke = invalid ? "#dc2626" : "#0284c7";
    // Live length + angle readout for the segment being drawn (prev → cand).
    // Bearing uses the same y-down screen convention as edgeBearingDeg; we also
    // surface the TURN from the previous edge when there is one, so the user sees
    // e.g. "2.40 m · 45° (↱90°)" as polar snapping locks the direction.
    const segBearing =
      stepLen > 1e-6
        ? ((Math.atan2(cand.y - prev.y, cand.x - prev.x) * 180) / Math.PI)
        : 0;
    let turnTxt = "";
    if (points.length >= 2 && stepLen > 1e-6) {
      const p0 = points[points.length - 2];
      const prevBear = (Math.atan2(prev.y - p0.y, prev.x - p0.x) * 180) / Math.PI;
      let turn = segBearing - prevBear;
      while (turn > 180) turn -= 360;
      while (turn <= -180) turn += 360;
      if (Math.abs(turn) > 0.5) turnTxt = ` (${Math.round(Math.abs(turn))}°)`;
    }
    const readout = `${formatLengthCm(stepLen)} · ${Math.round(segBearing)}°${turnTxt}`;
    // Park the label just past the moving tip, nudged off the line so it doesn't
    // sit on the cursor.
    const lblX = pb.x + 12;
    const lblY = pb.y - 12;
    rubber = (
      <g style={{ pointerEvents: "none" }}>
        <line
          x1={pa.x}
          y1={pa.y}
          x2={pb.x}
          y2={pb.y}
          stroke={stroke}
          strokeWidth={1.5}
          strokeDasharray="4 4"
          opacity={0.7}
        />
        <circle cx={pb.x} cy={pb.y} r={3} fill={stroke} opacity={0.7} />
        {!nearClose && stepLen > 1e-6 && (
          <text
            x={lblX}
            y={lblY}
            fontSize={11}
            fontWeight={700}
            fill={stroke}
            textAnchor="start"
            dominantBaseline="middle"
            stroke="#ffffff"
            strokeWidth={3}
            style={{ paintOrder: "stroke", userSelect: "none" }}
          >
            {readout}
          </text>
        )}
        {nearClose && (
          <circle
            cx={pxPts[0].x}
            cy={pxPts[0].y}
            r={HIT_PX}
            fill={closeValid ? "#16a34a" : "#dc2626"}
            fillOpacity={0.14}
            stroke={closeValid ? "#16a34a" : "#dc2626"}
            strokeDasharray="3 3"
          />
        )}
      </g>
    );
  }

  // ── Rectangle-tool preview: a dashed axis-aligned box A→B with corner markers
  // and a live W × H (m) readout while dragging. ──
  let rectPreview: React.ReactNode = null;
  if (tool === "rect" && rectStart && rectEnd) {
    const a = cmToPx(rectStart);
    const b = cmToPx(rectEnd);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    const wCm = Math.abs(rectEnd.x - rectStart.x);
    const hCm = Math.abs(rectEnd.y - rectStart.y);
    const readout = `${formatLengthCm(wCm)} × ${formatLengthCm(hCm)}`;
    rectPreview = (
      <g style={{ pointerEvents: "none" }}>
        <rect
          x={x}
          y={y}
          width={w}
          height={h}
          fill="#0ea5e9"
          fillOpacity={0.06}
          stroke="#0284c7"
          strokeWidth={1.5}
          strokeDasharray="5 4"
        />
        {/* Corner markers at A and the live B. */}
        <circle cx={a.x} cy={a.y} r={3.5} fill="#0284c7" />
        <circle cx={b.x} cy={b.y} r={3.5} fill="#0284c7" />
        <text
          x={b.x + 12}
          y={b.y - 12}
          fontSize={12}
          fontWeight={700}
          fill="#0369a1"
          textAnchor="start"
          dominantBaseline="middle"
          stroke="#ffffff"
          strokeWidth={3.5}
          style={{ paintOrder: "stroke", userSelect: "none" }}
        >
          {readout}
        </text>
      </g>
    );
  }

  // ── Tape-measure overlay (display-only): the amber polyline with round nodes,
  // each segment labelled with its length + bearing, a live rubber-band segment
  // to the cursor (until the chain is finished), and a running-total chip near
  // the last point. NEVER reads or writes `points`. ──
  let measureOverlay: React.ReactNode = null;
  if (tool === "measure" && measurePts.length > 0) {
    const AMBER = "#d97706";
    // Bearing (deg, y-down) of a→b — same convention as edgeBearingDeg.
    const bearing = (a: Pt, b: Pt) =>
      Math.round((Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI);
    // The placed segments plus (when still measuring) a live segment to cursor.
    const chain: Pt[] =
      !measureDone && cursor
        ? [...measurePts, snapPoint(cursor).point]
        : measurePts;
    const pxChain = chain.map(cmToPx);
    const segNodes: React.ReactNode[] = [];
    let running = 0;
    for (let i = 0; i + 1 < chain.length; i++) {
      const a = chain[i];
      const b = chain[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      running += segLen;
      const pa = pxChain[i];
      const pb = pxChain[i + 1];
      const live = i === chain.length - 2 && !measureDone && cursor;
      const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
      const label = `${formatLengthCm(segLen)} · ${bearing(a, b)}°`;
      segNodes.push(
        <g key={`mseg${i}`}>
          <line
            x1={pa.x}
            y1={pa.y}
            x2={pb.x}
            y2={pb.y}
            stroke={AMBER}
            strokeWidth={1.75}
            strokeDasharray={live ? "5 4" : undefined}
            opacity={live ? 0.8 : 1}
          />
          {segLen > 1e-6 && (
            <text
              x={mid.x}
              y={mid.y - 8}
              fontSize={10.5}
              fontWeight={700}
              fill={AMBER}
              textAnchor="middle"
              dominantBaseline="middle"
              stroke="#ffffff"
              strokeWidth={3}
              style={{ paintOrder: "stroke", userSelect: "none" }}
            >
              {label}
            </text>
          )}
        </g>,
      );
    }
    const last = pxChain[pxChain.length - 1];
    measureOverlay = (
      <g style={{ pointerEvents: "none" }}>
        {segNodes}
        {pxChain.map((p, i) => (
          <circle key={`mnode${i}`} cx={p.x} cy={p.y} r={3.5} fill="#fff" stroke={AMBER} strokeWidth={1.75} />
        ))}
        {/* Running total near the last point. */}
        {chain.length >= 2 && (
          <text
            x={last.x + 12}
            y={last.y + 14}
            fontSize={11}
            fontWeight={800}
            fill={AMBER}
            textAnchor="start"
            dominantBaseline="middle"
            stroke="#ffffff"
            strokeWidth={3.25}
            style={{ paintOrder: "stroke", userSelect: "none" }}
          >
            {`Σ ${formatLengthCm(running)}`}
          </text>
        )}
      </g>
    );
  }

  // ── Per-edge CAD dimension lines ──
  // For each edge we draw: two extension lines (from just outside each endpoint,
  // perpendicular to the edge, out to the dimension line), the dimension line
  // with arrowheads at both tips, and the length text. Placement is decided by
  // `dimStyleForEdge` from the on-screen edge length:
  //  - inline  : text in a gap punched in the line, arrows inward at the tips.
  //  - outside : edge too short for inline text → arrows point INWARD from the
  //              tips and the label is parked just past the right-hand tip, so
  //              adjacent short-edge labels don't collide.
  //  - bare    : edge tiny → a single floating number, no lines/arrows.
  // The outward direction uses `edgeOutwardNormal` (point-in-polygon sampling)
  // so a re-entrant notch wall dimensions INTO the notch void, never buried in
  // the solid. A wide invisible hit-line keeps click-to-type-length discoverable.
  const dims: React.ReactNode[] = [];
  const edgeHits: React.ReactNode[] = [];
  // Stacking levels so parallel/collinear dimensions on the SAME outward side
  // (e.g. an L-shape's two short collinear walls, or a notch wall lined up with
  // an outer wall) sit on distinct offset bands instead of overprinting.
  const dimLevels = closed
    ? dimensionOffsetLevels(points, (i) => edgeOutwardNormal(points, i))
    : new Array<number>(edgeCount).fill(0);
  // Deepest level reached — the overall (extents) dimensions sit just past it.
  const maxDimLevel = dimLevels.reduce((m, l) => Math.max(m, l), 0);
  for (let i = 0; i < edgeCount; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    const lenCm = Math.hypot(b.x - a.x, b.y - a.y);
    if (lenCm < 1e-6) continue;
    const label = formatLengthDual(lenCm);
    const selected = selEdge === i;
    const hovered = hoverEdge === i;
    const pa = cmToPx(a);
    const pb = cmToPx(b);
    const edgePx = Math.hypot(pb.x - pa.x, pb.y - pa.y);

    // Outward normal in cm-space; we orient the on-screen edge perpendicular to
    // agree with it. cmToPx applies the view scale, so we work in px-perp space.
    const nCm = closed ? edgeOutwardNormal(points, i) : { x: 0, y: 0 };
    const ux = (pb.x - pa.x) / edgePx;
    const uy = (pb.y - pa.y) / edgePx;
    let perpX = -uy;
    let perpY = ux;
    if (closed) {
      // world y-down == screen y-down here; flip perp to match the world normal.
      if (perpX * nCm.x + perpY * nCm.y < 0) {
        perpX = -perpX;
        perpY = -perpY;
      }
    } else if (perpY > 0) {
      // Open polyline: push labels to one consistent side (above the edge).
      perpX = -perpX;
      perpY = -perpY;
    }

    const off = DIM_OFFSET_PX + dimLevels[i] * DIM_LEVEL_STEP_PX;
    // Dimension-line endpoints (parallel to the edge, offset outward).
    const d1 = { x: pa.x + perpX * off, y: pa.y + perpY * off };
    const d2 = { x: pb.x + perpX * off, y: pb.y + perpY * off };
    const mid = { x: (d1.x + d2.x) / 2, y: (d1.y + d2.y) / 2 };
    // Unit vector along the dimension line (d1→d2).
    const gx = (d2.x - d1.x) / edgePx;
    const gy = (d2.y - d1.y) / edgePx;
    // Tilt the LABEL to run along the (rotated) dimension line for diagonal
    // edges so a chamfer wall's number reads ALONG its dim line exactly like a
    // straight wall's; axis-aligned edges return 0 → identical to before.
    const labelDeg = dimLabelAngleDeg(d1, d2);

    const plan = dimStyleForEdge(
      edgePx,
      dimTextHalfPx(label),
      DIM_ARROW_LEN,
      DIM_MIN_EDGE_PX,
    );

    if (closed) {
      // Click target spans the dimension line; for the "outside" case extend it
      // past the right tip to cover the parked label so the number stays grabbable.
      const h1 = d1;
      const h2 =
        plan.style === "outside"
          ? { x: d2.x + gx * plan.textOffsetPx * 2, y: d2.y + gy * plan.textOffsetPx * 2 }
          : d2;
      edgeHits.push(
        <line
          key={`hit${i}`}
          x1={h1.x}
          y1={h1.y}
          x2={h2.x}
          y2={h2.y}
          stroke="transparent"
          strokeWidth={18}
          style={{ cursor: "pointer" }}
          onClick={selectEdge(i)}
          onDoubleClick={selectEdge(i)}
          onMouseEnter={() => setHoverEdge(i)}
          onMouseLeave={() => setHoverEdge((h) => (h === i ? null : h))}
        />,
      );
    }

    // Highlight the actual edge when its dimension is selected.
    if (selected) {
      dims.push(
        <line
          key={`seledge${i}`}
          x1={pa.x}
          y1={pa.y}
          x2={pb.x}
          y2={pb.y}
          stroke="#f59e0b"
          strokeWidth={3}
          style={{ pointerEvents: "none" }}
        />,
      );
    }

    // Selected (amber) > hovered (sky, the click-to-edit affordance) > resting.
    const stroke = selected ? "#b45309" : hovered ? "#0284c7" : "#64748b";
    const textFill = selected ? "#b45309" : hovered ? "#0369a1" : "#334155";
    const textWeight = selected || hovered ? 700 : 500;
    const textCursor = closed ? "pointer" : "default";

    // Bare tiny edges: a single floating number, nudged outward off the edge.
    if (plan.style === "bare") {
      const m = { x: mid.x + perpX * 4, y: mid.y + perpY * 4 };
      dims.push(
        <text
          key={`tlbl${i}`}
          x={m.x}
          y={m.y}
          fontSize={11}
          fill={textFill}
          fontWeight={textWeight}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{ userSelect: "none", cursor: textCursor, paintOrder: "stroke" }}
          stroke="#ffffff"
          strokeWidth={3}
          onClick={closed ? selectEdge(i) : undefined}
          onDoubleClick={closed ? selectEdge(i) : undefined}
        >
          {label}
        </text>,
      );
      continue;
    }

    // Extension lines: a small gap off the edge endpoint, out past the dim line.
    const extA = { x: pa.x + perpX * DIM_EXT_GAP_PX, y: pa.y + perpY * DIM_EXT_GAP_PX };
    const extAOut = { x: pa.x + perpX * (off + DIM_EXT_OVERSHOOT_PX), y: pa.y + perpY * (off + DIM_EXT_OVERSHOOT_PX) };
    const extB = { x: pb.x + perpX * DIM_EXT_GAP_PX, y: pb.y + perpY * DIM_EXT_GAP_PX };
    const extBOut = { x: pb.x + perpX * (off + DIM_EXT_OVERSHOOT_PX), y: pb.y + perpY * (off + DIM_EXT_OVERSHOOT_PX) };

    // Arrowhead at `tip`, pointing along (dirX,dirY). Filled triangle.
    const arrow = (tip: Pt, dirX: number, dirY: number, key: string) => {
      const bx = tip.x - dirX * DIM_ARROW_LEN;
      const by = tip.y - dirY * DIM_ARROW_LEN;
      const px = -dirY * DIM_ARROW_HALF;
      const py = dirX * DIM_ARROW_HALF;
      return (
        <polygon
          key={key}
          points={`${tip.x},${tip.y} ${bx + px},${by + py} ${bx - px},${by - py}`}
          fill={stroke}
          style={{ pointerEvents: "none" }}
        />
      );
    };

    const lineW = selected ? 1.75 : hovered ? 1.6 : 1.25;

    if (plan.style === "inline") {
      // Punch a gap for the centred text; arrows point OUTWARD to the tips.
      const g1 = { x: mid.x - gx * plan.gapHalfPx, y: mid.y - gy * plan.gapHalfPx };
      const g2 = { x: mid.x + gx * plan.gapHalfPx, y: mid.y + gy * plan.gapHalfPx };
      dims.push(
        <g key={`dim${i}`} style={{ pointerEvents: "none" }}>
          <line x1={extA.x} y1={extA.y} x2={extAOut.x} y2={extAOut.y} stroke={stroke} strokeWidth={1} opacity={0.8} />
          <line x1={extB.x} y1={extB.y} x2={extBOut.x} y2={extBOut.y} stroke={stroke} strokeWidth={1} opacity={0.8} />
          <line x1={d1.x} y1={d1.y} x2={g1.x} y2={g1.y} stroke={stroke} strokeWidth={lineW} />
          <line x1={g2.x} y1={g2.y} x2={d2.x} y2={d2.y} stroke={stroke} strokeWidth={lineW} />
          {arrow(d1, -gx, -gy, `a1${i}`)}
          {arrow(d2, gx, gy, `a2${i}`)}
        </g>,
      );
      dims.push(
        <text
          key={`lbl${i}`}
          x={mid.x}
          y={mid.y}
          fontSize={DIM_FONT_PX}
          fill={textFill}
          fontWeight={textWeight}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={labelDeg ? `rotate(${labelDeg} ${mid.x} ${mid.y})` : undefined}
          style={{ userSelect: "none", cursor: textCursor, paintOrder: "stroke" }}
          stroke="#ffffff"
          strokeWidth={3.5}
          onClick={closed ? selectEdge(i) : undefined}
          onDoubleClick={closed ? selectEdge(i) : undefined}
        >
          {label}
        </text>,
      );
    } else {
      // "outside": short edge. Solid dim line, arrows point INWARD from the
      // tips (meeting in the middle), label parked just past the right tip.
      const tx = { x: d2.x + gx * plan.textOffsetPx, y: d2.y + gy * plan.textOffsetPx };
      dims.push(
        <g key={`dim${i}`} style={{ pointerEvents: "none" }}>
          <line x1={extA.x} y1={extA.y} x2={extAOut.x} y2={extAOut.y} stroke={stroke} strokeWidth={1} opacity={0.8} />
          <line x1={extB.x} y1={extB.y} x2={extBOut.x} y2={extBOut.y} stroke={stroke} strokeWidth={1} opacity={0.8} />
          <line x1={d1.x} y1={d1.y} x2={d2.x} y2={d2.y} stroke={stroke} strokeWidth={lineW} />
          {arrow(d1, gx, gy, `a1${i}`)}
          {arrow(d2, -gx, -gy, `a2${i}`)}
        </g>,
      );
      dims.push(
        <text
          key={`lbl${i}`}
          x={tx.x}
          y={tx.y}
          fontSize={DIM_FONT_PX}
          fill={textFill}
          fontWeight={textWeight}
          textAnchor="middle"
          dominantBaseline="middle"
          transform={labelDeg ? `rotate(${labelDeg} ${tx.x} ${tx.y})` : undefined}
          style={{ userSelect: "none", cursor: textCursor, paintOrder: "stroke" }}
          stroke="#ffffff"
          strokeWidth={3.5}
          onClick={closed ? selectEdge(i) : undefined}
          onDoubleClick={closed ? selectEdge(i) : undefined}
        >
          {label}
        </text>,
      );
    }
  }

  // ── Interior-angle dimension arcs (closed only, "Angles" toggle on): a small
  // arc + degree label inside each corner, so tapered/angled walls read their
  // exact angle. ~90° corners are skipped (they're implied by the square look) to
  // keep clutter down; everything off-square — the chamfers — is labelled. ──
  const ANGLE_ARC_PX = 14; // arc radius in screen px
  const angleNodes: React.ReactNode[] = [];
  if (closed && showAngles && points.length >= 3) {
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const ang = interiorAngleDeg(points, i);
      if (ang <= 0) continue;
      // Skip near-square corners (90° ± 1°) — they're obvious from the drawing.
      if (Math.abs(ang - 90) < 1) continue;
      const cur = cmToPx(points[i]);
      const prev = cmToPx(points[(i - 1 + n) % n]);
      const next = cmToPx(points[(i + 1) % n]);
      // Unit screen directions from the corner toward each neighbour.
      const du = { x: prev.x - cur.x, y: prev.y - cur.y };
      const dv = { x: next.x - cur.x, y: next.y - cur.y };
      const lu = Math.hypot(du.x, du.y);
      const lv = Math.hypot(dv.x, dv.y);
      if (lu < 1e-6 || lv < 1e-6) continue;
      const u = { x: du.x / lu, y: du.y / lu };
      const v = { x: dv.x / lv, y: dv.y / lv };
      // Arc start/end points on the two edges, `ANGLE_ARC_PX` from the corner.
      const a1 = { x: cur.x + u.x * ANGLE_ARC_PX, y: cur.y + u.y * ANGLE_ARC_PX };
      const a2 = { x: cur.x + v.x * ANGLE_ARC_PX, y: cur.y + v.y * ANGLE_ARC_PX };
      // SVG arc: large-arc flag set for a reflex (>180°) interior corner; sweep
      // direction chosen so the arc bows INTO the interior (between the edges).
      const largeArc = ang > 180 ? 1 : 0;
      const crossScreen = u.x * v.y - u.y * v.x; // sweep sign from edge turn
      const sweep = crossScreen > 0 ? 1 : 0;
      // Bisector direction (into the interior) for placing the label just outside
      // the arc. For a reflex corner the interior bisector flips outward.
      let bx = u.x + v.x;
      let by = u.y + v.y;
      const bl = Math.hypot(bx, by);
      if (bl < 1e-6) {
        // Edges are nearly opposite (≈180°): use the arc-chord perpendicular.
        bx = -u.y;
        by = u.x;
      } else {
        bx /= bl;
        by /= bl;
      }
      if (ang > 180) {
        bx = -bx;
        by = -by;
      }
      const lr = ANGLE_ARC_PX + 9;
      const lp = { x: cur.x + bx * lr, y: cur.y + by * lr };
      angleNodes.push(
        <g key={`ang${i}`} style={{ pointerEvents: "none" }}>
          <path
            d={`M ${a1.x} ${a1.y} A ${ANGLE_ARC_PX} ${ANGLE_ARC_PX} 0 ${largeArc} ${sweep} ${a2.x} ${a2.y}`}
            fill="none"
            stroke="#7c3aed"
            strokeWidth={1.25}
          />
          <text
            x={lp.x}
            y={lp.y}
            fontSize={10}
            fill="#7c3aed"
            fontWeight={700}
            textAnchor="middle"
            dominantBaseline="middle"
            stroke="#ffffff"
            strokeWidth={2.75}
            style={{ paintOrder: "stroke", userSelect: "none" }}
          >
            {`${Math.round(ang)}°`}
          </text>
        </g>,
      );
    }
  }

  // ── Overall (extents) dimensions: the total footprint W × H, drawn as a
  // heavier dimension line OUTSIDE the per-edge band. For an L-shape these give
  // the overall width/height no single edge spans. Only when closed + ≥3 pts. ──
  const overallDimNodes: React.ReactNode[] = [];
  if (closed && points.length >= 3) {
    const ov = overallDimensions(points);
    if (ov) {
      // Push past the deepest per-edge level so the extents never overlap them.
      const extOff = DIM_OFFSET_PX + maxDimLevel * DIM_LEVEL_STEP_PX + DIM_OVERALL_GAP_PX;
      const drawOverall = (
        dim: typeof ov.width,
        cm: number,
        key: string,
      ) => {
        const pa = cmToPx(dim.a);
        const pb = cmToPx(dim.b);
        const spanPx = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        if (spanPx < DIM_MIN_EDGE_PX) return;
        // Outward direction in screen px (world y-down == screen y-down here).
        const ox = dim.outward.x;
        const oy = dim.outward.y;
        const d1 = { x: pa.x + ox * extOff, y: pa.y + oy * extOff };
        const d2 = { x: pb.x + ox * extOff, y: pb.y + oy * extOff };
        const mid = { x: (d1.x + d2.x) / 2, y: (d1.y + d2.y) / 2 };
        const gx = (d2.x - d1.x) / spanPx;
        const gy = (d2.y - d1.y) / spanPx;
        // Extension lines run from just off each bbox corner out to the dim line.
        const e1a = { x: pa.x + ox * DIM_EXT_GAP_PX, y: pa.y + oy * DIM_EXT_GAP_PX };
        const e1b = { x: pa.x + ox * (extOff + DIM_EXT_OVERSHOOT_PX), y: pa.y + oy * (extOff + DIM_EXT_OVERSHOOT_PX) };
        const e2a = { x: pb.x + ox * DIM_EXT_GAP_PX, y: pb.y + oy * DIM_EXT_GAP_PX };
        const e2b = { x: pb.x + ox * (extOff + DIM_EXT_OVERSHOOT_PX), y: pb.y + oy * (extOff + DIM_EXT_OVERSHOOT_PX) };
        const col = "#475569";
        const ah = (tip: Pt, dx: number, dy: number, k: string) => {
          const bx = tip.x - dx * DIM_ARROW_LEN;
          const by = tip.y - dy * DIM_ARROW_LEN;
          const px = -dy * DIM_ARROW_HALF;
          const py = dx * DIM_ARROW_HALF;
          return (
            <polygon key={k} points={`${tip.x},${tip.y} ${bx + px},${by + py} ${bx - px},${by - py}`} fill={col} />
          );
        };
        const label = formatLengthDual(cm);
        const half = dimTextHalfPx(label) + 2;
        const g1 = { x: mid.x - gx * half, y: mid.y - gy * half };
        const g2 = { x: mid.x + gx * half, y: mid.y + gy * half };
        overallDimNodes.push(
          <g key={key} style={{ pointerEvents: "none" }}>
            <line x1={e1a.x} y1={e1a.y} x2={e1b.x} y2={e1b.y} stroke={col} strokeWidth={1} opacity={0.7} />
            <line x1={e2a.x} y1={e2a.y} x2={e2b.x} y2={e2b.y} stroke={col} strokeWidth={1} opacity={0.7} />
            <line x1={d1.x} y1={d1.y} x2={g1.x} y2={g1.y} stroke={col} strokeWidth={1.5} />
            <line x1={g2.x} y1={g2.y} x2={d2.x} y2={d2.y} stroke={col} strokeWidth={1.5} />
            {ah(d1, -gx, -gy, `${key}a1`)}
            {ah(d2, gx, gy, `${key}a2`)}
            <text
              x={mid.x}
              y={mid.y}
              fontSize={DIM_FONT_PX}
              fill="#1e293b"
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{ userSelect: "none", paintOrder: "stroke" }}
              stroke="#ffffff"
              strokeWidth={3.5}
            >
              {label}
            </text>
          </g>,
        );
      };
      drawOverall(ov.width, ov.width.lengthCm, "ovw");
      drawOverall(ov.height, ov.height.lengthCm, "ovh");
    }
  }

  // Perimeter + floor-area readouts (closed only) — a CAD title-block style
  // chip pinned to the canvas corner.
  const perimCm = closed && points.length >= 3 ? perimeter(points, true) : 0;
  const areaCm2 = closed && points.length >= 3 ? floorAreaCm2(points) : 0;

  // CAD snap visuals: dashed guide lines (alignment = magenta, polar = sky) plus
  // a glyph at the snapped point keyed by snap type (square=endpoint,
  // triangle=midpoint, ◇=intersection, ⊥=perpendicular, ○=edge, +=soft) and a
  // tiny type label near the cursor. Replaces the old single magenta ring.
  let snapMarker: React.ReactNode = null;
  if (snapResult && snapResult.type) {
    const s = cmToPx(snapResult.point);
    const SNAP_LABEL: Record<SnapType, string> = {
      endpoint: "END",
      midpoint: "MID",
      edge: "EDGE",
      perpendicular: "PERP",
      intersection: "INT",
      alignment: "ALIGN",
      polar: "POLAR",
      grid: "GRID",
    };
    const t = snapResult.type;
    // Hard snaps use the magenta object-snap colour; soft snaps (polar/grid)
    // use sky to match their guide colour.
    const isSoft = t === "polar" || t === "alignment" || t === "grid";
    const col = t === "polar" ? "#0ea5e9" : t === "alignment" ? "#d946ef" : isSoft ? "#0ea5e9" : "#d946ef";
    const glyph = (() => {
      const r = 6;
      switch (t) {
        case "endpoint":
          return <rect x={s.x - r} y={s.y - r} width={r * 2} height={r * 2} fill="none" stroke={col} strokeWidth={2} />;
        case "midpoint":
          return (
            <polygon
              points={`${s.x},${s.y - r} ${s.x + r},${s.y + r} ${s.x - r},${s.y + r}`}
              fill="none"
              stroke={col}
              strokeWidth={2}
            />
          );
        case "intersection":
          return (
            <polygon
              points={`${s.x},${s.y - r} ${s.x + r},${s.y} ${s.x},${s.y + r} ${s.x - r},${s.y}`}
              fill="none"
              stroke={col}
              strokeWidth={2}
            />
          );
        case "perpendicular":
          return (
            <g>
              <line x1={s.x - r} y1={s.y + r} x2={s.x + r} y2={s.y + r} stroke={col} strokeWidth={2} />
              <line x1={s.x} y1={s.y - r} x2={s.x} y2={s.y + r} stroke={col} strokeWidth={2} />
            </g>
          );
        case "edge":
          return <circle cx={s.x} cy={s.y} r={r} fill="none" stroke={col} strokeWidth={2} />;
        default:
          // Soft snaps (polar / alignment / grid): a small cross.
          return (
            <g>
              <line x1={s.x - r} y1={s.y} x2={s.x + r} y2={s.y} stroke={col} strokeWidth={1.75} />
              <line x1={s.x} y1={s.y - r} x2={s.x} y2={s.y + r} stroke={col} strokeWidth={1.75} />
            </g>
          );
      }
    })();
    snapMarker = (
      <g style={{ pointerEvents: "none" }}>
        {/* Soft-constraint guide lines (cm-space segments mapped to px). */}
        {snapResult.guides.map((gd, gi) => {
          const ga = cmToPx(gd.a);
          const gb = cmToPx(gd.b);
          return (
            <line
              key={`guide${gi}`}
              x1={ga.x}
              y1={ga.y}
              x2={gb.x}
              y2={gb.y}
              stroke={gd.kind === "polar" ? "#0ea5e9" : "#d946ef"}
              strokeWidth={1}
              strokeDasharray="5 4"
              opacity={0.8}
            />
          );
        })}
        {glyph}
        <text
          x={s.x + 10}
          y={s.y - 10}
          fontSize={9}
          fontWeight={700}
          fill={col}
          style={{ paintOrder: "stroke", userSelect: "none" }}
          stroke="#ffffff"
          strokeWidth={2.5}
        >
          {SNAP_LABEL[t]}
        </text>
      </g>
    );
  }

  // Edge-insert affordance marker (a hollow "+" dot on the hovered edge body).
  let insertMarker: React.ReactNode = null;
  if (closed && edgeInsert && dragIdx === null) {
    const m = cmToPx(edgeInsert.at);
    insertMarker = (
      <g style={{ pointerEvents: "none" }}>
        <circle cx={m.x} cy={m.y} r={5} fill="#fff" stroke="#0ea5e9" strokeWidth={1.5} />
        <line x1={m.x - 3} y1={m.y} x2={m.x + 3} y2={m.y} stroke="#0ea5e9" strokeWidth={1.5} />
        <line x1={m.x} y1={m.y - 3} x2={m.x} y2={m.y + 3} stroke="#0ea5e9" strokeWidth={1.5} />
      </g>
    );
  }

  // Global block-cell budget: decide which bays may draw their per-cell grid so
  // the SUM of rendered cells across ALL bays stays bounded (the per-bay cap
  // alone can't stop a many-bay room from exploding the node count). Index-
  // aligned with `beamLayers`; a bay not allowed falls back to a row-band tint.
  const blockGridAllowed = beamLayers
    ? blockCellBudget(beamLayers.map((l) => l.blockCells.length))
    : [];

  // ── Per-bay label chips (multi-line: beam count+length, pattern+blocks, and a
  // scale/grid warning), a per-bay PITCHED-RUN DEPTH dimension tick (ties the
  // drawing to the engine's pitch count), and a legend listing every bay's
  // colour swatch + direction + counts. All driven by `beamLayers`/`bays`. ──
  const bayLabels: React.ReactNode[] = [];
  const perpDims: React.ReactNode[] = [];
  const legendRows: Array<{ color: string; text: string }> = [];
  if (bays && beamLayers) {
    for (let i = 0; i < bays.length; i++) {
      const b = bays[i];
      const layer = beamLayers[i];
      if (!layer || !layer.beamCount) continue;
      const pal = bayPalette(i);
      const c = cmToPx({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
      const dirGlyph = layer.beamDir === "H" ? "→" : "↓";
      const gridShown = blockGridAllowed[i] !== false && !layer.blockCellsCapped;
      // Pure, engine-consistent label content (one source of truth for chip+legend).
      const lines = bayLabelLines(
        {
          beamCount: layer.beamCount ?? 0,
          extraBeams: layer.extraBeams ?? 0,
          beamLengthCm: layer.beamLengthCm ?? 0,
          pattern: (layer.pattern as "GB" | "BGB" | "GBG") ?? "GB",
          totalBlocks: layer.totalBlocks ?? 0,
          blockCellsCapped: layer.blockCellsCapped ?? false,
          pitchOverflow: layer.pitchOverflow ?? false,
          beamDir: layer.beamDir ?? "H",
        },
        gridShown,
      );
      const widest = lines.reduce((m, l) => Math.max(m, l.text.length), 0);
      const chipW = Math.max(84, widest * 6.0 + 18);
      const chipH = lines.length * 14 + 8;
      bayLabels.push(
        <g key={`baylbl${i}`} style={{ pointerEvents: "none" }}>
          <rect
            x={c.x - chipW / 2}
            y={c.y - chipH / 2}
            width={chipW}
            height={chipH}
            rx={5}
            fill="#ffffff"
            fillOpacity={0.92}
            stroke={pal.beam}
            strokeWidth={1}
          />
          {lines.map((ln, li) => (
            <text
              key={`line${li}`}
              x={c.x}
              y={c.y - chipH / 2 + 11 + li * 14}
              fontSize={ln.role === "primary" ? 11 : 10}
              fontWeight={ln.role === "primary" ? 700 : 500}
              fill={ln.role === "warn" ? "#b91c1c" : ln.role === "primary" ? pal.label : "#64748b"}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {ln.text}
            </text>
          ))}
        </g>,
      );

      // Pitched-run depth dimension: a thin tick from the start wall to where the
      // structural run actually ends (pitchExtentCm), parked just inside the near
      // wall. Only drawn when it reads on screen (≥ DIM_MIN_EDGE_PX). This is the
      // metric tie between the picture and the engine's pitch count.
      const pd = perpDimension(
        { rect: b, beamDir: layer.beamDir ?? "H" },
        layer.pitchExtentCm ?? 0,
        pxToCm(10),
      );
      if (pd) {
        const pa = cmToPx(pd.a);
        const pb = cmToPx(pd.b);
        const spanPx = Math.hypot(pb.x - pa.x, pb.y - pa.y);
        if (spanPx >= DIM_MIN_EDGE_PX) {
          const ux = (pb.x - pa.x) / spanPx;
          const uy = (pb.y - pa.y) / spanPx;
          // End caps perpendicular to the run, length 4px.
          const capX = -uy * 4;
          const capY = ux * 4;
          const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
          // Label sits on the outward side (toward the near wall), rotated to run
          // along the dimension so it never overlaps the beams.
          const lx = mid.x + pd.outward.x * 9;
          const ly = mid.y + pd.outward.y * 9;
          const rot = layer.beamDir === "H" ? -90 : 0;
          perpDims.push(
            <g key={`perpdim${i}`} style={{ pointerEvents: "none" }}>
              <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={pal.label} strokeWidth={1} strokeOpacity={0.7} />
              <line x1={pa.x + capX} y1={pa.y + capY} x2={pa.x - capX} y2={pa.y - capY} stroke={pal.label} strokeWidth={1} strokeOpacity={0.7} />
              <line x1={pb.x + capX} y1={pb.y + capY} x2={pb.x - capX} y2={pb.y - capY} stroke={pal.label} strokeWidth={1} strokeOpacity={0.7} />
              <text
                x={lx}
                y={ly}
                fontSize={9.5}
                fill={pal.label}
                fontWeight={600}
                textAnchor="middle"
                dominantBaseline="middle"
                transform={`rotate(${rot} ${lx} ${ly})`}
                style={{ paintOrder: "stroke" }}
                stroke="#ffffff"
                strokeWidth={2.5}
              >
                {formatLengthCm(pd.lengthCm)}
              </text>
            </g>,
          );
        }
      }

      const patTxt = layer.pattern ? ` ${layer.pattern}` : "";
      const lenTxt = layer.beamLengthCm ? formatLengthCm(layer.beamLengthCm) : "";
      const extraTxt = layer.extraBeams ? ` (+${layer.extraBeams})` : "";
      const flags =
        (!gridShown ? " (grid hidden)" : "") +
        (layer.pitchOverflow ? " ⚠ not to scale" : "");
      legendRows.push({
        color: pal.beam,
        text: `Bay ${i + 1} ${dirGlyph}${patTxt} ${layer.beamCount} beams${extraTxt} · ${lenTxt}${flags}`,
      });
    }
  }

  // Legend chip pinned to the bottom-left of the canvas. A colour-role KEY row
  // (beam / bearing seat / block) tops a per-bay list so the drawing is
  // self-describing. The key swatches use bay-1's palette as the exemplar.
  const KEY_H = 16; // px height reserved for the role-key strip
  const legend =
    legendRows.length > 0 ? (
      (() => {
        const key0 = bayPalette(0);
        const boxH = legendRows.length * 16 + 30 + KEY_H;
        const top = SVG_H - 16 - boxH + 8;
        return (
          <g style={{ pointerEvents: "none" }}>
            <rect
              x={8}
              y={top - 8}
              width={244}
              height={boxH}
              rx={6}
              fill="#ffffff"
              fillOpacity={0.92}
              stroke="#cbd5e1"
              strokeWidth={1}
            />
            <text x={16} y={top + 6} fontSize={10} fontWeight={700} fill="#64748b">
              BEAM LAYOUT
            </text>
            {/* Colour-role key: beam fill, extra (hatched), bearing seat, block tint. */}
            <g transform={`translate(0 ${top + KEY_H})`}>
              <rect x={16} y={2} width={10} height={9} rx={2} fill={key0.beam} fillOpacity={0.85} />
              <text x={30} y={10} fontSize={9.5} fill="#475569">beam</text>
              <g>
                <rect x={64} y={2} width={10} height={9} rx={2} fill={key0.beam} fillOpacity={0.85} stroke={key0.label} strokeWidth={0.75} strokeDasharray="2 1.5" />
                <rect x={64} y={2} width={10} height={9} rx={2} fill="url(#cad-extra-hatch)" />
              </g>
              <text x={78} y={10} fontSize={9.5} fill="#475569">extra</text>
              <rect x={114} y={2} width={10} height={9} rx={1} fill={key0.label} fillOpacity={0.5} stroke={key0.label} strokeWidth={0.75} />
              <text x={128} y={10} fontSize={9.5} fill="#475569">bearing</text>
              <rect x={176} y={2} width={10} height={9} rx={1} fill={key0.block} fillOpacity={0.85} stroke={key0.beam} strokeOpacity={0.4} strokeWidth={0.5} />
              <text x={190} y={10} fontSize={9.5} fill="#475569">block</text>
            </g>
            {legendRows.map((r, i) => {
              const ly = top + KEY_H + 16 + i * 16 + 8;
              return (
                <g key={`leg${i}`}>
                  <rect x={16} y={ly - 8} width={10} height={10} rx={2} fill={r.color} />
                  <text x={32} y={ly + 1} fontSize={10.5} fill="#334155">
                    {r.text}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })()
    ) : null;

  // Metric scale bar pinned to the bottom-right: a "nice" round length whose
  // pixel width reflects the live zoom, so the drawing reads as scaled.
  const scaleBarNode = (() => {
    const sb = scaleBar(BASE_SCALE * view.zoom, 140);
    if (sb.px < 12) return null;
    const x1 = SVG_W - 16 - sb.px;
    const x2 = SVG_W - 16;
    const yb = SVG_H - 18;
    return (
      <g style={{ pointerEvents: "none" }}>
        <rect
          x={x1 - 8}
          y={yb - 16}
          width={sb.px + 16}
          height={30}
          rx={5}
          fill="#ffffff"
          fillOpacity={0.9}
          stroke="#cbd5e1"
          strokeWidth={1}
        />
        <line x1={x1} y1={yb} x2={x2} y2={yb} stroke="#334155" strokeWidth={1.5} />
        <line x1={x1} y1={yb - 4} x2={x1} y2={yb + 4} stroke="#334155" strokeWidth={1.5} />
        <line x1={x2} y1={yb - 4} x2={x2} y2={yb + 4} stroke="#334155" strokeWidth={1.5} />
        <text
          x={(x1 + x2) / 2}
          y={yb - 6}
          fontSize={10}
          fill="#334155"
          fontWeight={600}
          textAnchor="middle"
        >
          {sb.label}
        </text>
      </g>
    );
  })();

  const cursorStyle = panning
    ? "grabbing"
    : spaceHeld
      ? "grab"
      : tool === "rect" || tool === "measure"
        ? "crosshair"
        : edgeDragIdx !== null || shapeDragIdx
          ? "grabbing"
          : closed || tool === "select"
            ? edgeInsert
              ? "copy"
              : hoverInterior && hoverVertex === null && hoverEdgeBody === null
                ? "move"
                : "default"
            : "crosshair";

  return (
    <div className={fill ? "flex h-full min-h-0 flex-col gap-2" : "space-y-2"}>
      <div className="flex flex-wrap items-center gap-x-1 gap-y-1.5 rounded-xl border border-slate-200/80 bg-gradient-to-b from-white to-slate-50 px-2.5 py-2 shadow-sm">
        {/* Tool-mode selector: Draw · Rectangle · Measure. Active mode highlighted. */}
        <div className="inline-flex overflow-hidden rounded-lg border border-slate-300/80 shadow-inner" role="group" aria-label="Drawing tool">
          {(
            [
              ["draw", "Draw", PenLine],
              ["select", "Select", MousePointer2],
              ["rect", "Rect", SquareIcon],
              ["measure", "Measure", Ruler],
            ] as [Tool, string, typeof PenLine][]
          ).map(([key, label, Icon], i) => (
            <button
              key={key}
              type="button"
              onClick={() => switchTool(key)}
              aria-pressed={tool === key}
              className={
                "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors " +
                (i > 0 ? "border-l border-slate-300/70 " : "") +
                (tool === key
                  ? "bg-sky-600 text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50")
              }
            >
              <Icon className="h-3.5 w-3.5" strokeWidth={2} />
              {label}
            </button>
          ))}
        </div>

        {/* Room-shape presets: drop a ready-made L/T/U/notch outline to edit
            (slide walls / type lengths) instead of hand-placing each vertex.
            Each replaces the current outline and is undoable. */}
        <div className="inline-flex items-center gap-0.5" role="group" aria-label="Insert room shape">
          <span className="px-1 text-[11px] font-medium text-slate-400">Shapes</span>
          {ROOM_PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => insertPreset(p.make())}
              title={
                p.key === "Notch"
                  ? "Notched rectangle — drop & edit"
                  : `${p.key}-shaped room — drop & edit`
              }
              className="inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-md px-1.5 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              {p.key}
            </button>
          ))}
        </div>

        {/* Start a fresh room of the floor plan (draw it next to the others). */}
        {onRequestNewRoom && (
          <button
            type="button"
            onClick={() => {
              switchTool("draw");
              onRequestNewRoom();
            }}
            title="Start a new room — draw it next to the others"
            className="inline-flex items-center gap-1 rounded-md bg-slate-700 px-2 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-slate-800"
          >
            + Room
          </button>
        )}

        {/* Clear the tape measurement (Measure mode only). */}
        {tool === "measure" && (
          <button
            type="button"
            onClick={() => {
              setMeasurePts([]);
              setMeasureDone(false);
            }}
            disabled={measurePts.length === 0}
            className="rounded-md px-2 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-200 transition-colors hover:bg-amber-50 disabled:opacity-40"
          >
            Clear tape
          </button>
        )}

        <span className={TB_SEP} aria-hidden />

        {/* Edit actions */}
        <div className="flex items-center gap-0.5">
          <TbIcon onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
            <Undo2 className="h-4 w-4" />
          </TbIcon>
          <TbIcon onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
            <Redo2 className="h-4 w-4" />
          </TbIcon>
          {!closed && points.length > 0 ? (
            <TbIcon onClick={undoLastPoint} title="Step back one point (Backspace)">
              <CornerUpLeft className="h-4 w-4" />
            </TbIcon>
          ) : (
            <TbIcon onClick={deleteSelected} disabled={selVertex === null} title="Delete selected vertex (Del)">
              <Trash2 className="h-4 w-4" />
            </TbIcon>
          )}
          <TbIcon onClick={clear} disabled={!points.length} title="Clear drawing">
            <Eraser className="h-4 w-4" />
          </TbIcon>
        </div>
        {closeOk && (
          <button
            type="button"
            onClick={close}
            title="Close the loop (Enter)"
            className="inline-flex items-center rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
          >
            Close loop
          </button>
        )}

        <span className={TB_SEP} aria-hidden />

        {/* View */}
        <div className="flex items-center gap-0.5">
          <TbIcon onClick={fitToShape} disabled={points.length < 2} title="Fit drawing to view (F)">
            <Maximize2 className="h-4 w-4" />
          </TbIcon>
          <TbIcon
            onClick={resetView}
            disabled={view.zoom === 1 && view.tx === 0 && view.ty === 0}
            title="Reset view (0)"
          >
            <Crosshair className="h-4 w-4" />
          </TbIcon>
          <span className="ml-0.5 min-w-[2.75rem] text-center font-mono text-[11px] tabular-nums text-slate-500">
            {Math.round(view.zoom * 100)}%
          </span>
        </div>

        <span className={TB_SEP} aria-hidden />

        {/* Grid-size selector — drives both the visible grid and the snap step. */}
        <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
          <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">Grid</span>
          <select
            className="rounded-md border border-slate-200 bg-white px-1.5 py-1 font-mono text-[11px] text-slate-600 outline-none focus:ring-2 focus:ring-sky-300"
            value={grid}
            onChange={(e) => setGrid(Number(e.target.value))}
          >
            {GRID_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g} cm
              </option>
            ))}
          </select>
        </label>

        {/* SNAP group: per-type object-snap pills + polar-step selector. The engine
            resolves the best snap by priority; each pill gates one type. */}
        <div
          className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50/80 px-1.5 py-1"
          title="Object snaps: End=vertex, Mid=edge midpoint, Edge=on a wall, Perp=perpendicular foot, Align=share a vertex's x/y, Polar=angle tracking, Grid=snap to grid."
        >
          <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">Snap</span>
          {(
            [
              ["endpoint", "End"],
              ["midpoint", "Mid"],
              ["edge", "Edge"],
              ["perpendicular", "Perp"],
              ["alignment", "Align"],
              ["polar", "Polar"],
              ["grid", "Grid"],
            ] as [keyof SnapSettings, string][]
          ).map(([key, label]) => (
            <TbChip
              key={key}
              active={Boolean(snapSettings[key])}
              onClick={() => toggleSnap(key)(!snapSettings[key])}
              title={label}
            >
              {label}
            </TbChip>
          ))}
          {/* Polar tracking increment. */}
          <select
            className="ml-0.5 rounded-md border border-slate-200 bg-white px-1 py-0.5 font-mono text-[11px] text-slate-600 disabled:opacity-50"
            value={snapSettings.polarStepDeg}
            disabled={!snapSettings.polar}
            onChange={(e) =>
              setSnapSettings((s) => ({ ...s, polarStepDeg: Number(e.target.value) }))
            }
            title="Polar tracking angle increment"
          >
            {[15, 45, 90].map((d) => (
              <option key={d} value={d}>
                {d}°
              </option>
            ))}
          </select>
        </div>

        {/* Ortho + angle-dimension toggles as pills. */}
        <TbChip
          active={ortho}
          onClick={() => setOrtho(!ortho)}
          title="Ortho: keep walls square — a moved vertex carries its neighbours so edges stay horizontal/vertical."
        >
          Ortho
        </TbChip>
        <TbChip
          active={showAngles}
          onClick={() => setShowAngles(!showAngles)}
          title="Angles: show the interior angle (degrees) at each corner."
        >
          ∠ Angles
        </TbChip>

        <span className={TB_SEP} aria-hidden />

        {/* TRANSFORM group: rotate / mirror the WHOLE room about its bbox centre;
            drag inside the room to MOVE it. Enabled only on a finished loop. */}
        <div
          className="flex items-center gap-0.5 rounded-lg border border-slate-200 bg-slate-50/80 px-1.5 py-1"
          title="Transform the whole room. Rotate/Mirror pivot on the bounding-box centre; drag inside the room to move it."
        >
          <span className="mr-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">Move</span>
          <TbIcon onClick={() => rotateRoom(-90)} disabled={!canTransform} title="Rotate 90° counter-clockwise">
            <RotateCcw className="h-4 w-4" />
          </TbIcon>
          <TbIcon onClick={() => rotateRoom(90)} disabled={!canTransform} title="Rotate 90° clockwise">
            <RotateCw className="h-4 w-4" />
          </TbIcon>
          <input
            type="number"
            className="w-12 rounded-md border border-slate-200 bg-white px-1 py-0.5 font-mono text-[11px] text-slate-600 disabled:opacity-50"
            placeholder="deg"
            value={rotInput}
            disabled={!canTransform}
            onChange={(e) => setRotInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyRotInput();
              }
              e.stopPropagation();
            }}
            title="Rotate by a typed angle (clockwise-positive) about the bbox centre"
          />
          <button
            type="button"
            onClick={applyRotInput}
            disabled={!canTransform || rotInput.trim() === ""}
            title="Apply the typed rotation"
            className="rounded-md px-1.5 py-0.5 text-[11px] font-medium text-slate-600 ring-1 ring-inset ring-slate-200 transition-colors hover:bg-white disabled:opacity-40"
          >
            Apply
          </button>
          <span className="mx-0.5 h-4 w-px bg-slate-200" aria-hidden />
          <TbIcon onClick={mirrorRoomX} disabled={!canTransform} title="Mirror horizontally (about the bbox centre)">
            <FlipHorizontal2 className="h-4 w-4" />
          </TbIcon>
          <TbIcon onClick={mirrorRoomY} disabled={!canTransform} title="Mirror vertically (about the bbox centre)">
            <FlipVertical2 className="h-4 w-4" />
          </TbIcon>
        </div>

        <span className={TB_SEP} aria-hidden />

        {/* Export */}
        <div className="flex items-center gap-0.5">
          <TbIcon onClick={exportPng} disabled={points.length < 2} title="Export PNG (raster)">
            <ImageDown className="h-4 w-4" />
          </TbIcon>
          <TbIcon onClick={exportSvg} disabled={points.length < 2} title="Export SVG (vector, editable)">
            <FileDown className="h-4 w-4" />
          </TbIcon>
        </div>
      </div>

      <div ref={wrapRef} className={fill ? "relative min-h-0 w-full flex-1" : "relative"}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        preserveAspectRatio="xMidYMid meet"
        tabIndex={0}
        className={
          "rounded-xl bg-[#fbfcfe] shadow-sm ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-sky-400/70 " +
          (fill ? "absolute inset-0 h-full w-full" : (svgClassName ?? "w-full max-w-[680px]"))
        }
        style={{
          touchAction: "none",
          cursor: cursorStyle,
          // Monospaced technical type across the whole canvas — every dimension,
          // angle, beam tag and readout reads as engineering drafting.
          fontFamily: "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace",
        }}
        onClick={handleCanvasClick}
        onDoubleClick={() => {
          // Double-click finishes the tape-measure chain (freezes the rubber-band).
          if (tool === "measure" && measurePts.length > 0) setMeasureDone(true);
        }}
        onMouseDown={handleDown}
        onMouseMove={handleMove}
        onMouseUp={endDrag}
        onMouseLeave={handleLeave}
        onWheel={handleWheel}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onBlur={() => setSpaceHeld(false)}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Hatch pattern marking manual EXTRA beams, so they read distinctly from
            the structural pitch grid. One white-on-colour diagonal per palette is
            overkill; a single neutral hatch tinted by opacity over the beam fill
            reads cleanly across every bay colour. */}
        <defs>
          <pattern
            id="cad-extra-hatch"
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={6} height={6} fill="#ffffff" fillOpacity={0} />
            <line x1={0} y1={0} x2={0} y2={6} stroke="#ffffff" strokeWidth={2} strokeOpacity={0.7} />
          </pattern>
          {/* Concrete hatch for the ring-beam / foundation band. */}
          <pattern
            id="cad-concrete-hatch"
            width={7}
            height={7}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={7} height={7} fill="#e2e8f0" />
            <line x1={0} y1={0} x2={0} y2={7} stroke="#94a3b8" strokeWidth={1} />
          </pattern>
          {/* Diagonal hatch marking CUT (partial make-up) filler blocks. */}
          <pattern
            id="cad-cut-hatch"
            width={5}
            height={5}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line x1={0} y1={0} x2={0} y2={5} stroke="#ea580c" strokeWidth={1.2} strokeOpacity={0.85} />
          </pattern>
        </defs>

        {/* Infinite CAD grid (screen-space; recomputed from the live view). */}
        {gridNodes}

        {/* Other rooms of the floor plan — read-only backdrop, clickable to edit.
            Pointer events are disabled while the active room is mid-draw so a
            click places a vertex instead of switching rooms. */}
        {backgroundRooms?.map((room) => {
          const pts = room.points;
          if (pts.length < 2) return null;
          const px = pts.map(cmToPx);
          const midDraw = !closed && points.length > 0;
          const pe = midDraw ? "none" : "auto";
          const bb = bbox(pts);
          const ctr = cmToPx({ x: bb.x + bb.w / 2, y: bb.y + bb.h / 2 });
          const activate = (e: React.MouseEvent) => {
            e.stopPropagation();
            if (!midDraw) onPickBackgroundRoom?.(room.index);
          };
          return (
            <g key={`room${room.index}`}>
              {room.closed ? (
                <polygon
                  points={px.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="#64748b"
                  fillOpacity={0.05}
                  stroke="#94a3b8"
                  strokeWidth={1.25}
                  style={{ cursor: "pointer", pointerEvents: pe }}
                  onClick={activate}
                />
              ) : (
                <polyline
                  points={px.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth={1.25}
                  strokeDasharray="4 3"
                  style={{ cursor: "pointer", pointerEvents: midDraw ? "none" : "stroke" }}
                  onClick={activate}
                />
              )}
              {/* Wall-length labels (closed rooms only). */}
              {room.closed &&
                pts.map((a, k) => {
                  const b = pts[(k + 1) % pts.length];
                  const lenCm = Math.hypot(b.x - a.x, b.y - a.y);
                  if (lenCm < 1) return null;
                  const mid = cmToPx({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
                  const nrm = edgeOutwardNormal(pts, k);
                  return (
                    <text
                      key={`rl${room.index}-${k}`}
                      x={mid.x + nrm.x * 9}
                      y={mid.y + nrm.y * 9}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={9.5}
                      fill="#64748b"
                      style={{ pointerEvents: "none" }}
                    >
                      {formatLengthDual(lenCm)}
                    </text>
                  );
                })}
              {/* Room number chip at the centroid. */}
              <text
                x={ctr.x}
                y={ctr.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={12}
                fontWeight={600}
                fill="#94a3b8"
                style={{ pointerEvents: "none" }}
              >
                {room.label}
              </text>
            </g>
          );
        })}

        {/* Ring-beam / foundation band around the inner outline (concrete hatch),
            drawn behind the room so bearing seats read as resting on it. */}
        {ringBandPath && (
          <path
            d={ringBandPath}
            fillRule="evenodd"
            fill="url(#cad-concrete-hatch)"
            stroke="#94a3b8"
            strokeWidth={1}
            style={{ pointerEvents: "none" }}
          />
        )}

        {/* Bay overlays (decomposed rectangles). cmToPx already applies view. */}
        {bays?.map((b, i) => {
          const tl = cmToPx({ x: b.x, y: b.y });
          const color = bayPalette(i).beam;
          return (
            <rect
              key={`bay${i}`}
              x={tl.x}
              y={tl.y}
              width={b.w * BASE_SCALE * view.zoom}
              height={b.h * BASE_SCALE * view.zoom}
              fill={color}
              fillOpacity={0.06}
              stroke={color}
              strokeOpacity={0.4}
              strokeWidth={1}
              style={{ pointerEvents: "none" }}
            />
          );
        })}

        {/* Beam/block visual overlay (from beamLayout). One <g> per bay, each in
            its own palette colour, so adjacent bays read as distinct. Order:
            block in-fill (palest) → beam strips (saturated) → extra-beam hatch →
            run-direction arrow → bay label chip. */}
        {beamLayers?.map((layer, bi) => {
          const pal = bayPalette(bi);
          const sc = BASE_SCALE * view.zoom; // cm → px scale (sans translate)
          // Global budget: only bays the budget allows draw their per-cell grid,
          // so a many-bay room can't blow the SVG node count. blockGridAllowed[bi]
          // is false → fall back to a single row-band tint (cheap) + "grid hidden".
          const drawGrid = blockGridAllowed[bi] !== false;
          return (
            <g key={`bl${bi}`} style={{ pointerEvents: "none" }}>
              {/* Block cells: pale tinted fill + faint hairline so the module
                  grid is visible without dominating the beams. */}
              {drawGrid && layer.blockCells.map((c, ci) => {
                const tl = cmToPx({ x: c.x, y: c.y });
                const isCut = layer.blockKinds?.[ci] === "cut";
                const wpx = c.w * sc;
                const hpx = c.h * sc;
                return (
                  <g key={`blk${bi}-${ci}`}>
                    <rect
                      x={tl.x}
                      y={tl.y}
                      width={wpx}
                      height={hpx}
                      fill={isCut ? "#fff7ed" : pal.block}
                      fillOpacity={isCut ? 0.9 : 0.55}
                      stroke={isCut ? "#ea580c" : pal.beam}
                      strokeOpacity={isCut ? 0.7 : 0.25}
                      strokeWidth={isCut ? 0.75 : 0.5}
                    />
                    {/* Cut (partial make-up) module: diagonal hatch so it reads as
                        a non-standard piece distinct from full 20-cm blocks. */}
                    {isCut && (
                      <rect x={tl.x} y={tl.y} width={wpx} height={hpx} fill="url(#cad-cut-hatch)" />
                    )}
                  </g>
                );
              })}
              {/* Budget fallback: when this bay's per-cell grid is suppressed, fill
                  the whole bay with a single pale tint so the floor still reads as
                  "blocked" (the legend flags "grid hidden"). One rect, not N. */}
              {!drawGrid && layer.blockCells.length > 0 && bays?.[bi] && (() => {
                const tl = cmToPx({ x: bays[bi].x, y: bays[bi].y });
                return (
                  <rect
                    x={tl.x}
                    y={tl.y}
                    width={bays[bi].w * sc}
                    height={bays[bi].h * sc}
                    fill={pal.block}
                    fillOpacity={0.4}
                  />
                );
              })()}
              {/* Beam strips: the saturated palette fill. Manual EXTRA beams get
                  a white diagonal hatch overlaid so they read as add-on line
                  items distinct from the structural pitch grid. */}
              {layer.beams.map((b, bmi) => {
                const tl = cmToPx({ x: b.x, y: b.y });
                const isExtra = layer.beamKinds?.[bmi] === "extra";
                const wpx = b.w * sc;
                const hpx = b.h * sc;
                return (
                  <g key={`beam${bi}-${bmi}`}>
                    <rect
                      x={tl.x}
                      y={tl.y}
                      width={wpx}
                      height={hpx}
                      fill={pal.beam}
                      fillOpacity={0.85}
                      stroke={pal.label}
                      strokeWidth={isExtra ? 0.9 : 0.5}
                      strokeDasharray={isExtra ? "3 2" : undefined}
                    />
                    {isExtra && (
                      <rect
                        x={tl.x}
                        y={tl.y}
                        width={wpx}
                        height={hpx}
                        fill="url(#cad-extra-hatch)"
                      />
                    )}
                  </g>
                );
              })}
              {/* Bearing seats: a darker outlined band at each beam end marking
                  the wall-rest portion of the beam_length. Only drawn when the
                  seat is wide enough on screen to read (≥3px). */}
              {layer.bearings?.map((b, bri) => {
                const wpx = b.w * sc;
                const hpx = b.h * sc;
                if (Math.min(wpx, hpx) < 3) return null;
                const tl = cmToPx({ x: b.x, y: b.y });
                return (
                  <rect
                    key={`bear${bi}-${bri}`}
                    x={tl.x}
                    y={tl.y}
                    width={wpx}
                    height={hpx}
                    fill={pal.label}
                    fillOpacity={0.5}
                    stroke={pal.label}
                    strokeWidth={0.75}
                  />
                );
              })}
              {/* Beam-run direction arrow down the bay centre. */}
              {layer.arrow && (layer.arrow.dir.x !== 0 || layer.arrow.dir.y !== 0) && (() => {
                const t = cmToPx(layer.arrow!.tail);
                const hd = cmToPx(layer.arrow!.head);
                const len = Math.hypot(hd.x - t.x, hd.y - t.y);
                if (len < 8) return null;
                const ux = (hd.x - t.x) / len;
                const uy = (hd.y - t.y) / len;
                const ah = 7; // arrowhead length px
                const aw = 4; // arrowhead half-width px
                const bx = hd.x - ux * ah;
                const by = hd.y - uy * ah;
                const px = -uy * aw;
                const py = ux * aw;
                return (
                  <g key={`arr${bi}`}>
                    <line
                      x1={t.x}
                      y1={t.y}
                      x2={bx}
                      y2={by}
                      stroke={pal.label}
                      strokeWidth={1.75}
                      strokeOpacity={0.85}
                    />
                    <polygon
                      points={`${hd.x},${hd.y} ${bx + px},${by + py} ${bx - px},${by - py}`}
                      fill={pal.label}
                      fillOpacity={0.85}
                    />
                  </g>
                );
              })()}

              {/* Per-beam length tags: each beam labelled with its own (stock)
                  length, running ALONG the strip (rotated for vertical beams),
                  so the cut-list lengths map onto the drawn beams. Skipped when a
                  beam is too short on screen to read, to avoid an overlap mush. */}
              {layer.beams.map((b, i) => {
                const lenCm = layer.beamLengthsCm?.[i] ?? layer.beamLengthCm ?? 0;
                if (!(lenCm > 0)) return null;
                const wpx = b.w * sc;
                const hpx = b.h * sc;
                if (Math.max(wpx, hpx) < 24) return null; // too short to read
                const tl = cmToPx({ x: b.x, y: b.y });
                const lx = tl.x + wpx / 2;
                const ly = tl.y + hpx / 2;
                const vertical = hpx > wpx;
                return (
                  <text
                    key={`blen${bi}-${i}`}
                    x={lx}
                    y={ly}
                    fontSize={9.5}
                    fill="#ffffff"
                    fontWeight={700}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    transform={vertical ? `rotate(-90 ${lx} ${ly})` : undefined}
                    style={{ paintOrder: "stroke" }}
                    stroke={pal.label}
                    strokeWidth={2.75}
                  >
                    {formatLengthCm(lenCm)}
                  </text>
                );
              })}
            </g>
          );
        })}

        {/* Closed polygon fill, or in-progress polyline. */}
        {closed && points.length >= 3 ? (
          <polygon points={pathPts} fill="#0ea5e9" fillOpacity={0.06} stroke="#0284c7" strokeWidth={2} />
        ) : (
          points.length >= 2 && (
            <polyline points={pathPts} fill="none" stroke="#0284c7" strokeWidth={2} />
          )
        )}

        {/* Rubber-band preview of the next edge while drawing. */}
        {rubber}

        {/* Rectangle-tool dashed preview box + W×H readout. */}
        {rectPreview}

        {/* Tape-measure overlay (amber polyline, segment + total labels). */}
        {measureOverlay}

        {/* Per-edge click targets (closed only), under dimensions + handles. */}
        {edgeHits}

        {/* CAD dimension lines (extension lines + arrows + length text). */}
        {dims}

        {/* Overall (extents) dimensions — total W × H outside the per-edge band. */}
        {overallDimNodes}

        {/* Interior-angle arcs + degree labels at off-square corners (Angles on). */}
        {angleNodes}

        {/* Per-bay pitched-run depth dimension ticks (drawing ↔ engine pitch). */}
        {perpDims}

        {/* Per-bay label chips (beam count + length) at each bay centroid. */}
        {bayLabels}

        {/* Beam-layout legend (colour swatch + direction + counts per bay). */}
        {legend}

        {/* Metric scale bar (bottom-right), reflecting the live zoom. */}
        {scaleBarNode}

        {/* Perimeter + floor-area + overall-size title-block, pinned top-left.
            Labelled, right-aligned values; area is the headline figure. */}
        {closed && points.length >= 3 && (() => {
          const bb = bbox(points);
          return (
            <g style={{ pointerEvents: "none" }}>
              <rect x={8} y={8} width={188} height={76} rx={6} fill="#ffffff" fillOpacity={0.94} stroke="#cbd5e1" strokeWidth={1} />
              <text x={16} y={22} fontSize={9.5} fill="#94a3b8" fontWeight={700} letterSpacing={0.5}>
                ROOM
              </text>
              <text x={16} y={40} fontSize={11} fill="#64748b">
                Floor area
              </text>
              <text x={188} y={40} fontSize={13} fill="#0f172a" fontWeight={700} textAnchor="end">
                {formatAreaCm2(areaCm2)}
              </text>
              <text x={16} y={57} fontSize={11} fill="#64748b">
                Overall
              </text>
              <text x={188} y={57} fontSize={12} fill="#334155" fontWeight={600} textAnchor="end">
                {formatLengthCm(bb.w)} × {formatLengthCm(bb.h)}
              </text>
              <text x={16} y={74} fontSize={11} fill="#64748b">
                Perimeter
              </text>
              <text x={188} y={74} fontSize={12} fill="#334155" fontWeight={600} textAnchor="end">
                {formatLengthCm(perimCm)}
              </text>
            </g>
          );
        })()}

        {/* Edge-body interaction layer: wall-highlight + slide grab lines +
            midpoint handles (click=select, drag=slide parallel, Alt-click=insert). */}
        {edgeBodyNodes}

        {/* Edge-insert affordance. */}
        {insertMarker}

        {/* CAD snap marker (typed glyph) + alignment/polar guide lines. */}
        {snapMarker}

        {/* Vertex handles. */}
        {pxPts.map((p, i) => {
          const isStart = i === 0 && !closed;
          const isSel = selVertex === i;
          const isHover = hoverVertex === i;
          return (
            <circle
              key={`v${i}`}
              cx={p.x}
              cy={p.y}
              r={isSel ? 7 : isStart ? 7 : isHover ? 6.5 : 6}
              fill={isSel ? "#f59e0b" : isStart ? "#0284c7" : "#fff"}
              stroke={isSel ? "#b45309" : "#0284c7"}
              strokeWidth={isSel ? 2.5 : 2}
              style={{ cursor: isStart ? "pointer" : dragIdx === i ? "grabbing" : "grab" }}
              onMouseDown={handleVertexDown(i)}
              onClick={(e) => {
                // Only intercept vertex clicks in an edit tool (draw/select);
                // in rect/measure mode let the click reach the canvas.
                if (!isEditTool) return;
                if (!closed) {
                  // While drawing, clicking the START vertex closes the loop;
                  // earlier vertices fall through so the canvas re-anchors the
                  // chain to them.
                  if (i === 0 && closeOk) {
                    e.stopPropagation();
                    close();
                  }
                  return;
                }
                e.stopPropagation();
                setSelVertex(i);
                setSelEdge(null);
              }}
            />
          );
        })}
      </svg>

      {/* ── Direct distance/angle entry (DDE) overlay: appears at the top-left of
          the canvas while DRAWING with a previous point. Type an exact Length
          (cm) + optional Angle (deg) and press Enter to place the next vertex
          precisely. Auto-activates when the user just starts typing a digit. The
          inputs stop key propagation so they don't trigger canvas shortcuts. ── */}
      {tool === "draw" && !closed && points.length >= 1 && (
        <div
          className="absolute left-2 top-2 z-10 flex items-center gap-1.5 rounded-md border border-slate-300 bg-white/95 px-2 py-1 text-xs shadow-sm"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="font-semibold text-slate-500">Len</span>
          <input
            ref={ddeLenRef}
            type="number"
            min={1}
            step="any"
            inputMode="decimal"
            placeholder="cm"
            className={
              "w-16 rounded border px-1.5 py-0.5 tabular-nums " +
              (ddeInvalid ? "border-red-400 bg-red-50 text-red-700" : "border-slate-300")
            }
            value={ddeLen}
            onChange={(e) => {
              setDdeLen(e.target.value);
              setDdeInvalid(false);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                commitDde();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDdeLen("");
                setDdeAngle("");
                setDdeInvalid(false);
                svgRef.current?.focus();
              }
            }}
          />
          <span className="font-semibold text-slate-500">∠</span>
          <input
            type="number"
            step="any"
            placeholder="°"
            className={
              "w-14 rounded border px-1.5 py-0.5 tabular-nums " +
              (ddeInvalid ? "border-red-400 bg-red-50" : "border-slate-300")
            }
            value={ddeAngle}
            onChange={(e) => {
              setDdeAngle(e.target.value);
              setDdeInvalid(false);
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                commitDde();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setDdeLen("");
                setDdeAngle("");
                setDdeInvalid(false);
                svgRef.current?.focus();
              }
            }}
          />
          <span className="text-slate-400">type a length, Enter</span>
        </div>
      )}
      </div>

      {/* Inline numeric length editor for the selected edge (dimension select only). */}
      {closed && selEdge !== null && lenEditing && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-600">Edge {selEdge + 1} length</span>
          <input
            type="number"
            min={1}
            autoFocus
            className="w-24 rounded border px-2 py-1"
            value={lenInput}
            onChange={(e) => setLenInput(e.target.value)}
            onBlur={applyLen}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                applyLen();
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                setSelEdge(null);
              }
            }}
          />
          <span className="text-slate-500">cm</span>
          {Number(lenInput) > 0 && (
            <span className="tabular-nums text-slate-400">
              = {formatLengthCm(Number(lenInput))} ({formatLengthDual(Number(lenInput))})
            </span>
          )}

          <span className="mx-1 h-5 w-px bg-slate-200" />

          {/* Exact bearing entry for the selected edge (deg, y-down screen space). */}
          <span className="text-slate-600">Burchak / Angle °</span>
          <input
            type="number"
            step="any"
            autoFocus={false}
            className="w-20 rounded border px-2 py-1"
            value={angleInput}
            onChange={(e) => setAngleInput(e.target.value)}
            onBlur={applyAngle}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") {
                e.preventDefault();
                applyAngle();
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Escape") {
                setSelEdge(null);
              }
            }}
          />
          {/* Mirror the selected edge's bearing about the vertical / horizontal axis. */}
          <Button type="button" variant="outline" size="sm" onClick={mirrorH} title="Reflect this wall's angle about the vertical axis (180 − angle)">
            Mirror ↔
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={mirrorV} title="Reflect this wall's angle about the horizontal axis (− angle)">
            Mirror ↕
          </Button>

          <Button type="button" variant="outline" size="sm" onClick={() => setSelEdge(null)}>
            Done
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 text-[11px] leading-relaxed text-slate-500">
        <p>
          {tool === "rect"
            ? "Rectangle: press and drag to draw an axis-aligned room box; release to place it (replaces the current room). Corners snap to the grid/vertices. Returns to Draw after."
            : tool === "measure"
            ? "Measure (display-only): click to drop tape points — each segment shows its length + angle, with a running total. Double-click or Enter finishes; Esc or Clear empties it."
            : closed
            ? (ortho
                ? "Loop closed. Drag a vertex — Ortho keeps walls square (neighbours follow). "
                : "Loop closed. Drag vertices freely (Ortho off). ") +
              "Double-click a dimension to type an exact length (e.g. 61 cm); click a wall to select it and drag it (or its square handle) to slide it parallel; Alt-click a wall to insert a point; select a vertex then arrow-nudge or Delete it. F = fit, 0 = reset view. Export PNG saves the dimensioned drawing."
            : points.length === 0
              ? "Click to start drawing. Snaps: vertices, midpoints, edges, polar angles" +
                (snapSettings.grid ? " + grid" : "") +
                ". Wheel = zoom, middle / Alt-drag / Space-drag = pan, F = fit."
              : "Click to add points. Click the first vertex or Enter to close (the ring turns green when valid). Backspace steps back a point; Esc cancels. Crossing edges are rejected."}
        </p>
        {shapeDragInfo ? (
          <span className="shrink-0 rounded-md bg-sky-50 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-sky-700 ring-1 ring-inset ring-sky-100">
            move {shapeDragInfo.dx >= 0 ? "+" : ""}
            {Math.round(shapeDragInfo.dx)}, {shapeDragInfo.dy >= 0 ? "+" : ""}
            {Math.round(shapeDragInfo.dy)} cm
          </span>
        ) : edgeDragInfo ? (
          <span className="shrink-0 rounded-md bg-sky-50 px-2 py-0.5 font-mono text-[11px] font-semibold tabular-nums text-sky-700 ring-1 ring-inset ring-sky-100">
            wall {formatLengthDual(edgeDragInfo.lenCm)} · {edgeDragInfo.offset >= 0 ? "+" : ""}
            {Math.round(edgeDragInfo.offset)} cm
          </span>
        ) : (
          cursor && (
            <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 font-mono text-[11px] tabular-nums text-slate-500">
              {Math.round(cursor.x)}, {Math.round(cursor.y)} cm
            </span>
          )
        )}
      </div>
    </div>
  );
}
