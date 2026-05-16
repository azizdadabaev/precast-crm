"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import QRCode from "react-qr-code";
import { api } from "@/lib/fetcher";
import { formatDate, formatNumber } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: "PLACED" | "IN_PRODUCTION" | "DISPATCHED" | "DELIVERED" | "CANCELED";
  paymentState: "AWAITING_PAYMENT" | "PARTIALLY_PAID" | "FULLY_PAID";
  confirmedPaid: string;
  roomsSubtotal: string;
  discountPercent: string;
  discountAmount: string;
  deliveryCost: string;
  otherCost: string;
  totalPrice: string;
  totalArea: string;
  totalBlocks: number;
  totalBeams: number;
  scheduledAt: string;
  placedAt: string;
  deliveredAt: string | null;
  deliveryProofUrl: string | null;
  client: { name: string; phone: string; address: string | null };
  project: {
    name: string | null;
    calculations: Array<{
      id: string;
      name: string | null;
      innerWidth: string;
      innerLength: string;
      pattern: "GB" | "BGB" | "GBG";
      beamLength: string;
      blocksPerRow: number;
      beamCount: number;
      blockRows: number;
      totalBlocks: number;
      monolithLength: string;
      monolithArea: string;
      m2Price: string;
      m2PriceOverride: boolean;
      m2PriceReason: string | null;
      subtotal: string;
    }>;
  };
  dispatch: {
    truckIdentifier: string | null;
    driver: { name: string; phone: string } | null;
  } | null;
}

const PATTERN_LABEL: Record<"GB" | "BGB" | "GBG", string> = {
  GB: "Г-Б",
  BGB: "Б-Г-Б",
  GBG: "Г-Б-Г",
};

const PAYMENT_STATE: Record<
  OrderDetail["paymentState"],
  { uz: string; en: string; cls: string }
> = {
  AWAITING_PAYMENT: { uz: "ТЎЛАНМАГАН", en: "AWAITING PAYMENT", cls: "text-rose-700" },
  PARTIALLY_PAID:   { uz: "ҚИСМАН ТЎЛАНГАН", en: "PARTIALLY PAID", cls: "text-amber-700" },
  FULLY_PAID:       { uz: "ТЎЛАНГАН", en: "FULLY PAID", cls: "text-emerald-700 font-bold" },
};

// Brand constants — TODO: move to AppConfig once an admin-config UI exists.
const BRAND_NAME = "PRECAST CRM";
const BRAND_TAGLINE = "Beam-and-block manufacturing";
const BRAND_PHONE = "+998 XX XXX XX XX";

export default function OrderPrintPage() {
  const params = useParams<{ id: string }>();
  const [pageUrl, setPageUrl] = useState<string>("");

  const { data: order, isLoading } = useQuery<OrderDetail>({
    queryKey: ["order-print", params.id],
    queryFn: () => api(`/api/orders/${params.id}`),
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      setPageUrl(`${window.location.origin}/orders/${params.id}`);
    }
  }, [params.id]);

  // Auto-trigger the print dialog once content is ready
  useEffect(() => {
    if (order && typeof window !== "undefined") {
      const t = setTimeout(() => window.print(), 250);
      return () => clearTimeout(t);
    }
  }, [order]);

  if (isLoading || !order) return <div className="p-4">Loading…</div>;

  const total = Number(order.totalPrice);
  const paid = Number(order.confirmedPaid);
  const remaining = Math.max(0, total - paid);
  const paymentMeta = PAYMENT_STATE[order.paymentState];
  const isFullyPaid = order.paymentState === "FULLY_PAID";

  // Delivery row: prefer the actual delivery date if it's been delivered.
  const deliveryLabel = (() => {
    const fmt = (iso: string) =>
      new Date(iso).toLocaleDateString("en-GB", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    if (order.status === "DELIVERED" && order.deliveredAt) {
      return { tag: "Delivered", value: fmt(order.deliveredAt) };
    }
    if (order.status === "DISPATCHED") {
      return { tag: "Dispatching", value: fmt(order.scheduledAt) };
    }
    return { tag: "Scheduled", value: fmt(order.scheduledAt) };
  })();

  return (
    <div className="bg-white text-black mx-auto px-[15mm] py-[15mm] max-w-[210mm] min-h-[297mm] text-[11pt] relative">
      <style jsx global>{`
        @media print {
          aside,
          nav,
          .no-print,
          .print\\:hidden {
            display: none !important;
          }
          body {
            background: white;
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
          @page {
            size: A4 portrait;
            margin: 15mm;
          }
          table,
          tr {
            page-break-inside: avoid;
          }
          .print\\:break-before-page {
            page-break-before: always;
          }
        }
      `}</style>

      {/* PAID watermark — only on fully-paid orders */}
      {isFullyPaid && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex items-center justify-center select-none"
        >
          <div
            className="text-emerald-700 font-black tracking-widest"
            style={{
              fontSize: "180px",
              opacity: 0.07,
              transform: "rotate(-22deg)",
            }}
          >
            PAID
          </div>
        </div>
      )}

      <div className="relative">
        {/* ─── 1. Header ─── */}
        <div className="flex items-baseline justify-between border-b-2 border-black pb-3">
          <div>
            <div className="text-[18pt] font-black leading-tight">{BRAND_NAME}</div>
            <div className="text-[10pt] text-gray-600">{BRAND_TAGLINE}</div>
          </div>
          <div className="text-right">
            <div className="text-[9pt] uppercase tracking-widest text-gray-500">
              Буюртма · Order
            </div>
            <div className="text-[16pt] font-black tabular-nums leading-tight">
              {order.orderNumber}
            </div>
            <div className="text-[9pt] text-gray-600">
              Placed {formatDate(order.placedAt)}
            </div>
          </div>
        </div>

        {/* ─── 2. Client + Delivery ─── */}
        <div className="grid grid-cols-2 gap-6 mt-5 pb-4 border-b border-gray-300">
          <div>
            <div className="text-[9pt] uppercase tracking-widest text-gray-500 mb-1">
              Мижоз · Client
            </div>
            <div className="text-[12pt] font-bold leading-tight">{order.client.name}</div>
            <div className="text-[10pt] tabular-nums">{formatPhone(order.client.phone)}</div>
            {order.client.address && (
              <div className="text-[10pt]">{order.client.address}</div>
            )}
          </div>
          <div>
            <div className="text-[9pt] uppercase tracking-widest text-gray-500 mb-1">
              Етказиб бериш · Delivery
            </div>
            <div className="text-[12pt] font-bold leading-tight">
              {deliveryLabel.tag}: {deliveryLabel.value}
            </div>
            <div className="text-[10pt]">
              Status:{" "}
              <span className="font-semibold uppercase tracking-wider">
                {order.status.replace(/_/g, " ")}
              </span>
            </div>
            {order.dispatch && (
              <>
                {order.dispatch.driver && (
                  <div className="text-[10pt] mt-1">
                    Driver: <span className="font-medium">{order.dispatch.driver.name}</span>
                  </div>
                )}
                {order.dispatch.truckIdentifier && (
                  <div className="text-[10pt] text-gray-600">
                    Truck: <span className="tabular-nums">{order.dispatch.truckIdentifier}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* ─── 3. Rooms table — same columns as the on-screen calc summary,
                 tightened to one row per room with tinted column groups ─── */}
        <div className="mt-5">
          <div className="text-[9pt] uppercase tracking-widest text-gray-500 mb-2">
            Хоналар · Rooms
          </div>
          <table className="w-full text-[9pt] border-collapse">
            <thead>
              <tr className="border-b-2 border-black uppercase text-[8pt] font-semibold tracking-wider text-gray-600">
                <th className="px-1.5 py-1.5 text-left bg-yellow-50">Name</th>
                <th className="px-1.5 py-1.5 text-center bg-yellow-50">W</th>
                <th className="px-1.5 py-1.5 text-center bg-yellow-50">L</th>
                <th className="px-1.5 py-1.5 text-center bg-blue-50">Pattern</th>
                <th className="px-1.5 py-1.5 text-center bg-green-50">Beam Len</th>
                <th className="px-1.5 py-1.5 text-center">Blks/Row</th>
                <th className="px-1.5 py-1.5 text-center bg-orange-50">Total Blks</th>
                <th className="px-1.5 py-1.5 text-center bg-gray-100">Beams</th>
                <th className="px-1.5 py-1.5 text-center">Slab L</th>
                <th className="px-1.5 py-1.5 text-center">Area</th>
                <th className="px-1.5 py-1.5 text-center bg-green-50">m² Rate</th>
                <th className="px-1.5 py-1.5 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {order.project.calculations.map((c) => (
                <tr key={c.id} className="border-b border-gray-200">
                  <td className="px-1.5 py-1.5 font-medium bg-yellow-50/40">
                    {c.name ?? "—"}
                  </td>
                  <td className="px-1.5 py-1.5 text-center tabular-nums bg-yellow-50/40">
                    {formatNumber(c.innerWidth, 2)}
                  </td>
                  <td className="px-1.5 py-1.5 text-center tabular-nums bg-yellow-50/40">
                    {formatNumber(c.innerLength, 2)}
                  </td>
                  <td className="px-1.5 py-1.5 text-center bg-blue-50/40">
                    {PATTERN_LABEL[c.pattern]}
                  </td>
                  <td className="px-1.5 py-1.5 text-center tabular-nums font-semibold bg-green-50/40 text-green-900">
                    {formatNumber(c.beamLength, 2)}
                  </td>
                  <td className="px-1.5 py-1.5 text-center tabular-nums">
                    {c.blockRows > 0 ? c.blocksPerRow : "—"}
                  </td>
                  <td className="px-1.5 py-1.5 text-center tabular-nums font-bold bg-orange-50/40 text-orange-900">
                    {c.totalBlocks}
                  </td>
                  <td className="px-1.5 py-1.5 text-center tabular-nums font-bold bg-gray-100">
                    {c.beamCount}
                  </td>
                  <td className="px-1.5 py-1.5 text-center tabular-nums">
                    {formatNumber(c.monolithLength, 2)} m
                  </td>
                  <td className="px-1.5 py-1.5 text-center tabular-nums">
                    {formatNumber(c.monolithArea, 2)} m²
                  </td>
                  <td
                    className={`px-1.5 py-1.5 text-center tabular-nums font-semibold ${
                      c.m2PriceOverride
                        ? "bg-amber-50/60 text-amber-900"
                        : "bg-green-50/40 text-green-900"
                    }`}
                  >
                    {formatNumber(c.m2Price, 0)}
                    {c.m2PriceOverride && (
                      <div className="text-[8px] font-normal text-amber-800 leading-tight mt-0.5">
                        ↑ Special rate
                        {c.m2PriceReason && (
                          <div className="text-[7px] text-amber-700 italic leading-tight">
                            {c.m2PriceReason}
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-1.5 py-1.5 text-right tabular-nums font-bold text-green-800">
                    {formatNumber(c.subtotal, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ─── 4. Totals strip ─── */}
        <div className="grid grid-cols-3 gap-4 py-3 border-y mt-2 text-[10pt]">
          <div>
            <div className="text-gray-500 text-[8pt] uppercase tracking-wider">
              Total beams
            </div>
            <div className="font-bold tabular-nums">{order.totalBeams} pcs</div>
          </div>
          <div>
            <div className="text-gray-500 text-[8pt] uppercase tracking-wider">
              Total blocks
            </div>
            <div className="font-bold tabular-nums">{order.totalBlocks} pcs</div>
          </div>
          <div>
            <div className="text-gray-500 text-[8pt] uppercase tracking-wider">
              Slab area
            </div>
            <div className="font-bold tabular-nums">
              {formatNumber(order.totalArea, 2)} m²
            </div>
          </div>
        </div>

        {/* ─── 5. Pricing breakdown ─── */}
        <div className="mt-5 ml-auto w-72 text-[11pt]">
          <Row label="Сумма · Subtotal" value={formatNumber(order.roomsSubtotal, 0)} />
          {Number(order.discountPercent) > 0 && (
            <Row
              label={`Чегирма · Discount ${formatNumber(order.discountPercent, 1)}%`}
              value={`− ${formatNumber(order.discountAmount, 0)}`}
            />
          )}
          {Number(order.deliveryCost) > 0 && (
            <Row
              label="Етказиб бериш · Delivery"
              value={formatNumber(order.deliveryCost, 0)}
            />
          )}
          {Number(order.otherCost) > 0 && (
            <Row label="Бошқа · Other" value={formatNumber(order.otherCost, 0)} />
          )}
          <div className="flex justify-between border-t-2 border-black pt-2 mt-2">
            <span className="font-bold">ЖАМИ · TOTAL</span>
            <span className="font-black tabular-nums text-[12pt]">
              {formatNumber(order.totalPrice, 0)}
              <span className="text-[9pt] text-gray-500 font-normal ml-1">UZS</span>
            </span>
          </div>
        </div>

        {/* ─── 6. Payment status ─── */}
        <div className="mt-4 ml-auto w-72 text-[11pt]">
          <div className="text-[9pt] uppercase tracking-widest text-gray-500 mb-1">
            Тўлов · Payment
          </div>
          <Row label="Тўланган · Paid" value={formatNumber(paid, 0)} />
          <Row label="Қолди · Remaining" value={formatNumber(remaining, 0)} />
          <div className="flex justify-between pt-2 mt-1 border-t border-gray-300">
            <span className="text-[9pt] uppercase tracking-wider text-gray-500">
              Status
            </span>
            <span className={`tabular-nums uppercase tracking-wider ${paymentMeta.cls}`}>
              {paymentMeta.uz} · {paymentMeta.en}
            </span>
          </div>
        </div>

        {/* ─── 7. Signature block ─── */}
        <div className="mt-16 grid grid-cols-2 gap-12 text-[10pt]">
          <div>
            <div className="text-[9pt] uppercase tracking-widest text-gray-500 mb-10">
              Operator signature · Имзо
            </div>
            <div className="border-b border-black mb-4 h-6"></div>
            <div className="text-gray-600">Name: ___________________________</div>
            <div className="text-gray-600 mt-2">Date: ___________________________</div>
          </div>
          <div>
            <div className="text-[9pt] uppercase tracking-widest text-gray-500 mb-10">
              Client signature · Мижоз имзоси
            </div>
            <div className="border-b border-black mb-4 h-6"></div>
            <div className="text-gray-600">Name: ___________________________</div>
            <div className="text-gray-600 mt-2">Date: ___________________________</div>
          </div>
        </div>

        {/* ─── 8. Footer ─── */}
        <div className="mt-10 pt-3 border-t border-gray-300 flex items-center justify-between text-[9pt] text-gray-600">
          <div className="flex items-center gap-3">
            {pageUrl && (
              <div style={{ width: 60, height: 60 }}>
                <QRCode value={pageUrl} size={60} />
              </div>
            )}
            <div className="text-[8pt] text-gray-500 max-w-[60mm] leading-tight">
              Scan to open this order on the operator dashboard.
            </div>
          </div>
          <div className="text-right">
            <div className="font-semibold text-black">{BRAND_NAME}</div>
            <div>etalon.uz · {BRAND_PHONE}</div>
          </div>
        </div>

        {/* Delivery proof — its own page */}
        {order.deliveryProofUrl && (
          <div className="mt-8 print:break-before-page">
            <div className="text-[9pt] uppercase tracking-widest text-gray-500 mb-2">
              Етказиб бериш фотоси · Delivery proof
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={order.deliveryProofUrl}
              alt="Truck loaded with order"
              className="w-full max-h-[24cm] object-contain border"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-[11pt] py-0.5">
      <span className="text-gray-700">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
