import { z } from "zod";
import { isMonday } from "./rules";

export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Сана YYYY-MM-DD кўринишида бўлиши керак");
export const WeekStartSchema = IsoDateSchema.refine(isMonday, "Ҳафта душанбадан бошланиши керак");
const Method = z.enum(["CASH", "CARD", "OFFSET", "OTHER"]);
const Text = z.string().trim().max(500).nullable().optional();
// Guards a typo (an extra zero or three) before it reaches the Int column.
const MAX_SOM = 1_000_000_000;
const TOO_BIG = "Сумма жуда катта — 1 000 000 000 сўмдан ошмаслиги керак";

export const DayBody = z.object({
  date: IsoDateSchema,
  moulded: z.number().int().min(0).nullable(),
  broken: z.number().int().min(0).default(0),
  attendance: z.record(z.string(), z.literal(1)),
  notes: Text,
  confirmNoAttendance: z.boolean().optional(),
});
export type DayBody = z.infer<typeof DayBody>;

export const LedgerBody = z.object({
  date: IsoDateSchema,
  workerId: z.string().min(1),
  // Weekly pay is recorded only through the Pay button (dated inside its week).
  type: z.enum(["ADVANCE", "CORRECTION"]),
  amount: z.number().int().min(-MAX_SOM, TOO_BIG).max(MAX_SOM, TOO_BIG),
  method: Method.default("CASH"),
  reason: Text,
  signed: z.boolean().optional(),
  clientKey: z.string().min(8).max(64).optional(),
  confirmOverBalance: z.boolean().optional(),
});
export type LedgerBody = z.infer<typeof LedgerBody>;

export const LedgerPatchBody = z.object({ reason: Text, signed: z.boolean().optional(), method: Method.optional() });
export type LedgerPatchBody = z.infer<typeof LedgerPatchBody>;

export const ReverseBody = z.object({ date: IsoDateSchema, amount: z.number().int().min(-MAX_SOM, TOO_BIG).max(MAX_SOM, TOO_BIG).optional(), reason: Text });
export type ReverseBody = z.infer<typeof ReverseBody>;

export const PayBody = z.object({
  payments: z.array(z.object({
    workerId: z.string().min(1), amount: z.number().int().min(0).max(MAX_SOM, TOO_BIG), method: Method, clientKey: z.string().min(8).max(64),
  })).min(1),
});
export type PayBody = z.infer<typeof PayBody>;

export const ReopenBody = z.object({ reason: z.string().trim().min(3, "Сабабини ёзинг") });

export const WorkerBody = z.object({
  name: z.string().trim().min(2).max(60),
  joinedOn: IsoDateSchema,
  phone: z.string().trim().max(30).nullable().optional(),
  notes: Text,
});
export type WorkerBody = z.infer<typeof WorkerBody>;

export const WorkerPatchBody = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  joinedOn: IsoDateSchema.optional(),
  leftOn: IsoDateSchema.nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  notes: Text,
});
export type WorkerPatchBody = z.infer<typeof WorkerPatchBody>;

export const RateBody = z.object({ effectiveFrom: IsoDateSchema, ratePerBlock: z.number().int().min(1).max(100_000) });
export type RateBody = z.infer<typeof RateBody>;

export const SettingBody = z.object({
  key: z.enum(["BREAK_ALLOWANCE", "DEBT_CAP", "REJECT_ALARM"]),
  value: z.number().min(0).max(1),
  effectiveFrom: IsoDateSchema,
});
export type SettingBody = z.infer<typeof SettingBody>;
