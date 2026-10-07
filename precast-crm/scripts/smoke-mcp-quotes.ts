/**
 * LOCAL end-to-end smoke for the MCP quote tools (spec 2026-10-07): calls
 * /api/mcp over HTTP exactly like Claude does, then checks the database.
 *
 *   npx next dev -p 3217                  # local DB only
 *   BASE_URL=http://localhost:3217 npx tsx scripts/smoke-mcp-quotes.ts
 *
 * Refuses to run unless BASE_URL and .env's DATABASE_URL are localhost. Writes
 * test drafts and quotes (and one gazoblok catalog row if none exists).
 */
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE_URL ?? "http://localhost:3217";
const env = readFileSync(".env", "utf8");
const envVal = (k: string) => (env.split(/\r?\n/).find((l) => l.startsWith(`${k}=`)) ?? "").slice(k.length + 1).replace(/^"|"$/g, "");
if (!BASE.startsWith("http://localhost") || !envVal("DATABASE_URL").includes("@localhost") || !(process.env.DATABASE_URL ?? envVal("DATABASE_URL")).includes("@localhost")) {
  console.error("Refusing: smoke runs only against localhost with a localhost DATABASE_URL.");
  process.exit(2);
}
const TOKEN = envVal("MCP_API_TOKEN");
const prisma = new PrismaClient();

let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) console.log(`PASS  ${name}`);
  else { failures += 1; console.log(`FAIL  ${name}`, detail === undefined ? "" : JSON.stringify(detail).slice(0, 400)); }
};

type Content = { type: string; text?: string; data?: string; mimeType?: string };
type CallResult = { content: Content[]; isError?: boolean };
let rpcId = 0;
async function rpc(method: string, params: unknown): Promise<{ result?: unknown; error?: unknown }> {
  const r = await fetch(`${BASE}/api/mcp`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
  });
  const text = await r.text();
  const data = text.trim().startsWith("{") ? text : text.split("\n").filter((l) => l.startsWith("data:")).map((l) => l.slice(5)).join("");
  return JSON.parse(data);
}
async function call(name: string, args: unknown): Promise<CallResult> {
  const res = await rpc("tools/call", { name, arguments: args });
  if (res.error) throw new Error(`${name}: ${JSON.stringify(res.error)}`);
  return res.result as CallResult;
}
/** The JSON body of a successful call, or the error envelope of a failed one. */
function body(r: CallResult): Record<string, any> {
  const txt = r.content.find((c) => c.type === "text" && c.text?.startsWith("```json"))?.text;
  if (txt) return JSON.parse(txt.replace(/^```json\n/, "").replace(/\n```$/, ""));
  return JSON.parse(r.content[0].text ?? "{}");
}

async function main() {
  const tools = (await rpc("tools/list", {})).result as { tools: Array<{ name: string }> };
  const names = tools.tools.map((t) => t.name);
  check("tools/list has the four quote tools", ["get_quote", "get_gazoblok_quote", "get_quote_by_id", "render_quote_image"].every((n) => names.includes(n)), names);

  // 1. The 4 × 6 example.
  const ref = `smoke_${Date.now()}`;
  const q1 = body(await call("get_quote", { rooms: [{ width_m: 4, length_m: 6 }], customer_ref: `@${ref}`, lang: "en" }));
  check("4 × 6 m → 3 749 600 UZS, 11 beams, 200 blocks", q1.totals?.total_price === 3749600 && q1.rooms?.[0]?.beam_count === 11 && q1.totals?.block_count === 200, q1.totals);
  check("quote is active, no expiry, source claude_mcp", q1.status === "active" && q1.validity === "until_withdrawn" && q1.source === "claude_mcp" && !("valid_until" in q1), q1);
  const draft = await prisma.project.findFirst({ where: { draftNumber: q1.draft_number }, include: { calculations: true } });
  check("saved as an AI draft named Claude · Instagram with one room at 3 749 600", !!draft && draft.aiGenerated && draft.status === "DRAFT" && (draft.name ?? "").startsWith("Claude · Instagram") && draft.calculations.length === 1 && Number(draft.calculations[0].subtotal) === 3749600, draft && { name: draft.name, ai: draft.aiGenerated, calcs: draft.calculations.length });
  check("customer_ref normalised (no @, lowercase)", q1.customer_ref === ref.toLowerCase(), q1.customer_ref);

  // 2. Same customer re-quotes → same draft, old quote superseded but unchanged.
  const q2 = body(await call("get_quote", { rooms: [{ width_m: 4, length_m: 7 }], customer_ref: ref.toUpperCase() }));
  check("re-quote for the same customer refreshes the same draft", q2.draft_number === q1.draft_number && q2.supersedes === q1.quote_id, { q1: q1.quote_id, q2: q2.quote_id, d1: q1.draft_number, d2: q2.draft_number, sup: q2.supersedes });
  const back1 = body(await call("get_quote_by_id", { quote_id: q1.quote_id }));
  check("old quote reads back superseded, pointing to the new one, with its original price", back1.status === "superseded" && back1.superseded_by === q2.quote_id && back1.totals?.total_price === 3749600, { status: back1.status, by: back1.superseded_by, total: back1.totals?.total_price });
  const refused = await call("render_quote_image", { quote_id: q1.quote_id });
  check("render refuses a superseded quote", refused.isError === true && body(refused).error_code === "QUOTE_SUPERSEDED", body(refused));

  // 3. Orientation.
  const auto = body(await call("get_quote", { rooms: [{ width_m: 6, length_m: 4 }] }));
  const given = body(await call("get_quote", { rooms: [{ width_m: 6, length_m: 4 }], orientation: "as_given" }));
  check("auto 6 × 4 = 4 × 6 price, short side", auto.totals?.total_price === 3749600 && auto.rooms?.[0]?.beams_span === "short_side", auto.rooms?.[0]);
  check("as_given 6 × 4 → long side, 4 604 040, prop", given.totals?.total_price === 4604040 && given.rooms?.[0]?.beams_span === "long_side" && given.rooms?.[0]?.needs_prop === true, given.rooms?.[0]);

  // 4. Over 6.30 m → not priced, not saved.
  const big = body(await call("get_quote", { rooms: [{ name: "Zal", width_m: 7, length_m: 8 }] }));
  check("7 × 8 m → needs_manual_review, nothing saved", big.quote_id === null && big.status === "not_saved" && big.rooms?.[0]?.status === "needs_manual_review", big);

  // 5. Error envelope.
  const bad = await call("get_quote", { rooms: [{ width_m: 13, length_m: 5 }] });
  check("width 13 m → WIDTH_OUT_OF_RANGE error", bad.isError === true && body(bad).error_code === "WIDTH_OUT_OF_RANGE", body(bad));
  const missing = await call("get_quote_by_id", { quote_id: "Q-999999" });
  check("unknown quote → QUOTE_NOT_FOUND", missing.isError === true && body(missing).error_code === "QUOTE_NOT_FOUND", body(missing));

  // 6. Image for the active quote.
  const img = await call("render_quote_image", { quote_id: q2.quote_id });
  const png = img.content.find((c) => c.type === "image");
  check("render_quote_image returns a PNG", !img.isError && png?.mimeType === "image/png" && (png?.data?.length ?? 0) > 1000, img.isError ? body(img) : png?.mimeType);
  // A download link too, so Claude can attach the card in an Instagram chat.
  const link = img.isError ? "" : String(body(img).download_url ?? "");
  const linkPath = link.replace(/^https?:\/\/[^/]+/, "");
  check("…and an unguessable download_url under /uploads/quote-cards/", /^https?:\/\/[^/]+\/uploads\/quote-cards\/[0-9a-f]{32}\.png$/.test(link), link);
  // In production Caddy serves /uploads publicly before Next sees it; locally
  // there is no Caddy (Next's login gate would answer), so check the saved file.
  const saved = linkPath ? readFileSync(`public${linkPath}`) : Buffer.alloc(0);
  check("…pointing at the saved PNG file", saved.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), saved.length);

  // 7. Staff deletes the draft → withdrawn.
  await prisma.project.delete({ where: { draftNumber: q2.draft_number } });
  const back2 = body(await call("get_quote_by_id", { quote_id: q2.quote_id }));
  check("draft deleted → quote withdrawn", back2.status === "withdrawn", back2.status);
  const wd = await call("render_quote_image", { quote_id: q2.quote_id });
  check("render refuses a withdrawn quote", wd.isError === true && body(wd).error_code === "QUOTE_WITHDRAWN", body(wd));

  // 8. Gazoblok.
  if (!(await prisma.gazoblokProduct.findFirst({ where: { active: true } }))) {
    await prisma.gazoblokProduct.create({ data: { label: "600×300×200", lengthM: 0.6, heightM: 0.3, thicknessM: 0.2, pricePerBlock: 9500, seq: 1 } });
  }
  const prod = await prisma.gazoblokProduct.findFirstOrThrow({ where: { active: true }, orderBy: { seq: "asc" } });
  const g = body(await call("get_gazoblok_quote", { size: prod.label, quantity_blocks: 100, district: "Янгиқўрғон тумани", grade: "D600" }));
  check("gazoblok: 100 blocks priced per size, delivery included in Yangiqo'rg'on", g.blocks === 100 && g.total_price === Math.round(100 * Number(prod.pricePerBlock)) && g.delivery_included === true && typeof g.quote_id === "string" && g.grade === "D600", g);
  const gBack = body(await call("get_quote_by_id", { quote_id: g.quote_id }));
  check("gazoblok quote reads back active", gBack.status === "active" && gBack.total_price === g.total_price, gBack.status);

  // 9. Audit trail.
  const audits = await prisma.auditLog.count({ where: { action: { startsWith: "mcp." } } });
  check("every call is audited (mcp.* rows exist)", audits >= 10, audits);

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
