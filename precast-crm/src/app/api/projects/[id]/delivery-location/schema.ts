import { z } from "zod";

export const DeliveryLocationBody = z.object({
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  url: z.string().max(2000).nullable().optional(),
  label: z.string().max(200).nullable().optional(),
});
