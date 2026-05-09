"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { Save, PackageCheck } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { ClientInfoBar, type ClientDraft } from "@/components/calculation/ClientInfoBar";
import { PlaceOrderDialog } from "@/components/calculation/PlaceOrderDialog";
import {
  MultiRoomCalculator,
  recomputeRow,
  type SlabRow,
} from "@/components/calculation/MultiRoomCalculator";
import { projectTotal } from "@/services/calculation-engine";

const STORAGE_KEY = "calc:autosave:v1";

interface AutosaveState {
  client: ClientDraft;
  rows: SlabRow[];
  discountPercent: number;
  matchedClientId: string | null;
}

function CalculationsInner() {
  const router = useRouter();
  const search = useSearchParams();

  const [client, setClient] = useState<ClientDraft>({
    name: "",
    phone: "",
    address: "",
    consentGranted: false,
  });
  const [matchedClientId, setMatchedClientId] = useState<string | null>(null);
  const [rows, setRows] = useState<SlabRow[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [draftProjectId, setDraftProjectId] = useState<string | null>(null);

  // ── Autosave to localStorage on every change ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    const payload: AutosaveState = { client, rows, discountPercent, matchedClientId };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [client, rows, discountPercent, matchedClientId]);

  // ── Restore on mount ──
  useEffect(() => {
    if (typeof window === "undefined") return;
    // One-shot handoff from the tapered-beam-block sandbox. If the
    // bridge key is present it wins over the autosave restore; we
    // consume-on-read so a later visit falls back to autosave. See
    // src/sandbox/tapered-beam-block/calculator-bridge.ts.
    try {
      const bridgeRaw = localStorage.getItem("calc:bridge-import:v1");
      if (bridgeRaw) {
        const bridge = JSON.parse(bridgeRaw) as AutosaveState;
        if (bridge.client) setClient(bridge.client);
        if (Array.isArray(bridge.rows)) setRows(bridge.rows.map(recomputeRow));
        if (typeof bridge.discountPercent === "number") setDiscountPercent(bridge.discountPercent);
        if (bridge.matchedClientId) setMatchedClientId(bridge.matchedClientId);
        localStorage.removeItem("calc:bridge-import:v1");
        return;
      }
    } catch {
      /* malformed bridge payload — fall through to autosave restore */
    }
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as AutosaveState;
      if (parsed.client) setClient(parsed.client);
      // Always recompute on restore so a stale `result` from a prior session
      // (e.g. after an engine rule change) gets refreshed.
      if (Array.isArray(parsed.rows)) setRows(parsed.rows.map(recomputeRow));
      if (typeof parsed.discountPercent === "number") setDiscountPercent(parsed.discountPercent);
      if (parsed.matchedClientId) setMatchedClientId(parsed.matchedClientId);
    } catch {
      /* ignore */
    }
    // also: if a project id was passed in via ?fromProject=, load it
    const fromProject = search.get("fromProject");
    if (fromProject) loadProject(fromProject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function clearAutosave() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

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
      setDraftProjectId(p.id);
      setClient({
        name: p.client?.name ?? p.tentativeClientName ?? "",
        phone: p.client?.phone ?? p.tentativeClientPhone ?? "",
        address: p.client?.address ?? p.tentativeClientAddress ?? "",
        consentGranted: p.client?.referenceConsent === "GRANTED",
      });
      setMatchedClientId(p.client?.id ?? null);
      // Compute results immediately so the table is fully populated when the
      // operator re-opens the draft — they don't have to "wake up" each row
      // by clicking the Pattern dropdown.
      setRows(
        p.calculations.map((c) =>
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
          }),
        ),
      );
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

  // ── Order summary ──
  const summary = useMemo(() => {
    const valid = validRooms.map((r) => r.result).filter((r): r is NonNullable<SlabRow["result"]> => !!r);
    const proj = projectTotal(valid, discountPercent);
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
      clearAutosave();
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
          // Only send when the operator actually checked the box. The server
          // never downgrades — null leaves any existing consent intact.
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
          // Optional up-front payment — server creates a PENDING_CONFIRMATION
          // Payment row in the placement transaction when paidAmount > 0.
          paidAmount: args.paidAmount,
          paymentMethod: args.paidAmount > 0 ? args.paymentMethod : null,
        },
      }),
    onSuccess: (order) => {
      clearAutosave();
      router.push(`/orders/${order.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="space-y-5">
      {/* Header with the two action buttons */}
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
