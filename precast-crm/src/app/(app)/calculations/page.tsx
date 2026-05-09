"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Save, PackageCheck, Trash2, Loader2 } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ClientInfoBar } from "@/components/calculation/ClientInfoBar";
import { PlaceOrderDialog } from "@/components/calculation/PlaceOrderDialog";
import {
  MultiRoomCalculator,
  recomputeRow,
  type SlabRow,
} from "@/components/calculation/MultiRoomCalculator";
import { projectTotal } from "@/services/calculation-engine";
import { TaperedPrefillSchema } from "@/lib/validation";
import { decodePrefillParam } from "@/sandbox/tapered-beam-block/calculator-bridge";
import { useCalculatorStore } from "@/store/calculator";
import { useHydrateCalculator } from "@/store/useHydrateCalculator";

function CalculationsInner() {
  const router = useRouter();
  const search = useSearchParams();

  // Hydrate the persisted calculator store from localStorage. Until this
  // resolves we render a skeleton so the operator never briefly sees an
  // empty calculator before their auto-saved draft loads.
  const { hydrated } = useHydrateCalculator();

  // ── Persisted calculator state — fine-grained selectors ──
  const client = useCalculatorStore((s) => s.client);
  const setClient = useCalculatorStore((s) => s.setClient);
  const matchedClientId = useCalculatorStore((s) => s.matchedClientId);
  const setMatchedClientId = useCalculatorStore((s) => s.setMatchedClientId);
  const rows = useCalculatorStore((s) => s.rows);
  const setRows = useCalculatorStore((s) => s.setRows);
  const discountPercent = useCalculatorStore((s) => s.discountPercent);
  const setDiscountPercent = useCalculatorStore((s) => s.setDiscountPercent);
  const draftProjectId = useCalculatorStore((s) => s.draftProjectId);
  const setDraftProjectId = useCalculatorStore((s) => s.setDraftProjectId);
  const loadFrom = useCalculatorStore((s) => s.loadFrom);
  const clearAll = useCalculatorStore((s) => s.clearAll);

  // ── Transient (UI-only) state — NOT persisted ──
  const [error, setError] = useState<string | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [prefillNotice, setPrefillNotice] = useState<string | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  // ── One-time effects on mount: prefill from URL, then ?fromProject= ──
  useEffect(() => {
    if (!hydrated) return;
    if (typeof window === "undefined") return;

    // Sandbox handoff via `?prefill=…`. Wins over the persisted draft.
    // The store's `loadFrom` resets all session fields first so a stale
    // client phone or matchedClientId can't leak into the prefilled rooms.
    const prefillRaw = search.get("prefill");
    if (prefillRaw) {
      const decoded = decodePrefillParam(prefillRaw);
      const parsed = decoded ? TaperedPrefillSchema.safeParse(decoded) : null;
      if (parsed?.success) {
        const newRows: SlabRow[] = parsed.data.rooms.map((r) =>
          recomputeRow({
            id: Math.random().toString(36).slice(2, 9),
            name: r.name ?? "",
            innerWidth: r.innerWidth,
            innerLength: r.innerLength,
            bearing: 0.15,
            correction: 0,
            extraBeams: 0,
            forceStartBeam: false,
            patternOverride: "AUTO",
            result: null,
            // Engineering ground truth for the undersize-warning helper.
            originalWidth: r.innerWidth,
          }),
        );
        loadFrom({ rows: newRows });
        setPrefillNotice(
          `Pre-filled from tapered sandbox · ${parsed.data.rooms.length} rooms (${parsed.data.mode})`,
        );
        // Clear the URL so a refresh doesn't re-apply the same prefill.
        router.replace("/calculations", { scroll: false });
        return;
      }
      // Malformed payload: fall through to the persisted draft. We leave
      // the URL alone so the operator can paste it elsewhere if debugging.
    }

    const fromProject = search.get("fromProject");
    if (fromProject) loadProject(fromProject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  async function loadProject(id: string) {
    try {
      const projects = await api<Array<{
        id: string;
        name: string | null;
        tentativeClientName: string | null;
        tentativeClientPhone: string | null;
        tentativeClientAddress: string | null;
        client: {
          id: string;
          name: string;
          phone: string;
          address: string | null;
          referenceConsent: "NOT_ASKED" | "GRANTED" | "DENIED";
        } | null;
        calculations: Array<{
          id: string;
          name: string | null;
          innerWidth: string;
          innerLength: string;
          bearing: string;
          correction: string;
          extraBeams: number;
          forceStartBeam: boolean;
          patternOverride: "GB" | "BGB" | "GBG" | null;
        }>;
      }>>("/api/projects?status=DRAFT");
      const p = projects.find((x) => x.id === id);
      if (!p) return;
      // Replace the calculator session in one shot. Transient banners stay.
      loadFrom({
        draftProjectId: p.id,
        client: {
          name: p.client?.name ?? p.tentativeClientName ?? "",
          phone: p.client?.phone ?? p.tentativeClientPhone ?? "",
          address: p.client?.address ?? p.tentativeClientAddress ?? "",
          consentGranted: p.client?.referenceConsent === "GRANTED",
        },
        matchedClientId: p.client?.id ?? null,
        rows: p.calculations.map((c) =>
          recomputeRow({
            id: Math.random().toString(36).slice(2, 9),
            name: c.name ?? "",
            innerWidth: Number(c.innerWidth),
            innerLength: Number(c.innerLength),
            bearing: Number(c.bearing),
            correction: Number(c.correction),
            extraBeams: c.extraBeams,
            forceStartBeam: c.forceStartBeam,
            patternOverride: c.patternOverride ?? "AUTO",
            result: null,
            // Drafts persisted to the DB don't carry the engineering
            // ground truth; the undersize warning ceases.
            originalWidth: null,
          }),
        ),
      });
    } catch {
      /* ignore */
    }
  }

  // ── Validation ──
  const validRooms = rows.filter((r) => r.innerWidth > 0 && r.innerLength > 0);
  const phoneOk = client.phone.replace(/\D+/g, "").length >= 5;
  const canSaveDraft = phoneOk;
  const canPlaceOrder =
    phoneOk &&
    client.name.trim().length > 0 &&
    client.address.trim().length > 0 &&
    validRooms.length > 0 &&
    validRooms.every((r) => r.result);
  const hasAnyContent =
    rows.length > 0 ||
    client.name.length > 0 ||
    client.phone.length > 0 ||
    client.address.length > 0;

  // ── Order summary ──
  const summary = useMemo(() => {
    const valid = validRooms
      .map((r) => r.result)
      .filter((r): r is NonNullable<SlabRow["result"]> => !!r);
    const proj = projectTotal(valid, discountPercent);
    const undersizedRooms = validRooms
      .filter((r) => (r.originalWidth ?? 0) > 0 && r.innerWidth < (r.originalWidth ?? 0))
      .map((r) => ({
        name: r.name || "Room",
        innerWidth: r.innerWidth,
        innerLength: r.innerLength,
        originalWidth: r.originalWidth ?? 0,
      }));
    return {
      clientName: client.name,
      clientPhone: client.phone,
      clientAddress: client.address,
      rooms: validRooms.length,
      totalArea: valid.reduce((s, r) => s + r.monolith_area, 0),
      totalBeams: valid.reduce((s, r) => s + r.beam_count, 0),
      totalBlocks: valid.reduce((s, r) => s + r.total_blocks, 0),
      roomsSubtotal: proj.rooms_subtotal,
      discountPercent: proj.discount_percent,
      discountAmount: proj.discount_amount,
      deliveryCost: 0,
      totalPrice: proj.total,
      undersizedRooms,
    };
  }, [validRooms, discountPercent, client]);

  // ── Mutations ──
  const saveDraft = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/api/projects", {
        method: "POST",
        json: {
          projectId: draftProjectId ?? undefined,
          name: null,
          clientName: client.name || null,
          clientPhone: client.phone,
          clientAddress: client.address || null,
          // Only send when the operator actually checked the box. The server
          // never downgrades from GRANTED — leaving it null is a no-op.
          clientReferenceConsent: client.consentGranted ? "GRANTED" : null,
          shapeType: "RECTANGULAR",
          rooms: validRooms.map((r) => ({
            name: r.name,
            innerWidth: r.innerWidth,
            innerLength: r.innerLength,
            bearing: r.bearing,
            correction: r.correction,
            extraBeams: r.extraBeams,
            forceStartBeam: r.forceStartBeam,
            patternOverride: r.patternOverride === "AUTO" ? null : r.patternOverride,
          })),
        },
      }),
    onSuccess: (project) => {
      setDraftProjectId(project.id);
      // Saved successfully → clear the auto-save draft. The operator can
      // continue editing; the next edits will start fresh in the auto-save
      // and Save Project will UPDATE this same draft id.
      clearAll();
      router.push(`/projects/${project.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  const placeOrder = useMutation({
    mutationFn: (args: {
      scheduledAt: Date;
      paidAmount: number;
      paymentMethod: "CASH" | "BANK_TRANSFER" | "CLICK" | "PAYME" | "OTHER";
    }) =>
      api<{ id: string; orderNumber: string }>("/api/orders", {
        method: "POST",
        json: {
          projectId: draftProjectId ?? undefined,
          clientName: client.name,
          clientPhone: client.phone,
          clientAddress: client.address,
          clientReferenceConsent: client.consentGranted ? "GRANTED" : null,
          shapeType: "RECTANGULAR",
          rooms: validRooms.map((r) => ({
            name: r.name,
            innerWidth: r.innerWidth,
            innerLength: r.innerLength,
            bearing: r.bearing,
            correction: r.correction,
            extraBeams: r.extraBeams,
            forceStartBeam: r.forceStartBeam,
            patternOverride: r.patternOverride === "AUTO" ? null : r.patternOverride,
          })),
          discountPercent,
          deliveryCost: 0,
          otherCost: 0,
          scheduledAt: args.scheduledAt.toISOString(),
          paidAmount: args.paidAmount,
          paymentMethod: args.paidAmount > 0 ? args.paymentMethod : null,
        },
      }),
    onSuccess: (order) => {
      // Order is now committed permanently — drop the draft.
      clearAll();
      router.push(`/orders/${order.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  function confirmClear() {
    clearAll();
    setClearConfirmOpen(false);
    setError(null);
    setPrefillNotice(null);
  }

  if (!hydrated) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Загрузка калькулятора…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header with the action buttons */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Калькулятор · Calculator
          </h1>
          <p className="text-sm text-muted-foreground">
            Quick calc during a phone call. Save as Project, or place an order directly.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            disabled={!hasAnyContent}
            onClick={() => setClearConfirmOpen(true)}
            title="Clear the calculator and start a new calculation"
            className="text-rose-700 hover:text-rose-800 hover:bg-rose-50"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Тозалаш · Clear
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canSaveDraft || saveDraft.isPending}
            onClick={() => saveDraft.mutate()}
            title={canSaveDraft ? "Save as draft (requires phone)" : "Phone is required"}
          >
            <Save className="h-4 w-4 mr-2" />
            {saveDraft.isPending ? "Saving…" : "Save Project"}
          </Button>
          <Button
            size="sm"
            className="bg-orange-500 hover:bg-orange-600 text-white"
            disabled={!canPlaceOrder}
            onClick={() => setOrderOpen(true)}
            title={
              canPlaceOrder
                ? "Place an order"
                : "Place Order needs Name + Phone + Address + at least 1 valid room"
            }
          >
            <PackageCheck className="h-4 w-4 mr-2" />
            Буюртма Бериш · Place Order
          </Button>
        </div>
      </div>

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/20 px-3 py-2 rounded">
          {error}
        </div>
      )}

      {prefillNotice && (
        <div className="flex items-center justify-between text-sm bg-emerald-50 border border-emerald-200 text-emerald-900 px-3 py-2 rounded">
          <span>{prefillNotice}</span>
          <button
            type="button"
            className="text-xs underline hover:no-underline"
            onClick={() => setPrefillNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Client info — Name | Phone | Address */}
      <ClientInfoBar
        value={client}
        onChange={(c) => {
          setClient(c);
          setError(null);
        }}
        matchedClientId={matchedClientId}
        onMatch={setMatchedClientId}
      />

      {/* Calculator */}
      <MultiRoomCalculator
        rows={rows}
        onChange={setRows}
        discountPercent={discountPercent}
        onDiscountChange={setDiscountPercent}
      />

      {/* Place Order modal */}
      <PlaceOrderDialog
        open={orderOpen}
        onClose={() => setOrderOpen(false)}
        summary={summary}
        onConfirm={async ({ scheduledAt, paidAmount, paymentMethod }) => {
          await placeOrder.mutateAsync({ scheduledAt, paidAmount, paymentMethod });
        }}
      />

      {/* Clear confirmation modal */}
      <Dialog
        open={clearConfirmOpen}
        onOpenChange={(v) => !v && setClearConfirmOpen(false)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Калькуляторни тозаламоқчимисиз? · Clear calculator?</DialogTitle>
            <DialogDescription>
              Барча хоналар, мижоз маълумотлари ва ҳисоб-китоб йўқолади. Бу
              амалли қайтариб бўлмайди. · All rooms, client info, and
              calculations will be lost. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setClearConfirmOpen(false)}
            >
              Бекор қилиш · Cancel
            </Button>
            <Button
              size="sm"
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={confirmClear}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Тозалаш · Clear
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function CalculationsPage() {
  return (
    <Suspense fallback={<div className="text-muted-foreground p-4">Loading…</div>}>
      <CalculationsInner />
    </Suspense>
  );
}
