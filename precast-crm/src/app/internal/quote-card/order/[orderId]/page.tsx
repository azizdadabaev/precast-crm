// Internal render target for an ORDER's share card — the sibling of the project and
// payload pages, and the same CalculationShareCard. Puppeteer (this process)
// navigates here and screenshots #quote-card, so the picture the Android app sends
// a customer is the picture the web sends, not a hand-mirrored copy of it.

import { notFound } from "next/navigation";
import { CalculationShareCard } from "@/components/share/CalculationShareCard";
import { loadTableDesignConfig } from "@/lib/table-design-config";
import { QUOTE_CARD_TOKEN } from "@/lib/agent/quote-card";
import { buildShareDataFromOrder } from "@/lib/order-share-card";

export const dynamic = "force-dynamic";

export default async function OrderCardRenderPage({
  params,
  searchParams,
}: {
  params: { orderId: string };
  searchParams: { k?: string };
}) {
  if (searchParams.k !== QUOTE_CARD_TOKEN) notFound();

  const data = await buildShareDataFromOrder(params.orderId);
  if (!data) notFound();

  const cfg = await loadTableDesignConfig();
  return (
    <div id="quote-card" style={{ display: "inline-block", background: "#ffffff" }}>
      <CalculationShareCard data={data} config={cfg} />
    </div>
  );
}
