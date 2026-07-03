/**
 * Wire format for DrawingRequest.roomsJson when the request was created from
 * the CAD drawing tool directly (as opposed to the rectangular-rooms path).
 *
 * The Blender addon detects `payload.type === "cad_drawing"` and renders the
 * actual polygon outline with beams clipped to it, instead of building a
 * simple rectangular slab from inner_width × inner_length.
 */

/** One polygon room sent to Blender in CAD-drawing mode. */
export interface CadRoomPolygon {
  name: string;
  /** Closed polygon vertices in METRES (stored cm ÷ 100). CCW winding. */
  points: Array<{ x: number; y: number }>;
  /** Floor voids (stairwells/shafts) in metres. Each hole is a closed polygon. */
  holes?: Array<Array<{ x: number; y: number }>>;
  /** Beam direction within this room. */
  beam_dir: "H" | "V";
  /** Per-end bearing seat on supporting wall, metres (default 0.15). */
  bearing_m: number;
  /** Beam centre-to-centre pitch, metres (default 0.58). */
  pitch_m: number;
  /** Precast beam cross-section in metres. */
  beam_section: { w: number; h: number };
  /** Filler block dimensions in metres (l = along beam, w = between beams, h = height). */
  block_dims: { l: number; w: number; h: number };
  /** CRM-computed total beam count across all bays/buckets of this room. */
  total_beams: number;
  /** CRM-computed total filler block count. */
  total_blocks: number;
  /**
   * Beam cut list — groups of equal-length beams.
   * For rectilinear rooms: one entry per rectangular bay.
   * For tapered rooms: one entry per length bucket from the scanline engine
   * (sorted long → short by convention).
   */
  beam_schedule: Array<{
    /** Full slab beam length in metres (inner span + 2 × bearing). */
    slab_length_m: number;
    /** Number of beams of this length. */
    count: number;
  }>;
}

/** Top-level payload stored in DrawingRequest.roomsJson for CAD-drawing requests. */
export interface CadDrawingPayload {
  type: "cad_drawing";
  version: 1;
  rooms: CadRoomPolygon[];
}
