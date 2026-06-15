# Delivery Location (Geolocation per Order) — Design

**Date:** 2026-06-15
**Status:** Approved (design) — pending spec review

## 1. Summary

Clients send a delivery location (usually a **Google Maps link via Telegram/WhatsApp**, sometimes a native Telegram location share). Today staff paste that link into the **comments** section, where it isn't even clickable and never reaches the driver. This feature gives delivery location a proper home:

- **Paste a Google Maps link → it auto-converts into a Google Maps preview card** (map + pin + Navigate + Copy link). This is the headline behavior.
- **Capture a native Telegram location share in one tap** from the CRM inbox (the webhook already extracts its coordinates).
- Store the pin per order (carried from the quote stage), surface it on the order + dispatch view, and let the dispatcher **share it to the driver** (drivers don't use the CRM).

The pin is for **office/dispatch staff** to act on and forward — drivers receive the link via Telegram/phone from the dispatcher.

## 2. Goals / Non-goals

**Goals**
- Paste a Google Maps link (full or short) → parsed to coordinates → Google Maps preview card.
- One-tap "Use as delivery location" from a Telegram inbox location/venue message.
- Interactive Google map preview + click/drag pin-picker for manual capture/correction.
- Store the pin on the order (carried from the project/quote stage); show it on order + dispatch views.
- Dispatcher actions: **Navigate** (open Google Maps), **Copy link**, optional **Send to chat**.
- Make existing comment URLs clickable, and offer to promote a map link already pasted in a comment to the delivery location.

**Non-goals**
- No driver-facing app/login (drivers stay off the CRM).
- No routing/ETA/live-tracking.
- No non-Google link providers in v1 (see §10 decision — Yandex/Apple deferred; parser is extensible).
- WhatsApp auto-capture is out of scope until the parked Baileys integration ships (its links still work via paste).

## 3. Decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| Ambition | Full logistics: pin + map preview + capture across surfaces |
| Map technology | **Google Maps JavaScript API** (interactive preview + picker) |
| Driver delivery | Drivers off-CRM; **dispatcher shares** the link (Telegram/phone) |
| Capture paths | **Both**: (A) paste a link, (B) one-tap from the Telegram inbox |
| Link providers (parser) | **Google Maps only** (full + short). Yandex/Apple/geo deferred; parser kept pluggable |

## 4. Data model

All fields nullable, additive (safe `prisma db push`, like the discount columns).

- **`Order`**: `deliveryLat Float?`, `deliveryLng Float?`, `deliveryLocationUrl String?` (original pasted/generated Google Maps link), `deliveryLocationLabel String?` (free note, e.g. "blue gate behind the school"). Canonical delivery pin.
- **`Project`**: the same four fields, so the pin is captured at the quote/calculator stage and **flows into the order at placement** (mirrors how the discount now carries).
- **`Client`** (optional, last phase): `lastDeliveryLat Float?`, `lastDeliveryLng Float?` — prefill a repeat customer's site.

Coordinates are the source of truth; `deliveryLocationUrl` is kept for provenance and the Copy/Navigate actions.

## 5. Link parsing (Path A)

A pure module `parseMapLink(input: string): { lat: number; lng: number } | null` plus a server step for short links.

- **Full Google Maps URLs** (client-parseable, regex): `?q=lat,lng`, `&ll=lat,lng`, `/@lat,lng,zoom`, `!3dlat!4dlng`.
- **Short Google links** (`maps.app.goo.gl/…`, `goo.gl/maps/…`): contain no coordinates → a **server endpoint follows the redirect once** to the full URL, then applies the regex. (No API key needed — it's an HTTP redirect fetch.)
- **Plain `lat, lng` text**: accepted as a fallback.
- Output validated to plausible ranges (lat −90..90, lng −180..180). Anything unrecognized → `null` → the UI shows "couldn't read this link — paste a Google Maps link or pick on the map."

The parser is structured as a list of provider matchers so **adding Yandex/Apple later is a localized change** (see §10).

## 6. Capture surfaces & the preview card

**Preview card component** (`DeliveryLocationCard`): a Google Maps JS API map centered on the pin, with **Navigate** (deep-link `https://www.google.com/maps?q=lat,lng`, opens the device's Google Maps), **Copy link**, and (when empty) a paste box + **"Pick on map"** click/drag picker. The picker writes `deliveryLat/Lng` and a generated `deliveryLocationUrl`.

Surfaces:
1. **Order detail page** — the card (view + add/edit/clear).
2. **Order placement / calculator flow** — capture into the **Project** so it carries into the order (same pattern as the discount).
3. **Telegram inbox (Path B)** — see §7.

**Google Maps JS API loading:** a small loader using a **referrer-restricted public key** (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`). Loaded only on pages that render the card (not globally). Setup + restriction notes in §9.

## 7. Telegram inbox capture (Path B)

The webhook already parses native location **and** venue messages into `lat/lng` ([parse.ts:91-99](../../../src/lib/telegram/parse.ts#L91)); `MediaKind.LOCATION` exists in the schema.

- Render a **location card** in the inbox conversation for `LOCATION` messages (today they likely show as a generic media row).
- Add a **"Use as delivery location"** button that writes the coords onto the conversation's linked **Project** (and/or the order if one exists). Reuses the existing inbox→calculator linkage (`sourceConversationId`).
- No link parsing needed for this path — coordinates are already structured.

WhatsApp: when the parked Baileys integration ships, its location messages flow through this same path; until then WhatsApp links use Path A.

## 8. Dispatch, sharing, and comments

**Dispatch / Logistics:**
- The `DeliveryLocationCard` also renders in the order's **Logistics Summary** (ЛОГИСТИКА ХУЛОСАСИ) and on the dispatch view.
- **Share to driver:** **Copy link** (paste into the driver's Telegram/SMS) + **Navigate**. Optional **Send to chat** reusing the existing Telegram send plumbing when the order's client is a linked inbox conversation (`tgSendBusinessLocation` can even send a native pin).

**Comments cleanup (closes the original workaround):**
- **Linkify URLs** in `CommentThread` rendering (today only `@mentions` are linkified) so any pasted link becomes clickable.
- When a comment body contains a recognizable Google Maps link and the order/project has **no** delivery pin yet, show a one-tap **"Set as delivery location"** affordance on that comment. (A light, opt-in promotion — no silent backfill.)

## 9. Google Maps API key & ops

- **Public JS key** `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` — HTTP-referrer-restricted to the prod domain (`etalontbm.uz`) + localhost for dev, and restricted to the Maps JavaScript API. Billing must be enabled on the Google Cloud project.
- Short-link **redirect resolution** is a plain server-side fetch (no key).
- **Navigate** deep-links need no key.
- Document the key in `.env` (not committed) and the setup steps in the plan. If the key is absent, the card degrades to "paste link / Copy / Navigate" without the interactive map (graceful).

## 10. Open decisions / assumptions

- **Google-only parser (operator's choice).** Yandex Maps is common in Uzbekistan; the operator chose Google-only for v1. The parser is a provider list, so adding Yandex/Apple/`geo:` later is a small, localized change. If Yandex links appear in practice, revisit.
- **Pin lives on Order, carried from Project.** Repeat-customer `Client` default is the last, optional phase.
- **Drivers stay off-CRM**; sharing is dispatcher-driven (Copy link / Send to chat).

## 11. Phased build order (scope is full; this is sequencing)

1. **Phase 1 — Paste → preview card (the headline).** Data model on Order+Project · `parseMapLink` + short-link resolver endpoint · `DeliveryLocationCard` (Google JS map, Navigate, Copy, paste box, pick-on-map) · order detail capture/display.
2. **Phase 2 — Quote→order carry + dispatch/share.** Capture in the placement/calculator flow (Project → Order) · card in Logistics Summary + dispatch view · Send-to-chat.
3. **Phase 3 — Inbox + comments + client default.** Telegram inbox location card + "Use as delivery location" (Path B) · comment URL linkify + "Set as delivery location" promotion · optional Client last-location prefill.

Each phase is independently shippable and useful on its own.

## 12. Build status & remaining work (as of 2026-06-15)

**Done + deployed (Phase 1) / committed (Phase 2 + comments):**
- Phase 1 — schema fields on `Order`+`Project`; `parseMapLink` + `isGoogleShortLinkHost`
  (`src/lib/geo/parse-map-link.ts`); SSRF-guarded resolver `POST /api/geo/resolve-link`;
  `PATCH /api/orders/[id]/delivery-location`; `DeliveryLocationCard`
  (`src/components/logistics/DeliveryLocationCard.tsx`) + `useGoogleMaps` loader (graceful
  degrade when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is absent); card on the order detail page.
- Phase 2 — `PATCH /api/projects/[id]/delivery-location`; card on the project detail page;
  carry Project→Order in `src/lib/create-order.ts` (the canonical create path; the agent
  place-order path inherits it).
- Comments — URL linkify via `src/components/comments/parse-comment.ts` (used by
  `CommentThread.renderBody`); pasted map links are now clickable.

**Remaining (deferred to a fresh session — groundwork below):**

1. **Telegram inbox "Use as delivery location" (Path B).** No schema change needed — location
   coordinates are already persisted in `Message.mediaMeta` (`{ lat, lng, title? }`) by the
   webhook, and `src/components/inbox/MediaRenderers.tsx` already renders the `LOCATION` case
   (map texture + a maps link). To finish:
   - Add an optional `onUseLocation?: (lat:number,lng:number) => void` prop to `MessageMedia`
     and render a "Use as delivery location" button in the `LOCATION` case when provided.
   - Thread the callback from the conversation view down to `MessageMedia`.
   - New endpoint `POST /api/inbox/[conversationId]/use-location` (gate `inbox.access`):
     read `{lat,lng}`, find the draft `Project` linked by `conversationId` (most recent
     `status=DRAFT`), set its delivery pin (reuse the project delivery-location update); if an
     order already exists for that project, set it there too. Returns the updated target.
   - The "Set as delivery location" promotion on a comment that contains a maps link is a
     small follow-on (parse-comment already classifies `link` tokens): pass an
     `onUseLink?(url)` from the order/project page that resolves via `/api/geo/resolve-link`
     and saves; show it only when no pin exists yet and the user can edit.

2. **Client default prefill (optional, last).** Add `lastDeliveryLat Float?` /
   `lastDeliveryLng Float?` to `Client` (additive `prisma db push`); on order placement, also
   update the client's last location; prefill the `DeliveryLocationCard` capture UI from it
   for repeat customers.

**Operator setup (no code):** add a billing-enabled `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
(referrer-restricted to the prod domain + the Maps JavaScript API) so the interactive map
renders; everything else (paste/parse/Copy/Navigate/save) works without it.
