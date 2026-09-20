// Internal render target for a quote card built from a POSTed payload rather than
// from a saved Project — the Android calculator's «Юбориш».
//
// Same shape as the sibling `[projectId]` page and for the same reason: puppeteer
// (in this very process) navigates here and screenshots #quote-card, so the phone
// receives the SAME CalculationShareCard the web operator sends and the two can
// never drift. Gated by the same in-process token, plus a nonce that only the POST
// that parked the payload has ever seen.

import { notFound } from "next/navigation";
import { CalculationShareCard } from "@/components/share/CalculationShareCard";
import { loadTableDesignConfig } from "@/lib/table-design-config";
import { QUOTE_CARD_TOKEN } from "@/lib/agent/quote-card";
import { readQuoteCardPayload } from "@/lib/quote-card-payload";

export const dynamic = "force-dynamic";

export default async function QuoteCardPayloadRenderPage({
  params,
  searchParams,
}: {
  params: { nonce: string };
  searchParams: { k?: string };
}) {
  if (searchParams.k !== QUOTE_CARD_TOKEN) notFound();

  const data = readQuoteCardPayload(params.nonce);
  if (!data) notFound();

  const cfg = await loadTableDesignConfig();

  // inline-block + white bg so the screenshotted element hugs the card exactly.
  return (
    <div id="quote-card" style={{ display: "inline-block", background: "#ffffff" }}>
      <CalculationShareCard data={data} config={cfg} />
    </div>
  );
}
