"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { api } from "@/lib/fetcher";
import { formatDate, formatNumber } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: string;
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
  deliveryProofUrl: string | null;
  client: { name: string; phone: string; address: string | null };
  project: {
    name: string | null;
    calculations: Array<{
      id: string;
      name: string | null;
      pattern: "GB" | "BGB" | "GBG";
      beamLength: string;
      beamCount: number;
      blocksPerRow: number;
      blockRows: number;
      totalBlocks: number;
      monolithArea: string;
      subtotal: string;
    }>;
  };
}

const PATTERN_LABEL: Record<"GB" | "BGB" | "GBG", string> = {
  GB: "Г-Б",
  BGB: "Б-Г-Б",
  GBG: "Г-Б-Г",
};

export default function OrderPrintPage() {
  const params = useParams<{ id: string }>();
  const { data: order, isLoading } = useQuery<OrderDetail>({
    queryKey: ["order-print", params.id],
    queryFn: () => api(`/api/orders/${params.id}`),
  });

  // Auto-trigger the print dialog once content is ready
  useEffect(() => {
    if (order && typeof window !== "undefined") {
      const t = setTimeout(() => window.print(), 250);
      return () => clearTimeout(t);
    }
  }, [order]);

  if (isLoading || !order) return <div className="p-4">Loading…</div>;

  return (
    <div className="bg-white text-black mx-auto p-8 max-w-[210mm] min-h-[297mm] text-sm">
      <style jsx global>{`
        @media print {
          aside, nav, .print\\:hidden { display: none !important; }
          body { background: white; }
          @page { size: A4; margin: 12mm; }
        }
      `}</style>

      {/* Header */}
      <div className="flex items-baseline justify-between border-b-2 border-black pb-3">
        <div>
          <div className="text-2xl font-black">PRECAST CRM</div>
          <div className="text-xs text-gray-600">Beam-and-block manufacturing</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-gray-500">Буюртма · Order</div>
          <div className="text-2xl font-black tabular-nums">{order.orderNumber}</div>
          <div className="text-xs text-gray-600">Placed {formatDate(order.placedAt)}</div>
        </div>
      </div>

      {/* Client */}
      <div className="grid grid-cols-2 gap-6 mt-5">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500">Мижоз · Client</div>
          <div className="font-semibold">{order.client.name}</div>
          <div className="text-xs tabular-nums">{formatPhone(order.client.phone)}</div>
          {order.client.address && <div className="text-xs">{order.client.address}</div>}
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-widest text-gray-500">Етказиб бериш · Delivery</div>
          <div className="font-semibold">
            {new Date(order.scheduledAt).toLocaleDateString("en-GB", {
              weekday: "short",
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </div>
          <div className="text-xs">Status: {order.status}</div>
        </div>
      </div>

      {/* Rooms table */}
      <div className="mt-5">
        <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-1">
          Хоналар · Rooms
        </div>
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-black">
              <th className="text-left py-1">Name</th>
              <th className="text-center py-1">Pattern</th>
              <th className="text-right py-1">Beam L</th>
              <th className="text-right py-1">Beams</th>
              <th className="text-right py-1">Blocks</th>
              <th className="text-right py-1">Area m²</th>
              <th className="text-right py-1">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {order.project.calculations.map((c) => (
              <tr key={c.id} className="border-b border-gray-200">
                <td className="py-1">{c.name ?? "—"}</td>
                <td className="text-center py-1">{PATTERN_LABEL[c.pattern]}</td>
                <td className="text-right py-1 tabular-nums">{formatNumber(c.beamLength, 2)}</td>
                <td className="text-right py-1 tabular-nums">{c.beamCount}</td>
                <td className="text-right py-1 tabular-nums">{c.totalBlocks}</td>
                <td className="text-right py-1 tabular-nums">{formatNumber(c.monolithArea, 2)}</td>
                <td className="text-right py-1 tabular-nums">{formatNumber(c.subtotal, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pricing summary */}
      <div className="mt-5 ml-auto w-72 text-sm">
        <Row label="Сумма · Subtotal" value={formatNumber(order.roomsSubtotal, 0)} />
        {Number(order.discountPercent) > 0 && (
          <Row
            label={`Чегирма ${formatNumber(order.discountPercent, 1)}%`}
            value={`− ${formatNumber(order.discountAmount, 0)}`}
          />
        )}
        {Number(order.deliveryCost) > 0 && (
          <Row label="Етказиб бериш" value={formatNumber(order.deliveryCost, 0)} />
        )}
        {Number(order.otherCost) > 0 && (
          <Row label="Бошқа · Other" value={formatNumber(order.otherCost, 0)} />
        )}
        <div className="flex justify-between border-t-2 border-black pt-2 mt-2">
          <span className="font-bold">Жами · Total</span>
          <span className="font-black tabular-nums">
            {formatNumber(order.totalPrice, 0)} UZS
          </span>
        </div>
      </div>

      {/* Production summary */}
      <div className="mt-6 grid grid-cols-3 gap-3 text-xs border-t pt-3">
        <div>
          <div className="text-gray-500">Total beams</div>
          <div className="font-semibold tabular-nums">{order.totalBeams} pcs</div>
        </div>
        <div>
          <div className="text-gray-500">Total blocks</div>
          <div className="font-semibold tabular-nums">{order.totalBlocks} pcs</div>
        </div>
        <div>
          <div className="text-gray-500">Slab area</div>
          <div className="font-semibold tabular-nums">{formatNumber(order.totalArea, 2)} m²</div>
        </div>
      </div>

      {/* Signature lines */}
      <div className="mt-12 grid grid-cols-2 gap-12 text-xs">
        <div>
          <div className="border-t border-black pt-1">Operator signature · Имзо</div>
        </div>
        <div>
          <div className="border-t border-black pt-1">Client signature · Мижоз имзоси</div>
        </div>
      </div>

      {/* Delivery proof — printed on its own page so the invoice stays clean */}
      {order.deliveryProofUrl && (
        <div className="mt-8 print:break-before-page">
          <div className="text-[10px] uppercase tracking-widest text-gray-500 mb-2">
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
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-gray-700">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
