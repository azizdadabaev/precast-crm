# Multi-Operator Telegram Inbox — Feasibility / Parked Design

> **Status: PARKED (not started).** Decision 2026-06-04: the owner will run the
> inbox on his **own** Telegram Premium account only, for now. Operators pushed
> back on paying ~$30/yr Premium each ("manual file-sending is fine"). Revisit
> when the owner decides the centralized-record value is worth the spend.
>
> **Reach for this doc when:** the owner says he wants to onboard other operators'
> Telegram accounts into the CRM inbox. It captures the full feasibility study so
> we can jump straight to a design/plan without re-brainstorming.

---

## The idea

Three operators each talk to clients on **their own** personal Telegram. Goal:
each operator signs into the CRM and sees **their own** Telegram conversations
(drawings, addresses, requests) inside the inbox, and can reply/send quotes &
PDFs back — exactly like the owner's current single-account setup, but fully
isolated per operator. The owner only sees his own account; each operator only
sees theirs.

## Direct answer to "shared bot or own bots + Premium?"

- **Shared bot: YES.** One Telegram bot connects to *many* Telegram Business
  accounts simultaneously. Each connection has its own `business_connection_id`,
  and every update carries it, so the server demuxes by operator. **No new bots,
  tokens, or webhooks** — operators connect the existing `@bot`.
- **Premium: YES, one per operator.** Connecting a chatbot to an account is a
  *Telegram Business* feature, and Business is bundled into *Telegram Premium*.
  Each operator's personal account must have Premium. The **bot** is free; the
  **human accounts** each need Premium (~$30/yr regional, ~$2.50/mo).
- **Cost model:** 1 bot (free, shared) + N Premium subs. For 3 operators ≈
  **$90/yr total** — a rounding error for the business; it should be a company
  expense, not an operator out-of-pocket cost.

## How it maps onto the current codebase

Already in place (≈80% of the plumbing):
- `Conversation.businessConnectionId` is stored **per row**
  ([prisma/schema.prisma:1077](../../../prisma/schema.prisma#L1077)).
- Send helpers are parameterized by connection id
  ([src/lib/telegram/api.ts](../../../src/lib/telegram/api.ts) — `tgSendBusiness*`).
- `outgoing` detection already mirrors messages an operator types **on their own
  phone** ([src/lib/telegram/parse.ts](../../../src/lib/telegram/parse.ts)).
- Single webhook; demux-in-code is fine
  ([src/app/api/telegram/webhook/route.ts](../../../src/app/api/telegram/webhook/route.ts)).

Needs to be built:
1. **`operatorId` on `Conversation`** (FK to `User`).
2. ⚠️ **Schema landmine:** `Conversation` is uniquely keyed `[channel, externalId]`
   *globally* ([schema.prisma:1088](../../../prisma/schema.prisma#L1088)). Two
   operators chatting with the **same** customer would collide. Change to
   `[channel, operatorId, externalId]`.
3. **Webhook: handle `business_connection` connect/disconnect events** (not parsed
   today). On connect, capture the operator's stable Telegram **user id** + rights
   + current `business_connection_id`. Anchor the operator mapping on the user id
   (the connection id can change on reconnect).
4. **Operator link table:** Telegram user id ↔ CRM user ↔ current
   `business_connection_id` ↔ enabled/rights.
5. **Row-level scoping** on every inbox endpoint (list / thread / reply /
   reply-photo / reply-voice / reply-document / projects) — today they are NOT
   scoped; they assume a single owner inbox.
6. **Media gating (mandatory now).** Inbox media is served from a public
   `/uploads/inbox/<conversationId>/…` URL. With multiple operators, operator B
   could fetch operator A's client media by guessing URLs. Gate behind auth +
   ownership. (Already on the hardening list; multi-operator makes it required.)
7. **SSE scoping** — `emitInbox` / the inbox stream must filter per operator.
8. **Onboarding flow** — operator connects the bot to their Business account →
   `business_connection` event arrives → admin assigns it to the CRM operator
   account (or a one-time link code).
9. **Migration** — assign existing conversations `operatorId = owner`.

## Pros

- Operators keep their **existing client relationships** (clients already message
  them); no "everyone re-add a new bot/number."
- Marginal cost ≈ Premium only; one bot, one server, one codebase serve all.
- **Continuity:** client history lives in the CRM, not trapped on a personal phone
  — survives an operator leaving / phone loss.
- Strict per-operator isolation (matches the owner's "only my own" requirement).
- Incremental, not a rewrite — the proven hard parts (Business connections,
  per-connection send, media staging→file_id) already exist.

## Cons / risks

- Recurring N × Premium cost.
- **Data governance:** the bot + server can read/send on each operator's client
  chats; PII flows through company infra. Define who owns the leads/chats if an
  operator leaves.
- **Single point of failure:** if the shared bot is banned / token revoked, **all**
  operators go dark at once.
- Operator self-management: each must enable Business, connect the bot, grant
  reply rights; a lapsed-Premium / disconnected operator silently stops receiving
  → need a "connection lost" alert.
- More attack surface: an isolation bug leaks one operator's chats to another —
  must be carefully tested.

## Subtle gotchas

1. **Chat-scope privacy.** On connect, Telegram lets the operator choose which
   chats the bot sees: all 1-1 / contacts only / non-contacts only / specific.
   "All chats" mirrors every client **and** every personal 1-1 chat; "non-contacts
   only" protects privacy but misses saved-as-contact clients. Needs a house rule.
2. **Group chats & channels are never covered** — Business bots see only 1-1
   private chats.
3. **`business_connection_id` changes on reconnect** — map on the stable user id.
4. **Shared rate limits** — one bot's API budget across all operators; irrelevant
   at 3, matters at ~20+.
5. **Media still needs the staging-channel→file_id workaround** (business
   connections reject fresh uploads). One shared staging channel is fine; file_ids
   are bot-global so reusable.

## Premium-free alternative (and why it doesn't fit)

Customers message the **bot directly** (`@CompanyBot`) instead of operators'
personal accounts → plain bot, no Business/Premium for anyone. But customers then
talk to a faceless company bot and you lose the operators' existing personal
client relationships — which is the whole premise. Only fits *new* inbound, not
preserving what operators already have.

## Open questions to resolve before designing

1. **Oversight:** strictly per-operator only, or an owner "see everything" view?
2. **Who pays/manages** the Premium subs — company centrally (recommended) or each
   operator?
3. **Mirror scope** per operator: all 1-1 chats vs non-contacts only (gotcha #1)?
4. **Off-boarding:** when an operator leaves — archive / reassign / delete their
   conversations?
5. **Surface:** do operators get the calculator/orders/drawings too, or inbox-only?
   (Drives permission design.)

## Recommended rollout (when greenlit)

Company-paid **pilot with one willing operator** first — prove continuity + clean
records on one account before rolling to all three. Low cost, low risk, reversible.

## Verdict

**Highly feasible, medium effort** — a focused multi-day feature, not a rewrite.
No new Telegram capability is required beyond what the CRM already runs; the work
is "add an operator dimension + lock down isolation." Recurring cost is purely the
Premium subscriptions.
