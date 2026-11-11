"use client";

/**
 * Gazoblok order card for the client (PNG download / send to chat). A fixed white card,
 * not themed: it is an image the customer receives. Inline styles for the same reason as
 * CalculationShareCard — html-to-image serialises them reliably.
 */
import * as React from "react";
import { formatNumber } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { DEFAULT_TABLE_DESIGN } from "@/lib/table-design-config";
import { shareSummary, type ShareOrder } from "./gazoblok-share";

export { shareCaption, type ShareOrder } from "./gazoblok-share";

const cfg = DEFAULT_TABLE_DESIGN;
const mono: React.CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  fontVariantNumeric: "tabular-nums",
};
const n0 = (v: number) => formatNumber(v, 0);

type Props = { order: ShareOrder & { client: { name: string; phone?: string | null } } };

export const GazoblokShareCard = React.forwardRef<HTMLDivElement, Props>(function GazoblokShareCard({ order }, ref) {
  const s = shareSummary(order);
  const generatedAt = new Date();
  const th = (align: "left" | "right"): React.CSSProperties => ({
    textAlign: align,
    padding: "6px 12px",
    fontSize: 10,
    fontWeight: 700,
    color: cfg.headerText,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    borderBottom: `1px solid ${cfg.borderColor}`,
    backgroundColor: cfg.tableBarBg,
  });
  const td = (align: "left" | "right", extra: React.CSSProperties = {}): React.CSSProperties => ({
    textAlign: align,
    padding: "7px 12px",
    fontSize: 13,
    color: cfg.bodyText,
    borderBottom: `1px solid ${cfg.rowDividerColor}`,
    whiteSpace: "nowrap",
    ...(align === "right" ? mono : {}),
    ...extra,
  });
  const sumRow = (label: string, value: string, strong = false) => (
    <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 16, padding: "3px 0", fontSize: strong ? 16 : 13, fontWeight: strong ? 900 : 500, color: strong ? "#0f172a" : cfg.bodyText }}>
      <span style={strong ? { textTransform: "uppercase", letterSpacing: "0.06em" } : { color: cfg.dimText }}>{label}</span>
      <span style={mono}>{value}</span>
    </div>
  );

  return (
    <div
      ref={ref}
      style={{
        width: 720,
        backgroundColor: "#ffffff",
        color: cfg.bodyText,
        fontFamily: cfg.fontFamily,
        padding: 32,
        boxSizing: "border-box",
      }}
    >
      {/* ── Brand header (as CalculationShareCard) ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, paddingBottom: 16, borderBottom: `2px solid ${cfg.brandDividerColor}` }}>
        <div>
          <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: "-0.025em", lineHeight: 1, color: "#0f172a" }}>{cfg.brandName}</div>
          <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em", color: cfg.dimText, marginTop: 4 }}>Газоблок</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 10, color: cfg.dimText }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: "#1e293b", ...mono }}>{cfg.brandPhone}</div>
          <div style={{ marginTop: 2, ...mono }}>
            {generatedAt.toLocaleDateString("en-GB")} · {generatedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
      </div>

      {/* ── Number + client ── */}
      <div style={{ marginTop: 14, display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
        <span style={{ fontSize: 16, fontWeight: 900, color: "#0f172a", whiteSpace: "nowrap", ...mono }}>№{order.orderNumber}</span>
        <span style={{ fontSize: 12, color: cfg.dimText, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          <span style={{ fontWeight: 600, color: "#1e293b" }}>{order.client.name}</span>
          {order.client.phone && <span style={mono}> · {formatPhone(order.client.phone)}</span>}
        </span>
      </div>

      {/* ── Sizes ── */}
      <div style={{ marginTop: 12, borderRadius: 8, border: `1px solid ${cfg.borderColor}`, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th("left")}>Ўлчам</th>
              <th style={th("right")}>Сони, та</th>
              <th style={th("right")}>Нархи, UZS</th>
              <th style={th("right")}>Сумма, UZS</th>
            </tr>
          </thead>
          <tbody>
            {s.rows.map((r) => (
              <tr key={r.key}>
                <td style={td("left", { fontWeight: 600 })}>{r.label}</td>
                <td style={td("right")}>
                  {n0(r.quantity)}
                  {r.over > 0 && <div style={{ fontSize: "0.8em", color: "#B4500F" }}>+{n0(r.over)} ортиқча</div>}
                </td>
                <td style={td("right")}>{n0(r.unitPrice)}</td>
                <td style={td("right", { fontWeight: 600 })}>{n0(r.sum)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Money ── */}
      <div style={{ marginTop: 14, marginLeft: "auto", width: 340 }}>
        {(s.discount > 0 || s.delivery > 0 || s.overship > 0) && sumRow("Сумма", n0(s.subtotal))}
        {s.discount > 0 && sumRow("Чегирма", `−${n0(s.discount)}`)}
        {s.delivery > 0 && sumRow("Етказиб бериш", n0(s.delivery))}
        {s.overship > 0 && sumRow("Ортиқча юклаш", n0(s.overship))}
        <div style={{ borderTop: `2px solid ${cfg.brandDividerColor}`, marginTop: 4, paddingTop: 4 }}>
          {sumRow("Жами, UZS", n0(s.total), true)}
        </div>
      </div>

      {/* ── Weight + volume ── */}
      <div style={{ marginTop: 14, display: "flex", gap: 24, fontSize: 12, color: cfg.dimText }}>
        <span>Оғирлик: <span style={{ ...mono, fontWeight: 600, color: "#1e293b" }}>{n0(Math.round(s.weightKg))} кг</span></span>
        <span>Ҳажм: <span style={{ ...mono, fontWeight: 600, color: "#1e293b" }}>{formatNumber(s.volumeM3, 2)} м³</span></span>
      </div>
    </div>
  );
});
