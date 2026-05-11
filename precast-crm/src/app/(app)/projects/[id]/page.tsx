"use client";

import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/fetcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, FileText } from "lucide-react";
import { formatDate, formatNumber } from "@/lib/utils";
import { ShareCalculationButton } from "@/components/ShareCalculationButton";
import { formatDraftNumber } from "@/lib/draft-number";
import { useT } from "@/lib/i18n";

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
      monolithArea: acc.monolithArea + Number(c.monolithArea),
      concrete: acc.concrete + Number(c.concreteVolume),
      sum: acc.sum + Number(c.subtotal),
    }),
    { blocks: 0, beams: 0, monolithArea: 0, concrete: 0, sum: 0 }
  );

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

      {/* Shareable area — wraps project header + calculation summary so
          ShareCalculationButton captures both as a single image.
          flex+gap (not space-y-*) so html-to-image doesn't include any
          phantom margin from the parent's space-y rule. p-4 gives the
          captured image symmetric breathing room around all edges. */}
      <div ref={shareRef} className="flex flex-col gap-6 p-4 bg-background">
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
            <div className="text-right">
              <div className="text-muted-foreground uppercase text-[10px] font-bold">{t("Жами сумма", "Total Sum")}</div>
              <div className="text-2xl font-black text-success font-mono">{formatNumber(totals.sum, 0)}</div>
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-lg">{t("Ҳисоб-китоб хулосаси (Хоналар)", "Calculation Summary (Rooms)")}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
                <tr>
                  <th className="px-3 py-2 border-b bg-yellow-50">{t("Исм", "Name")}</th>
                  <th className="px-3 py-2 border-b text-center bg-yellow-50">{t("Эни", "W")}</th>
                  <th className="px-3 py-2 border-b text-center bg-yellow-50">{t("Бўйи", "L")}</th>
                  <th className="px-3 py-2 border-b text-center bg-blue-50">{t("Шаблон", "Pattern")}</th>
                  <th className="px-3 py-2 border-b text-center bg-green-50">{t("Балка узунлиги", "Beam Len")}</th>
                  <th className="px-3 py-2 border-b text-center">{t("Ғ/Қатор", "Blks/Row")}</th>
                  <th className="px-3 py-2 border-b text-center bg-orange-50">{t("Жами Ғ", "Total Blks")}</th>
                  <th className="px-3 py-2 border-b text-center bg-gray-100">{t("Балка", "Beams")}</th>
                  <th className="px-3 py-2 border-b text-center">{t("Плита Б", "Slab L")}</th>
                  <th className="px-3 py-2 border-b text-center">{t("Майдон", "Area")}</th>
                  <th className="px-3 py-2 border-b text-center bg-green-50">{t("м² нархи", "m² Rate")}</th>
                  <th className="px-3 py-2 border-b text-right">{t("Сумма", "Subtotal")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {project.calculations.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-3 py-2 font-medium bg-yellow-50/20">{c.name || t("Номсиз хона", "Unnamed Room")}</td>
                    <td className="px-3 py-2 text-center bg-yellow-50/20">{formatNumber(c.innerWidth, 2)}</td>
                    <td className="px-3 py-2 text-center bg-yellow-50/20">{formatNumber(c.innerLength, 2)}</td>
                    <td className="px-3 py-2 text-center text-xs font-medium bg-blue-50/30">
                      {PATTERN_LABEL[c.pattern]}
                      {c.pattern !== c.patternAuto && (
                        <span className="text-muted-foreground"> ({t("авто", "auto")}: {PATTERN_LABEL[c.patternAuto]})</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center font-bold bg-green-50/20 text-green-800">{formatNumber(c.beamLength, 2)}</td>
                    <td className="px-3 py-2 text-center">{c.blockRows > 0 ? c.blocksPerRow : "—"}</td>
                    <td className="px-3 py-2 text-center font-black bg-orange-50/20 text-orange-800">{c.totalBlocks}</td>
                    <td className="px-3 py-2 text-center font-black bg-gray-100/50">{c.beamCount}</td>
                    <td className="px-3 py-2 text-center text-xs">{formatNumber(c.monolithLength, 2)} m</td>
                    <td className="px-3 py-2 text-center text-xs">{formatNumber(c.monolithArea, 2)} m²</td>
                    <td className="px-3 py-2 text-center font-bold bg-green-50/20 text-green-800">{formatNumber(c.m2Price, 0)}</td>
                    <td className="px-3 py-2 text-right font-black text-green-700">
                      {formatNumber(c.subtotal, 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/20 font-black border-t-2 border-primary/10">
                <tr>
                  <td className="px-3 py-3 text-right" colSpan={6}>ЖАМИ<span className="lang-en"> (TOTALS)</span>:</td>
                  <td className="px-3 py-3 text-center text-orange-800 bg-orange-50/50">{totals.blocks}</td>
                  <td className="px-3 py-3 text-center bg-gray-100">{totals.beams}</td>
                  <td className="px-3 py-3" colSpan={1}></td>
                  <td className="px-3 py-3 text-center text-xs">{formatNumber(totals.monolithArea, 2)} m²</td>
                  <td className="px-3 py-3 text-right text-green-800 bg-green-50/50 text-lg" colSpan={2}>{formatNumber(totals.sum, 0)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
      </div>
      {/* /shareRef */}

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
             <div className="flex justify-between">
               <span className="text-muted-foreground">{t("Бетон қатлами", "Concrete Topping")}</span>
               <span className="font-bold">{totals.concrete.toFixed(2)} m³</span>
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
