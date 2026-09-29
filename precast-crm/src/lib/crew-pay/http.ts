import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { fail } from "@/lib/api";
import type { RouteContext } from "@/lib/api-auth";
import { CrewPayError } from "./rules";

type Fn<P> = (req: NextRequest, ctx: RouteContext<P>) => Promise<Response>;

const CYRILLIC = /[А-Яа-яЁёЎўҚқҒғҲҳ]/;
const INVALID_INPUT = "Маълумот нотўғри киритилган — текшириб, қайта юборинг";
/** Unique-constraint clashes the owner can cause from the UI, by column. */
const DUPLICATE: Array<[string, string]> = [
  ["effectiveFrom", "Бу санада аллақачон ёзув бор — бошқа сана танланг"],
  ["workDate", "Бу санада аллақачон кун бор — саҳифани янгиланг"],
  ["name", "Бу исмли ишчи аллақачон бор"],
  ["clientKey", "Бу тўлов аллақачон ёзилган"],
];

/**
 * Crew-pay errors → JSON the owner can read. The shared handler() answers in
 * English ("Validation failed", "Unique constraint violation: …"), and the
 * crew-pay UI shows the error text verbatim, so everything is mapped to Uzbek
 * here. Anything unexpected falls through to handler().
 */
export function crewRoute<P = Record<string, string>>(fn: Fn<P>): Fn<P> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof CrewPayError) return fail(err.message, err.status);
      if (err instanceof ZodError) {
        // Our schemas carry Uzbek messages; zod's built-ins are English.
        return fail(err.issues.map((i) => i.message).find((m) => CYRILLIC.test(m)) ?? INVALID_INPUT, 400);
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          const target = ([] as string[]).concat((err.meta?.target as string | string[] | undefined) ?? []).join(",");
          return fail(DUPLICATE.find(([col]) => target.includes(col))?.[1] ?? "Бундай ёзув аллақачон бор", 409);
        }
        // Serializable transaction lost a race with a concurrent write.
        if (err.code === "P2034") return fail("Бир вақтда бошқа ўзгариш бўлди — қайта уриниб кўринг", 409);
      }
      throw err;
    }
  };
}
