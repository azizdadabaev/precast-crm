// Can this caller be reached on Telegram RIGHT NOW, without the SMS handshake?
//
// The handshake exists because a Telegram bot cannot open a conversation: outbound
// sending needs a `business_connection_id`, and Telegram only ever hands that over
// on an INBOUND update (src/lib/inbox-send.ts:51). For a stranger there is no way
// around that.
//
// But for someone who has written before there is nothing to work around — the
// connection is already live and the bot can send this second. On production that
// is 348 chats. What was missing was never permission; it was IDENTITY: knowing
// which of those chats belongs to the number that was just called.
//
// Two strengths of answer, and the difference between them is the whole point:
//
//   PROVEN  — the chat is tied to this exact phone. Send without asking.
//   LIKELY  — a live chat whose name resembles the client's. NEVER sent to on its
//             own; the operator is shown the chat and confirms it is the right
//             customer. Names repeat in this CRM (the client identity is the
//             phone, deliberately), so a name alone is a guess, and a wrong guess
//             puts one customer's price list in another customer's chat.

import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/phone";

export interface ReachableChat {
  conversationId: string;
  displayName: string;
  username: string | null;
  lastMessageAt: string;
}

export interface ReachResult {
  /** Send here with no SMS and no confirmation. */
  proven: ReachableChat | null;
  /** Show these to the operator and ask before sending. Never auto-sent. */
  likely: ReachableChat[];
}

/** More than a handful of maybes is not a shortlist, it is a search result. */
const MAX_LIKELY = 3;

/**
 * Names are compared on letters only, case-folded: «Азиз Дадамов» and
 * «азиз  дадамов.» are the same person typing in a hurry, and a Telegram display
 * name carries emoji, shop names and punctuation the CRM's copy never has.
 */
function nameKey(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

function toChat(c: {
  id: string;
  displayName: string;
  username: string | null;
  lastMessageAt: Date;
}): ReachableChat {
  return {
    conversationId: c.id,
    displayName: c.displayName,
    username: c.username,
    lastMessageAt: c.lastMessageAt.toISOString(),
  };
}

/**
 * Which live Telegram chat, if any, belongs to [rawPhone].
 *
 * Only chats with a `businessConnectionId` are ever returned: without one the bot
 * cannot send, so offering it would be offering a button that fails.
 */
export async function findReachableChats(rawPhone: string): Promise<ReachResult> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { proven: null, likely: [] };

  const live = { businessConnectionId: { not: null } } as const;

  // 1. PROVEN — the chat itself carries this phone. Written by the handoff token
  //    match and by a customer's own shared contact card; both are facts, not
  //    inferences.
  const byPhone = await prisma.conversation.findFirst({
    where: { ...live, sharedContactPhone: phone },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, displayName: true, username: true, lastMessageAt: true },
  });
  if (byPhone) return { proven: toChat(byPhone), likely: [] };

  const client = await prisma.client.findUnique({
    where: { phone },
    select: { id: true, name: true },
  });
  if (!client) return { proven: null, likely: [] };

  // 2. PROVEN — a quote already made in that chat was saved against this client.
  //    The operator linked them at the time; that is as good as a phone match.
  const byProject = await prisma.project.findFirst({
    where: { clientId: client.id, conversationId: { not: null }, conversation: { is: live } },
    orderBy: { createdAt: "desc" },
    select: {
      conversation: {
        select: { id: true, displayName: true, username: true, lastMessageAt: true },
      },
    },
  });
  if (byProject?.conversation) return { proven: toChat(byProject.conversation), likely: [] };

  // 3. LIKELY — same name, nothing more. Returned for a human to confirm.
  const key = nameKey(client.name);
  if (!key) return { proven: null, likely: [] };
  const candidates = await prisma.conversation.findMany({
    where: live,
    orderBy: { lastMessageAt: "desc" },
    // Bounded: this is a shortlist for a person to read, and the scan behind it
    // runs while an operator is standing there after a phone call.
    take: 200,
    select: { id: true, displayName: true, username: true, lastMessageAt: true },
  });
  const likely = candidates
    .filter((c) => {
      const k = nameKey(c.displayName);
      return k.length > 0 && (k === key || k.includes(key) || key.includes(k));
    })
    .slice(0, MAX_LIKELY)
    .map(toChat);

  return { proven: null, likely };
}
