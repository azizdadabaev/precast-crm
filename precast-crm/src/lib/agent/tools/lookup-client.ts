// lookup_client — resolve a customer to a client_id with MINIMUM PII
// (spec §5 / §7 / §10).
//
// Privacy rule: a PHONE match may return id + name + language (it's the
// customer's own record); a NAME-only match returns id + name ONLY — never a
// phone or address. Anything beyond a name requires a phone match, so the bot
// can't be used to fish another customer's contact details out of the CRM.
// "No match" is a normal new-customer answer, NOT an escalation.

import { z } from 'zod';
import { normalizePhone } from '@/lib/phone';
import {
  type AgentTool,
  type AgentToolContext,
  type AgentToolDefinition,
  type ToolResult,
  toolOk,
} from './types';

export const LookupClientInput = z.object({
  phone: z.string().optional(), // raw; normalized here
  name: z.string().optional(),
});
export type LookupClientInputType = z.infer<typeof LookupClientInput>;

/** A client row as the db returns it (the shell maps Prisma → this). */
export interface ClientRow {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  language: string;
}

export type ClientMatch = { client_id: string; name: string; language?: string };

export interface LookupData {
  matchedBy: 'phone' | 'name' | 'none';
  clients: ClientMatch[];
}

/** Phone match → id + name + language (the customer's own record). */
export function toPhoneMatch(c: ClientRow): ClientMatch {
  return { client_id: c.id, name: c.name, language: c.language };
}
/** Name-only match → id + name ONLY (no phone/address/language). */
export function toNameMatch(c: ClientRow): ClientMatch {
  return { client_id: c.id, name: c.name };
}

/** Narrow db surface — injectable so the lookup logic is unit-testable. */
export interface LookupClientDb {
  findClientByPhone(phone: string): Promise<ClientRow | null>;
  findClientsByName(name: string): Promise<ClientRow[]>;
}

export interface LookupClientDeps {
  db: LookupClientDb;
  /** Conversation.sharedContactPhone (digits-only), used when no phone is given. */
  sharedContactPhone?: string | null;
}

/**
 * Pure-ish core: choose a lookup key (explicit phone > shared contact > name),
 * query via the injected db, and shape the result with PII minimization.
 */
export async function runLookupClient(
  raw: unknown,
  deps: LookupClientDeps,
): Promise<ToolResult<LookupData>> {
  const parsed = LookupClientInput.safeParse(raw);
  if (!parsed.success) return toolOk({ matchedBy: 'none', clients: [] });
  const i = parsed.data;

  const phone = i.phone ? normalizePhone(i.phone) : (deps.sharedContactPhone || '');
  if (phone) {
    const client = await deps.db.findClientByPhone(phone);
    return toolOk({ matchedBy: 'phone', clients: client ? [toPhoneMatch(client)] : [] });
  }

  // Require ≥2 chars before a name search so a 1-char query can't enumerate
  // arbitrary customer names (PII minimization, spec §7/§10). The §6.5 output
  // validator (Plan 08) is the final backstop on leaking a non-customer name.
  const name = i.name?.trim();
  if (name && name.length >= 2) {
    const rows = await deps.db.findClientsByName(name);
    return toolOk({ matchedBy: 'name', clients: rows.map(toNameMatch) });
  }

  return toolOk({ matchedBy: 'none', clients: [] });
}

function makeDb(): LookupClientDb {
  return {
    async findClientByPhone(phone) {
      const { prisma } = await import('@/lib/prisma');
      const c = await prisma.client.findUnique({ where: { phone } });
      return c
        ? { id: c.id, name: c.name, phone: c.phone, address: c.address, language: c.language }
        : null;
    },
    async findClientsByName(name) {
      const { prisma } = await import('@/lib/prisma');
      const rows = await prisma.client.findMany({
        where: { name: { contains: name, mode: 'insensitive' } },
        take: 5,
        orderBy: { updatedAt: 'desc' },
      });
      return rows.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        address: c.address,
        language: c.language,
      }));
    },
  };
}

export const lookupClientDefinition: AgentToolDefinition = {
  name: 'lookup_client',
  description:
    'Look up an existing customer to get a client_id. Prefer a phone number; if ' +
    'omitted, the customer\'s shared contact phone is used. A PHONE match returns ' +
    'the client_id, name, and language. A NAME-only search returns just client_id ' +
    'and name for up to a few matches — never a phone or address (full details ' +
    'require a phone match). No match means a new customer (not an error). NEVER ' +
    "reveal one customer's contact details to another.",
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      phone: { type: 'string', description: "Customer phone in any format; matched after normalization." },
      name: { type: 'string', description: 'Customer name (partial allowed) — returns minimal info only.' },
    },
  },
};

export const lookupClientTool: AgentTool<LookupData> = {
  definition: lookupClientDefinition,
  async execute(rawInput, ctx?: AgentToolContext) {
    return runLookupClient(rawInput, {
      db: makeDb(),
      sharedContactPhone: ctx?.sharedContactPhone,
    });
  },
};
