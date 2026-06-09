# Instagram → CRM Integration — Preparation Guide

**Goal:** receive and reply to **Instagram Direct Messages inside the CRM inbox**, with the
same AI sales agent that already runs on Telegram. This document is the **owner-side
preparation checklist** — the accounts, Meta app, permissions, verification, and tokens you
must set up *before* the code integration. The last section ("CRM side") is for the developer.

> ⚠️ **Meta renames menus often.** The exact button/label names below match Meta's UI as of
> early 2026 and may shift. When a step's wording differs, follow the *intent* and confirm
> against the official docs linked at the bottom. Don't be surprised by relabels — the flow is
> stable even when the names move.

---

## 0. How Instagram DM integration actually works (read once)

Unlike Telegram (one bot token, instant), Instagram DMs go through **Meta's Graph API** and
require **Meta's approval** before they work for real customers. The shape:

- **Inbound** (customer → us): Meta sends each new DM to a **webhook** (a public HTTPS URL on
  our server). Same idea as the Telegram webhook we already run.
- **Outbound** (us → customer): we call the **Graph API** `…/messages` endpoint with an access
  token. Same idea as our Telegram "send message".
- **The catch — the 24-hour rule:** you may reply freely only **within 24 hours** of the
  customer's last message. After 24h you can't send a normal message (only specific tagged
  message types). This is a Meta policy, not a CRM limit — the AI agent must answer promptly.
- **The catch — approval:** the messaging permission needs **App Review + Business
  Verification**. Until approved, only people added to the app (admins/testers) can DM it.

So preparation has two tracks that run in parallel:
1. **Accounts + app + tokens** (you can finish in a day).
2. **Business Verification + App Review** (Meta's review — can take **days to ~2 weeks**).

---

## 1. Prerequisites checklist

Tick all of these before starting:

- [ ] An **Instagram account** for the business (the one customers will DM).
- [ ] Admin access to the **business email / phone** (for verification codes).
- [ ] A **Facebook account** (personal is fine — it owns the developer app).
- [ ] A **Meta Business Portfolio** (Business Manager) — or willingness to create one.
- [ ] Business documents for verification (legal name, address, a utility bill / registration
      doc, a business phone/email or website) — **etalontbm.uz** helps here.
- [ ] Our server already serves **public HTTPS** (✅ we have this: `etalontbm.uz` via Caddy).

---

## 2. Part A — Instagram & Facebook account setup

1. **Convert Instagram to a Professional account**
   - Instagram app → **Settings → Account type and tools → Switch to professional account**.
   - Choose **Business** (recommended) or Creator. *Personal accounts cannot use the API.*

2. **Allow message access via the API**
   - Instagram app → **Settings → Messages and story replies → (Connected tools / Message
     controls)** → ensure **"Allow access to messages"** is **ON**.
   - Without this toggle, the API receives nothing even after approval.

3. **(Recommended) Link a Facebook Page**
   - The newer "Instagram Login" flow can work without a Page, but the **Facebook-Page flow is
     the most documented and stable**. Create/choose a Facebook Page for the business and link
     it: Instagram **Settings → Account → Sharing to other apps → Facebook**, or from the Page's
     **Linked accounts**.
   - Note the **Page name** — you'll select it during app setup.

4. **Create / confirm a Meta Business Portfolio**
   - Go to **business.facebook.com** → create a Business Portfolio if you don't have one.
   - Add the Instagram account and the Facebook Page to it (**Business settings → Accounts**).

---

## 3. Part B — Meta Developer app

1. Go to **developers.facebook.com** → log in with the Facebook account → **My Apps → Create App**.
2. **Use case:** choose the option about **messaging / Instagram** (recent UI: "Other" →
   **Business**, or a direct "Instagram" use case). The goal is an app that can add the
   **Instagram** product.
3. Fill in: **App name** (e.g. `Etalon CRM`), **contact email**, attach the **Business
   Portfolio** from Part A.
4. In the app dashboard → **Add product → Instagram** (the messaging product, sometimes shown
   as **"Instagram"** or **"Messenger → Instagram settings"**). Click **Set up**.
5. **App settings → Basic**, fill in (required for review):
   - [ ] **Privacy Policy URL** (a public page — can live on `etalontbm.uz/privacy`).
   - [ ] **App icon** (1024×1024).
   - [ ] **Category** (e.g. Business).
   - [ ] **Business use** / data handling questions.

---

## 4. Part C — Permissions (scopes) & tokens

**Permissions the integration needs** (names depend on which flow):

| Flow | Core messaging scopes |
|---|---|
| **Instagram Login** (newer) | `instagram_business_basic`, `instagram_business_manage_messages` |
| **Facebook Login + Page** (classic) | `instagram_basic`, `instagram_manage_messages`, `pages_manage_metadata`, `pages_messaging`, `pages_show_list` |

Steps:
1. In the Instagram product → **API setup / Generate token**: connect the Instagram
   professional account (and Page, in the classic flow) and **generate an access token**.
2. **Make it long-lived.** Short tokens expire in ~1 hour. Exchange for a **long-lived token**
   (~60 days) using the token-exchange endpoint, OR use the System User token from Business
   settings for a non-expiring server token (preferred for a CRM — see docs).
3. **Record these values** (you'll hand them to the developer — see Part F):
   - [ ] **Access token** (long-lived / system-user).
   - [ ] **Instagram account ID** (IG user id / IG Business Account id).
   - [ ] **Facebook Page ID** (classic flow only).
   - [ ] **App ID** and **App Secret** (App settings → Basic).

> 🔒 **Never paste tokens into chat, code, or screenshots.** They go into the CRM the same
> write-only way as the AI provider keys (a settings field or a server `.env`), and into a
> password manager as backup.

---

## 5. Part D — Webhooks

This is how inbound DMs reach the CRM (mirrors our Telegram webhook).

1. In the app → **Instagram product → Webhooks** (or **Messenger → Instagram Settings →
   Webhooks**).
2. **Callback URL:** the CRM endpoint we'll add —
   ```
   https://etalontbm.uz/api/instagram/webhook
   ```
3. **Verify token:** invent a random string (e.g. a 32-char secret). Meta sends it once to
   confirm we own the URL; the CRM echoes it back. **Record this** for Part F.
4. **Subscribe to fields:** at minimum **`messages`**. Optionally `messaging_postbacks`,
   `message_reactions`, `messaging_seen`.
5. **Subscribe the account:** after the URL verifies, **subscribe the Instagram account / Page**
   to the app (a separate "Add subscriptions" step — easy to miss; without it, the URL verifies
   but no messages arrive).

> The CRM endpoint doesn't exist yet — the developer adds it. You can complete every *other*
> step first; the webhook URL is verified last (once the endpoint is deployed).

---

## 6. Part E — Business Verification & App Review (the gate to go live)

Until this is done, **only people listed in the app** (App roles → Admins/Developers/Testers)
can DM the account and have the AI reply. To open it to **real customers**, you need:

1. **Business Verification** (Business settings → **Security Center / Business verification**):
   submit the legal business name, address, and a document (registration / utility bill) +
   confirm a business phone/email or domain. Meta verifies (often 1–3 days).
2. **App Review → request Advanced Access** for the messaging permission
   (`instagram_business_manage_messages` / `instagram_manage_messages`). You must submit:
   - [ ] A clear **description** of how the app uses DMs (customer support / sales replies).
   - [ ] A **screencast** showing: a user DMs the account → the message appears in the CRM →
         an agent/AI replies → the reply arrives in Instagram.
   - [ ] Confirmation the app complies with the **Platform Terms** and **24-hour policy**.
3. Submit and wait. Reviews can take **a few days to ~2 weeks**; expect possible back-and-forth.

> **Plan for this lead time.** Start verification + review **early**, because the code can be
> ready while Meta reviews. The integration is testable end-to-end with **test users** (app
> roles) during review.

---

## 7. Part F — Information to hand to the developer

When the above is done (or as you get each piece), give the developer these — **securely, not
in this chat**:

| Item | Where it comes from |
|---|---|
| App ID | App settings → Basic |
| App Secret | App settings → Basic |
| Long-lived / system-user **Access Token** | Part C |
| Instagram Account ID | Part C |
| Facebook Page ID (classic flow) | Part C |
| Webhook **Verify Token** (the string you invented) | Part D |
| Which flow you used (Instagram-Login vs Facebook-Page) | Part B/C |

These get stored **write-only** (a settings field or the server `.env`) exactly like the AI
provider keys — never committed to the repo.

---

## 8. CRM side — what the developer will build (for reference)

The CRM already has the full inbox + AI-agent pipeline for Telegram. Instagram **reuses all of
it**; only the channel adapter is new. Expected work:

- **Schema:** add `INSTAGRAM` to the `ConversationChannel` enum (`prisma/schema.prisma`,
  currently `TELEGRAM`-only). `Conversation.externalId` stores the Instagram sender id.
- **Inbound webhook:** new route `src/app/api/instagram/webhook/route.ts` — handles Meta's
  GET verify handshake + POST message events; normalizes them into the existing
  `Conversation`/`Message` models (mirrors `src/app/api/telegram/webhook/route.ts`). Add it to
  the middleware public-paths allowlist (like the Telegram webhook).
- **Outbound send:** an Instagram sender mirroring `sendBusinessReply` / `sendBusinessPhoto`
  (`src/lib/inbox-send.ts`) — POSTs to the Graph API `…/messages` endpoint with the token.
- **AI agent:** works unchanged — it's channel-agnostic; it already runs off the
  `Conversation`/`Message` records. The quote image send works the same.
- **Config:** the tokens/IDs/verify-token from Part F, stored write-only (env or a settings
  panel like `/agent` provider keys).
- **The 24-hour window:** the agent should reply promptly; flag conversations that fall outside
  the window for human follow-up.

Rough dev estimate once Meta access is granted: **~1–2 days** (webhook + send adapter + enum +
config + testing), because the inbox/agent/quote pipeline already exists.

---

## 9. Limitations & gotchas (know these up front)

- **24-hour messaging window** — the single biggest behavioral difference vs Telegram.
- **Professional account required** — personal IG accounts can't use the API.
- **One IG account per app** is the simple/clean setup; multiple accounts add complexity.
- **App Review screencast must be realistic** — reviewers reject vague submissions.
- **Token expiry** — use a long-lived or system-user token; short tokens die in ~1 hour.
- **Rate limits** — Graph API has per-app/per-user rate limits; fine for normal DM volume.
- **Story replies / reactions / shares** arrive as special message types — handle or ignore.
- **Caddy / HTTPS** — already in place; the webhook just needs the `/api/instagram/webhook`
  path routed to the app (same as `/api/telegram/webhook`).

---

## 10. Quick reference (official docs — verify against these)

- Instagram Platform overview: https://developers.facebook.com/docs/instagram-platform
- Instagram messaging (DMs): https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging-api
- Webhooks: https://developers.facebook.com/docs/instagram-platform/webhooks
- App Review & permissions: https://developers.facebook.com/docs/app-review
- Business Verification: https://www.facebook.com/business/help (Security Center)
- Graph API changelog (current version): https://developers.facebook.com/docs/graph-api/changelog

---

## TL;DR order of operations

1. IG → Professional account + allow message access. *(minutes)*
2. Link a Facebook Page + Business Portfolio. *(minutes)*
3. Create the Meta app + add the Instagram product + fill Basic settings (privacy URL, icon). *(~1 hour)*
4. Generate a long-lived access token; record App ID/Secret + IG/Page IDs. *(~30 min)*
5. **Start Business Verification + App Review now** (long lead time). *(days–weeks, in background)*
6. Tell the developer to add the webhook endpoint + send adapter + `INSTAGRAM` channel.
7. Set the webhook callback URL + verify token; subscribe to `messages`; subscribe the account.
8. Test with app-role users → once Meta approves, go live for real customers.
