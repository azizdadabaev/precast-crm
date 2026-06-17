import { z } from "zod";

// Body for PATCH /api/orders/[id]/settle-remaining. A required reason is
// the whole point — writing off money must be deliberate and auditable.
// Lives in a sibling file because Next forbids non-route exports from a
// route.ts module.
export const SettleRemainingBody = z.object({
  note: z.string().min(3).max(300),
});
