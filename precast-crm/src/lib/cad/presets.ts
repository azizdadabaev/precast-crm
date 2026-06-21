import type { Pt } from "@/lib/cad/geometry";

/**
 * Ready-made rectilinear room outlines (presets) for the Draw-room tool.
 *
 * Each returns a CLOSED outline as a vertex list in CENTIMETRES (y-down, the
 * same convention RoomCanvas uses), wound clockwise around the boundary
 * starting at the top-left — matching `rectFromCorners`. The operator drops one
 * and then edits it (slide walls / type exact lengths) instead of placing every
 * vertex of an L / T / U / notched room by hand.
 *
 * Every edge is axis-aligned so the outline stays rectilinear (the invariant
 * the bay decomposition relies on). Defaults are a sensible starting room;
 * callers can override the overall bounding-box extent.
 */

export interface PresetSize {
  /** Overall bounding-box width (cm). */
  w?: number;
  /** Overall bounding-box height (cm). */
  h?: number;
}

const DEFAULT_W = 500;
const DEFAULT_H = 400;

/** L-shaped room: a vertical bar down the left + a horizontal foot along the
 *  bottom; the top-right rectangle is cut away. 6 vertices. */
export function lShape({ w = DEFAULT_W, h = DEFAULT_H }: PresetSize = {}): Pt[] {
  const armW = Math.round(w * 0.42); // width of the vertical bar
  const footH = Math.round(h * 0.5); // height of the bottom foot
  return [
    { x: 0, y: 0 },
    { x: armW, y: 0 },
    { x: armW, y: h - footH },
    { x: w, y: h - footH },
    { x: w, y: h },
    { x: 0, y: h },
  ];
}

/** T-shaped room: a full-width bar across the top + a centred vertical stem
 *  dropping from it. 8 vertices. */
export function tShape({ w = DEFAULT_W, h = DEFAULT_H }: PresetSize = {}): Pt[] {
  const barH = Math.round(h * 0.4); // height of the top bar
  const stemW = Math.round(w * 0.4); // width of the stem
  const x0 = Math.round((w - stemW) / 2);
  const x1 = x0 + stemW;
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: barH },
    { x: x1, y: barH },
    { x: x1, y: h },
    { x: x0, y: h },
    { x: x0, y: barH },
    { x: 0, y: barH },
  ];
}

/** U-shaped room: two vertical legs joined by a bottom bar, open at the top.
 *  8 vertices. */
export function uShape({ w = DEFAULT_W, h = DEFAULT_H }: PresetSize = {}): Pt[] {
  const legW = Math.round(w * 0.3); // width of each leg
  const botH = Math.round(h * 0.4); // height of the bottom bar
  return [
    { x: 0, y: 0 },
    { x: legW, y: 0 },
    { x: legW, y: h - botH },
    { x: w - legW, y: h - botH },
    { x: w - legW, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
}

/** Full rectangle with a rectangular notch cut out of the centre of the top
 *  edge (a stairwell/alcove bite). 8 vertices. */
export function notchShape({ w = DEFAULT_W, h = DEFAULT_H }: PresetSize = {}): Pt[] {
  const notchW = Math.round(w * 0.3); // width of the notch
  const notchD = Math.round(h * 0.3); // depth of the notch
  const x0 = Math.round((w - notchW) / 2);
  const x1 = x0 + notchW;
  return [
    { x: 0, y: 0 },
    { x: x0, y: 0 },
    { x: x0, y: notchD },
    { x: x1, y: notchD },
    { x: x1, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
}

/** A preset descriptor for the toolbar: a short label + the outline factory. */
export interface RoomPreset {
  key: string;
  make: (size?: PresetSize) => Pt[];
}

export const ROOM_PRESETS: RoomPreset[] = [
  { key: "L", make: lShape },
  { key: "T", make: tShape },
  { key: "U", make: uShape },
  { key: "Notch", make: notchShape },
];
