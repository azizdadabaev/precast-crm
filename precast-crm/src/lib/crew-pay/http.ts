import type { NextRequest } from "next/server";
import { fail } from "@/lib/api";
import type { RouteContext } from "@/lib/api-auth";
import { CrewPayError } from "./rules";

type Fn<P> = (req: NextRequest, ctx: RouteContext<P>) => Promise<Response>;

/** Map CrewPayError → JSON with its status; everything else falls through to handler(). */
export function crewRoute<P = Record<string, string>>(fn: Fn<P>): Fn<P> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof CrewPayError) return fail(err.message, err.status);
      throw err;
    }
  };
}
