// Persistence for MCP quotes (spec 2026-10-07).
//
// A floor quote lives as an AI draft in «Лойиҳалар» (same record the Telegram
// agent saves) plus an immutable McpQuote row holding exactly what Claude was
// told. One live draft per customer_ref: a re-quote refreshes that draft and
// marks the earlier quote superseded. Nothing here deletes or edits a quote —
// staff withdraw a quote by deleting its draft in the CRM.

import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { loadPricingMeta } from '@/lib/pricing-config';
import { nextDraftNumber } from '@/lib/draft-number';
import type { PriceConfig } from '@/services/calculation-engine';
import type { SlabQuoteResult } from './slab';
import type { GazoblokCatalogRow } from './gazoblok';
import { draftMatchesSnapshot, formatQuoteId, quoteStatus, type QuoteStatus } from './status';

const hash6 = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 6);
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : 'default');

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

/** A customer's quotes that a newer one may replace: not yet replaced, and not
 *  ordered — an order is a fact, a later quote never relabels it superseded. */
function replaceable(kind: 'slab' | 'gazoblok', customerRef: string): Prisma.McpQuoteWhereInput {
  return {
    kind,
    customerRef,
    supersededById: null,
    OR: [{ projectId: null }, { project: { is: { status: { not: 'ORDERED' } } } }],
  };
}

/** One customer's quotes are written one at a time, so two quick re-quotes can
 *  never both refresh (or both create) that customer's draft. */
async function lockCustomer(tx: Prisma.TransactionClient, customerRef: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`mcp_quote:${customerRef}`}))`;
}

type SlabMeta = { quoteId: string; draftNumber: number | null; createdAt: Date; supersedes: string | null };

export async function saveSlabQuote(p: {
  input: unknown;
  result: SlabQuoteResult;
  customerRef: string | null;
  priceListVersion: string;
  snapshot: SnapshotBuilder<SlabMeta>;
}): Promise<{ snapshot: Prisma.InputJsonValue; number: number }> {
  // Two new drafts at the same moment can draw the same draft number (unique);
  // the loser simply retries with the next one.
  for (let attempt = 1; ; attempt++) {
    try {
      return await writeSlabQuote(p);
    } catch (err) {
      const clash = err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
      if (!clash || attempt >= 3) throw err;
    }
  }
}

async function writeSlabQuote(p: Parameters<typeof saveSlabQuote>[0]): Promise<{ snapshot: Prisma.InputJsonValue; number: number }> {
  const n = p.result.calcs.length;
  const first = p.result.calcs[0];
  // No project name: the quote card prints it as its title. Staff see where the
  // draft came from in the notes instead.
  const dimensions = {
    width: Number(first.innerWidth),
    length: Number(first.innerLength),
    notes: `${n} room${n === 1 ? '' : 's'} · Claude${p.customerRef ? ` · ${p.customerRef}` : ''}`,
  };

  return prisma.$transaction(async (tx) => {
    let project: { id: string; draftNumber: number | null } | null = null;
    let previous: { id: string; number: number } | null = null;
    if (p.customerRef) {
      await lockCustomer(tx, p.customerRef);
      const prev = await tx.mcpQuote.findFirst({
        where: replaceable('slab', p.customerRef),
        orderBy: { number: 'desc' },
        select: {
          id: true, number: true, snapshot: true,
          project: {
            select: {
              id: true, draftNumber: true, status: true, discountPercent: true, discountAmount: true,
              calculations: { select: { subtotal: true } },
            },
          },
        },
      });
      if (prev) previous = { id: prev.id, number: prev.number };
      // Refresh the customer's draft only while it still holds exactly what
      // Claude quoted — never overwrite a draft staff have started working on.
      const d = prev?.project;
      if (
        d && d.status === 'DRAFT' &&
        draftMatchesSnapshot(
          {
            subtotals: d.calculations.map((c) => Number(c.subtotal)),
            discountPercent: Number(d.discountPercent),
            discountAmount: Number(d.discountAmount),
          },
          prev?.snapshot,
        )
      ) {
        project = { id: d.id, draftNumber: d.draftNumber };
      }
    }

    if (project) {
      await tx.calculation.deleteMany({ where: { projectId: project.id } });
      await tx.project.update({
        where: { id: project.id },
        data: { dimensions, calculations: { create: p.result.calcs } },
      });
    } else {
      const maxAgg = await tx.project.aggregate({ _max: { draftNumber: true } });
      project = await tx.project.create({
        data: {
          draftNumber: nextDraftNumber(maxAgg._max.draftNumber ?? null),
          status: 'DRAFT',
          aiGenerated: true,
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
        where: { ...replaceable('slab', p.customerRef), id: { not: row.id } },
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
    if (p.customerRef) await lockCustomer(tx, p.customerRef);
    const previous = p.customerRef
      ? await tx.mcpQuote.findFirst({
          where: replaceable('gazoblok', p.customerRef),
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
        where: { ...replaceable('gazoblok', p.customerRef), id: { not: row.id } },
        data: { supersededById: row.id },
      });
    }
    return { snapshot, number: row.number };
  });
}

export interface LoadedQuote {
  kind: string;
  customerRef: string | null;
  projectId: string | null;
  snapshot: unknown;
  status: QuoteStatus;
  supersededBy: string | null;
  /** The draft behind a floor quote, as it is now (null once withdrawn). */
  draft: {
    hasClientDetails: boolean;
    subtotals: number[];
    discountPercent: number;
    discountAmount: number;
  } | null;
}

export async function loadQuote(number: number): Promise<LoadedQuote | null> {
  const q = await prisma.mcpQuote.findUnique({
    where: { number },
    select: {
      kind: true, customerRef: true, projectId: true, supersededById: true, snapshot: true,
      project: {
        select: {
          status: true, clientId: true,
          tentativeClientName: true, tentativeClientPhone: true, tentativeClientAddress: true,
          discountPercent: true, discountAmount: true,
          calculations: { select: { subtotal: true } },
        },
      },
    },
  });
  if (!q) return null;
  const newer = q.supersededById
    ? await prisma.mcpQuote.findUnique({ where: { id: q.supersededById }, select: { number: true } })
    : null;
  const d = q.project;
  return {
    kind: q.kind,
    customerRef: q.customerRef,
    projectId: q.projectId,
    snapshot: q.snapshot,
    status: quoteStatus({
      kind: q.kind,
      projectId: q.projectId,
      supersededById: q.supersededById,
      projectStatus: d?.status ?? null,
    }),
    supersededBy: newer ? formatQuoteId(newer.number) : null,
    draft: d
      ? {
          hasClientDetails: !!(d.clientId || d.tentativeClientName || d.tentativeClientPhone || d.tentativeClientAddress),
          subtotals: d.calculations.map((c) => Number(c.subtotal)),
          discountPercent: Number(d.discountPercent),
          discountAmount: Number(d.discountAmount),
        }
      : null,
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
