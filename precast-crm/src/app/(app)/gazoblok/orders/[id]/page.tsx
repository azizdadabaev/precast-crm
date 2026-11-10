"use client";

/**
 * Gazoblok order detail (redesign approved 2026-11-10, Downloads/gazoblok-order-detail-redesign).
 * Work column in question order — what is left to load → money → where/when → what happened —
 * and a sticky «Ҳисоб» ledger with ONE next action (lib/gazoblok-detail). Phone: same order,
 * ledger after «Юклаш», debt + action in a bottom bar.
 */
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Ban, CircleCheck } from "lucide-react";
import { api, ApiError } from "@/lib/fetcher";
import { useLang, useT } from "@/lib/i18n";
import { formatNumber } from "@/lib/utils";
import { uzPart, parseMoney } from "@/lib/gazoblok-text";
import { refundBody } from "@/lib/gazoblok-order-screen";
import { screenActions } from "@/lib/gazoblok-order-screen";
import { blockWeightKg } from "@/lib/gazoblok-weight";
import { buildHistory } from "@/lib/gazoblok-history";
import { dotDate, loadPill, loadSummary, nextAction, payable, paymentPill, pickTruckForLoad } from "@/lib/gazoblok-detail";
import { GazoblokShareCard, shareCaption } from "@/components/gazoblok/GazoblokShareCard";
import { GazoblokEditOrderDialog, type GazoblokCatalogProduct } from "@/components/gazoblok/GazoblokEditOrderDialog";
import { RefundDialog } from "@/components/payments/RefundDialog";
import type { PaymentMethod } from "@/components/gazoblok/order-form/types";
import type { OrderDetail, Payment, Shipment } from "@/components/gazoblok/order-detail/types";
import { DetailHeader } from "@/components/gazoblok/order-detail/DetailHeader";
import { LoadCard } from "@/components/gazoblok/order-detail/LoadCard";
import { LoadDialog, type LoadLine } from "@/components/gazoblok/order-detail/LoadDialog";
import { CloseShortDialog } from "@/components/gazoblok/order-detail/CloseShortDialog";
import { PaymentsCard } from "@/components/gazoblok/order-detail/PaymentsCard";
import { DeliveryCard } from "@/components/gazoblok/order-detail/DeliveryCard";
import { HistoryCard } from "@/components/gazoblok/order-detail/HistoryCard";
import { Ledger, MobileActionBar } from "@/components/gazoblok/order-detail/Ledger";
import { WallEstimateCard } from "@/components/gazoblok/order-detail/WallEstimateCard";
import { ConfirmDialog } from "@/components/gazoblok/order-detail/ConfirmDialog";
import { ICON } from "@/components/gazoblok/order-detail/ui";

type Status = OrderDetail["status"];
type LoadTarget = { id: string; number: number; initial: Record<string, number> | null; created: boolean };
type Confirm = { kind: "deliver" } | { kind: "cancel" } | { kind: "reject"; payment: Payment };

const n0 = (v: number) => formatNumber(v, 0);

export default function GazoblokOrderDetailPage() {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const cardRef = useRef<HTMLDivElement>(null);

  const [error, setError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<"full" | "schedule" | null>(null);
  const [loadTarget, setLoadTarget] = useState<LoadTarget | null>(null);
  const [closeShortOpen, setCloseShortOpen] = useState(false);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);
  const [payFormOpen, setPayFormOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [busyTruck, setBusyTruck] = useState<string | null>(null);
  const showError = (e: unknown) => setError(uzPart(e instanceof Error ? e.message : String(e), lang));

  const { data: order, isLoading, isError } = useQuery<OrderDetail>({
    queryKey: ["gazoblok-order", id],
    queryFn: () => api(`/api/gazoblok/orders/${id}`),
  });
  const { data: me } = useQuery<{ permissions: string[] }>({ queryKey: ["me"], queryFn: () => api("/api/auth/me") });
  const perms = useMemo(() => me?.permissions ?? [], [me]);
  const can = (p: string) => perms.includes(p);
  const { data: catalog } = useQuery<GazoblokCatalogProduct[]>({
    queryKey: ["gazoblok", "products"],
    queryFn: () => api("/api/gazoblok/products"),
    enabled: editMode === "full",
  });

  function refresh() {
    qc.invalidateQueries({ queryKey: ["gazoblok-order", id] });
    qc.invalidateQueries({ queryKey: ["gazoblok-orders"] });
  }

  const setStatus = useMutation({
    mutationFn: (v: { status: Status; reason?: string }) =>
      api(`/api/gazoblok/orders/${id}`, { method: "PATCH", json: { action: "set_status", status: v.status, reason: v.reason } }),
    onSuccess: () => {
      setConfirm(null);
      refresh();
    },
    onError: (e) => {
      setConfirm(null);
      showError(e);
    },
  });

  const recordPayment = useMutation({
    mutationFn: (v: { amount: number; method: PaymentMethod; receiptUrls: string[] }) =>
      api(`/api/gazoblok/orders/${id}`, { method: "PATCH", json: { action: "record_payment", ...v } }),
    onError: showError,
  });

  const reviewPayment = useMutation({
    mutationFn: (v: { paymentId: string; approve: boolean; rejectionReason?: string }) =>
      api(`/api/gazoblok/orders/${id}`, { method: "PATCH", json: { action: "confirm_payment", ...v } }),
    onSuccess: () => {
      setConfirm(null);
      refresh();
    },
    onError: (e) => {
      setConfirm(null);
      showError(e);
    },
  });

  const deliveryLocation = useMutation({
    mutationFn: (body: { lat: number | null; lng: number | null; url?: string | null; label?: string | null }) =>
      api(`/api/gazoblok/orders/${id}/delivery-location`, { method: "PATCH", json: body }),
    onSuccess: refresh,
    onError: showError,
  });

  // One-step loading: reuse an empty truck or create one, and open the dialog at once.
  const startLoad = useMutation({
    mutationFn: async (shipments: Shipment[]) => {
      const reuse = shipments.find((s) => s.id === pickTruckForLoad(shipments));
      if (reuse) return { id: reuse.id, number: reuse.number, created: false };
      const s = await api<{ id: string; number: number }>(`/api/gazoblok/orders/${id}/shipments`, { method: "POST" });
      return { id: s.id, number: s.number, created: true };
    },
    onSuccess: (s) => setLoadTarget({ ...s, initial: null }),
    onError: showError,
  });

  async function truckAction(s: Shipment, method: "PATCH" | "DELETE") {
    setBusyTruck(s.id);
    setError(null);
    try {
      await api(`/api/gazoblok/orders/${id}/shipments/${s.id}`, { method });
      refresh();
    } catch (e) {
      showError(e);
    } finally {
      setBusyTruck(null);
    }
  }

  /** Load dialog closed: a shipment created for it and left empty is removed again (Ruling). */
  function closeLoad(loaded: boolean) {
    const target = loadTarget;
    setLoadTarget(null);
    if (loaded) {
      refresh();
      return;
    }
    if (target?.created) {
      void api(`/api/gazoblok/orders/${id}/shipments/${target.id}`, { method: "DELETE" })
        // 409: another user loaded this truck meanwhile; 404: already removed — the refresh shows it.
        .catch((e) => {
          if (!(e instanceof ApiError && (e.status === 409 || e.status === 404))) showError(e);
        })
        .finally(refresh);
    }
  }

  const derived = useMemo(() => {
    if (!order) return null;
    const labelById = new Map(order.lines.map((l) => [l.id, l.productLabel]));
    const summary = loadSummary(order.quantities, order.shipments);
    const history = buildHistory({
      events: order.events,
      lines: order.lines.map((l) => ({ id: l.id, label: l.productLabel, quantity: l.quantity })),
      payments: order.payments,
      sellerName: order.createdBy?.name ?? null,
    });
    const actorByShipment = new Map<string, string>();
    for (const e of [...order.events].reverse()) {
      const sid = (e.payload as { shipmentId?: unknown } | null)?.shipmentId;
      if (typeof sid === "string" && e.actor && (e.type === "SHIPMENT_LOADED" || e.type === "SHIPMENT_CORRECTED" || e.type === "SHIPMENT_DELIVERED")) {
        actorByShipment.set(sid, e.actor.name);
      }
    }
    // Per-block weight from the size; a deleted size falls back to the order average (611 kg/m³).
    const avgKg = order.totalBlocks > 0 ? (Number(order.totalVolumeM3) / order.totalBlocks) * 611 : 0;
    const loadLines: LoadLine[] = order.lines.map((l) => ({
      lineId: l.id,
      label: l.productLabel,
      quantity: l.quantity,
      unitPrice: Number(l.unitPrice),
      productId: l.product?.id ?? null,
      perBlockKg: l.product ? blockWeightKg(Number(l.product.lengthM), Number(l.product.heightM), Number(l.product.thicknessM)) : avgKg,
    }));
    const weightT = summary.rows.reduce((s, r) => s + r.loaded * (loadLines.find((l) => l.lineId === r.lineId)?.perBlockKg ?? 0), 0) / 1000;
    const closeEvent = order.events.find((e) => e.type === "ORDER_SHORT_CLOSED");
    const cancelEvent = order.events.find((e) => e.type === "STATUS_CHANGED" && (e.payload as { to?: string } | null)?.to === "CANCELED");
    const totalBefore = Number((closeEvent?.payload as { before?: { totalPrice?: number } } | null)?.before?.totalPrice ?? NaN);
    return { labelById, summary, history, actorByShipment, loadLines, weightT, closeEvent, cancelEvent, totalBefore: Number.isFinite(totalBefore) ? totalBefore : null };
  }, [order]);

  if (isLoading) return <div className="p-4 text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>;
  if (isError || !order || !derived) {
    return (
      <div className="space-y-3 rounded-lg border border-border bg-card p-5">
        <div className="text-sm text-destructive">{t("Буюртмани юклаб бўлмади ёки топилмади.", "Failed to load or order not found.")}</div>
        <Link href="/gazoblok/orders" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" {...ICON} /> {t("Буюртмаларга қайтиш", "Back to orders")}
        </Link>
      </div>
    );
  }

  const { summary, history, labelById, actorByShipment, loadLines, weightT } = derived;
  const total = Number(order.totalPrice);
  const paid = Number(order.confirmedPaid);
  const toPay = payable(order);
  const actions = screenActions(order, perms);
  const isOpenOrder = (order.status === "PLACED" || order.status === "IN_PRODUCTION") && !order.shortClosedAt;
  const next = nextAction(order, perms);
  const lPill = loadPill(order);
  const pPill = paymentPill(order);
  const overBlocks = summary.total.over;

  let banner: { tone: "warning" | "destructive"; title: string; text: string } | null = null;
  if (order.shortClosedAt) {
    const notTaken = summary.total.left;
    banner = {
      tone: "warning",
      title: t("Юкланганича ёпилган", "Closed as loaded"),
      text: `${dotDate(order.shortClosedAt)}${derived.closeEvent?.actor ? `, ${derived.closeEvent.actor.name}` : ""}${notTaken > 0 ? ` — ${n0(notTaken)} ${t("та олинмади", "pcs not taken")}` : ""}.${order.shortCloseReason ? ` ${t("Сабаб", "Reason")}: ${order.shortCloseReason}` : ""}`,
    };
  } else if (order.status === "CANCELED") {
    banner = {
      tone: "destructive",
      title: t("Бекор қилинган", "Cancelled"),
      text: `${order.canceledAt ? dotDate(order.canceledAt) : ""}${derived.cancelEvent?.actor ? `, ${derived.cancelEvent.actor.name}` : ""}.${order.cancelReason ? ` ${t("Сабаб", "Reason")}: ${order.cancelReason}` : ""}`,
    };
  }

  function runPrimary() {
    const p = next.primary;
    if (!p) return;
    setError(null);
    switch (p.kind) {
      case "refund":
        setRefundOpen(true);
        break;
      case "load":
        startLoad.mutate(order!.shipments);
        break;
      case "deliverTruck": {
        const s = order!.shipments.find((x) => x.id === p.shipmentId);
        if (s) void truckAction(s, "PATCH");
        break;
      }
      case "pay":
        setPayAmount(n0(p.amount ?? 0));
        setPayFormOpen(true);
        requestAnimationFrame(() => document.getElementById("sec-payments")?.scrollIntoView({ behavior: "smooth", block: "start" }));
        break;
      case "confirmPayment":
        if (p.paymentId) reviewPayment.mutate({ paymentId: p.paymentId, approve: true });
        break;
      case "markDelivered":
        setConfirm({ kind: "deliver" });
        break;
      case "reorder":
        router.push(`/gazoblok/new?from=${order!.id}`);
        break;
    }
  }
  const primaryPending =
    startLoad.isPending || (next.primary?.kind === "deliverTruck" && busyTruck !== null) || (next.primary?.kind === "confirmPayment" && reviewPayment.isPending);

  const ledger = (
    <Ledger
      className="xl:sticky xl:top-6"
      status={order.status}
      shortClosed={!!order.shortClosedAt}
      lines={order.lines.map((l) => {
        // Closed short bills what was loaded (up to the order); over-load stays its own line.
        const loaded = order.quantities.find((q) => q.lineId === l.id)?.loaded ?? 0;
        const qty = order.shortClosedAt ? Math.min(loaded, l.quantity) : l.quantity;
        return { id: l.id, label: l.productLabel, quantity: qty, unitPrice: Number(l.unitPrice), lineTotal: order.shortClosedAt ? qty * Number(l.unitPrice) : Number(l.lineTotal) };
      })}
      linesSubtotal={Number(order.linesSubtotal)}
      discountAmount={Number(order.discountAmount)}
      discountPercent={Number(order.discountPercent)}
      deliveryCost={Number(order.deliveryCost)}
      overshipAmount={Number(order.overshipAmount)}
      overBlocks={overBlocks}
      total={total}
      totalBefore={derived.totalBefore}
      paid={paid}
      refundDue={order.refundDue}
      unpaidOverload={order.unpaidOverload}
      sellerName={order.createdBy?.name ?? null}
      payPill={pPill}
      next={next}
      primaryPending={primaryPending}
      onPrimary={runPrimary}
      onProduction={() => setStatus.mutate({ status: "IN_PRODUCTION" })}
      onMarkDelivered={() => setConfirm({ kind: "deliver" })}
      onCloseShort={() => setCloseShortOpen(true)}
      onCancel={() => setConfirm({ kind: "cancel" })}
    />
  );

  return (
    <div className="max-w-[1240px] pb-28 xl:pb-0">
      <DetailHeader
        orderNumber={order.orderNumber}
        status={order.status}
        loadPill={lPill}
        payPill={pPill}
        client={order.client}
        sellerName={order.createdBy?.name ?? null}
        placedAt={order.placedAt}
        deliveredAt={order.deliveredAt}
        sourceOrder={order.sourceOrder}
        reorders={order.reorders}
        tools={{ edit: actions.edit, reorder: actions.reorder, chat: actions.chat }}
        banner={banner}
        shareRef={cardRef}
        shareFileBase={`Gazoblok-${order.orderNumber}`}
        shareCaption={shareCaption(order)}
        onEdit={() => {
          setError(null);
          setEditMode("full");
        }}
        reorderHref={`/gazoblok/new?from=${order.id}`}
      />

      {error && (
        <div role="alert" className="mb-5 rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px] xl:gap-6">
        <div className="min-w-0 xl:col-start-1">
          <LoadCard
            summary={summary}
            shipments={order.shipments}
            labelById={labelById}
            weightT={weightT}
            status={order.status}
            shortClosed={!!order.shortClosedAt}
            actorByShipment={actorByShipment}
            can={{
              load: isOpenOrder && can("order.edit"),
              correct: (s) => isOpenOrder && (s.status === "LOADED" ? can("order.edit") : s.status === "DELIVERED" ? can("order.edit") && can("order.editShipped") : false),
              deliver: can("order.edit"),
              closeShort: next.secondary.closeShort,
            }}
            busyTruck={busyTruck}
            onLoad={() => startLoad.mutate(order.shipments)}
            loadPending={startLoad.isPending}
            onLoadTruck={(s) => setLoadTarget({ id: s.id, number: s.number, initial: null, created: false })}
            onCorrect={(s) => setLoadTarget({ id: s.id, number: s.number, initial: s.loadedLines ?? {}, created: false })}
            onDeliver={(s) => void truckAction(s, "PATCH")}
            onDelete={(s) => void truckAction(s, "DELETE")}
            onCloseShort={() => setCloseShortOpen(true)}
          />
        </div>

        <div className="min-w-0 xl:col-start-2 xl:row-span-5 xl:row-start-1 xl:self-stretch">{ledger}</div>

        <div className="min-w-0 xl:col-start-1">
          <PaymentsCard
            payments={order.payments}
            orderStatus={order.status}
            total={total}
            paid={paid}
            payable={toPay}
            unpaidOverload={order.unpaidOverload}
            canRecord={can("payment.record")}
            canConfirm={can("payment.confirm")}
            formOpen={payFormOpen}
            onFormOpen={(o) => {
              setPayFormOpen(o);
              if (o && !payAmount) setPayAmount(n0(toPay));
            }}
            amountRaw={payAmount}
            onAmountRaw={setPayAmount}
            recordPending={recordPayment.isPending}
            reviewPending={reviewPayment.isPending}
            onRecord={(v, done) => {
              setError(null);
              recordPayment.mutate(v, {
                onSuccess: () => {
                  done();
                  setPayAmount("");
                  setPayFormOpen(false);
                  refresh();
                },
              });
            }}
            onConfirm={(p) => {
              setError(null);
              reviewPayment.mutate({ paymentId: p.id, approve: true });
            }}
            onReject={(p) => setConfirm({ kind: "reject", payment: p })}
          />
        </div>

        <div className="min-w-0 xl:col-start-1">
          <DeliveryCard
            scheduledAt={order.scheduledAt}
            address={order.client.address}
            notes={order.notes}
            lat={order.deliveryLat}
            lng={order.deliveryLng}
            locationUrl={order.deliveryLocationUrl}
            locationLabel={order.deliveryLocationLabel}
            proofUrl={order.deliveryProofUrl}
            proofAt={order.deliveryProofUploadedAt}
            canReschedule={actions.edit}
            canPin={actions.pin}
            onReschedule={() => {
              setError(null);
              setEditMode("schedule");
            }}
            onSaveLocation={(v) => deliveryLocation.mutateAsync(v).then(() => undefined)}
          />
        </div>

        <div className="min-w-0 xl:col-start-1">
          <HistoryCard orderId={order.id} items={history} />
        </div>

        {order.wallEstimate && (
          <div className="min-w-0 xl:col-start-1">
            <WallEstimateCard estimate={order.wallEstimate} />
          </div>
        )}
      </div>

      <MobileActionBar debt={order.status === "CANCELED" ? 0 : Math.max(0, total - paid)} refund={order.refundDue} primary={next.primary} pending={primaryPending} onPrimary={runPrimary} />

      {/* Off-screen, fixed-width card — the capture target of «Расм» and «Чатга юбориш». */}
      <div aria-hidden="true" className="pointer-events-none fixed left-[-99999px] top-0">
        <GazoblokShareCard ref={cardRef} order={order} />
      </div>

      {loadTarget && (
        <LoadDialog
          orderId={order.id}
          orderNumber={order.orderNumber}
          clientName={order.client.name}
          sellerName={order.createdBy?.name ?? null}
          shipment={{ id: loadTarget.id, number: loadTarget.number }}
          initialLoaded={loadTarget.initial}
          lines={loadLines}
          otherShipments={order.shipments.filter((s) => s.id !== loadTarget.id && s.status !== "PENDING" && s.loadedLines).map((s) => s.loadedLines as Record<string, number>)}
          canSeeStock={can("inventory.view")}
          onClose={() => closeLoad(false)}
          onSuccess={() => closeLoad(true)}
        />
      )}

      {closeShortOpen && (
        <CloseShortDialog
          orderId={order.id}
          orderNumber={order.orderNumber}
          clientName={order.client.name}
          quantities={order.quantities}
          lines={order.lines.map((l) => ({ id: l.id, quantity: l.quantity, unitPrice: Number(l.unitPrice) }))}
          totals={{ linesSubtotal: Number(order.linesSubtotal), discountAmount: Number(order.discountAmount), deliveryCost: Number(order.deliveryCost), totalPrice: total }}
          confirmedPaid={paid}
          onClose={() => setCloseShortOpen(false)}
          onDone={refresh}
        />
      )}

      {confirm?.kind === "deliver" && (
        <ConfirmDialog
          title={t("Етказилди деб ёпиш", "Close as delivered")}
          text={t("Буюртма ёпилади. Блоклар жўнатмалар юкланганда омбордан чиқарилган.", "The order is closed. Blocks left stock when the shipments were loaded.")}
          confirmLabel={t("Етказилди", "Delivered")}
          icon={<CircleCheck {...ICON} />}
          pending={setStatus.isPending}
          onClose={() => setConfirm(null)}
          onConfirm={() => setStatus.mutate({ status: "DELIVERED" })}
        />
      )}
      {confirm?.kind === "cancel" && (
        <ConfirmDialog
          title={t("Буюртмани бекор қилиш", "Cancel the order")}
          reasonLabel={t("Бекор қилиш сабаби", "Cancellation reason")}
          confirmLabel={t("Бекор қилиш", "Cancel the order")}
          icon={<Ban {...ICON} />}
          danger
          pending={setStatus.isPending}
          onClose={() => setConfirm(null)}
          onConfirm={(reason) => setStatus.mutate({ status: "CANCELED", reason })}
        />
      )}
      {confirm?.kind === "reject" && (
        <ConfirmDialog
          title={t("Тўловни рад этиш", "Reject the payment")}
          text={
            <>
              {n0(Number(confirm.payment.amount))} UZS
            </>
          }
          reasonLabel={t("Рад этиш сабаби", "Rejection reason")}
          confirmLabel={t("Рад этиш", "Reject")}
          icon={<Ban {...ICON} />}
          danger
          pending={reviewPayment.isPending}
          onClose={() => setConfirm(null)}
          onConfirm={(reason) => reviewPayment.mutate({ paymentId: confirm.payment.id, approve: false, rejectionReason: reason })}
        />
      )}

      {refundOpen && can("payment.confirm") && (
        <RefundDialog
          open
          onClose={() => setRefundOpen(false)}
          orderId={order.id}
          due={order.refundDue}
          onRefunded={refresh}
          showDate={false}
          parseAmount={parseMoney}
          submit={async (v) => {
            try {
              await api(`/api/gazoblok/orders/${order.id}`, { method: "PATCH", json: refundBody(v) });
            } catch (e) {
              throw new Error(uzPart((e as Error).message, lang));
            }
          }}
        />
      )}

      {editMode && (
        <GazoblokEditOrderDialog
          open
          onClose={() => setEditMode(null)}
          order={order}
          catalog={catalog ?? []}
          perms={{ edit: can("order.edit"), editShipped: can("order.editShipped") }}
          mode={editMode}
          onSaved={() => {
            setEditMode(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}
