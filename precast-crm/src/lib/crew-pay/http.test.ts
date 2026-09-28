import { describe, it, expect } from "vitest";
import { z, ZodError } from "zod";
import { Prisma } from "@prisma/client";
import type { NextRequest } from "next/server";
import { crewRoute } from "./http";

// Final review #3: validation and uniqueness errors reached the owner in English
// ("Validation failed", "Unique constraint violation: …"). Every crew-pay error
// the UI can show must be Uzbek.
const run = async (err: unknown) => {
  const res = await crewRoute(async () => { throw err; })({} as NextRequest, { user: {} as never, params: {} });
  return { status: res.status, body: await res.json() };
};
const known = (code: string, target?: string[]) =>
  new Prisma.PrismaClientKnownRequestError("x", { code, clientVersion: "5.22.0", meta: target ? { target } : undefined });

describe("crewRoute error mapping", () => {
  it("shows a schema's own Uzbek message for a validation error", async () => {
    let err: unknown;
    try { z.object({ reason: z.string().min(3, "Сабабини ёзинг") }).parse({ reason: "a" }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(ZodError);
    expect(await run(err)).toEqual({ status: 400, body: expect.objectContaining({ ok: false, error: "Сабабини ёзинг" }) });
  });
  it("falls back to a generic Uzbek message when zod's text is English", async () => {
    let err: unknown;
    try { z.object({ amount: z.number() }).parse({ amount: "x" }); } catch (e) { err = e; }
    const r = await run(err);
    expect(r.status).toBe(400);
    expect(r.body.error).toBe("Маълумот нотўғри киритилган — текшириб, қайта юборинг");
  });
  it("names the clash in Uzbek for duplicates", async () => {
    expect((await run(known("P2002", ["effectiveFrom"]))).body.error).toMatch(/Бу санада/);
    expect((await run(known("P2002", ["effectiveFrom"]))).status).toBe(409);
    expect((await run(known("P2002", ["name"]))).body.error).toMatch(/Бу исмли ишчи/);
    expect((await run(known("P2002", ["clientKey"]))).body.error).toMatch(/аллақачон ёзилган/);
    expect((await run(known("P2002", ["workDate"]))).body.error).toMatch(/Бу санада/);
  });
  it("asks to retry in Uzbek when a concurrent change wins (serialization failure)", async () => {
    const r = await run(known("P2034"));
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/қайта уриниб/);
  });
});
