// Internal render target for the agent's headless quote-card screenshot.
//
// NOT a user-facing page: puppeteer (same process) navigates here and screenshots
// the #quote-card element. Gated by an in-process token (QUOTE_CARD_TOKEN) and
// allow-listed in middleware, so it isn't behind the login wall but also can't be
// fetched by guessing a project id. Renders the SAME CalculationShareCard the
// operator's "Send to chat" uses → the agent image is pixel-identical.

import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { CalculationShareCard } from "@/components/share/CalculationShareCard";
import { loadTableDesignConfig } from "@/lib/table-design-config";
import { QUOTE_CARD_TOKEN, buildShareDataFromProject } from "@/lib/agent/quote-card";

export const dynamic = "force-dynamic";

export default async function QuoteCardRenderPage({
  params,
  searchParams,
}: {
  params: { projectId: string };
  searchParams: { k?: string };
}) {
  if (searchParams.k !== QUOTE_CARD_TOKEN) notFound();

  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: {
      draftNumber: true,
      name: true,
      tentativeClientName: true,
      tentativeClientPhone: true,
      tentativeClientAddress: true,
      client: { select: { name: true, phone: true, address: true } },
      calculations: {
        orderBy: { seq: "asc" },
        select: {
          name: true,
          innerWidth: true,
          innerLength: true,
          bearing: true,
          pattern: true,
          patternAuto: true,
          beamLength: true,
          blocksPerRow: true,
          blockRows: true,
          totalBlocks: true,
          beamCount: true,
          monolithLength: true,
          monolithArea: true,
          m2Price: true,
          subtotal: true,
        },
      },
    },
  });
  if (!project) notFound();

  const cfg = await loadTableDesignConfig();
  const data = buildShareDataFromProject(project);

  // inline-block + white bg so the screenshotted element hugs the card exactly.
  return (
    <div id="quote-card" style={{ display: "inline-block", background: "#ffffff" }}>
      <CalculationShareCard data={data} config={cfg} />
    </div>
  );
}
