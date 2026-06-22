"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save, PackageCheck, Trash2, Loader2, Phone, PanelLeftOpen, PencilRuler } from "lucide-react";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { AiAssistBox } from "@/components/calculation/AiAssistBox";
import { aiRoomsToSlabRows } from "@/components/calculation/ai-rooms";
import { DrawRoomDialog } from "@/components/calculation/DrawRoomDialog";
import type { ExtractedRoom } from "@/lib/agent/llm/provider";
import { ClientInfoBar } from "@/components/calculation/ClientInfoBar";
import { DrawingDock } from "@/components/calculation/DrawingDock";
import { PlaceOrderDialog } from "@/components/calculation/PlaceOrderDialog";
import {
  MultiRoomCalculator,
  recomputeRow,
  makeRow,
  type SlabRow,
} from "@/components/calculation/MultiRoomCalculator";
import type { NormBox } from "@/lib/annotation-box";
import { projectTotal } from "@/services/calculation-engine";
import { TaperedPrefillSchema } from "@/lib/validation";
import { decodePrefillParam } from "@/sandbox/tapered-beam-block/calculator-bridge";
import { useCalculatorStore, normalizeDrawing } from "@/store/calculator";
import { useHydrateCalculator } from "@/store/useHydrateCalculator";
import { Bi, useT } from "@/lib/i18n";
import { ShareCalculationButton } from "@/components/ShareCalculationButton";
import { ShareTarget, type ShareData } from "@/components/share/CalculationShareCard";
import { useTableDesign } from "@/hooks/useTableDesign";

type ConversationContext = {
  displayName: string;
  username: string | null;
  sharedContactPhone: string | null;
  images: { messageId: string; path: string | null; createdAt: string }[];
};

function CalculationsInner() {
  const router = useRouter();
  const qc = useQueryClient();
  const search = useSearchParams();
  const t = useT();

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
  const discountAmount = useCalculatorStore((s) => s.discountAmount);
  const setDiscountAmount = useCalculatorStore((s) => s.setDiscountAmount);
  const draftProjectId = useCalculatorStore((s) => s.draftProjectId);
  const setDraftProjectId = useCalculatorStore((s) => s.setDraftProjectId);
  const editingOrderId = useCalculatorStore((s) => s.editingOrderId);
  const setEditingOrderId = useCalculatorStore((s) => s.setEditingOrderId);
  const sourceConversationId = useCalculatorStore((s) => s.sourceConversationId);
  const setSourceConversationId = useCalculatorStore((s) => s.setSourceConversationId);
  const dockHidden = useCalculatorStore((s) => s.dockHidden);
  const setDockHidden = useCalculatorStore((s) => s.setDockHidden);
  const droppedImages = useCalculatorStore((s) => s.droppedImages);
  const addDroppedImages = useCalculatorStore((s) => s.addDroppedImages);
  const drawing = useCalculatorStore((s) => s.drawing);
  const setDrawing = useCalculatorStore((s) => s.setDrawing);
  const loadFrom = useCalculatorStore((s) => s.loadFrom);
  const clearAll = useCalculatorStore((s) => s.clearAll);

  // ── Transient (UI-only) state — NOT persisted ──
  const [error, setError] = useState<string | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const [prefillNotice, setPrefillNotice] = useState<string | null>(null);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [drawRoomOpen, setDrawRoomOpen] = useState(false);
  // ── Drawing-dock state (transient) — populated when the calculator is
  //    opened from an inbox chat (?fromConversation=). NOT persisted; the
  //    persisted sourceConversationId lets us re-fetch these on reload.
  const [conversationImages, setConversationImages] = useState<string[]>([]);
  const [sharedPhone, setSharedPhone] = useState<string | null>(null);
  const [convLoadError, setConvLoadError] = useState(false);
  // Drag-drop a drawing onto the calculator (custom calc OR an existing dock).
  const [dragOverFile, setDragOverFile] = useState(false);
  const [uploadingDrawing, setUploadingDrawing] = useState(false);
  // Room-capture highlight sync between the drawing dock and the table.
  const [highlightRowId, setHighlightRowId] = useState<string | null>(null);
  const loadedConvRef = useRef<string | null>(null);
  /** Ref to the offscreen <ShareTarget> — see render block below. */
  const shareRef = useRef<HTMLDivElement>(null);
  const tableDesign = useTableDesign();
  /** Order number + scheduled date for the edit-mode banner and dialog
   *  default. Re-fetched on mount when editingOrderId is in the store
   *  (so a refresh during edit mode keeps showing the right banner).
   *  Transient — not persisted. */
  const [editingOrderInfo, setEditingOrderInfo] = useState<{
    orderNumber: string;
    scheduledAt: Date;
  } | null>(null);
  const isEditingOrder = !!editingOrderId;

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
            // Sandbox prefill always lands at engine auto-pick.
            m2PriceOverride: false,
            m2PriceOverrideValue: null,
            m2PriceReason: null,
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

    // ?fromOrder=<id> wins over draft restoration: opening edit-mode
    // for an existing order replaces the workspace contents.
    const fromOrder = search.get("fromOrder");
    if (fromOrder) {
      void loadOrder(fromOrder);
      // strip the query so a refresh doesn't double-load
      router.replace("/calculations", { scroll: false });
      return;
    }

    // ?fromConversation=<id>: opened from an inbox chat. Prefill the client
    // name + dock the chat's drawings, then strip the query so a refresh
    // doesn't re-prefill over the operator's edits.
    const fromConversation = search.get("fromConversation");
    if (fromConversation) {
      void loadConversationContext(fromConversation, { prefillClient: true }).finally(() => {
        router.replace("/calculations", { scroll: false });
      });
      return;
    }

    // Refresh during edit mode: URL doesn't have ?fromOrder= but the
    // store still carries editingOrderId. Re-fetch so the banner +
    // dialog default scheduledAt come back. Don't replace the rows
    // (the autosaved version is what the user was editing).
    if (editingOrderId) {
      void refreshEditingOrderInfo(editingOrderId);
    }

    const fromProject = search.get("fromProject");
    if (fromProject) loadProject(fromProject);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  // Repopulate the drawing dock after a reload while still linked to a chat:
  // sourceConversationId is persisted but the dock images are transient. The
  // ref-dedupe in loadConversationContext prevents a double-fetch with the
  // mount handoff above.
  useEffect(() => {
    if (!hydrated || !sourceConversationId) return;
    if (search.get("fromConversation")) return; // handled by the mount effect
    void loadConversationContext(sourceConversationId, { prefillClient: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, sourceConversationId]);

  // Self-heal stale draftProjectId. The calculator persists the loaded
  // draft's id in localStorage so a refresh keeps the in-progress state.
  // But if the operator placed the order in another tab — or hit back
  // after placing — the persisted id can point at a project that has
  // since transitioned out of DRAFT. The next "Place Order" click would
  // then POST a projectId the server rejects with a 409 ("an order is
  // already placed for this project"). Detect that here on mount and
  // clear the calculator so the operator starts fresh instead of
  // hitting the dead-end submit. Fail open on network errors — don't
  // yank the calculator just because a status check blipped.
  useEffect(() => {
    if (!hydrated || !draftProjectId) return;
    let cancelled = false;
    api<{ status: "DRAFT" | "ORDERED" | "ARCHIVED" } | null>(
      `/api/projects/${draftProjectId}/status`,
    )
      .then((res) => {
        if (cancelled) return;
        if (!res || res.status !== "DRAFT") clearAll();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, draftProjectId]);

  /** Lightweight refetch used only to repopulate the banner + dialog
   *  default after a refresh while editingOrderId is already in the
   *  store. Does NOT replace the row data — the autosaved version
   *  represents the operator's in-progress edits. */
  async function refreshEditingOrderInfo(id: string) {
    try {
      const order = await api<{
        id: string;
        orderNumber: string;
        scheduledAt: string;
        status: string;
      }>(`/api/orders/${id}`);
      // If the order was canceled / dispatched / delivered while the
      // operator had this tab open, drop edit-mode silently.
      if (
        order.status === "DISPATCHED" ||
        order.status === "DELIVERED" ||
        order.status === "CANCELED"
      ) {
        setEditingOrderId(null);
        setEditingOrderInfo(null);
        return;
      }
      setEditingOrderInfo({
        orderNumber: order.orderNumber,
        scheduledAt: new Date(order.scheduledAt),
      });
    } catch {
      // Order may have been deleted or permissions revoked. Drop edit-mode.
      setEditingOrderId(null);
      setEditingOrderInfo(null);
    }
  }

  /** Hydrate the calculator workspace from an existing order's
   *  frozen snapshot for edit-mode. Replaces all session state.
   *  Status checked server-side too — the edit endpoint refuses
   *  DISPATCHED/DELIVERED/CANCELED. */
  /** Fetch a conversation's context for the drawing dock. `prefillClient`
   *  replaces the client info (used only on a fresh ?fromConversation
   *  handoff); on reload we keep the operator's in-progress client/rows and
   *  only repopulate the dock. Deduped per id via loadedConvRef so the
   *  mount handoff and the reload effect never double-fetch. Fails open. */
  async function loadConversationContext(
    id: string,
    opts?: { prefillClient?: boolean },
  ) {
    if (loadedConvRef.current === id) return;
    loadedConvRef.current = id;
    // A fresh handoff (prefillClient) REPLACES the workspace. Reset before the
    // fetch so a failed context load can't silently inherit a prior calc's rows,
    // hidden-dock flag, or dropped images (which would otherwise leak into the
    // new quote — and into its project media on Save). The reload path
    // (prefillClient:false) keeps the operator's in-progress work untouched.
    if (opts?.prefillClient) loadFrom({});
    try {
      const ctx = await api<ConversationContext>(`/api/inbox/${id}/context`);
      if (opts?.prefillClient) {
        loadFrom({
          client: { name: ctx.displayName ?? "", phone: "", address: "" },
        });
      }
      setSourceConversationId(id);
      setConversationImages(ctx.images.map((i) => i.path).filter((p): p is string => !!p));
      setSharedPhone(ctx.sharedContactPhone ?? null);
      setConvLoadError(false);
    } catch {
      // Fail open: keep the persisted draft; flag the dock as errored.
      setSourceConversationId(id);
      setConversationImages([]);
      setConvLoadError(true);
    }
  }

  // ── Room capture (Stage ②): a box drawn on the drawing becomes a room. ──
  const captureRoom = (imagePath: string, box: NormBox) => {
    const boxed = { imagePath, ...box };
    // Reuse a still-blank row (no box, no dims) for the first capture so the
    // auto-created empty "Хона 1" isn't left dangling; otherwise append.
    const blankIdx = rows.findIndex(
      (r) => !r.box && r.innerWidth === 0 && r.innerLength === 0,
    );
    if (blankIdx >= 0) {
      setRows(rows.map((r, i) => (i === blankIdx ? { ...r, box: boxed } : r)));
    } else {
      setRows([...rows, { ...makeRow(rows.length + 1), box: boxed }]);
    }
  };
  const deleteRow = (id: string) => setRows(rows.filter((r) => r.id !== id));
  // Combined dock images: chat-fetched (transient, re-fetched on reload) +
  // operator drag-dropped (persisted). De-duplicated; either can fill the dock.
  const dockImages = Array.from(new Set([...conversationImages, ...droppedImages]));
  // Show the split drawing dock during a chat handoff, when a reopened linked
  // draft brought its drawings back, or when the operator dropped a drawing on a
  // custom calc — unless they dismissed it (✕). Dismiss keeps the chat link;
  // only Clear wipes it.
  const hasDockContent = !!sourceConversationId || dockImages.length > 0;
  const showDock = !dockHidden && hasDockContent;

  // Upload drag-dropped image files to the operator's own draft folder, then
  // dock them for room capture. Works on a custom calc AND an existing (chat-
  // linked) dock. Non-image files are ignored.
  async function handleDroppedFiles(files: FileList | null) {
    const all = Array.from(files ?? []);
    const images = all.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) {
      // Files were dropped but none were images — explain rather than no-op
      // (the overlay promised "Drop the drawing here").
      if (all.length > 0) {
        setError(
          t(
            "Фақат расм файллари (JPG/PNG/WEBP) бириктирилади",
            "Only image files (JPG, PNG, or WEBP) can be docked",
          ),
        );
      }
      return;
    }
    setUploadingDrawing(true);
    setError(null);
    const urls: string[] = [];
    let failure: string | null = null;
    try {
      for (const file of images) {
        const fd = new FormData();
        fd.append("file", file);
        // Raw fetch (not api()) — multipart must set its own boundary header.
        const res = await fetch("/api/calculations/upload-drawing", {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        const json = (await res.json()) as {
          ok: boolean;
          data?: { url: string };
          error?: string;
        };
        if (!res.ok || !json.ok || !json.data) {
          throw new Error(json.error || `HTTP ${res.status}`);
        }
        urls.push(json.data.url);
      }
    } catch (e) {
      failure = (e as Error).message;
    } finally {
      // Dock whatever uploaded so a mid-batch failure doesn't discard the
      // successes (which would leave orphan files un-referenced). De-duped in
      // the store; also un-hides the dock.
      if (urls.length) addDroppedImages(urls);
      if (failure) setError(urls.length ? `${urls.length}/${images.length} · ${failure}` : failure);
      setUploadingDrawing(false);
    }
  }

  async function loadOrder(id: string) {
    try {
      const order = await api<{
        id: string;
        orderNumber: string;
        status: string;
        discountPercent: string;
        scheduledAt: string;
        client: {
          id: string;
          name: string;
          phone: string;
          address: string | null;
        };
        project: {
          id: string;
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
            m2Price: string;
            m2PriceOverride: boolean;
            m2PriceReason: string | null;
          }>;
        };
      }>(`/api/orders/${id}`);

      if (
        order.status === "DISPATCHED" ||
        order.status === "DELIVERED" ||
        order.status === "CANCELED"
      ) {
        setError(
          `Order ${order.orderNumber} is in status ${order.status} and can't be edited. Cancel + recreate instead.`,
        );
        return;
      }

      loadFrom({
        editingOrderId: order.id,
        client: {
          name: order.client.name,
          phone: order.client.phone,
          address: order.client.address ?? "",
        },
        matchedClientId: order.client.id,
        discountPercent: Number(order.discountPercent),
        rows: order.project.calculations.map((c) =>
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
            originalWidth: null,
            m2PriceOverride: c.m2PriceOverride,
            m2PriceOverrideValue: c.m2PriceOverride ? Number(c.m2Price) : null,
            m2PriceReason: c.m2PriceOverride ? c.m2PriceReason : null,
          }),
        ),
      });
      setEditingOrderInfo({
        orderNumber: order.orderNumber,
        scheduledAt: new Date(order.scheduledAt),
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function loadProject(id: string) {
    try {
      const projects = await api<Array<{
        id: string;
        name: string | null;
        discountPercent: string;
        discountAmount: string;
        tentativeClientName: string | null;
        tentativeClientPhone: string | null;
        tentativeClientAddress: string | null;
        drawingJson: unknown;
        client: {
          id: string;
          name: string;
          phone: string;
          address: string | null;
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
          m2Price: string;
          m2PriceOverride: boolean;
          m2PriceReason: string | null;
          annotationBox: { x: number; y: number; w: number; h: number } | null;
          annotationImagePath: string | null;
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
        },
        matchedClientId: p.client?.id ?? null,
        discountPercent: Number(p.discountPercent),
        discountAmount: Number(p.discountAmount),
        // Restore the drawn floor plan so "Draw room" reopens the saved rooms.
        drawing: normalizeDrawing(p.drawingJson),
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
            // Hydrate the rate override flag and value from the persisted
            // calculation. m2Price stored on the row IS the effective rate
            // (auto OR override), so when override is true we feed it back
            // as the override value so recomputeRow stamps it onto result.
            m2PriceOverride: c.m2PriceOverride,
            m2PriceOverrideValue: c.m2PriceOverride ? Number(c.m2Price) : null,
            m2PriceReason: c.m2PriceOverride ? c.m2PriceReason : null,
            box:
              c.annotationImagePath && c.annotationBox
                ? { imagePath: c.annotationImagePath, ...c.annotationBox }
                : null,
          }),
        ),
      });
      // Re-dock the project-owned drawing copies so a reopened linked draft
      // shows its annotated plans (decoupled from the live conversation).
      const docked = Array.from(
        new Set(
          p.calculations
            .map((c) => c.annotationImagePath)
            .filter((u): u is string => !!u),
        ),
      );
      setConversationImages(docked);
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

  // AI assist → append parsed rooms to the table. The calculator prices them
  // (recomputeRow already ran in aiRoomsToSlabRows; the live-pricing effect
  // re-bills on the next /api/pricing payload). Operator reviews before saving.
  function handleAiRooms(aiRooms: ExtractedRoom[]) {
    const next = aiRoomsToSlabRows(aiRooms, rows.length);
    setRows([...rows, ...next]);
    setError(null);
  }

  // Draw room → append as real rooms. The dialog already mapped the drawn
  // outline to priced SlabRows (exact bays for a rectilinear room, or tapered
  // estimate rows for an angled one); the live-pricing effect re-bills on the
  // next /api/pricing payload, matching handleAiRooms.
  function handleDrawnRooms(next: SlabRow[]) {
    // Drawing-sourced rows replace any previously-added drawn rows (so editing
    // the sketch and re-adding doesn't duplicate); hand-typed rows are kept.
    setRows([...rows.filter((r) => !r.fromDrawing), ...next]);
    setError(null);
  }

  // ── Per-drawing "Extract with AI" (Drawing Dock) ──
  // Gated by the `calculator.aiAssist` permission; the same ["me"] query key
  // is used by AiAssistBox, so react-query dedupes the request.
  const { data: me } = useQuery<{ permissions: string[] }>({
    queryKey: ["me"],
    queryFn: () => api("/api/auth/me"),
  });
  const aiAssistEnabled = me?.permissions?.includes("calculator.aiAssist") ?? false;

  async function handleDockExtractAI(imagePath: string) {
    try {
      const res = await api<{ rooms: ExtractedRoom[]; confidence: "high" | "low"; note?: string }>(
        "/api/calculations/ai-extract",
        { method: "POST", json: { imagePath } },
      );
      if (!res.rooms.length) {
        setError(t("Ўлчамларни ўқий олмадим — қўлда киритинг", "Couldn't read dimensions — please enter them manually"));
        return;
      }
      handleAiRooms(res.rooms);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // ── Order summary ──
  const summary = useMemo(() => {
    const valid = validRooms
      .map((r) => r.result)
      .filter((r): r is NonNullable<SlabRow["result"]> => !!r);
    const proj = projectTotal(valid, discountPercent, discountAmount);
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
  }, [validRooms, discountPercent, discountAmount, client]);

  // Build the offscreen share-card payload. Only rooms with a
  // computed result appear — partial rows the operator is still
  // typing shouldn't show up in the customer-facing image.
  const shareData: ShareData = useMemo(() => {
    const withResult = rows.filter((r): r is SlabRow & { result: NonNullable<SlabRow["result"]> } => !!r.result);
    return {
      // Share card is customer-facing; pin labels to Uzbek so the
      // exported image is consistent regardless of the operator's
      // current UI language.
      title: "Ҳисоб-китоб",
      clientName: client.name || "Номсиз мижоз",
      clientPhone: client.phone || null,
      clientAddress: client.address || null,
      rows: withResult.map((r) => ({
        name: r.name,
        innerWidth: r.innerWidth,
        innerLength: r.innerLength,
        bearing: r.bearing,
        pattern: r.result.pattern,
        patternAuto: r.result.pattern,
        beamLength: r.result.beam_length,
        blocksPerRow: r.result.block_rows > 0 ? r.result.blocks_per_row : null,
        totalBlocks: r.result.total_blocks,
        beamCount: r.result.beam_count,
        monolithLength: r.result.monolith_length,
        monolithArea: r.result.monolith_area,
        m2Price: r.result.m2_price,
        subtotal: r.result.subtotal,
      })),
      totals: {
        blocks: withResult.reduce((s, r) => s + r.result.total_blocks, 0),
        beams: withResult.reduce((s, r) => s + r.result.beam_count, 0),
        monolithLength: withResult.reduce((s, r) => s + r.result.monolith_length, 0),
        monolithArea: withResult.reduce((s, r) => s + r.result.monolith_area, 0),
        sum: withResult.reduce((s, r) => s + r.result.subtotal, 0),
      },
    };
  }, [rows, client, t]);

  const canShare = shareData.rows.length > 0;
  // Filename for the downloaded image — hardcoded Uzbek to match the
  // share card's locked-language strategy.
  const shareFileBase = `Hisob-kitob${
    client.name ? `-${client.name}` : ""
  }`
    .replace(/[<>:"/\\|?*]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

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
          shapeType: "RECTANGULAR",
          conversationId: sourceConversationId ?? undefined,
          discountPercent,
          discountAmount,
          // Persist the drawn outline (CAD sketch) so reopening this draft
          // restores it; null when nothing was drawn / it was cleared.
          drawing,
          rooms: validRooms.map((r) => ({
            name: r.name,
            innerWidth: r.innerWidth,
            innerLength: r.innerLength,
            bearing: r.bearing,
            correction: r.correction,
            extraBeams: r.extraBeams,
            forceStartBeam: r.forceStartBeam,
            patternOverride: r.patternOverride === "AUTO" ? null : r.patternOverride,
            m2PriceOverride: r.m2PriceOverride,
            m2PriceOverrideValue: r.m2PriceOverride ? r.m2PriceOverrideValue : null,
            m2PriceReason: r.m2PriceOverride ? r.m2PriceReason : null,
            box: r.box ?? null,
          })),
        },
      }),
    onSuccess: (project) => {
      setDraftProjectId(project.id);
      // Saved successfully → clear the auto-save draft. The operator can
      // continue editing; the next edits will start fresh in the auto-save
      // and Save Project will UPDATE this same draft id.
      clearAll();
      // Invalidate the lists used by /projects (`["projects", ...]`) and
      // the detail page (`["projects-all"]`) so the destination route
      // sees the just-saved row instead of stale cache from before the
      // POST. Without this, /projects/[id] shows "Лойиҳа топилмади"
      // because React Query serves the pre-save snapshot.
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["projects-all"] });
      router.push(`/projects/${project.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  const placeOrder = useMutation({
    mutationFn: (args: {
      scheduledAt: Date;
      paidAmount: number;
      paymentMethod: "CASH" | "BANK_TRANSFER" | "CLICK" | "PAYME" | "OTHER";
      receiptUrls: string[];
    }) =>
      api<{ id: string; orderNumber: string }>("/api/orders", {
        method: "POST",
        json: {
          projectId: draftProjectId ?? undefined,
          clientName: client.name,
          clientPhone: client.phone,
          clientAddress: client.address,
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
            m2PriceOverride: r.m2PriceOverride,
            m2PriceOverrideValue: r.m2PriceOverride ? r.m2PriceOverrideValue : null,
            m2PriceReason: r.m2PriceOverride ? r.m2PriceReason : null,
          })),
          discountPercent,
          discountAmount,
          deliveryCost: 0,
          otherCost: 0,
          scheduledAt: args.scheduledAt.toISOString(),
          paidAmount: args.paidAmount,
          paymentMethod: args.paidAmount > 0 ? args.paymentMethod : null,
          receiptUrls: args.receiptUrls,
        },
      }),
    onSuccess: (order) => {
      // Order is now committed permanently — drop the draft.
      clearAll();
      router.push(`/orders/${order.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  /** Edit-mode submit. Sends the current rooms + pricing knobs to
   *  PATCH /api/orders/<id>/edit, which re-runs the engine server-side
   *  and replaces the order's frozen snapshot. Existing payment rows
   *  are preserved; the route recomputes confirmedPaid + paymentState
   *  for the new total. */
  const editOrder = useMutation({
    mutationFn: (args: { scheduledAt: Date }) => {
      if (!editingOrderId) throw new Error("Not in edit-mode");
      return api<{ id: string; orderNumber: string }>(
        `/api/orders/${editingOrderId}/edit`,
        {
          method: "PATCH",
          json: {
            rooms: validRooms.map((r) => ({
              name: r.name,
              innerWidth: r.innerWidth,
              innerLength: r.innerLength,
              bearing: r.bearing,
              correction: r.correction,
              extraBeams: r.extraBeams,
              forceStartBeam: r.forceStartBeam,
              patternOverride: r.patternOverride === "AUTO" ? null : r.patternOverride,
              m2PriceOverride: r.m2PriceOverride,
              m2PriceOverrideValue: r.m2PriceOverride ? r.m2PriceOverrideValue : null,
              m2PriceReason: r.m2PriceOverride ? r.m2PriceReason : null,
            })),
            discountPercent,
            discountAmount,
            deliveryCost: 0,
            otherCost: 0,
            scheduledAt: args.scheduledAt.toISOString(),
          },
        },
      );
    },
    onSuccess: (order) => {
      // Edit committed — drop edit-mode AND the autosave snapshot so
      // the next /calculations visit starts clean.
      // Bust the order cache so the detail page shows updated data
      // immediately (not stale pre-edit totals from React Query cache).
      qc.invalidateQueries({ queryKey: ["order", order.id] });
      clearAll();
      router.push(`/orders/${order.id}`);
    },
    onError: (e: Error) => setError(e.message),
  });

  /** Cancel edit-mode without saving. Returns to the order detail
   *  page and wipes the edited rows from autosave. */
  function cancelEditMode() {
    const id = editingOrderId;
    clearAll();
    setEditingOrderInfo(null);
    if (id) router.push(`/orders/${id}`);
  }

  function confirmClear() {
    clearAll();
    setEditingOrderInfo(null);
    setClearConfirmOpen(false);
    setError(null);
    setPrefillNotice(null);
    // Clear acts globally: also drop the docked drawings + chat-link state so
    // the dock disappears and the table returns to its centered placement.
    setConversationImages([]);
    setSharedPhone(null);
    setConvLoadError(false);
    setHighlightRowId(null);
    loadedConvRef.current = null;
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
    <div
      className={
        showDock
          ? "relative flex items-stretch gap-4"
          : "relative max-w-[1400px] w-full mx-auto"
      }
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragOverFile(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOverFile(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragOverFile(false);
        void handleDroppedFiles(e.dataTransfer.files);
      }}
    >
      {/* Drag-a-drawing overlay — while a file is dragged over the calculator
          or an upload is in flight. Drop anywhere on the calculator to dock it. */}
      {(dragOverFile || uploadingDrawing) && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center rounded-xl border-2 border-dashed border-primary bg-primary/10 backdrop-blur-[1px]">
          <div className="flex items-center gap-2 rounded-full bg-background/90 px-4 py-2 text-sm font-medium text-primary shadow">
            {uploadingDrawing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("Чизма юкланмоқда…", "Uploading drawing…")}
              </>
            ) : (
              t("Чизмани шу ерга ташланг", "Drop the drawing here")
            )}
          </div>
        </div>
      )}
      {showDock && (
        <DrawingDock
          images={dockImages}
          error={convLoadError}
          rows={rows}
          onCapture={captureRoom}
          onDeleteRow={deleteRow}
          onHideDock={() => setDockHidden(true)}
          highlightRowId={highlightRowId}
          onHighlightRow={setHighlightRowId}
          aiAssistEnabled={aiAssistEnabled}
          onExtractAI={handleDockExtractAI}
        />
      )}
      <div className={showDock ? "min-w-0 flex-1 space-y-5" : "space-y-5"}>
        {/* Restore the dock the operator dismissed (✕) — the chat link and any
            dropped drawings are preserved, so this just re-shows the panel. */}
        {dockHidden && hasDockContent && (
          <button
            type="button"
            onClick={() => setDockHidden(false)}
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-sm text-primary transition hover:bg-primary/10"
          >
            <PanelLeftOpen className="h-3.5 w-3.5" />
            {t("Чизмани кўрсатиш", "Show drawing")}
          </button>
        )}
      {/* Header — title only. The action buttons (Clear / Save Project /
          Place Order) moved to a dedicated bar after the calculator
          totals so the user's eye lands on the numbers before the CTAs. */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          <Bi
            uz={isEditingOrder ? "Буюртмани таҳрирлаш" : "Калькулятор"}
            en={isEditingOrder ? "Edit Order" : "Calculator"}
            enClassName="text-muted-foreground font-normal text-base"
          />
        </h1>
        <p className="text-sm text-muted-foreground">
          {isEditingOrder
            ? t(
                "Жойида таҳрирлаш — сақлаш мавжуд буюртмани алмаштиради; янги буюртма яратилмайди.",
                "Editing in place — saving replaces the existing order; no new order is placed.",
              )
            : t(
                "Телефонда тез ҳисоб-китоб. Лойиҳа сифатида сақланг ёки буюртма беринг.",
                "Quick calc during a phone call. Save as Project, or place an order directly.",
              )}
        </p>
      </div>

      {/* Edit-mode banner — sky-tinted strip with a "Cancel edits"
          escape that returns the operator to the order detail page
          without saving. */}
      {isEditingOrder && editingOrderInfo && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-foreground">
          <div>
            {t("Буюртма таҳрирланмоқда", "Editing order")}{" "}
            <Link
              href={`/orders/${editingOrderId}`}
              className="font-mono font-bold text-primary hover:underline"
            >
              {editingOrderInfo.orderNumber}
            </Link>
            .{" "}
            {t(
              "Сақлаш мавжуд снепшотни алмаштиради. Тўловлар сақланиб қолади; ортиқча ёки кам тўлов эгаси томонидан қўлда созланади.",
              "Save replaces the existing snapshot. Existing payments are preserved; the owner reconciles any over- or under-payment manually.",
            )}
          </div>
          <button
            type="button"
            onClick={cancelEditMode}
            className="text-xs underline hover:no-underline shrink-0 text-text-tertiary hover:text-foreground"
          >
            {t("Таҳрирни бекор қилиш", "Cancel edits")}
          </button>
        </div>
      )}

      {error && (
        <div className="text-sm text-destructive bg-destructive/10 border border-destructive/30 px-3 py-2 rounded-md">
          {error}
        </div>
      )}

      {prefillNotice && (
        <div className="flex items-center justify-between text-sm bg-success/10 border border-success/30 text-success px-3 py-2 rounded-md">
          <span>{prefillNotice}</span>
          <button
            type="button"
            className="text-xs underline hover:no-underline"
            onClick={() => setPrefillNotice(null)}
          >
            {t("Ёпиш", "Dismiss")}
          </button>
        </div>
      )}

      {/* AI assist — text/image → rooms. Renders only for calculator.aiAssist holders. */}
      <AiAssistBox onRooms={handleAiRooms} />

      {/* Draw room — sketch a rectilinear outline → bays → rooms. The drawn
          bays append to the table and save / place-order exactly like typed
          rooms. */}
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setDrawRoomOpen(true)}
          className="border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary"
        >
          <PencilRuler className="h-4 w-4 mr-2" />
          {drawing && drawing.rooms.length > 0 ? (
            <Bi
              uz={`Чизмани таҳрирлаш · ${drawing.rooms.length} хона`}
              en={`Edit drawing · ${drawing.rooms.length} ${drawing.rooms.length === 1 ? "room" : "rooms"}`}
              enClassName="font-normal opacity-90"
            />
          ) : (
            <Bi uz="Хона чизиш" en="Draw room" enClassName="font-normal opacity-90" />
          )}
        </Button>
      </div>

      <DrawRoomDialog
        open={drawRoomOpen}
        onClose={() => setDrawRoomOpen(false)}
        startSeq={rows.length}
        onAddRooms={handleDrawnRooms}
        drawing={drawing}
        onDrawingChange={setDrawing}
      />

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

      {/* One-tap fill the phone from a contact the client shared in chat. */}
      {sharedPhone && !client.phone.trim() && (
        <button
          type="button"
          onClick={() => {
            setClient({ ...client, phone: sharedPhone });
            setError(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-3 py-1 text-sm text-primary transition hover:bg-primary/10"
        >
          <Phone className="h-3.5 w-3.5" />
          {t("Юборилган рақамни ишлатиш", "Use shared number")}: {sharedPhone}
        </button>
      )}

      {/* Offscreen share card — capture target for the Send button.
          Rendered at fixed 1100 px regardless of viewport so the
          exported image is identical on phones + desktops. */}
      <ShareTarget ref={shareRef} data={shareData} config={tableDesign} />

      {/* Calculator. The Clear / Save Project / Place Order buttons
          render INSIDE the calculator's bottom toolbar via the
          `actions` slot so they sit on the same row as Add room and
          opposite the rounding controls — visually snapped to the
          table. The handlers stay here on the page. */}
      <MultiRoomCalculator
        rows={rows}
        onChange={setRows}
        discountPercent={discountPercent}
        onDiscountChange={setDiscountPercent}
        discountAmount={discountAmount}
        onDiscountAmountChange={setDiscountAmount}
        highlightRowId={highlightRowId}
        onRowHover={setHighlightRowId}
        actions={
          <>
            {/* Clear — Tier 4 "destructive" action. Outline + destructive
                border + destructive text says "this wipes everything" so
                the operator's eye separates it cleanly from the Add Room
                button next door. */}
            <Button
              variant="outline"
              size="sm"
              disabled={!hasAnyContent}
              onClick={() => setClearConfirmOpen(true)}
              title={t(
                "Калькуляторни тозалаш ва янги ҳисоб-китобни бошлаш",
                "Clear the calculator and start a new calculation",
              )}
              className="text-destructive border-destructive/40 hover:text-destructive hover:bg-destructive/10 hover:border-destructive/60"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              <Bi uz="Тозалаш" en="Clear" />
            </Button>
            {/* Send · Юбориш — export the calculation as a desktop-quality
                image regardless of which device the operator is on. */}
            <ShareCalculationButton
              targetRef={shareRef}
              fileBase={shareFileBase}
              disabled={!canShare}
            />
            {/* Save Project hides in edit-mode — saving as a draft mid-edit
                conflicts with the in-place semantics. The escape is "Cancel
                edits" in the banner. */}
            {!isEditingOrder && (
              <Button
                variant="outline"
                size="sm"
                disabled={!canSaveDraft || saveDraft.isPending}
                onClick={() => saveDraft.mutate()}
                title={
                  canSaveDraft
                    ? t(
                        "Лойиҳа сифатида сақлаш (телефон керак)",
                        "Save as draft (requires phone)",
                      )
                    : t("Телефон рақами керак", "Phone is required")
                }
              >
                <Save className="h-4 w-4 mr-2" />
                {saveDraft.isPending
                  ? t("Сақланмоқда…", "Saving…")
                  : t("Лойиҳани сақлаш", "Save Project")}
              </Button>
            )}
            <Button
              size="sm"
              className="bg-success hover:bg-success/90 text-success-foreground"
              disabled={!canPlaceOrder || editOrder.isPending || (isEditingOrder && !editingOrderInfo)}
              onClick={() => setOrderOpen(true)}
              title={
                isEditingOrder
                  ? t(
                      "Бу буюртмага таҳрирларни сақлаш — жойида снепшотни алмаштиради",
                      "Save edits to this order — replaces the snapshot in place",
                    )
                  : canPlaceOrder
                    ? t("Буюртма бериш", "Place an order")
                    : t(
                        "Буюртма Бериш учун Исм + Телефон + Манзил + камида 1 та хона керак",
                        "Place Order needs Name + Phone + Address + at least 1 valid room",
                      )
              }
            >
              <PackageCheck className="h-4 w-4 mr-2" />
              {isEditingOrder ? (
                editOrder.isPending ? (
                  t("Сақланмоқда…", "Saving…")
                ) : (
                  t("Таҳрирни сақлаш", "Save edits")
                )
              ) : (
                <Bi uz="Буюртма Бериш" en="Place Order" enClassName="font-normal opacity-90" />
              )}
            </Button>
          </>
        }
      />

      {/* Place Order / Save edits modal — same dialog, two modes.
          editMode hides the up-front payment section and routes the
          confirm to /api/orders/<id>/edit instead of POST /api/orders. */}
      <PlaceOrderDialog
        open={orderOpen}
        onClose={() => setOrderOpen(false)}
        summary={summary}
        editMode={isEditingOrder}
        defaultScheduledAt={editingOrderInfo?.scheduledAt ?? null}
        onConfirm={async ({ scheduledAt, paidAmount, paymentMethod, receiptUrls }) => {
          if (isEditingOrder) {
            await editOrder.mutateAsync({ scheduledAt });
          } else {
            await placeOrder.mutateAsync({ scheduledAt, paidAmount, paymentMethod, receiptUrls });
          }
        }}
      />

      {/* Clear confirmation modal */}
      <Dialog
        open={clearConfirmOpen}
        onOpenChange={(v) => !v && setClearConfirmOpen(false)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              <Bi
                uz="Калькуляторни тозаламоқчимисиз?"
                en="Clear calculator?"
              />
            </DialogTitle>
            <DialogDescription>
              {t(
                "Барча хоналар, мижоз маълумотлари ва ҳисоб-китоб йўқолади. Бу амалли қайтариб бўлмайди.",
                "All rooms, client info, and calculations will be lost. This cannot be undone.",
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setClearConfirmOpen(false)}
            >
              <Bi uz="Бекор қилиш" en="Cancel" />
            </Button>
            <Button
              size="sm"
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
              onClick={confirmClear}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              <Bi uz="Тозалаш" en="Clear" enClassName="font-normal opacity-90" />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
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
