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

        {/* ── Title + client + (optional) payment block ─────────── */}
        <div className="flex items-start justify-between gap-6 mt-5">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-black tracking-tight text-slate-900 leading-tight">
              {data.title}
            </h1>
            {data.subtitle && (
              <div className="text-sm text-slate-500 mt-0.5">{data.subtitle}</div>
            )}
            <div className="mt-3 space-y-0.5 text-sm">
              <div className="text-slate-900 font-semibold">{data.clientName}</div>
              {data.clientPhone && (
                <div className="text-slate-600 tabular-nums">
                  {formatPhone(data.clientPhone)}
                </div>
              )}
              {data.clientAddress && (
                <div className="text-slate-600">
                  {addressToCyrillic(data.clientAddress)}
                </div>
              )}
              {data.scheduledLabel && (
                <div className="text-slate-600 mt-1">
                  <span className="text-slate-400 uppercase text-[10px] font-bold tracking-wider mr-2">
                    Етказиб бериш · Delivery
                  </span>
                  <span className="font-semibold tabular-nums">
                    {data.scheduledLabel}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Payment recap — orders only */}
          {data.payment && (
            <div className="text-right shrink-0 min-w-[260px]">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold">
                Жами · Total
              </div>
              <div className="text-3xl font-black tabular-nums text-emerald-700 leading-tight">
                {formatNumber(data.payment.totalPrice, 0)}
                <span className="text-xs text-slate-500 font-normal ml-1">UZS</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between gap-4 text-xs">
                <span className="text-slate-500 uppercase tracking-wider font-bold">
                  Тўлов · Paid
                </span>
                <span className="tabular-nums font-semibold text-slate-700">
                  {formatNumber(data.payment.paid, 0)}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-4 text-xs">
                <span className="text-slate-500 uppercase tracking-wider font-bold">
                  Қолди · Remaining
                </span>
                <span
                  className={`tabular-nums font-semibold ${
                    data.payment.remaining === 0
                      ? "text-emerald-700"
                      : "text-amber-700"
                  }`}
                >
                  {data.payment.remaining === 0
                    ? "0"
                    : formatNumber(data.payment.remaining, 0)}
                </span>
              </div>
              <div
                className={`mt-2 inline-block text-[10px] font-bold uppercase tracking-wider rounded px-2 py-1 ${data.payment.badgeColorCls}`}
              >
                {data.payment.badgeLabel}
              </div>
            </div>
          )}
        </div>

        {/* ── Calculation table ─────────────────────────────────── */}
        <div className="mt-6 rounded-lg border border-slate-200 overflow-hidden">
          <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex items-baseline justify-between">
            <div className="text-[10px] font-bold uppercase tracking-widest text-slate-600">
              Ҳисоб-китоб хулосаси · Calculation summary
            </div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
              {data.rows.length} {data.rows.length === 1 ? "хона · room" : "хона · rooms"}
            </div>
          </div>
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-[10px] uppercase tracking-wider text-slate-600">
              <tr>
                <th className="text-left px-3 py-2.5 font-semibold">Хона · Room</th>
                <th className="text-right px-3 py-2.5 font-semibold">Эни · W</th>
                <th className="text-right px-3 py-2.5 font-semibold">Бўйи · L</th>
                <th className="text-left px-3 py-2.5 font-semibold">Шаблон · Pattern</th>
                <th className="text-right px-3 py-2.5 font-semibold">Балка · Beam</th>
                <th className="text-right px-3 py-2.5 font-semibold">Ғ/қатор · Per row</th>
                <th className="text-right px-3 py-2.5 font-semibold">Жами Ғ · Blocks</th>
                <th className="text-right px-3 py-2.5 font-semibold">Балка · Beams</th>
                <th className="text-right px-3 py-2.5 font-semibold">Майдон · Area</th>
                <th className="text-right px-3 py-2.5 font-semibold">м² нархи · Rate</th>
                <th className="text-right px-3 py-2.5 font-semibold">Сумма · Subtotal</th>
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
                  <td className="px-3 py-2.5 font-medium text-slate-800">
                    {r.name || (
                      <span className="text-slate-400 italic">Номсиз хона · Unnamed</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatNumber(r.innerWidth, 2)}
                    <span className="text-slate-400 text-[10px] ml-0.5">m</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatNumber(r.innerLength, 2)}
                    <span className="text-slate-400 text-[10px] ml-0.5">m</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px]">
                      <span className="font-semibold">{PATTERN_LABEL[r.pattern]}</span>
                      {r.patternAuto && r.patternAuto !== r.pattern && (
                        <span className="text-slate-400 normal-case text-[10px]">
                          (auto: {PATTERN_LABEL[r.patternAuto]})
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700 font-semibold">
                    {formatNumber(r.beamLength, 2)}
                    <span className="text-slate-400 text-[10px] ml-0.5">m</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                    {r.blocksPerRow ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                    {r.totalBlocks}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                    {r.beamCount}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                    {formatNumber(r.monolithArea, 2)}
                    <span className="text-[10px] ml-0.5">m²</span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatNumber(r.m2Price, 0)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-emerald-700">
                    {formatNumber(r.subtotal, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 border-t-2 border-slate-300">
                <td
                  colSpan={6}
                  className="px-3 py-3 text-right text-[10px] uppercase tracking-wider text-slate-600 font-bold"
                >
                  Жами · Totals
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-bold">
                  {data.totals.blocks}
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-bold">
                  {data.totals.beams}
                </td>
                <td className="px-3 py-3 text-right tabular-nums font-bold">
                  {formatNumber(data.totals.monolithArea, 2)}
                  <span className="text-[10px] ml-0.5 text-slate-500">m²</span>
                </td>
                <td className="px-3 py-3"></td>
                <td className="px-3 py-3 text-right tabular-nums font-extrabold text-emerald-700 text-sm">
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
            Generated · {generatedAt.toLocaleDateString("en-GB")}{" "}
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
