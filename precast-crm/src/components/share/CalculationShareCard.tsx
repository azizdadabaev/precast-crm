"use client";

/**
 * Self-contained, fixed-width (1100 px) shareable card used as the
 * capture target for the "Send" image-export flow on:
 *
 *   - the calculator page
 *   - the saved-project detail page
 *   - the order detail page
 *
 * Why a separate component instead of capturing the visible card:
 *
 * The visible summary uses Tailwind's `sm:` / `lg:` responsive
 * classes. On a phone, html-to-image captures the mobile layout —
 * cramped, sticky-column shadows, two-line stacks. The exported
 * image then looks unprofessional when the operator sends it to a
 * customer via WhatsApp / Telegram.
 *
 * This component has NO responsive classes. It always renders at
 * desktop width with the full multi-column table layout. Each
 * surface mounts it inside an offscreen wrapper:
 *
 *   <div aria-hidden className="pointer-events-none fixed left-[-9999px] top-0">
 *     <CalculationShareCard ref={shareRef} ... />
 *   </div>
 *
 * The existing <ShareCalculationButton> targets `shareRef` and
 * captures this card. The visible on-screen summary is unchanged
 * and remains responsive for actual viewing.
 *
 * Width chosen as 1100 px: wide enough for the 12-column table
 * without crowding, narrow enough that a customer opening the
 * exported image on a phone screen still gets a readable result
 * (~92 % of typical phone viewport at 1× zoom).
 */

import * as React from "react";
import { formatNumber } from "@/lib/utils";
import { addressToCyrillic } from "@/lib/regions";
import { formatPhone } from "@/lib/phone";

// Brand constants — same source as the print page. TODO when
// AppConfig admin UI lands: read these from the DB instead.
const BRAND_NAME = "EtalonSlabs";
const BRAND_TAGLINE = "Yig'ma monolit";
const BRAND_PHONE = "+998 93 481 33 30";

const PATTERN_LABEL: Record<"GB" | "BGB" | "GBG", string> = {
  GB: "Г-Б",
  BGB: "Б-Г-Б",
  GBG: "Г-Б-Г",
};

export interface ShareRow {
  name: string;
  innerWidth: number;
  innerLength: number;
  bearing: number;
  pattern: "GB" | "BGB" | "GBG";
  /** Engine's auto-picked pattern; shown when it differs from the operator pick. */
  patternAuto?: "GB" | "BGB" | "GBG" | null;
  beamLength: number;
  /** null when block_rows === 0 (edge-beam-only row) so we render "—" */
  blocksPerRow: number | null;
  totalBlocks: number;
  beamCount: number;
  monolithArea: number;
  m2Price: number;
  subtotal: number;
}

export interface ShareData {
  /** Big title — "Буюртма №2026-05-0010" / "Сақланган лойиҳа 0001D" / etc. */
  title: string;
  /** Subtitle line — e.g. order date or "Лойиҳа · Draft". */
  subtitle?: string;
  /** Client info row. */
  clientName: string;
  clientPhone?: string | null;
  clientAddress?: string | null;
  /** Optional payment recap — orders only. */
  payment?: {
    totalPrice: number;
    paid: number;
    remaining: number;
    /** Pre-translated bilingual label e.g. "ТЎЛАНГАН · FULLY PAID". */
    badgeLabel: string;
    badgeColorCls: string;
  };
  /** Optional scheduled-at date for orders. Formatted as a string. */
  scheduledLabel?: string;
  rows: ShareRow[];
  totals: {
    blocks: number;
    beams: number;
    monolithArea: number;
    sum: number;
  };
}

export const CalculationShareCard = React.forwardRef<HTMLDivElement, { data: ShareData }>(
  function CalculationShareCard({ data }, ref) {
    const generatedAt = new Date();
    return (
      <div
        ref={ref}
        // Plain white card with high-contrast text; no oklch CSS vars
        // (some browsers don't serialize those reliably through
        // html-to-image's foreignObject pass).
        style={{ width: "1100px", backgroundColor: "#ffffff", color: "#111827" }}
        className="font-sans p-8"
      >
        {/* ── Brand header bar ───────────────────────────────────── */}
        <div className="flex items-end justify-between gap-4 pb-4 border-b-2 border-slate-800">
          <div>
            <div className="text-3xl font-black tracking-tight leading-none text-slate-900">
              {BRAND_NAME}
            </div>
            <div className="text-xs uppercase tracking-widest text-slate-500 mt-1">
              {BRAND_TAGLINE}
            </div>
          </div>
          <div className="text-right text-xs text-slate-600">
            <div className="font-semibold text-sm text-slate-800 tabular-nums">
              {BRAND_PHONE}
            </div>
            <div className="mt-0.5 tabular-nums">
              {generatedAt.toLocaleDateString("en-GB")} ·{" "}
              {generatedAt.toLocaleTimeString("en-GB", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
          </div>
        </div>

        {/* ── Title + client + (optional) payment block — 2-line strip ── */}
        <div className="mt-3 space-y-[3px]">
          {/* Line 1: title left · total right */}
          <div className="flex items-baseline justify-between gap-4">
            <div className="flex items-baseline gap-3 min-w-0">
              <span className="text-base font-black tracking-tight text-slate-900 leading-none whitespace-nowrap">
                {data.title}
              </span>
              {data.subtitle && (
                <span className="text-[10px] text-slate-400">{data.subtitle}</span>
              )}
            </div>
            {data.payment ? (
              <div className="flex items-baseline gap-2 shrink-0">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Жами</span>
                <span className="text-lg font-black tabular-nums text-emerald-700 leading-none">
                  {formatNumber(data.payment.totalPrice, 0)}
                </span>
                <span className="text-[10px] text-slate-400">UZS</span>
              </div>
            ) : null}
          </div>

          {/* Line 2: client details left · payment breakdown right */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-[11px] text-slate-600 min-w-0 flex-wrap">
              <span className="font-semibold text-slate-800">{data.clientName}</span>
              {data.clientPhone && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="tabular-nums">{formatPhone(data.clientPhone)}</span>
                </>
              )}
              {data.clientAddress && (
                <>
                  <span className="text-slate-300">·</span>
                  <span>{addressToCyrillic(data.clientAddress)}</span>
                </>
              )}
              {data.scheduledLabel && (
                <>
                  <span className="text-slate-300">·</span>
                  <span>
                    <span className="uppercase text-[9px] font-bold tracking-wider text-slate-400 mr-1">Ет:</span>
                    <span className="font-semibold tabular-nums">{data.scheduledLabel}</span>
                  </span>
                </>
              )}
            </div>
            {data.payment && (
              <div className="flex items-center gap-3 shrink-0 text-[11px]">
                <span className="text-slate-400 uppercase text-[9px] font-bold tracking-wider">Тўлов</span>
                <span className="tabular-nums font-semibold text-slate-700">{formatNumber(data.payment.paid, 0)}</span>
                <span className="text-slate-300">·</span>
                <span className="text-slate-400 uppercase text-[9px] font-bold tracking-wider">Қолди</span>
                <span className={`tabular-nums font-semibold ${data.payment.remaining === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                  {data.payment.remaining === 0 ? "0" : formatNumber(data.payment.remaining, 0)}
                </span>
                <span className={`text-[9px] font-bold uppercase tracking-wider rounded px-2 py-0.5 ${data.payment.badgeColorCls}`}>
                  {data.payment.badgeLabel}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Calculation table ─────────────────────────────────── */}
        <div className="mt-3 rounded-lg border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-baseline justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
              Ҳисоб-китоб хулосаси
            </div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              {data.rows.length} хона
            </div>
          </div>
          <table className="w-full text-[8px]">
            <thead className="bg-slate-100 text-[7px] uppercase tracking-wider text-slate-600">
              <tr>
                <th className="text-left px-3 py-[5px] font-semibold">Хона</th>
                <th className="text-right px-3 py-[5px] font-semibold">Эни</th>
                <th className="text-right px-3 py-[5px] font-semibold">Бўйи</th>
                <th className="text-left px-3 py-[5px] font-semibold">Шаблон</th>
                <th className="text-right px-3 py-[5px] font-semibold">Балка</th>
                <th className="text-right px-3 py-[5px] font-semibold">Ғ/қатор</th>
                <th className="text-right px-3 py-[5px] font-semibold">Жами Ғ</th>
                <th className="text-right px-3 py-[5px] font-semibold">Балка</th>
                <th className="text-right px-3 py-[5px] font-semibold">Майдон</th>
                <th className="text-right px-3 py-[5px] font-semibold">м² нархи</th>
                <th className="text-right px-3 py-[5px] font-semibold">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr
                  key={i}
                  className={
                    "border-b last:border-b-0 border-slate-100 " +
                    (i % 2 === 1 ? "bg-slate-50/60" : "")
                  }
                >
                  <td className="px-3 py-[5px] font-medium text-slate-800">
                    {r.name || (
                      <span className="text-slate-400 italic">Номсиз хона</span>
                    )}
                  </td>
                  <td className="px-3 py-[5px] text-right tabular-nums">
                    {formatNumber(r.innerWidth, 2)}
                    <span className="text-slate-400 text-[7px] ml-0.5">m</span>
                  </td>
                  <td className="px-3 py-[5px] text-right tabular-nums">
                    {formatNumber(r.innerLength, 2)}
                    <span className="text-slate-400 text-[7px] ml-0.5">m</span>
                  </td>
                  <td className="px-3 py-[5px]">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[8px]">
                      <span className="font-semibold">{PATTERN_LABEL[r.pattern]}</span>
                      {r.patternAuto && r.patternAuto !== r.pattern && (
                        <span className="text-slate-400 normal-case text-[7px]">
                          (auto: {PATTERN_LABEL[r.patternAuto]})
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-[5px] text-right tabular-nums text-emerald-700 font-semibold">
                    {formatNumber(r.beamLength, 2)}
                    <span className="text-slate-400 text-[7px] ml-0.5">m</span>
                  </td>
                  <td className="px-3 py-[5px] text-right tabular-nums text-slate-500">
                    {r.blocksPerRow ?? "—"}
                  </td>
                  <td className="px-3 py-[5px] text-right tabular-nums font-semibold">
                    {r.totalBlocks}
                  </td>
                  <td className="px-3 py-[5px] text-right tabular-nums font-semibold">
                    {r.beamCount}
                  </td>
                  <td className="px-3 py-[5px] text-right tabular-nums text-slate-500">
                    {formatNumber(r.monolithArea, 2)}
                    <span className="text-[7px] ml-0.5">m²</span>
                  </td>
                  <td className="px-3 py-[5px] text-right tabular-nums">
                    {formatNumber(r.m2Price, 0)}
                  </td>
                  <td className="px-3 py-[5px] text-right tabular-nums font-bold text-emerald-700">
                    {formatNumber(r.subtotal, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300">
                <td
                  colSpan={6}
                  className="px-3 py-[6px] text-right text-[7px] uppercase tracking-wider text-slate-600 font-bold"
                >
                  Жами
                </td>
                <td className="px-3 py-[6px] text-right tabular-nums font-bold">
                  {data.totals.blocks}
                </td>
                <td className="px-3 py-[6px] text-right tabular-nums font-bold">
                  {data.totals.beams}
                </td>
                <td className="px-3 py-[6px] text-right tabular-nums font-bold">
                  {formatNumber(data.totals.monolithArea, 2)}
                  <span className="text-[7px] ml-0.5 text-slate-500">m²</span>
                </td>
                <td className="px-3 py-[6px]"></td>
                <td className="px-3 py-[6px] text-right tabular-nums font-extrabold text-emerald-700 text-[10px]">
                  {formatNumber(data.totals.sum, 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <div className="mt-6 pt-3 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-400">
          <div>{BRAND_NAME} · {BRAND_TAGLINE}</div>
          <div className="tabular-nums">
            Чиқарилди ·{" "}
            {generatedAt.toLocaleDateString("en-GB")}{" "}
            {generatedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>
    );
  },
);

/**
 * Wrapper that positions the share card offscreen so html-to-image
 * can capture it. The card is laid out at full 1100 px width even
 * on a 360 px phone viewport because `position: fixed` decouples it
 * from the document flow.
 *
 *   <ShareTarget data={shareData} ref={shareRef} />
 *
 * pointer-events-none + aria-hidden so screen readers and clicks
 * pass through to the visible UI.
 */
export const ShareTarget = React.forwardRef<HTMLDivElement, { data: ShareData }>(
  function ShareTarget({ data }, ref) {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none fixed top-0 left-[-99999px]"
      >
        <CalculationShareCard data={data} ref={ref} />
      </div>
    );
  },
);
