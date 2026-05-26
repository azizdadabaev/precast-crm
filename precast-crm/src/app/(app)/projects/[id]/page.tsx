"use client";

import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/fetcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, FileText } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { ShareCalculationButton } from "@/components/ShareCalculationButton";
import { ShareTarget, type ShareData } from "@/components/share/CalculationShareCard";
import { SendToBlenderButton } from "@/components/blender-bridge/SendToBlenderButton";
import { DrawingsSection } from "@/components/blender-bridge/DrawingsSection";
import { formatDraftNumber } from "@/lib/draft-number";
import { useT } from "@/lib/i18n";
import { CommentThread } from "@/components/comments/CommentThread";

interface Project {
  id: string;
  name: string | null;
  draftNumber: number | null;
  shapeType: string;
  status: "DRAFT" | "ORDERED" | "ARCHIVED";
  dimensions: { width?: number; length?: number; widths?: number[] };
  createdAt: string;
  // tentative client info (when no Client linked yet)
  tentativeClientName: string | null;
  tentativeClientPhone: string | null;
  tentativeClientAddress: string | null;
  // hardened client (set when ordered or matched on phone)
  client: { id: string; name: string; phone: string; address: string | null } | null;
  // related orders (one per project for now)
  orders: Array<{ id: string; orderNumber: string; status: string; scheduledAt: string }>;
  calculations: Array<{
    id: string;
    name: string | null;
    innerWidth: string;
    innerLength: string;
    bearing: string;
    pattern: "GB" | "BGB" | "GBG";
    patternAuto: "GB" | "BGB" | "GBG";
    beamLength: string;
    blocksPerRow: number;
    beamCount: number;
    blockRows: number;
    totalBlocks: number;
    monolithLength: string;
    billedLength: string;
    monolithArea: string;
    billedArea: string;
    concreteVolume: string;
    m2Price: string;
    extraBeamPricePerM: string;
    m2Cost: string;
    patternExtraCost: string;
    manualExtraBeamsCost: string;
    subtotal: string;
    createdAt: string;
  }>;
}

const PATTERN_LABEL: Record<"GB" | "BGB" | "GBG", string> = {
  GB: "Г-Б",
  BGB: "Б-Г-Б",
  GBG: "Г-Б-Г",
};

export default function ProjectDetailPage() {
  const t = useT();
  const params = useParams<{ id: string }>();
  // Owner-only Blender bridge gate.
  const { data: me } = useQuery<{ permissions: string[] }>({
    queryKey: ["me"],
    queryFn: () => api("/api/auth/me"),
  });
  const canUseBlender = me?.permissions?.includes("blender.bridge") ?? false;
  /** Captured by ShareCalculationButton — wraps project header +
   *  calculation summary so operators can ship a one-shot image. */
  const shareRef = useRef<HTMLDivElement>(null);

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["projects-all"],
    queryFn: () => api("/api/projects"),
  });

  const project = projects.find((p) => p.id === params.id);

  if (isLoading) return <div className="text-muted-foreground p-8">{t("Лойиҳа юкланмоқда…", "Loading project…")}</div>;
  if (!project) return <div className="p-8">{t("Лойиҳа топилмади", "Project not found")}</div>;

  // Display label for an unnamed draft. The project.name column is
  // optional (operator can save a draft without typing a name), so
  // we fall back to "Saved Draft NNNND" — NNNND is the monotonic
  // draftNumber assigned at save time (see src/lib/draft-number.ts).
  // Falls back to the id-tail for any pre-feature rows that haven't
  // been backfilled with a draftNumber yet.
  const draftLabel = project.draftNumber
    ? formatDraftNumber(project.draftNumber)
    : project.id.slice(-6);
  const displayName = project.name || `${t("Сақланган лойиҳа", "Saved Draft")} ${draftLabel}`;
  const clientLabel =
    project.client?.name ?? project.tentativeClientName ?? "";

  const totals = project.calculations.reduce(
    (acc, c) => ({
      blocks: acc.blocks + c.totalBlocks,
      beams: acc.beams + c.beamCount,
      monolithLength: acc.monolithLength + Number(c.monolithLength),
      monolithArea: acc.monolithArea + Number(c.monolithArea),
      concrete: acc.concrete + Number(c.concreteVolume),
      sum: acc.sum + Number(c.subtotal),
    }),
    { blocks: 0, beams: 0, monolithLength: 0, monolithArea: 0, concrete: 0, sum: 0 }
  );

  // Build the offscreen share-card payload (rendered at fixed 1100 px
  // so the exported image is identical on phones + desktops).
  const shareData: ShareData = {
    title: displayName,
    subtitle: t("Лойиҳа · Draft", "Лойиҳа · Draft"),
    clientName: clientLabel || t("Номсиз мижоз", "Unnamed client"),
    clientPhone: project.client?.phone ?? project.tentativeClientPhone ?? null,
    clientAddress: project.client?.address ?? project.tentativeClientAddress ?? null,
    rows: project.calculations.map((c) => ({
      name: c.name ?? "",
      innerWidth: Number(c.innerWidth),
      innerLength: Number(c.innerLength),
      bearing: Number(c.bearing),
      pattern: c.pattern,
      patternAuto: c.patternAuto,
      beamLength: Number(c.beamLength),
      blocksPerRow: c.blockRows > 0 ? c.blocksPerRow : null,
      totalBlocks: c.totalBlocks,
      beamCount: c.beamCount,
      monolithArea: Number(c.monolithArea),
      m2Price: Number(c.m2Price),
      subtotal: Number(c.subtotal),
    })),
    totals: {
      blocks: totals.blocks,
      beams: totals.beams,
      monolithArea: totals.monolithArea,
      sum: totals.sum,
    },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/projects"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> {t("Орқага", "Back")}
        </Link>
        <div className="flex gap-2">
          <ShareCalculationButton
            targetRef={shareRef}
            fileBase={`${displayName}${
              clientLabel ? `-${clientLabel}` : ""
            }`
              // Strip Windows-forbidden filename chars and collapse
              // whitespace, same sanitization the order page uses.
              .replace(/[<>:"/\\|?*]+/g, "")
              .replace(/\s+/g, " ")
              .trim()}
            disabled={project.calculations.length === 0}
          />
          {/* Owner-only Blender bridge — pushes this project's saved
              rooms to a locally-running Blender. */}
          {canUseBlender && project.calculations.length > 0 && (
            <SendToBlenderButton projectId={project.id} />
          )}
          {project.status === "ORDERED" && project.orders[0] ? (
            <Button variant="outline" asChild size="sm">
              <Link href={`/orders/${project.orders[0].id}`}>
                <FileText className="h-4 w-4 mr-2" /> {t("Буюртма", "Order")} {project.orders[0].orderNumber}
              </Link>
            </Button>
          ) : (
            <Button variant="outline" asChild size="sm">
              <Link href={`/calculations?fromProject=${project.id}`}>
                <FileText className="h-4 w-4 mr-2" /> Буюртма Бериш<span className="lang-en"> · Place Order</span>
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Offscreen, fixed-width share card — the actual capture target
          for the "Send" button. Rendering this in addition to the
          visible card means the exported image is consistent across
          phone + desktop. See src/components/share/CalculationShareCard.tsx. */}
      <ShareTarget ref={shareRef} data={shareData} />

      {/* On-screen layout — stays responsive for viewing. */}
      <div className="flex flex-col gap-6 p-4 bg-background">
      <div className="bg-card rounded-lg border p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-primary">
              {displayName}
            </h1>
            <p className="text-muted-foreground mt-1">
              {t("Мижоз:", "Client:")}{" "}
              <span className="text-foreground font-medium">
                {project.client?.name ?? project.tentativeClientName ?? "—"}
              </span>
              {" · "}
              {project.client?.phone ?? project.tentativeClientPhone ?? ""}
              {(project.client?.address || project.tentativeClientAddress) && (
                <>
                  {" · "}
                  {project.client?.address ?? project.tentativeClientAddress}
                </>
              )}
              <span className="ml-3 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                {project.status === "DRAFT"
                  ? <>Лойиҳа<span className="lang-en"> · Draft</span></>
                  : project.status === "ORDERED"
                  ? <>Буюртма берилди<span className="lang-en"> · Ordered</span></>
                  : <>Архив<span className="lang-en"> · Archived</span></>}
              </span>
            </p>
          </div>
          <div className="flex gap-6 text-sm">
            {/* Total slab weight — same 180 kg/m² factory rule used by
                the calculator and order detail pages. */}
            <div className="text-right">
              <div className="text-muted-foreground uppercase text-[10px] font-bold">{t("Оғирлик", "Weight")}</div>
              <div className="text-2xl font-black text-foreground font-mono">
                {formatNumber(totals.monolithArea * 180, 0)}
                <span className="text-xs font-normal text-muted-foreground ml-1">кг</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-muted-foreground uppercase text-[10px] font-bold">{t("Жами сумма", "Total Sum")}</div>
              <div className="text-2xl font-black text-success font-mono">{formatNumber(totals.sum, 0)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-baseline justify-between">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Ҳисоб-китоб хулосаси
            <span className="lang-en font-normal">{" "}· Calculation Summary</span>
          </div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-text-tertiary">
            {project.calculations.length}{" "}
            {t("хона", project.calculations.length === 1 ? "room" : "rooms")}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold">
                  Хона<span className="lang-en font-normal"> · Room</span>
                </th>
                <th className="text-right px-3 py-2.5 font-semibold">
                  Эни<span className="lang-en font-normal"> · W</span>
                </th>
                <th className="text-right px-3 py-2.5 font-semibold">
                  Бўйи<span className="lang-en font-normal"> · L</span>
                </th>
                <th className="text-left px-3 py-2.5 font-semibold">
                  Шаблон<span className="lang-en font-normal"> · Pattern</span>
                </th>
                <th className="text-right px-3 py-2.5 font-semibold">
                  Балка<span className="lang-en font-normal"> · Beam</span>
                </th>
                <th className="text-right px-3 py-2.5 font-semibold">
                  Ғ/қатор<span className="lang-en font-normal"> · Per row</span>
                </th>
                <th className="text-right px-3 py-2.5 font-semibold">
                  Жами Ғ<span className="lang-en font-normal"> · Blocks</span>
                </th>
                <th className="text-right px-3 py-2.5 font-semibold">
                  Балка<span className="lang-en font-normal"> · Beams</span>
                </th>
                <th className="text-right px-3 py-2.5 font-semibold">
                  Монолит Б<span className="lang-en font-normal"> · Slab L</span>
                </th>
                <th className="text-right px-3 py-2.5 font-semibold">
                  Майдон<span className="lang-en font-normal"> · Area</span>
                </th>
                <th className="text-right px-3 py-2.5 font-semibold">
                  м² нархи<span className="lang-en font-normal"> · Rate</span>
                </th>
                <th className="text-right px-3 py-2.5 font-semibold">
                  Сумма<span className="lang-en font-normal"> · Subtotal</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {project.calculations.map((c, i) => (
                <tr
                  key={c.id}
                  className={
                    "border-b last:border-b-0 border-border/60 hover:bg-surface-hover transition-colors " +
                    (i % 2 === 1 ? "bg-muted/30" : "")
                  }
                >
                  <td className="px-3 py-2.5 font-medium">
                    {c.name || (
                      <span className="text-text-tertiary italic">
                        {t("Номсиз хона", "Unnamed Room")}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {formatNumber(c.innerWidth, 2)}
                    <span className="text-text-tertiary text-xs ml-0.5">m</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {formatNumber(c.innerLength, 2)}
                    <span className="text-text-tertiary text-xs ml-0.5">m</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs">
                      <span className="font-semibold">{PATTERN_LABEL[c.pattern]}</span>
                      {c.pattern !== c.patternAuto && (
                        <span className="text-text-tertiary normal-case">
                          ({t("авто", "auto")}: {PATTERN_LABEL[c.patternAuto]})
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {formatNumber(c.beamLength, 2)}
                    <span className="text-text-tertiary text-xs ml-0.5">m</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-tertiary">
                    {c.blockRows > 0 ? c.blocksPerRow : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold">
                    {c.totalBlocks}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold">
                    {c.beamCount}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-primary">
                    {formatNumber(c.monolithLength, 2)}
                    <span className="text-text-tertiary text-xs ml-0.5">m</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono text-text-tertiary">
                    {formatNumber(c.monolithArea, 2)}
                    <span className="text-xs ml-0.5">m²</span>
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono">
                    {formatNumber(c.m2Price, 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right font-mono font-bold text-success">
                    {formatNumber(c.subtotal, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted border-t border-border-strong">
                <td
                  colSpan={6}
                  className="px-3 py-3 text-right text-[10px] uppercase tracking-wider text-muted-foreground font-bold"
                >
                  Жами<span className="lang-en font-normal">{" "}· Totals</span>
                </td>
                <td className="px-3 py-3 text-right font-mono font-bold">
                  {totals.blocks}
                </td>
                <td className="px-3 py-3 text-right font-mono font-bold">
                  {totals.beams}
                </td>
                <td className="px-3 py-3 text-right font-mono font-bold text-primary">
                  {formatNumber(totals.monolithLength, 2)}
                  <span className="text-xs ml-0.5 text-muted-foreground">m</span>
                </td>
                <td className="px-3 py-3 text-right font-mono font-bold">
                  {formatNumber(totals.monolithArea, 2)}
                  <span className="text-xs ml-0.5 text-muted-foreground">m²</span>
                </td>
                <td className="px-3 py-3"></td>
                <td className="px-3 py-3 text-right font-mono font-extrabold text-success text-base">
                  {formatNumber(totals.sum, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      </div>
      {/* /shareRef */}

      {/* Drawings — Blender-generated PDFs attached to this project */}
      {canUseBlender && <DrawingsSection projectId={project.id} />}

      {/* Comments thread — human conversation goes first, reference
          totals (Logistics Summary) below. */}
      <CommentThread projectId={project.id} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{t("Логистика хулосаси", "Logistics Summary")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
             <div className="flex justify-between border-b pb-2">
               <span className="text-muted-foreground">{t("Жами балка дона", "Total Beam Pieces")}</span>
               <span className="font-bold">{totals.beams}</span>
             </div>
             <div className="flex justify-between border-b pb-2">
               <span className="text-muted-foreground">{t("Жами ғишт дона", "Total Block Pieces")}</span>
               <span className="font-bold">{totals.blocks}</span>
             </div>
             <div className="flex justify-between border-b pb-2">
               <span className="text-muted-foreground">{t("Плита майдони", "Slab Area (visual)")}</span>
               <span className="font-bold">{formatNumber(totals.monolithArea, 2)} m²</span>
             </div>
             <div className="flex justify-between border-b pb-2">
               <span className="text-muted-foreground">{t("Бетон қатлами", "Concrete Topping")}</span>
               <span className="font-bold">{totals.concrete.toFixed(2)} m³</span>
             </div>
             <div className="flex justify-between">
               <span className="text-muted-foreground">{t("Жами оғирлик", "Total Weight")}</span>
               <span className="font-bold">{formatNumber(totals.monolithArea * 180, 0)} кг</span>
             </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
