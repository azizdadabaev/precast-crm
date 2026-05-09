/**
 * Barrel export — what the sandbox UI consumes.
 *
 * Keep the surface narrow: the UI never needs the validation or
 * grouping internals directly. If you find yourself importing from a
 * deeper path in the UI layer, surface the helper here instead.
 */

export {
  computeTaper,
  ROUTING_MESSAGE_RECTANGULAR,
} from "./compute-taper";

export type {
  BeamGroup,
  BillOfMaterials,
  PerRowDetail,
  Severity,
  TaperInput,
  TaperResult,
  Tier,
} from "./types";

export {
  BLOCK_PITCH_M,
  DEFAULT_BEAM_SPACING,
  DEFAULT_BEARING,
} from "./helpers";

export { TRANSVERSE_RIB_WARNING_PREFIX } from "./validation";
