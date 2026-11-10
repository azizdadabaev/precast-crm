"use client";

import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  Calendar,
  CheckCircle2,
  Factory,
  Loader2,
  Pencil,
  Plus,
  Repeat,
  Truck,
} from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Chip } from "@/components/ui/chip";
import { formatDate, formatDateTime, formatNumber } from "@/lib/utils";
import { PhoneLink } from "@/components/PhoneLink";
import { useLang, useT } from "@/lib/i18n";
import { CommentThread } from "@/components/comments/CommentThread";
import { ReceiptPicker } from "@/components/payments/ReceiptPicker";
import { GazoblokShipmentsSection } from "@/components/gazoblok/GazoblokShipmentsSection";
import { blockWeightKg, type GazoblokLine } from "@/lib/gazoblok-weight";
import { PAYMENT_METHOD_LABELS, EVENT_TYPE_LABELS } from "@/lib/gazoblok-labels";
import { GazoblokQuantitiesTable } from "@/components/gazoblok/GazoblokQuantitiesTable";
import { GazoblokDebtPanel } from "@/components/gazoblok/GazoblokDebtPanel";
import { GazoblokCloseShortDialog } from "@/components/gazoblok/GazoblokCloseShortDialog";
import {
  GazoblokEditOrderDialog,
  type GazoblokCatalogProduct,
} from "@/components/gazoblok/GazoblokEditOrderDialog";
import { GazoblokShareCard, shareCaption } from "@/components/gazoblok/GazoblokShareCard";
import { ShareCalculationButton } from "@/components/ShareCalculationButton";
import { SendQuoteToChatButton } from "@/components/inbox/SendQuoteToChatButton";
import { DeliveryLocationCard } from "@/components/logistics/DeliveryLocationCard";
import { eventText, parseMoney, uzPart } from "@/lib/gazoblok-text";
import {
  cancelBlock,
  deliverBlockers,
  historyLine,
  paymentRow,
  regroupMoney,
  screenActions,
  totalTone,
} from "@/lib/gazoblok-order-screen";
import type { LineQty } from "@/lib/gazoblok-quantities";

type GazoblokShipmentStatus = "PENDING" | "LOADED" | "DELIVERED";

type Status = "PLACED" | "IN_PRODUCTION" | "DELIVERED" | "CANCELED";
type PaymentState = "AWAITING_PAYMENT" | "PARTIALLY_PAID" | "FULLY_PAID";
type PaymentStatus = "PENDING_CONFIRMATION" | "CONFIRMED" | "REJECTED";
type PaymentMethod = "CASH" | "BANK_TRANSFER" | "CLICK" | "PAYME" | "OTHER";

interface OrderDetail {
  id: string;
  orderNumber: string;
  status: Status;
  paymentState: PaymentState;
  confirmedPaid: string;
  totalPrice: string;
  totalBlocks: number;
  totalVolumeM3: string;
  linesSubtotal: string;
  discountPercent: string;
  discountAmount: string;
  deliveryCost: string;
  overshipAmount: string;
  notes: string | null;
  scheduledAt: string | null;
  sourceOrder: { id: string; orderNumber: string } | null;
  reorders: Array<{ id: string; orderNumber: string }>;
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryLocationUrl: string | null;
  deliveryLocationLabel: string | null;
  deliveryProofUrl: string | null;
  deliveryProofUploadedAt: string | null;
  placedAt: string | null;
  deliveredAt: string | null;
  canceledAt: string | null;
  cancelReason: string | null;
  shortClosedAt: string | null;
  shortCloseReason: string | null;
  // Strict per-size picture + money to chase or give back (computed by the API).
  quantities: LineQty[];
  unpaidOverload: number;
  refundDue: number;
  createdBy: { id: string; name: string } | null;
  // Read-only snapshot of the wall calculator that produced the order (stored JSON).
  wallEstimate: Record<string, unknown> | null;
  client: { id: string; name: string; phone: string; address: string | null };
  lines: Array<{
    id: string;
    productLabel: string;
    unitPrice: string;
    quantity: number;
    lineTotal: string;
    product: { id: string; label: string; lengthM: string; heightM: string; thicknessM: string } | null;
  }>;
  shipments: Array<{
    id: string;
    number: number;
    status: GazoblokShipmentStatus;
    loadedLines: Record<string, number> | null;
    loadedPhotoUrls: string[];
    loadedAt: string | null;
    deliveredAt: string | null;
    notes: string | null;
  }>;
  payments: Array<{
    id: string;
    amount: string;
    method: PaymentMethod;
    status: PaymentStatus;
    recordedAt: string | null;
    confirmedAt: string | null;
    notes: string | null;
    receipts: Array<{ id: string; imageUrl: string }>;
    recordedBy: { id: string; name: string } | null;
  }>;
  events: Array<{
    id: string;
    type: string;
    message: string | null;
    payload: unknown;
    createdAt: string;
    actor: { id: string; name: string } | null;
  }>;
}

interface StockWarning {
  productId: string;
  resultingQuantity: number;
  decrementedBy: number;
}

const STATUS_META: Record<Status, { uz: string; en: string; variant: React.ComponentProps<typeof Chip>["variant"] }> = {
  PLACED:        { uz: "Қабул қилинган",   en: "Placed",        variant: "default" },
  IN_PRODUCTION: { uz: "Ишлаб чиқилмоқда", en: "In production", variant: "default" },
  DELIVERED:     { uz: "Етказилган",       en: "Delivered",     variant: "success" },
  CANCELED:      { uz: "Бекор қилинган",   en: "Canceled",      variant: "neutral" },
};

const PAYMENT_STATE_META: Record<PaymentState, { uz: string; en: string; variant: React.ComponentProps<typeof Chip>["variant"] }> = {
  AWAITING_PAYMENT: { uz: "Тўлов кутилмоқда", en: "Awaiting payment", variant: "neutral" },
  PARTIALLY_PAID:   { uz: "Қисман тўланган",  en: "Partially paid",   variant: "default" },
  FULLY_PAID:       { uz: "Тўлиқ тўланган",   en: "Fully paid",       variant: "success" },
};

const PAYMENT_STATUS_META: Record<PaymentStatus, { uz: string; en: string; variant: React.ComponentProps<typeof Chip>["variant"] }> = {
  PENDING_CONFIRMATION: { uz: "Тасдиқланмаган", en: "Unconfirmed",   variant: "warning" },
  CONFIRMED:            { uz: "Тасдиқланган", en: "Confirmed", variant: "success" },
  REJECTED:             { uz: "Рад этилган",  en: "Rejected",  variant: "danger" },
};

const PAYMENT_METHODS: PaymentMethod[] = ["CASH", "BANK_TRANSFER", "CLICK", "PAYME", "OTHER"];

export default function GazoblokOrderDetailPage() {
  const t = useT();
  const lang = useLang();
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const cardRef = useRef<HTMLDivElement>(null);
  const [editMode, setEditMode] = useState<"full" | "schedule" | null>(null);
  const showError = (e: Error) => setError(uzPart(e.message, lang));

  const [error, setError] = useState<string | null>(null);
  const [stockWarning, setStockWarning] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("CASH");
  const [payReceiptUrls, setPayReceiptUrls] = useState<string[]>([]);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [deliverOpen, setDeliverOpen] = useState(false);
  const [rejectPaymentId, setRejectPaymentId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { data: order, isLoading, isError } = useQuery<OrderDetail>({
    queryKey: ["gazoblok-order", id],
    queryFn: () => api(`/api/gazoblok/orders/${id}`),
  });

  // Only users with the maker-checker payment.confirm permission may
  // confirm/reject payments — everything else here stays open to anyone.
  const { data: me } = useQuery<{ permissions: string[] }>({
    queryKey: ["me"],
    queryFn: () => api("/api/auth/me"),
  });
  const perms = me?.permissions ?? [];
  const canConfirm = perms.includes("payment.confirm");
  const canEdit = perms.includes("order.edit");
  const canCancelPerm = perms.includes("order.cancel");
  const canRecord = perms.includes("payment.record");
  const canEditShipped = perms.includes("order.editShipped");
  const [closeShortOpen, setCloseShortOpen] = useState(false);

  // Catalog for the edit dialog's «add a size» — only fetched once the dialog opens.
  const { data: catalog } = useQuery<GazoblokCatalogProduct[]>({
    queryKey: ["gazoblok", "products"],
    queryFn: () => api("/api/gazoblok/products"),
    enabled: editMode === "full",
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["gazoblok-order", id] });
    qc.invalidateQueries({ queryKey: ["gazoblok-orders"] });
  }

  const deliveryLocation = useMutation({
    mutationFn: (body: { lat: number | null; lng: number | null; url?: string | null; label?: string | null }) =>
      api(`/api/gazoblok/orders/${id}/delivery-location`, { method: "PATCH", json: body }),
    onSuccess: refresh,
    onError: showError,
  });

  const setStatus = useMutation({
    mutationFn: (vars: { status: Status; reason?: string }) =>
      api<{ stockWarnings?: StockWarning[] }>(`/api/gazoblok/orders/${id}`, {
        method: "PATCH",
        json: { action: "set_status", status: vars.status, reason: vars.reason },
      }),
    onSuccess: (data, vars) => {
      setCancelOpen(false);
      setCancelReason("");
      setDeliverOpen(false);
      if (vars.status === "DELIVERED") {
        qc.invalidateQueries({ queryKey: ["gazoblok", "stock"] });
        setStockWarning((data.stockWarnings?.length ?? 0) > 0);
      }
      refresh();
    },
    onError: (e: Error) => {
      // Close the dialogs so the error banner isn't hidden behind the overlay.
      setCancelOpen(false);
      setDeliverOpen(false);
      showError(e);
    },
  });

  const recordPayment = useMutation({
    mutationFn: (vars: { amount: number; method: PaymentMethod; receiptUrls: string[] }) =>
      api(`/api/gazoblok/orders/${id}`, {
        method: "PATCH",
        json: { action: "record_payment", amount: vars.amount, method: vars.method, receiptUrls: vars.receiptUrls },
      }),
    onSuccess: () => {
      setPayAmount("");
      setPayReceiptUrls([]);
      refresh();
    },
    onError: showError,
  });

  const confirmPayment = useMutation({
    mutationFn: (vars: { paymentId: string; approve: boolean; rejectionReason?: string }) =>
      api(`/api/gazoblok/orders/${id}`, {
        method: "PATCH",
        json: {
          action: "confirm_payment",
          paymentId: vars.paymentId,
          approve: vars.approve,
          rejectionReason: vars.rejectionReason,
        },
      }),
    onSuccess: () => {
      setRejectPaymentId(null);
      setRejectReason("");
      refresh();
    },
    onError: (e: Error) => {
      setRejectPaymentId(null);
      showError(e);
    },
  });

  function advance(status: Status) {
    setError(null);
    setStatus.mutate({ status });
  }

  function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = parseMoney(payAmount);
    if (amount === null || amount <= 0) {
      setError(t("Тўғри сумма киритинг: масалан 1 000 000", "Enter a valid amount: e.g. 1 000 000"));
      return;
    }
    recordPayment.mutate({ amount, method: payMethod, receiptUrls: payReceiptUrls });
  }

  if (isLoading) {
    return <div className="p-4 text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>;
  }

  if (isError || !order) {
    return (
      <div className="rounded-lg border bg-background p-5 shadow-sm space-y-3">
        <div className="text-sm text-destructive">
          {t("Буюртмани юклаб бўлмади ёки топилмади.", "Failed to load or order not found.")}
        </div>
        <Link
          href="/gazoblok/orders"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 mr-1" /> {t("Буюртмаларга қайтиш", "Back to orders")}
        </Link>
      </div>
    );
  }

  const status = STATUS_META[order.status];
  const isCanceled = order.status === "CANCELED";
  const isOpenOrder = (order.status === "PLACED" || order.status === "IN_PRODUCTION") && !order.shortClosedAt;
  const loadedTotal = order.quantities.reduce((sum, q) => sum + q.loaded, 0);
  const leftTotal = order.quantities.reduce((sum, q) => sum + q.left, 0);
  const overTotal = order.quantities.reduce((sum, q) => sum + q.over, 0);
  const payState = PAYMENT_STATE_META[order.paymentState];
  const totalNum = Number(order.totalPrice);
  const paidNum = Number(order.confirmedPaid);
  const remainingNum = Math.max(0, totalNum - paidNum);
  const overshipNum = Number(order.overshipAmount);
  // Frozen base — reconstructible from the still-frozen pricing snapshot.
  const baseNum = Number(order.linesSubtotal) - Number(order.discountAmount) + Number(order.deliveryCost);

  // Per-line weight for the split-shipment distributor. perBlockKg from the
  // product dimensions; when the product was deleted, fall back to the order
  // average (total volume / total blocks × NAAC density 611).
  const totalBlocks = order.totalBlocks;
  const avgPerBlockKg = totalBlocks > 0
    ? (Number(order.totalVolumeM3) / totalBlocks) * 611
    : 0;
  const weightLines: Array<GazoblokLine & { unitPrice: number }> = order.lines.map((l) => ({
    lineId: l.id,
    label: l.productLabel,
    quantity: l.quantity,
    unitPrice: Number(l.unitPrice),
    perBlockKg: l.product
      ? blockWeightKg(Number(l.product.lengthM), Number(l.product.heightM), Number(l.product.thicknessM))
      : avgPerBlockKg,
  }));

  const actions = screenActions(order, perms);
  const canStartProduction = canEdit && order.status === "PLACED" && !order.shortClosedAt;
  const canDeliver = canEdit && (order.status === "PLACED" || order.status === "IN_PRODUCTION");
  const deliverReasons = deliverBlockers({
    quantities: order.quantities,
    shortClosedAt: order.shortClosedAt,
    openShipments: order.shipments.filter((sh) => sh.status !== "DELIVERED").length,
    remaining: totalNum - paidNum,
  });
  // Cancel only while nothing has left the yard; after a load the order is closed short.
  const canCancelShown = canCancelPerm && isOpenOrder;
  const cancelBlocked = cancelBlock(loadedTotal);
  const canCloseShort = canEdit && isOpenOrder && loadedTotal > 0 && leftTotal > 0;
  // 0.005 tolerance: totals arrive as decimal strings — don't let float dust
  // (e.g. remaining 0.0000001) keep the payment form open on a settled order.
  const canRecordPayment = canRecord && !isCanceled && remainingNum > 0.005;
  const payAmountNum = parseMoney(payAmount);
  const payAmountUnreadable = payAmount.trim() !== "" && payAmountNum === null;
  const payAmountTooHigh = payAmountNum !== null && payAmountNum > remainingNum + 0.005;
  const shareFileBase = `Gazoblok-${order.orderNumber}`;

  return (
    <div className="space-y-5">
      <Link
        href="/gazoblok/orders"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> {t("Буюртмаларга қайтиш", "Back to orders")}
      </Link>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {stockWarning && (
        <div className="text-sm text-warning bg-warning/10 border border-warning/30 px-3 py-2 rounded">
          {t("Диққат: захира манфий бўлди", "Warning: stock went negative")}
        </div>
      )}

      {/* Header card */}
      <div className="rounded-lg border bg-background p-4 sm:p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Газоблок буюртмаси<span className="lang-en"> · Gazoblok order</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap mt-0.5">
              <h1 className="text-3xl font-black tabular-nums tracking-tight">{order.orderNumber}</h1>
              <Chip variant={status.variant}>{t(status.uz, status.en)}</Chip>
              {!isCanceled && <Chip variant={payState.variant}>{t(payState.uz, payState.en)}</Chip>}
              {order.shortClosedAt && <Chip variant="warning">{t("Қисқа ёпилган", "Closed short")}</Chip>}
            </div>
            <div className="text-sm text-muted-foreground mt-2 break-words">
              {t("Мижоз:", "Client:")}{" "}
              <Link href={`/clients/${order.client.id}`} className="text-foreground font-medium hover:underline">
                {order.client.name}
              </Link>
              {" · "}
              <PhoneLink phone={order.client.phone} />
              {order.client.address && <> · {order.client.address}</>}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {t("Сотувчи:", "Seller:")} <span className="text-foreground font-medium">{order.createdBy?.name ?? "—"}</span>
            </div>
            {order.sourceOrder && (
              <div className="text-sm text-muted-foreground mt-1">
                {t("Такрорий буюртма:", "Reorder of:")}{" "}
                <Link href={`/gazoblok/orders/${order.sourceOrder.id}`} className="font-mono tabular-nums text-primary hover:underline">
                  {order.sourceOrder.orderNumber}
                </Link>{" "}
                {t("асосида", "")}
              </div>
            )}
            {order.reorders.length > 0 && (
              <div className="text-sm text-muted-foreground mt-1">
                {t("Қайта буюртмалар:", "Reorders:")}{" "}
                {order.reorders.map((r, i) => (
                  <span key={r.id}>
                    {i > 0 && ", "}
                    <Link href={`/gazoblok/orders/${r.id}`} className="font-mono tabular-nums text-primary hover:underline">
                      {r.orderNumber}
                    </Link>
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {(order.scheduledAt || actions.edit) && (
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5" />
                  {t("Жадвал:", "Scheduled:")}{" "}
                  <span className="tabular-nums font-medium text-foreground">
                    {order.scheduledAt ? formatDate(order.scheduledAt) : "—"}
                  </span>
                  {actions.edit && (
                    <button
                      type="button"
                      className="min-h-[44px] px-2 text-primary hover:underline"
                      onClick={() => {
                        setError(null);
                        setEditMode("schedule");
                      }}
                    >
                      {t("Санани ўзгартириш", "Change date")}
                    </button>
                  )}
                </span>
              )}
              {order.placedAt && (
                <span className="tabular-nums">{t("Қабул қилинган", "Placed")} {formatDate(order.placedAt)}</span>
              )}
              {order.deliveredAt && (
                <span className="tabular-nums">{t("Етказилган", "Delivered")} {formatDate(order.deliveredAt)}</span>
              )}
            </div>
            {order.notes && (
              <div className="mt-2 text-sm text-muted-foreground break-words">
                {t("Изоҳ:", "Notes:")} <span className="text-foreground">{order.notes}</span>
              </div>
            )}
          </div>
          <div className="w-full sm:w-auto sm:min-w-[16rem] space-y-1 text-sm">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold sm:text-right">
              Жами<span className="lang-en"> · Total</span>
            </div>
            <div className={`text-3xl font-black tabular-nums font-mono sm:text-right ${totalTone(order.paymentState)}`}>
              {formatNumber(totalNum, 0)}
              <span className="text-xs text-muted-foreground font-normal ml-1">UZS</span>
            </div>
            <Row
              label={t("Тўланган", "Paid")}
              value={formatNumber(paidNum, 0)}
              valueClassName={paidNum > 0 ? "text-success" : "text-muted-foreground"}
            />
            {!isCanceled && (
              <Row
                label={t("Қолди", "Remaining")}
                value={formatNumber(remainingNum, 0)}
                valueClassName={remainingNum > 0.005 ? "text-foreground" : "text-muted-foreground"}
              />
            )}
            {overshipNum > 0 && (
              <Row
                label={t("Шундан ортиқча юклаш", "Of which over-load")}
                value={formatNumber(overshipNum, 0)}
                valueClassName="text-destructive"
              />
            )}
          </div>
        </div>

        {/* Header actions — 44 px targets, wrap on phones */}
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.edit && (
            <Button
              variant="outline"
              size="sm"
              className="min-h-[44px]"
              onClick={() => {
                setError(null);
                setEditMode("full");
              }}
            >
              <Pencil className="h-3.5 w-3.5 mr-1.5" />
              {t("Таҳрирлаш", "Edit")}
            </Button>
          )}
          {actions.reorder && (
            <Button variant="outline" size="sm" className="min-h-[44px]" asChild>
              <Link href={`/gazoblok/new?from=${order.id}`}>
                <Repeat className="h-3.5 w-3.5 mr-1.5" />
                {t("Қайта буюртма", "Reorder")}
              </Link>
            </Button>
          )}
          <ShareCalculationButton targetRef={cardRef} fileBase={shareFileBase} />
          {actions.chat && (
            <SendQuoteToChatButton
              targetRef={cardRef}
              conversationId={null}
              fileBase={shareFileBase}
              caption={shareCaption(order)}
            />
          )}
        </div>

        {order.shortClosedAt && order.shortCloseReason && (
          <div className="mt-3 text-sm text-warning bg-warning/10 border border-warning/30 px-3 py-2 rounded">
            {t("Қисқа ёпиш сабаби:", "Closed short because:")} {order.shortCloseReason}
          </div>
        )}
        {isCanceled && order.cancelReason && (
          <div className="mt-3 text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
            {t("Бекор қилиш сабаби:", "Cancellation reason:")} {order.cancelReason}
          </div>
        )}
      </div>

      <GazoblokDebtPanel
        orderId={order.id}
        overBlocks={overTotal}
        overshipAmount={overshipNum}
        unpaidOverload={order.unpaidOverload}
        sellerName={order.createdBy?.name ?? null}
        refundDue={order.refundDue}
        canRefund={canConfirm}
        onChanged={refresh}
      />

      {/* Lines */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          Маҳсулотлар<span className="lang-en"> · Lines</span>
        </div>
        <GazoblokQuantitiesTable
          quantities={order.quantities}
          prices={Object.fromEntries(order.lines.map((l) => [l.id, { unitPrice: Number(l.unitPrice), lineTotal: Number(l.lineTotal) }]))}
        />

        {/* Totals */}
        <div className="border-t-2 border-border-strong bg-muted/30 px-4 py-3 space-y-1.5 text-sm">
          <Row label={t("Оралиқ сумма", "Subtotal")} value={formatNumber(Number(order.linesSubtotal), 0)} />
          {Number(order.discountAmount) > 0 && (
            <Row label={t("Чегирма", "Discount")} value={`− ${formatNumber(Number(order.discountAmount), 0)}`} />
          )}
          {Number(order.deliveryCost) > 0 && (
            <Row label={t("Етказиб бериш", "Delivery")} value={formatNumber(Number(order.deliveryCost), 0)} />
          )}
          {overshipNum > 0 && (
            <>
              <Row label={t("Буюртма жами", "Base")} value={formatNumber(baseNum, 0)} />
              <Row
                label={t("Ортиқча юклаш", "Over-ship")}
                value={`+ ${formatNumber(overshipNum, 0)}`}
                valueClassName="text-primary"
              />
            </>
          )}
          <Row
            label={t("ЖАМИ", "TOTAL")}
            value={`${formatNumber(totalNum, 0)} UZS`}
            strong
            valueClassName={totalTone(order.paymentState)}
          />
          <div className="flex items-center justify-between pt-1.5 text-xs text-muted-foreground border-t border-border/60 mt-1.5">
            <span>{t("Блоклар", "Blocks")}: <span className="font-mono font-semibold text-foreground">{formatNumber(order.totalBlocks, 0)}</span></span>
            <span>{t("Ҳажм", "Volume")}: <span className="font-mono font-semibold text-foreground">{formatNumber(Number(order.totalVolumeM3), 2)} м³</span></span>
          </div>
        </div>
      </div>


      {/* Estimate — read-only snapshot of the wall calculator that produced this order */}
      {order.wallEstimate && (() => {
        const snap = order.wallEstimate as unknown as {
          walls?: Array<{
            name?: string;
            lengthM: number;
            heightM: number;
            productId?: string;
            orientation?: "STANDARD" | "ROTATED";
            openings?: Array<{ kind: string; widthM: number; heightM: number; qty: number }>;
          }>;
          result?: { glue?: { kg: number; bags: number } };
        };
        const walls = snap.walls ?? [];
        if (walls.length === 0 && !snap.result?.glue) return null;
        return (
          <div className="rounded-lg border bg-background overflow-hidden">
            <div className="px-4 py-3 border-b text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Ҳисоб-китоб<span className="lang-en"> · Estimate</span>
            </div>
            {walls.length > 0 && (
              <ul className="divide-y">
                {walls.map((w, i) => (
                  <li key={i} className="px-4 py-2.5 text-sm flex items-baseline justify-between gap-4">
                    <span className="font-medium">
                      {w.name || `${t("Девор", "Wall")} ${i + 1}`}
                      <span className="ml-2 font-mono tabular-nums text-muted-foreground">
                        {formatNumber(Number(w.lengthM), 2)}×{formatNumber(Number(w.heightM), 2)} м
                      </span>
                      {w.orientation === "ROTATED" && (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          {t("(айланган)", "(rotated)")}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {(w.openings ?? []).reduce((s, o) => s + (Number(o.qty) || 0), 0)} {t("очиқлик", "openings")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {snap.result?.glue && (
              <div className="px-4 py-2.5 text-xs text-muted-foreground border-t bg-muted/20">
                {t("Ёпиштиргич", "Glue")}: ~
                <span className="font-mono tabular-nums text-foreground">{formatNumber(Number(snap.result.glue.kg), 1)}</span> кг ·{" "}
                <span className="font-mono tabular-nums text-foreground">{formatNumber(Number(snap.result.glue.bags), 0)}</span> {t("қоп", "bags")}
              </div>
            )}
          </div>
        );
      })()}

      {/* Status actions */}
      {!isCanceled && (canStartProduction || canDeliver || canCancelShown || canCloseShort) && (
        <div className="rounded-lg border bg-background p-4 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
            Ҳолат<span className="lang-en"> · Status actions</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {canStartProduction && (
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                disabled={setStatus.isPending}
                onClick={() => advance("IN_PRODUCTION")}
              >
                <Factory className="h-3.5 w-3.5 mr-1.5" />
                Ишлаб чиқаришга<span className="lang-en font-normal"> · Start production</span>
              </Button>
            )}
            {canDeliver && (
              <Button
                size="sm"
                className="min-h-[44px] bg-success hover:bg-success/90 text-success-foreground"
                disabled={setStatus.isPending || deliverReasons.length > 0}
                onClick={() => {
                  setError(null);
                  setDeliverOpen(true);
                }}
              >
                <Truck className="h-3.5 w-3.5 mr-1.5" />
                Етказилди<span className="lang-en font-normal"> · Mark delivered</span>
              </Button>
            )}
            {canCloseShort && (
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                onClick={() => {
                  setError(null);
                  setCloseShortOpen(true);
                }}
              >
                {t("Юкланганича ёпиш", "Close as loaded")}
              </Button>
            )}
            {canCancelShown && (
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px] border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive hover:text-white hover:border-destructive transition-colors"
                disabled={setStatus.isPending || cancelBlocked !== null}
                title={cancelBlocked ?? undefined}
                onClick={() => {
                  setError(null);
                  setCancelReason("");
                  setCancelOpen(true);
                }}
              >
                <Ban className="h-3.5 w-3.5 mr-1.5" />
                {t("Буюртмани бекор қилиш", "Cancel order")}
              </Button>
            )}
          </div>
          {((canDeliver && deliverReasons.length > 0) || (canCancelShown && cancelBlocked)) && (
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {canDeliver && deliverReasons.map((r) => (
                <li key={r}>{t("Етказилди:", "Delivered:")} {uzPart(r, lang)}</li>
              ))}
              {canCancelShown && cancelBlocked && (
                <li>{t("Бекор қилиб бўлмайди:", "Cannot cancel:")} <span className="font-mono tabular-nums">{cancelBlocked}</span></li>
              )}
            </ul>
          )}
        </div>
      )}

      {/* Payments */}
      <div className="rounded-lg border bg-background overflow-hidden">
        <div className="px-4 py-3 border-b flex flex-wrap items-baseline justify-between gap-2">
          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Тўловлар<span className="lang-en"> · Payments</span>
          </div>
          <div className="text-[10px] text-muted-foreground tabular-nums">
            {t("Тасдиқланган:", "Confirmed:")} {formatNumber(paidNum, 0)} / {formatNumber(totalNum, 0)}
          </div>
        </div>

        {order.payments.length > 0 ? (
          <ul className="divide-y">
            {order.payments.map((p) => {
              const ps = PAYMENT_STATUS_META[p.status];
              const row = paymentRow(p, order.status);
              return (
                <li key={p.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                  <div className="min-w-0 flex-1 basis-40">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-mono tabular-nums font-semibold ${row.refund ? "text-warning" : ""}`}>
                        {row.amountText}
                        <span className="text-[10px] font-normal text-muted-foreground ml-1">UZS</span>
                      </span>
                      {row.refund ? (
                        <Chip variant="warning">{t("Қайтарилди", "Refunded")}</Chip>
                      ) : (
                        <Chip variant={ps.variant}>{t(ps.uz, ps.en)}</Chip>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground break-words">
                      {PAYMENT_METHOD_LABELS[p.method] ? t(...PAYMENT_METHOD_LABELS[p.method]) : p.method}
                      {" · "}
                      {p.recordedBy?.name ?? "—"}
                      {" · "}
                      <span className="font-mono tabular-nums">{p.recordedAt ? formatDateTime(p.recordedAt) : "—"}</span>
                    </div>
                    {row.refund && p.notes && (
                      <div className="mt-1 text-xs text-muted-foreground break-words">{p.notes}</div>
                    )}
                    {p.receipts.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {p.receipts.map((r) => (
                          <a
                            key={r.id}
                            href={r.imageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={t("Чекни очиш", "Open receipt")}
                            className="block h-11 w-11 overflow-hidden rounded ring-1 ring-border hover:ring-primary"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={r.imageUrl} alt={t("Чек", "Receipt")} className="h-full w-full object-cover" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                  {canConfirm && (row.canApprove || row.canReject) && (
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {row.canApprove && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="min-h-[44px] border-success/40 text-success hover:bg-success hover:text-white"
                          disabled={confirmPayment.isPending}
                          onClick={() => {
                            setError(null);
                            confirmPayment.mutate({ paymentId: p.id, approve: true });
                          }}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          {t("Тасдиқлаш", "Confirm")}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="min-h-[44px] border-destructive/40 text-destructive hover:bg-destructive hover:text-white"
                        disabled={confirmPayment.isPending}
                        onClick={() => {
                          setError(null);
                          setRejectReason("");
                          setRejectPaymentId(p.id);
                        }}
                      >
                        <Ban className="h-3.5 w-3.5 mr-1" />
                        {t("Рад этиш", "Reject")}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-4 py-6 text-sm text-muted-foreground">{t("Тўлов йўқ.", "No payments yet.")}</div>
        )}

        {/* Record payment form */}
        {canRecordPayment && (
          <form onSubmit={submitPayment} className="border-t bg-muted/20 px-4 py-3 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[160px]">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                {t("Сумма", "Amount")}
              </label>
              <Input
                inputMode="decimal"
                className="min-h-[44px] font-mono tabular-nums"
                placeholder={t("масалан 1 000 000", "e.g. 1 000 000")}
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                onBlur={() => setPayAmount(regroupMoney(payAmount))}
              />
              {payAmountUnreadable && (
                <div className="text-xs text-destructive mt-1">
                  {t("Сонни текширинг: масалан 1 000 000", "Check the number: e.g. 1 000 000")}
                </div>
              )}
              {payAmountTooHigh && (
                <div className="text-xs text-warning mt-1">
                  {t("Сумма қолдиқдан ошиб кетди", "Amount exceeds remaining balance")}
                </div>
              )}
            </div>
            <div className="min-w-[160px]">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                {t("Усул", "Method")}
              </label>
              <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m] ? t(...PAYMENT_METHOD_LABELS[m]) : m}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                {t("Чек (ихтиёрий)", "Receipt (optional)")}
              </label>
              <ReceiptPicker
                urls={payReceiptUrls}
                onChange={setPayReceiptUrls}
                disabled={recordPayment.isPending}
                uploadUrl="/api/gazoblok/upload-receipt"
              />
            </div>
            <Button type="submit" size="sm" className="min-h-[44px]" disabled={recordPayment.isPending || payAmountUnreadable}>
              {recordPayment.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5 mr-1.5" />
              )}
              Тўлов қўшиш<span className="lang-en font-normal"> · Record payment</span>
            </Button>
          </form>
        )}
      </div>

      <DeliveryLocationCard
        lat={order.deliveryLat}
        lng={order.deliveryLng}
        url={order.deliveryLocationUrl}
        label={order.deliveryLocationLabel}
        canEdit={actions.pin}
        onSave={(v) => deliveryLocation.mutateAsync(v).then(() => undefined)}
        onClear={() => deliveryLocation.mutateAsync({ lat: null, lng: null }).then(() => undefined)}
      />

      {order.deliveryProofUrl && (
        <div className="rounded-lg border bg-background overflow-hidden">
          <div className="px-4 py-3 border-b text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {t("Етказиш сурати", "Delivery photo")}
            {order.deliveryProofUploadedAt && (
              <span className="ml-2 font-normal font-mono tabular-nums normal-case tracking-normal">
                {formatDateTime(order.deliveryProofUploadedAt)}
              </span>
            )}
          </div>
          <a href={order.deliveryProofUrl} target="_blank" rel="noopener noreferrer" className="block p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={order.deliveryProofUrl}
              alt={t("Етказиш сурати", "Delivery photo")}
              className="max-h-72 max-w-full rounded ring-1 ring-border object-contain"
            />
          </a>
        </div>
      )}

      {/* Shipments — split-load the order across one or more trucks */}
      <GazoblokShipmentsSection
        orderId={order.id}
        shipments={order.shipments}
        lines={weightLines}
        orderStatus={order.status}
        orderOpen={isOpenOrder}
        canEdit={canEdit}
        canEditShipped={perms.includes("order.editShipped")}
        onRefresh={refresh}
      />

      {/* Comments — human conversation before the system activity log */}
      <CommentThread gazoblokOrderId={order.id} />

      {/* Activity */}
      <div className="rounded-lg border bg-background overflow-hidden">
        <div className="px-4 py-3 border-b text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {t("Фаолият журнали", "Activity log")}
          <span className="ml-2 font-normal tabular-nums">({order.events.length})</span>
        </div>
        {order.events.length > 0 ? (
          <ul className="divide-y">
            {order.events.map((e) => {
              const label = EVENT_TYPE_LABELS[e.type] ? t(...EVENT_TYPE_LABELS[e.type]) : e.type;
              const line = historyLine(label, eventText(e));
              return (
                <li key={e.id} className="px-4 py-2.5 text-sm grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 sm:grid-cols-[10rem_1fr_auto]">
                  <span className="font-medium break-words">{e.actor?.name ?? t("Тизим", "System")}</span>
                  <span className="text-xs text-muted-foreground font-mono tabular-nums text-right sm:order-last">
                    {formatDateTime(e.createdAt)}
                  </span>
                  <span className="col-span-2 sm:col-span-1 break-words">
                    {line}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-4 py-6 text-sm text-muted-foreground">{t("Ёзув йўқ.", "No activity yet.")}</div>
        )}
      </div>

      {/* Mark-delivered confirmation modal */}
      {deliverOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setDeliverOpen(false)}
        >
          <div
            className="bg-card rounded-lg shadow-2xl w-full max-w-md p-5 space-y-3 border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">
              Етказилди деб белгилаш<span className="lang-en font-normal"> · Mark delivered</span>
            </h2>
            <p className="text-sm text-muted-foreground">
              {t(
                "Буюртма ёпилади. Блоклар юкланганда омбордан чиқарилган.",
                "The order will be closed. Blocks left stock when the trucks were loaded.",
              )}
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                onClick={() => setDeliverOpen(false)}
                disabled={setStatus.isPending}
              >
                {t("Орқага", "Back")}
              </Button>
              <Button
                size="sm"
                className="bg-success hover:bg-success/90 text-success-foreground"
                disabled={setStatus.isPending}
                onClick={() => advance("DELIVERED")}
              >
                {setStatus.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Truck className="h-4 w-4 mr-2" />
                )}
                {t("Етказилди", "Mark delivered")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel-order modal with optional reason */}
      {cancelOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setCancelOpen(false)}
        >
          <div
            className="bg-card rounded-lg shadow-2xl w-full max-w-md p-5 space-y-3 border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">
              Буюртмани бекор қилиш<span className="lang-en font-normal"> · Cancel order</span>
            </h2>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                {t("Бекор қилиш сабаби (ихтиёрий)", "Cancellation reason (optional)")}
              </label>
              <textarea
                rows={3}
                autoFocus
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCancelOpen(false)}
                disabled={setStatus.isPending}
              >
                {t("Орқага", "Back")}
              </Button>
              <Button
                size="sm"
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                disabled={setStatus.isPending}
                onClick={() => {
                  setError(null);
                  setStatus.mutate({ status: "CANCELED", reason: cancelReason.trim() || undefined });
                }}
              >
                {setStatus.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Ban className="h-4 w-4 mr-2" />
                )}
                {t("Бекор қилиш", "Cancel order")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Off-screen, fixed-width card — the capture target of «Расм» and «Чатга юбориш». */}
      <div aria-hidden="true" className="pointer-events-none fixed top-0 left-[-99999px]">
        <GazoblokShareCard ref={cardRef} order={order} />
      </div>

      {editMode && (
        <GazoblokEditOrderDialog
          open
          onClose={() => setEditMode(null)}
          order={order}
          catalog={catalog ?? []}
          perms={{ edit: canEdit, editShipped: canEditShipped }}
          mode={editMode}
          onSaved={() => {
            setEditMode(null);
            refresh();
          }}
        />
      )}

      <GazoblokCloseShortDialog
        open={closeShortOpen}
        onClose={() => setCloseShortOpen(false)}
        orderId={order.id}
        quantities={order.quantities}
        lines={order.lines.map((l) => ({ id: l.id, quantity: l.quantity, unitPrice: Number(l.unitPrice) }))}
        totals={{
          linesSubtotal: Number(order.linesSubtotal),
          discountAmount: Number(order.discountAmount),
          deliveryCost: Number(order.deliveryCost),
          totalPrice: totalNum,
        }}
        confirmedPaid={paidNum}
        onDone={refresh}
      />

      {/* Reject-payment modal with optional reason */}
      {rejectPaymentId && (
        <div
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
          onClick={() => setRejectPaymentId(null)}
        >
          <div
            className="bg-card rounded-lg shadow-2xl w-full max-w-md p-5 space-y-3 border border-border"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold">
              Тўловни рад этиш<span className="lang-en font-normal"> · Reject payment</span>
            </h2>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">
                {t("Рад этиш сабаби (ихтиёрий)", "Rejection reason (optional)")}
              </label>
              <textarea
                rows={3}
                autoFocus
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRejectPaymentId(null)}
                disabled={confirmPayment.isPending}
              >
                {t("Орқага", "Back")}
              </Button>
              <Button
                size="sm"
                className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                disabled={confirmPayment.isPending}
                onClick={() => {
                  setError(null);
                  confirmPayment.mutate({
                    paymentId: rejectPaymentId,
                    approve: false,
                    rejectionReason: rejectReason.trim() || undefined,
                  });
                }}
              >
                {confirmPayment.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Ban className="h-4 w-4 mr-2" />
                )}
                {t("Рад этиш", "Reject")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  valueClassName,
}: {
  label: string;
  value: string;
  strong?: boolean;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={strong ? "text-[11px] font-bold uppercase tracking-wider text-muted-foreground" : "text-muted-foreground"}>
        {label}
      </span>
      <span className={`font-mono tabular-nums ${strong ? "font-extrabold text-base" : "font-semibold"} ${valueClassName ?? ""}`}>
        {value}
      </span>
    </div>
  );
}
