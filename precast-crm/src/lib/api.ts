import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { CalculationError } from "@/services/calculation-engine";
import { UploadError } from "@/lib/uploads";

export function ok<T>(data: T, init?: number) {
  return NextResponse.json({ ok: true, data }, { status: init ?? 200 });
}

export function created<T>(data: T) {
  return NextResponse.json({ ok: true, data }, { status: 201 });
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: message, details }, { status });
}

/**
 * Wrap an async route handler so all error types are translated to clean JSON.
 * Keeps every API route a one-liner for error handling.
 */
export function handler<T extends unknown[]>(
  fn: (...args: T) => Promise<Response>,
): (...args: T) => Promise<Response> {
  return async (...args: T) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof UploadError) {
        return fail(err.message, err.status);
      }
      if (err instanceof ZodError) {
        return fail("Validation failed", 422, err.flatten());
      }
      if (err instanceof CalculationError) {
        return fail(err.message, 400);
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          const target = (err.meta?.target as string[] | undefined)?.join(", ") ?? "field";
          // Safety net for the rare race where two simultaneous place-
          // order submits both pass the pre-flight check in
          // api/orders/route.ts. The Order.projectId @unique catches
          // the second one here; emit the same bilingual message the
          // pre-flight returns so the operator never sees the raw
          // database column name.
          if (target === "projectId") {
            return fail(
              "Бу лойиҳа учун буюртма аллақачон жойлаштирилган · An order has already been placed for this project",
              409,
            );
          }
          return fail(`Unique constraint violation: ${target}`, 409);
        }
        if (err.code === "P2025") {
          return fail("Record not found", 404);
        }
      }
      console.error("[API ERROR]", err);
      return fail("Internal server error", 500);
    }
  };
}
