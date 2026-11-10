// Idempotent retries for mobile uploads (spec D7 / S4).
//
// The Android outbox retries a POST after a dropped connection. Without
// this, a delivery proof or receipt could be recorded twice. The wrapper
// stores the first successful JSON response under (userId, key) for 24 h
// and replays it byte-for-byte on a retry. It composes INSIDE a
// withPermission/withAuth wrapper because it needs ctx.user.
//
//   export const POST = withPermission("order.edit", withIdempotency(async (req, ctx) => …));
//
// Requests without the header are untouched — the web never sends it.
//
// A row stays IN_PROGRESS if the handler committed but marking it DONE failed
// (DB blip, restart). Such a key must never run its handler again, so after
// STALE_MS it is answered with a definitive 409 IDEMPOTENT_STALE ("re-read the
// order"), and pruning keeps IN_PROGRESS rows for STUCK_TTL_MS — far longer than
// any client retries — instead of re-opening the key after 24 h.
//
// Optional `scope`: a route that takes several different actions under one path
// (gazoblok PATCH /orders/[id]) passes a function returning the request's
// identity (body, or stable multipart fields — never file bytes). A key reused
// with a different scope gets 422 IDEMPOTENT_SCOPE_MISMATCH instead of a replay.
// Callers without `scope` store and compare exactly as before.

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fail } from "@/lib/api";
import type { RouteContext } from "@/lib/api-auth";

export const IDEMPOTENCY_HEADER = "idempotency-key";
const TTL_MS = 24 * 60 * 60 * 1000;
const STALE_MS = 5 * 60 * 1000;
const STUCK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_KEY_LEN = 128;

type Fn<P> = (req: NextRequest, ctx: RouteContext<P>) => Promise<Response>;

export type IdempotencyOptions = {
  /** Identity of the request beyond its path; read from a clone of the request. */
  scope?: (req: NextRequest) => Promise<string> | string;
};

/** Scope on the exact JSON body a retry re-sends byte for byte. */
export const bodyScope = (req: NextRequest): Promise<string> => req.text();

/** Scope on named multipart fields; file parts (photo bytes) are left out. */
export const formFieldsScope =
  (...names: string[]) =>
  async (req: NextRequest): Promise<string> => {
    const form = await req.formData();
    return JSON.stringify(names.map((n) => {
      const v = form.get(n);
      return typeof v === "string" ? v : null;
    }));
  };

/** Separates the path from the scope hash in the stored `route` column. */
const SCOPE_SEP = "#";

async function scopeHash(req: NextRequest, scope: NonNullable<IdempotencyOptions["scope"]>): Promise<string> {
  let identity: string;
  try {
    identity = await scope(req.clone() as NextRequest);
  } catch {
    // Unreadable body: the handler answers 400 on its own; still pin the key.
    identity = "<unreadable>";
  }
  return createHash("sha256").update(identity).digest("hex").slice(0, 32);
}

async function pruneExpired(): Promise<void> {
  try {
    await prisma.idempotencyKey.deleteMany({
      where: {
        OR: [
          { status: "DONE", createdAt: { lt: new Date(Date.now() - TTL_MS) } },
          { createdAt: { lt: new Date(Date.now() - STUCK_TTL_MS) } },
        ],
      },
    });
  } catch (err) {
    console.error("[idempotency] prune failed:", err);
  }
}

function replay(status: number, body: unknown): Response {
  const res = NextResponse.json(body, { status });
  res.headers.set("Idempotency-Replayed", "true");
  return res;
}

export function withIdempotency<P = Record<string, string>>(fn: Fn<P>, opts: IdempotencyOptions = {}): Fn<P> {
  return async (req, ctx) => {
    const key = req.headers.get(IDEMPOTENCY_HEADER)?.trim();
    if (!key) return fn(req, ctx);
    if (key.length > MAX_KEY_LEN) {
      return fail("Idempotency-Key жуда узун · Idempotency-Key too long", 400);
    }
    const id = `${ctx.user.id}:${key}`;
    const path = new URL(req.url).pathname;
    const route = opts.scope ? `${path}${SCOPE_SEP}${await scopeHash(req, opts.scope)}` : path;

    const existing = await prisma.idempotencyKey.findUnique({ where: { id } });
    if (existing) {
      if (existing.route !== route) {
        if (existing.route.split(SCOPE_SEP)[0] === path) {
          return fail(
            "Idempotency-Key бошқа амал учун ишлатилган · Idempotency-Key already used for a different action",
            422,
            { code: "IDEMPOTENT_SCOPE_MISMATCH" },
          );
        }
        return fail(
          "Idempotency-Key бошқа сўров учун ишлатилган · Idempotency-Key already used for a different request",
          422,
          { code: "IDEMPOTENT_ROUTE_MISMATCH" },
        );
      }
      if (existing.status === "DONE" && existing.responseStatus !== null) {
        return replay(existing.responseStatus, existing.responseBody);
      }
      if (Date.now() - existing.createdAt.getTime() > STALE_MS) {
        return fail(
          "Сўров натижаси номаълум — буюртмани қайта очиб текширинг · Request outcome unknown — re-read the order before retrying",
          409,
          { code: "IDEMPOTENT_STALE" },
        );
      }
      return fail("Сўров ҳали бажарилмоқда · Request still in progress", 409, {
        code: "IDEMPOTENT_IN_PROGRESS",
      });
    }

    try {
      await prisma.idempotencyKey.create({ data: { id, userId: ctx.user.id, route } });
    } catch (err) {
      // Lost the race with a concurrent duplicate — it owns the key now.
      if (
        (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") ||
        (err as { code?: string }).code === "P2002"
      ) {
        return fail("Сўров ҳали бажарилмоқда · Request still in progress", 409, {
          code: "IDEMPOTENT_IN_PROGRESS",
        });
      }
      throw err;
    }

    void pruneExpired();

    let res: Response;
    try {
      res = await fn(req, ctx);
    } catch (err) {
      await prisma.idempotencyKey.delete({ where: { id } }).catch(() => undefined);
      throw err;
    }

    // Only cache definitive outcomes. A 5xx means "try again later" and
    // must not be replayed; non-JSON bodies (binary) are not cached either.
    const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
    if (res.status >= 500 || !isJson) {
      await prisma.idempotencyKey.delete({ where: { id } }).catch(() => undefined);
      return res;
    }
    let body: Prisma.InputJsonValue;
    try {
      body = (await res.clone().json()) as Prisma.InputJsonValue;
    } catch {
      // content-type lied — body isn't actually valid JSON. Don't strand
      // the row in IN_PROGRESS; let the client retry uncached.
      await prisma.idempotencyKey.delete({ where: { id } }).catch(() => undefined);
      return res;
    }
    await prisma.idempotencyKey.update({
      where: { id },
      data: { status: "DONE", responseStatus: res.status, responseBody: body },
    });
    return res;
  };
}
