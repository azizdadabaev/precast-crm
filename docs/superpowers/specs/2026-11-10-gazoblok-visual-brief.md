# Gazoblok visual reconstruction — brief and process for the design agents

Date: 2026-11-10 · Owner: EtalonSlabs · Runs as a separate agent, in parallel with Stage 1 engineering.
Owner's words: "i need visual reconstruction as well, as a seperate agent run."

## 1. What this is

The gazoblok section of the EtalonSlabs CRM is being renovated
(`docs/superpowers/specs/2026-11-10-gazoblok-renovation-design.md`). Engineering fixes the logic in stages; this run
designs **how every gazoblok screen should look and read** after the renovation, so the engineers implement a designed
target instead of improvising. Output is **design comps, not product code**.

## 2. Inputs (read first)

1. `C:\Users\aziz\Downloads\gazoblok-renovation-research-2026-10-20.md` — especially Appendix D (usability walkthrough:
   English mixed into Uzbek, confusing delivery/cancel buttons, phone-width sideways scroll, 44 px targets, cancelled
   orders still showing "awaiting payment") and Appendix C (feature gaps vs beam-and-block).
2. The renovation design above — §2 owner decisions and §4 Stage 1 (ordered / loaded / left, over-load debt with the
   selling operator, close short, refund owed, who·what·when history, permissions).
3. `C:\Users\aziz\Downloads\CLAUDE.md` §3 and §7 — the CRM's language and design rules (binding).
4. The live code for real tokens and patterns: `precast-crm/src/app/globals.css` (theme tokens, light + `data-theme=dark`),
   `tailwind.config.*`, `src/components/ui/*`, beam-and-block screens `src/app/(app)/orders/**` and the dashboard
   `src/components/dashboard/**` — gazoblok must look like the same product.

## 3. Rules (binding)

- **Language:** every visible string in Uzbek Cyrillic. No English, no Latin Uzbek, no Russian. Numbers `1 554`,
  `4,90`, currency `UZS`, units `та`, `м³`, `м²`.
- **Numbers:** tabular mono figures in every numeric column; money right-aligned.
- **Theme:** only the real tokens from `globals.css` (`--background`, `--card`, `--muted`, `--primary`, `--success`,
  `--warning`, `--destructive`, …). Light **and** dark, both legible.
- **Payment states** keep fixed meaning: paid = success/green family, partial = accent, pending = muted; refund owed and
  over-load debt use the warning/destructive pair consistently.
- **Editorial / data-magazine** look: strong type hierarchy, whitespace, restrained colour; no gradients, no emoji, no
  decorative icons, no "card with coloured left border" cliché.
- **Touch:** hit targets ≥ 44 px; phone width 412 px must not scroll sideways.
- **Real content:** realistic but clearly fake data (client «Тест Мижоз», sizes like 600×300×200, 200 / 168 / 32 blocks).

## 4. Screens to design

Stage 1 (needed first — engineering builds these now, comps guide the finish):
1. **Order detail** — header (number, client, selling operator, status, payment state); per-size table
   **буюртма / юкланди / қолди / ортиқча**; trucks (shipments) with load / correct / deliver; **over-load debt block**
   (extra blocks, extra UZS, unpaid part, selling operator); **refund owed** block; **history** «Ким · нима · сана вақт».
2. **Over-load confirm dialog** — «Буюртмадан ортиқ: +N та · +X UZS. Мижоз қарзи шунча ошади.»
3. **Close short dialog** — loaded vs ordered per size, new total, reason field.
4. **Cancel dialog** — only when nothing loaded; distinct wording from closing a delivery dialog.
5. **Orders list** — status + payment chips, over-load / refund flags, phone layout without sideways scroll.

Stage 2–3 (direction now, detail later):
6. **Gazoblok dashboard** (own, separate from beam-and-block): revenue, receivables, over-load debt per selling operator,
   stock by size with low-stock, today's trucks.
7. **New order + wall calculator** and **Reorder** (start a new order for the same client from a previous one).
8. **Stock** (with history) and **production** screens.

## 5. Process

1. **Load the `impeccable` skill** (owner's routing rule: impeccable = CRM UI) and follow it.
2. **Audit the current screens.** Log in to the local test app at `http://localhost:3105` (name «Admin», PIN «1234» —
   seed data on an isolated test database, never production). If gazoblok has no data, create clearly fake products and
   orders through the app's own screens. Screenshot every gazoblok screen at 1440 and 412 wide, light and dark.
   Note what breaks the rules in §3.
3. **Study the beam-and-block equivalents** (orders list, order detail, dashboard) so gazoblok reuses their patterns.
4. **Write the direction** (one page): layout principles, type scale, how the four quantities and the debt/refund
   states are shown, what is reused from beam-and-block.
5. **Build the comps** as static HTML pages that load the app's real tokens and fonts (copy the token values from
   `globals.css` into the comp's stylesheet), one page per screen in §4, each switchable light/dark.
6. **Export** PNG screenshots of every comp: 1440 and 412 wide, light and dark.
7. **Check your own work** against §3 and §4 before reporting (no outside gate): every string Uzbek, every number
   tabular, every state from §4 present, no sideways scroll at 412.
8. **Report** the files, the main design decisions, and any questions only the owner can answer.

## 6. Where things go and what not to touch

- All output in `C:\Users\aziz\Downloads\gazoblok-visual\` (`audit/`, `direction.md`, `comps/*.html`, `png/`).
- **Do not** edit product code, commit, push, deploy, change branches or worktrees, or stop the server on port 3105.
- The only data you may create is clearly fake gazoblok test data through the app at `localhost:3105`.
