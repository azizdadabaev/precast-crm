import { z } from "zod";
import { RoomCalcInputSchema } from "@/lib/validation";

// Kept out of route.ts because the App Router forbids non-route exports.
export const CalculateBatchSchema = z.object({
  rooms: z.array(RoomCalcInputSchema).min(1).max(50),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  discountAmount: z.coerce.number().min(0).default(0),
  deliveryCost: z.coerce.number().min(0).default(0),
  otherCost: z.coerce.number().min(0).default(0),
});
export type CalculateBatchInput = z.infer<typeof CalculateBatchSchema>;
