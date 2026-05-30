"use client";

/**
 * Self-contained shareable card for the image-export flow.
 * Width is controlled by config.cardWidth (default 1100 px).
 *
 * All visual properties come from TableDesignConfig — edited live on
 * the /table-design settings page. Falls back to DEFAULT_TABLE_DESIGN
 * when no config is passed, producing the original look.
 *
 * Why inline styles: html-to-image captures inline styles reliably
 * across all browsers; Tailwind utility classes are purged in production
 * builds and may not serialize correctly through foreignObject.
 */

import * as React from "react";
import { formatNumber } from "@/lib/utils";
import { addressToCyrillic } from "@/lib/regions";
import { formatPhone } from "@/lib/phone";
import { DEFAULT_TABLE_DESIGN, type TableDesignConfig } from "@/lib/table-design-config";

const PATTERN_LABEL: Record<"GB" | "BGB" | "GBG", string> = {
  GB: "Г-Б",
  BGB: "Б-Г-Б",
  GBG: "Г-Б-Г",
};

const COL_LABELS = [
  "Хона", "Эни", "Бўйи", "Шаблон",
  "Балка", "Ғ/қатор", "Жами Ғ", "Балка",
  "Майдон", "м² нархи", "Сумма",
] as const;

export interface ShareRow {
  name: string;
  innerWidth: number;
  innerLength: number;
  bearing: number;
  pattern: "GB" | "BGB" | "GBG";
  patternAuto?: "GB" | "BGB" | "GBG" | null;
  beamLength: number;
  blocksPerRow: number | null;
  totalBlocks: number;
  beamCount: number;
  monolithArea: number;
  m2Price: number;
  subtotal: number;
}

export interface ShareData {
  title: string;
  subtitle?: string;
  clientName: string;
  clientPhone?: string | null;
  clientAddress?: string | null;
  payment?: {
    totalPrice: number;
    paid: number;
    remaining: number;
    badgeLabel: string;
    badgeColorCls: string;
  };
  scheduledLabel?: string;
  rows: ShareRow[];
  totals: {
    blocks: number;
    beams: number;
    monolithArea: number;
    sum: number;
  };
}

interface Props {
  data: ShareData;
  config?: TableDesignConfig;
}

export const CalculationShareCard = React.forwardRef<HTMLDivElement, Props>(
  function CalculationShareCard({ data, config: configProp }, ref) {
    const cfg = { ...DEFAULT_TABLE_DESIGN, ...configProp };
    const generatedAt = new Date();

    // ── Style helpers ───────────────────────────────────────
    const px = (n: number) => `${n}px`;

    const thCell = (align: "left" | "right"): React.CSSProperties => ({
      textAlign: align,
      paddingTop: px(cfg.headerRowPaddingY),
      paddingBottom: px(cfg.headerRowPaddingY),
      paddingLeft: px(cfg.cellPaddingX),
      paddingRight: px(cfg.cellPaddingX),
      fontSize: px(cfg.headerFontSize),
      fontWeight: cfg.headerFontWeight,
      color: cfg.headerText,
      letterSpacing: "0.07em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    });

    const tdBase = (extras: React.CSSProperties = {}): React.CSSProperties => ({
      paddingTop: px(cfg.bodyRowPaddingY),
      paddingBottom: px(cfg.bodyRowPaddingY),
      paddingLeft: px(cfg.cellPaddingX),
      paddingRight: px(cfg.cellPaddingX),
      fontSize: px(cfg.bodyFontSize),
      fontWeight: cfg.bodyFontWeight,
      color: cfg.bodyText,
      borderBottom: `1px solid ${cfg.rowDividerColor}`,
      ...extras,
    });

    const tfCell = (extras: React.CSSProperties = {}): React.CSSProperties => ({
      paddingTop: px(cfg.bodyRowPaddingY + 1),
      paddingBottom: px(cfg.bodyRowPaddingY + 1),
      paddingLeft: px(cfg.cellPaddingX),
      paddingRight: px(cfg.cellPaddingX),
      fontSize: px(cfg.footerFontSize),
      fontWeight: cfg.footerFontWeight,
      color: cfg.footerText,
      ...extras,
    });

    const tabular: React.CSSProperties = { fontVariantNumeric: "tabular-nums" };

    return (
      <div
        ref={ref}
        style={{
          width: px(cfg.cardWidth),
          backgroundColor: cfg.cardBg,
          color: cfg.bodyText,
          fontFamily: cfg.fontFamily,
          paddingLeft: px(cfg.cardPaddingX),
          paddingRight: px(cfg.cardPaddingX),
          paddingTop: px(cfg.cardPaddingY),
          paddingBottom: px(cfg.cardPaddingY),
          boxSizing: "border-box",
        }}
      >
        {/* ── Brand header ─────────────────────────────────── */}
        <div style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          gap: 16,
          paddingBottom: 16,
          borderBottom: `2px solid ${cfg.brandDividerColor}`,
        }}>
          <div>
            <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.025em", lineHeight: 1, color: "#0f172a" }}>
              {cfg.brandName}
            </div>
            <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: cfg.dimText, marginTop: 4 }}>
              {cfg.brandTagline}
            </div>
          </div>
          <div style={{ textAlign: "right", fontSize: 10, color: cfg.dimText }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b", ...tabular }}>
              {cfg.brandPhone}
            </div>
            <div style={{ marginTop: 2, ...tabular }}>
              {generatedAt.toLocaleDateString("en-GB")} ·{" "}
              {generatedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
            </div>
          </div>
        </div>

        {/* ── Title + client + payment — 2-line strip ──────── */}
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 3 }}>
          {/* Line 1: title · total */}
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.015em", color: "#0f172a", whiteSpace: "nowrap" }}>
                {data.title}
              </span>
              {data.subtitle && (
                <span style={{ fontSize: 10, color: cfg.dimText }}>{data.subtitle}</span>
              )}
            </div>
            {data.payment && (
              <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: cfg.dimText, fontWeight: 700 }}>Жами</span>
                <span style={{ fontSize: 17, fontWeight: 900, ...tabular, color: cfg.subtotalColor, lineHeight: 1 }}>
                  {formatNumber(data.payment.totalPrice, 0)}
                </span>
                <span style={{ fontSize: 9, color: cfg.dimText }}>UZS</span>
              </div>
            )}
          </div>

          {/* Line 2: client info · payment breakdown */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: cfg.dimText }}>
              <span style={{ fontWeight: 600, color: "#1e293b" }}>{data.clientName}</span>
              {data.clientPhone && (
                <><span style={{ color: "#cbd5e1" }}>·</span>
                <span style={tabular}>{formatPhone(data.clientPhone)}</span></>
              )}
              {data.clientAddress && (
                <><span style={{ color: "#cbd5e1" }}>·</span>
                <span>{addressToCyrillic(data.clientAddress)}</span></>
              )}
              {data.scheduledLabel && (
                <><span style={{ color: "#cbd5e1" }}>·</span>
                <span>
                  <span style={{ fontSize: 9, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.08em", color: cfg.dimText, marginRight: 3 }}>Ет:</span>
                  <span style={{ fontWeight: 600, ...tabular }}>{data.scheduledLabel}</span>
                </span></>
              )}
            </div>
            {data.payment && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0, fontSize: 11 }}>
                <span style={{ fontSize: 9, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.08em", color: cfg.dimText }}>Тўлов</span>
                <span style={{ ...tabular, fontWeight: 600, color: "#374151" }}>{formatNumber(data.payment.paid, 0)}</span>
                <span style={{ color: "#cbd5e1" }}>·</span>
                <span style={{ fontSize: 9, textTransform: "uppercase", fontWeight: 700, letterSpacing: "0.08em", color: cfg.dimText }}>Қолди</span>
                <span style={{ ...tabular, fontWeight: 600, color: data.payment.remaining === 0 ? cfg.subtotalColor : "#b45309" }}>
                  {data.payment.remaining === 0 ? "0" : formatNumber(data.payment.remaining, 0)}
                </span>
                <span
                  className={data.payment.badgeColorCls}
                  style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", borderRadius: 3, paddingLeft: 6, paddingRight: 6, paddingTop: 2, paddingBottom: 2 }}
                >
                  {data.payment.badgeLabel}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Calculation table ─────────────────────────────── */}
        <div style={{
          marginTop: 12,
          borderRadius: 8,
          border: `${px(cfg.tableBorderWidth)} solid ${cfg.borderColor}`,
          overflow: "hidden",
        }}>
          {/* Section header bar */}
          <div style={{
            backgroundColor: cfg.tableBarBg,
            paddingLeft: cfg.cellPaddingX,
            paddingRight: cfg.cellPaddingX,
            paddingTop: 8,
            paddingBottom: 8,
            borderBottom: `1px solid ${cfg.borderColor}`,
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
          }}>
            <div style={{ fontSize: cfg.tableBarFontSize, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: cfg.tableBarText }}>
              Ҳисоб-китоб хулосаси
            </div>
            <div style={{ fontSize: cfg.tableBarFontSize, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.08em", color: cfg.dimText }}>
              {data.rows.length} хона
            </div>
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              {cfg.colWidths.map((w, i) => <col key={i} style={{ width: `${w}%` }} />)}
            </colgroup>
            <thead style={{ backgroundColor: cfg.headerBg }}>
              <tr>
                <th style={thCell("left")}>{COL_LABELS[0]}</th>
                <th style={thCell("right")}>{COL_LABELS[1]}</th>
                <th style={thCell("right")}>{COL_LABELS[2]}</th>
                <th style={thCell("left")}>{COL_LABELS[3]}</th>
                <th style={thCell("right")}>{COL_LABELS[4]}</th>
                <th style={thCell("right")}>{COL_LABELS[5]}</th>
                <th style={thCell("right")}>{COL_LABELS[6]}</th>
                <th style={thCell("right")}>{COL_LABELS[7]}</th>
                <th style={thCell("right")}>{COL_LABELS[8]}</th>
                <th style={thCell("right")}>{COL_LABELS[9]}</th>
                <th style={thCell("right")}>{COL_LABELS[10]}</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 === 0 ? cfg.evenRowBg : cfg.oddRowBg }}>
                  <td style={tdBase({ color: cfg.nameCellColor, fontWeight: cfg.nameCellWeight })}>
                    {r.name || <span style={{ color: cfg.dimText, fontStyle: "italic" }}>Номсиз хона</span>}
                  </td>
                  <td style={tdBase({ textAlign: "right", ...tabular })}>
                    {formatNumber(r.innerWidth, 2)}
                    <span style={{ color: cfg.dimText, fontSize: cfg.bodyFontSize - 1, marginLeft: 1 }}>m</span>
                  </td>
                  <td style={tdBase({ textAlign: "right", ...tabular })}>
                    {formatNumber(r.innerLength, 2)}
                    <span style={{ color: cfg.dimText, fontSize: cfg.bodyFontSize - 1, marginLeft: 1 }}>m</span>
                  </td>
                  <td style={tdBase()}>
                    <span style={{ fontFamily: "monospace", fontWeight: 600 }}>
                      {PATTERN_LABEL[r.pattern]}
                    </span>
                    {r.patternAuto && r.patternAuto !== r.pattern && (
                      <span style={{ color: cfg.dimText, fontSize: cfg.bodyFontSize - 1, marginLeft: 4 }}>
                        (auto: {PATTERN_LABEL[r.patternAuto]})
                      </span>
                    )}
                  </td>
                  <td style={tdBase({ textAlign: "right", ...tabular, color: cfg.accentColor, fontWeight: 600 })}>
                    {formatNumber(r.beamLength, 2)}
                    <span style={{ color: cfg.dimText, fontSize: cfg.bodyFontSize - 1, marginLeft: 1 }}>m</span>
                  </td>
                  <td style={tdBase({ textAlign: "right", ...tabular, color: cfg.dimText })}>
                    {r.blocksPerRow ?? "—"}
                  </td>
                  <td style={tdBase({ textAlign: "right", ...tabular, fontWeight: 600 })}>
                    {r.totalBlocks}
                  </td>
                  <td style={tdBase({ textAlign: "right", ...tabular, fontWeight: 600 })}>
                    {r.beamCount}
                  </td>
                  <td style={tdBase({ textAlign: "right", ...tabular, color: cfg.dimText })}>
                    {formatNumber(r.monolithArea, 2)}
                    <span style={{ fontSize: cfg.bodyFontSize - 1, marginLeft: 1 }}>m²</span>
                  </td>
                  <td style={tdBase({ textAlign: "right", ...tabular })}>
                    {formatNumber(r.m2Price, 0)}
                  </td>
                  <td style={tdBase({ textAlign: "right", ...tabular, fontWeight: 700, color: cfg.subtotalColor })}>
                    {formatNumber(r.subtotal, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ backgroundColor: cfg.footerBg, borderTop: `${px(cfg.footerDividerWidth)} solid ${cfg.borderColor}` }}>
                <td colSpan={6} style={tfCell({ textAlign: "right", textTransform: "uppercase", letterSpacing: "0.08em" })}>
                  Жами
                </td>
                <td style={tfCell({ textAlign: "right", ...tabular })}>{data.totals.blocks}</td>
                <td style={tfCell({ textAlign: "right", ...tabular })}>{data.totals.beams}</td>
                <td style={tfCell({ textAlign: "right", ...tabular })}>
                  {formatNumber(data.totals.monolithArea, 2)}
                  <span style={{ fontSize: cfg.footerFontSize - 2, marginLeft: 1, color: cfg.dimText }}>m²</span>
                </td>
                <td style={tfCell({})} />
                <td style={tfCell({ textAlign: "right", ...tabular, color: cfg.subtotalColor, fontWeight: 800, fontSize: cfg.footerFontSize + 2 })}>
                  {formatNumber(data.totals.sum, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Footer ──────────────────────────────────────────── */}
        <div style={{
          marginTop: 24,
          paddingTop: 12,
          borderTop: `1px solid ${cfg.borderColor}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: 10,
          color: cfg.dimText,
        }}>
          <div>{cfg.brandName} · {cfg.brandTagline}</div>
          <div style={tabular}>
            Чиқарилди · {generatedAt.toLocaleDateString("en-GB")} {generatedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
    );
  },
);

/**
 * Offscreen wrapper — positions the card off-screen so html-to-image can
 * capture it at the card's native width regardless of current viewport.
 */
export const ShareTarget = React.forwardRef<HTMLDivElement, { data: ShareData; config?: TableDesignConfig }>(
  function ShareTarget({ data, config }, ref) {
    return (
      <div aria-hidden="true" className="pointer-events-none fixed top-0 left-[-99999px]">
        <CalculationShareCard data={data} config={config} ref={ref} />
      </div>
    );
  },
);
