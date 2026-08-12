# Inbox redesign — Campsite design system

**Date:** 2026-08-11
**Status:** Approved — implementing
**Reference:** https://styles.refero.design/style/5d8ad116-b3d8-4890-a969-5b856b35c678

## 1. Scope

Re-skin the Inbox tab (`/inbox`) in the Campsite style. Owner decisions:

- **Restyle, keep the chat layout** — conversation list → thread → composer stays.
- **Inbox only** — the rest of the CRM keeps its existing blue-grey theme.
- **Light AND dark** both supported.
- **Inter** is used inside the Inbox (the reference specifies it exclusively).

Non-goals: no behavioural change (send, AI handling, auto-lock, quote/drawing-to-chat,
voice, media all keep working), nothing outside `/inbox`, no data or API changes.

## 2. Why this is contained

The Inbox already carries its own theme: a full `--tg-*` token set (Telegram look)
with light and dark variants in `globals.css`, consumed only by Inbox components.
This redesign replaces that token set with `--inbox-*` Campsite tokens. The blast
radius is the Inbox subtree; no other screen reads these variables.

## 3. What the reference actually specifies

Extracted verbatim (two passes):

**Palette (light only).** Ink `#171717`, Graphite `#525252`, Steel `#737373`,
Silver `#a3a3a3`, Charcoal Card `#1e1e1e`, Warm Canvas `#fffdf9`, Pure White
`#ffffff`, Ash Mist `#f5f5f5`, Soft Fog `#f0f0f0`, Resolve Green `#22c55e`,
Alert Red `#ef4444`, Highlight Wash `#fef3c7`, Sienna Brand `#451a03`.

**Type.** Inter 400/500/600. Body 15px/1.56/-0.27px · Body-lg 18px/1.63 ·
Caption 11px/1.4 · Subheading 22px/500/1.4 · Heading 29px/600/1.33/-0.52px ·
Display 58px/600/1.2/-1.8px.

**Shape.** Pill `9999px` for buttons/tags/avatars; cards `12px`; images/inputs `8px`;
status badges `4px` with `4px 8px` padding.

**Spacing.** Base unit 4px. Card padding 16px, element gap 8px, section gap 64px,
page max-width 1200px. Scale: 4, 8, 12, 16, 20, 24, 32, 48, 64, 72, 80, 96, 160.

**Borders.** `1px` `#f0f0f0` on cards/inputs/sidebar; avatars get a `1px #ffffff` ring.

**Shadows (verbatim).**
```
--shadow-sm:        rgba(0,0,0,.05) 0 3px 6px -3px, rgba(0,0,0,.05) 0 2px 4px -2px,
                    rgba(0,0,0,.05) 0 1px 2px -1px, rgba(0,0,0,.05) 0 1px 1px -1px,
                    rgba(0,0,0,.05) 0 1px 0 -1px
--shadow-subtle:    rgba(0,0,0,.08) 0 1px 1px -1px, rgba(0,0,0,.08) 0 2px 2px -1px,
                    rgba(0,0,0,.06) 0 0 0 1px, #fff 0 1px 0 0 inset,
                    #fff 0 1px 2px 1px inset, rgba(0,0,0,.06) 0 1px 2px 0 inset
--shadow-subtle-2:  rgba(0,0,0,.05) 0 1px 2px 0
--shadow-subtle-4:  rgba(0,0,0,.1) 0 .5px 0 0 inset, rgba(0,0,0,.1) 0 2px 4px 0,
                    rgba(0,0,0,.1) 0 4px 12px 0, rgba(0,0,0,.02) 0 8px 20px 0
```

**Icons.** Small, filled, monochrome — Ink or `#737373`. Sizes not given.

**Core principle.** 98% achromatic. Colour only for function: green = resolved/
complete, red = destructive, amber wash = highlight.

## 4. What the reference does NOT specify — our extrapolations

Recorded explicitly so these read as our decisions, not the reference's:

1. **Dark palette — absent.** Campsite is light-only. We derive one that keeps its
   achromatic discipline: canvas `#141414`, panel `#1e1e1e` (the one dark value the
   reference gives), secondary `#262626`, divider `#2e2e2e`, text `#f5f5f5` /
   `#a3a3a3` / `#8a8a8a`. Functional green and red are unchanged across themes.
2. **Interactive states — absent.** Derived: hover = Ash Mist `#f5f5f5`, selected =
   Soft Fog `#f0f0f0`, disabled = Silver `#a3a3a3` text at 60% opacity. Dark mode
   mirrors these one step lighter than the panel.
3. **Focus rings — absent.** We keep a visible 2px Ink ring (white in dark) because
   removing focus indication would be an accessibility regression.
4. **Transitions — absent.** 150ms ease for colour/background only; no motion on
   layout, matching the system's restraint.
5. **Icon sizes — absent.** 16px in dense rows, 20px in the composer, monochrome per
   the reference.

## 5. Deliberate departure: outgoing bubbles lose their green

Today outgoing messages are green (`--tg-bubble-out: #effdde`). Campsite reserves
green strictly for *resolved* states, so outgoing bubbles become neutral (Ash Mist /
`#262626` dark) and green is freed for handled/resolved meaning. This is the single
most visible change and was flagged to the owner.

## 6. Typography in practice

Inter is loaded via `next/font/google` as `--font-inter` and applied only within the
Inbox subtree, so no other screen's typography changes. Numeric runs (timestamps,
quote sums) keep `font-variant-numeric: tabular-nums` so figures stay aligned, which
satisfies the repo's aligned-figures rule without importing the mono face into chat
text.

## 7. Structure — two phases

`src/app/(app)/inbox/InboxClient.tsx` is 1541 lines holding the lock gate,
conversation list, thread, composer and AI controls in one file.

**Phase 1 — extraction, ZERO visual change.** Split into `LockGate`,
`ConversationList`, `ThreadHeader`, `MessageThread`, `Composer`, `AiControls` under
`src/components/inbox/`. Verified by tsc + tests + build and by the Inbox behaving
identically. Nothing about the styling moves in this phase.

**Phase 2 — token swap + restyle** against the now-reviewable components.

Sequencing matters: doing both at once would make any regression impossible to
attribute between "I moved it" and "I restyled it".

## 8. Verification

Each phase: `tsc --noEmit` clean, full vitest suite green, production build compiles.
Phase 1 additionally requires that no styling changed. Phase 2 requires a visual pass
in BOTH themes, and confirmation that send, AI toggle, auto-lock, voice record/play,
image viewing, attachments, and quote/drawing-to-chat all still work.
