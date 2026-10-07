// Persistence for MCP quotes (spec 2026-10-07).
//
// A floor quote lives as an AI draft in «Лойиҳалар» (same record the Telegram
// agent saves) plus an immutable McpQuote row holding exactly what Claude was
// told. One live draft per customer_ref: a re-quote refreshes that draft and
// marks the earlier quote superseded. Nothing here deletes or edits a quote —
// staff withdraw a quote by deleting its draft in the CRM.

import { createHash } from 'crypto';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { loadPricingMeta } from '@/lib/pricing-config';
import { nextDraftNumber } from '@/lib/draft-number';
import type { PriceConfig } from '@/services/calculation-engine';
import type { SlabQuoteResult } from './slab';
import type { GazoblokCatalogRow } from './gazoblok';
import { formatQuoteId, quoteStatus, type QuoteStatus } from './status';

const hash6 = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 6);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : 'default');

/** Instagram handles are case-insensitive and often sent with a leading "@". */
export function normalizeCustomerRef(ref: string | null | undefined): string | null {
  const v = (ref ?? '').trim().replace(/^@+/, '').toLowerCase();
  return v ? v.slice(0, 80) : null;
}

export async function slabPriceListVersion(pricing: PriceConfig): Promise<string> {
  const { updatedAt } = await loadPricingMeta();
  return `${day(updatedAt)}.${hash6(pricing)}`;
}

export function gazoblokPriceListVersion(catalog: Array<GazoblokCatalogRow & { updatedAt?: Date }>): string {
  const latest = catalog.reduce<Date | null>((m, r) => (r.updatedAt && (!m || r.updatedAt > m) ? r.updatedAt : m), null);
  return `gazoblok-${day(latest)}.${hash6(catalog.map((r) => [r.label, r.pricePerBlock]))}`;
}

type SnapshotBuilder<M> = (meta: M) => object;

/** The snapshot as stored: plain JSON (dates already ISO strings). */
const toJson = (v: object): Prisma.InputJsonValue => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

export async function saveSlabQuote(p: {
  input: unknown;
  result: SlabQuoteResult;
  customerRef: string | null;
  priceListVersion: string;
  snapshot: SnapshotBuilder<{ quoteId: string; draftNumber: number | null; createdAt: Date; supersedes: string | null }>;
}): Promise<{ snapshot: Prisma.InputJsonValue; number: number }> {
  const first = p.result.calcs[0];
  const dimensions = {
    width: Number(first.innerWidth),
    length: Number(first.innerLength),
    notes: `${p.result.calcs.length} room${p.result.calcs.length === 1 ? '' : 's'} · Claude`,
  };
  const name = `Claude · Instagram${p.customerRef ? ` · ${p.customerRef}` : ''}`.slice(0, 120);

  return prisma.$transaction(async (tx) => {
    let project: { id: string; draftNumber: number | null } | null = null;
    let previous: { id: string; number: number } | null = null;
    if (p.customerRef) {
      const prev = await tx.mcpQuote.findFirst({
        where: { kind: 'slab', customerRef: p.customerRef, supersededById: null },
        orderBy: { number: 'desc' },
        select: { id: true, number: true, project: { select: { id: true, draftNumber: true, status: true } } },
      });
      if (prev) previous = { id: prev.id, number: prev.number };
      // Refresh the customer's draft only while it is still a draft — never
      // rewrite one staff already turned into an order.
      if (prev?.project && prev.project.status === 'DRAFT') project = prev.project;
    }

    if (project) {
      await tx.calculation.deleteMany({ where: { projectId: project.id } });
      await tx.project.update({
        where: { id: project.id },
        data: { name, dimensions, calculations: { create: p.result.calcs } },
      });
    } else {
      const maxAgg = await tx.project.aggregate({ _max: { draftNumber: true } });
      project = await tx.project.create({
        data: {
          draftNumber: nextDraftNumber(maxAgg._max.draftNumber ?? null),
          status: 'DRAFT',
          aiGenerated: true,
          name,
          shapeType: 'RECTANGULAR',
          dimensions,
          calculations: { create: p.result.calcs },
        },
        select: { id: true, draftNumber: true },
      });
    }

    const row = await tx.mcpQuote.create({
      data: {
        kind: 'slab',
        customerRef: p.customerRef,
        projectId: project.id,
        priceListVersion: p.priceListVersion,
        input: p.input as Prisma.InputJsonValue,
        snapshot: {},
      },
    });
    const snapshot = toJson(p.snapshot({
      quoteId: formatQuoteId(row.number),
      draftNumber: project.draftNumber,
      createdAt: row.createdAt,
      supersedes: previous ? formatQuoteId(previous.number) : null,
    }));
    await tx.mcpQuote.update({ where: { id: row.id }, data: { snapshot } });
    if (p.customerRef) {
      await tx.mcpQuote.updateMany({
        where: { kind: 'slab', customerRef: p.customerRef, supersededById: null, id: { not: row.id } },
        data: { supersededById: row.id },
      });
    }
    return { snapshot, number: row.number };
  });
}

export async function saveGazoblokQuote(p: {
  input: unknown;
  customerRef: string | null;
  priceListVersion: string;
  snapshot: SnapshotBuilder<{ quoteId: string; createdAt: Date; supersedes: string | null }>;
}): Promise<{ snapshot: Prisma.InputJsonValue; number: number }> {
  return prisma.$transaction(async (tx) => {
    const previous = p.customerRef
      ? await tx.mcpQuote.findFirst({
          where: { kind: 'gazoblok', customerRef: p.customerRef, supersededById: null },
          orderBy: { number: 'desc' },
          select: { number: true },
        })
      : null;
    const row = await tx.mcpQuote.create({
      data: {
        kind: 'gazoblok',
        customerRef: p.customerRef,
        priceListVersion: p.priceListVersion,
        input: p.input as Prisma.InputJsonValue,
        snapshot: {},
      },
    });
    const snapshot = toJson(p.snapshot({
      quoteId: formatQuoteId(row.number),
      createdAt: row.createdAt,
      supersedes: previous ? formatQuoteId(previous.number) : null,
    }));
    await tx.mcpQuote.update({ where: { id: row.id }, data: { snapshot } });
    if (p.customerRef) {
      await tx.mcpQuote.updateMany({
        where: { kind: 'gazoblok', customerRef: p.customerRef, supersededById: null, id: { not: row.id } },
        data: { supersededById: row.id },
      });
    }
    return { snapshot, number: row.number };
  });
}

export async function loadQuote(number: number): Promise<{
  kind: string;
  projectId: string | null;
  snapshot: unknown;
  status: QuoteStatus;
  supersededBy: string | null;
} | null> {
  const q = await prisma.mcpQuote.findUnique({
    where: { number },
    select: {
      kind: true, projectId: true, supersededById: true, snapshot: true,
      project: { select: { status: true } },
    },
  });
  if (!q) return null;
  const newer = q.supersededById
    ? await prisma.mcpQuote.findUnique({ where: { id: q.supersededById }, select: { number: true } })
    : null;
  return {
    kind: q.kind,
    projectId: q.projectId,
    snapshot: q.snapshot,
    status: quoteStatus({
      kind: q.kind,
      projectId: q.projectId,
      supersededById: q.supersededById,
      projectStatus: q.project?.status ?? null,
    }),
    supersededBy: newer ? formatQuoteId(newer.number) : null,
  };
}

/** Active gazoblok catalog with stock, Decimals coerced to numbers. */
export async function loadGazoblokCatalog(): Promise<Array<GazoblokCatalogRow & { updatedAt: Date }>> {
  const rows = await prisma.gazoblokProduct.findMany({
    where: { active: true },
    orderBy: { seq: 'asc' },
    include: { stock: { select: { quantity: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    lengthM: Number(r.lengthM),
    heightM: Number(r.heightM),
    thicknessM: Number(r.thicknessM),
    pricePerBlock: Number(r.pricePerBlock),
    active: r.active,
    stockQuantity: r.stock ? r.stock.quantity : null,
    updatedAt: r.updatedAt,
  }));
}
