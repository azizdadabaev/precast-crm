// System-wide audit log helper.
//
// `recordAudit()` is the SINGLE entry point for writing AuditLog rows.
// Call it from route handlers AFTER the primary mutation has succeeded
// — never as part of the same transaction. The helper is fire-and-forget
// with explicit error swallowing so a logging failure can never break
// the user's actual work.
//
// This is deliberate. The audit log is a journal, not a constraint.
// If the DB hiccups during a write, the user's order still placed, the
// order's OrderEvent (the customer-facing trail) is still recorded, and
// the missing audit row is logged to stderr for the operator to chase.

import { prisma } from "@/lib/prisma";

export interface AuditEntry {
  userId: string | null; // null for system-triggered events
  action: string;        // e.g. "project.create", "order.place"
  targetType?: string | null;
  targetId?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Record an audit entry. Best-effort — never throws.
 * Awaiting it is optional; the caller can fire and forget.
 */
export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        message: entry.message ?? null,
        metadata: entry.metadata ? (entry.metadata as object) : undefined,
      },
    });
  } catch (err) {
    // Never let an audit-write failure surface to the user. Just log.
    console.error("[audit] write failed:", err, entry);
  }
}
