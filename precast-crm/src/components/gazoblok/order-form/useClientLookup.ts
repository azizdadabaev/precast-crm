"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/fetcher";
import { normalizePhone } from "@/lib/phone";
import { exactPhoneMatch, phoneLooksComplete } from "@/lib/gazoblok-order-form";

export type KnownClient = {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  orderCount: number;
  debt: number;
  last: { id: string; orderNumber: string; placedAt: string } | null;
};

export type ClientLookup =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "known"; client: KnownClient }
  | { status: "new" }
  /** No client.view, or the lookup failed: the form works as before (server 409 still asks). */
  | { status: "unavailable" };

type ClientRow = { id: string; name: string; phone: string; address: string | null };
type ClientDetail = ClientRow & {
  gazoblok?: { orderCount: number; debt: number };
  gazoblokOrders?: { id: string; orderNumber: string; placedAt: string }[];
};

/** Phone is the client id: once 9+ digits are typed (and settle for 350 ms) the existing
 *  client routes are asked who it is. Read-only; both routes are gated by client.view. */
export function useClientLookup(phone: string, enabled: boolean): ClientLookup {
  const [settled, setSettled] = useState(phone);
  useEffect(() => {
    const h = setTimeout(() => setSettled(phone), 350);
    return () => clearTimeout(h);
  }, [phone]);

  const norm = phoneLooksComplete(settled) ? normalizePhone(settled) : "";
  const q = useQuery<KnownClient | null>({
    queryKey: ["gazoblok-new-client-lookup", norm],
    enabled: enabled && norm !== "",
    retry: false,
    staleTime: 60_000,
    queryFn: async () => {
      const rows = await api<ClientRow[]>(`/api/clients?phone=${encodeURIComponent(norm)}`);
      const hit = exactPhoneMatch(norm, Array.isArray(rows) ? rows : []);
      if (!hit) return null;
      const d = await api<ClientDetail>(`/api/clients/${hit.id}`);
      const last = d.gazoblokOrders?.[0] ?? null;
      return {
        id: d.id,
        name: d.name,
        phone: d.phone,
        address: d.address,
        orderCount: d.gazoblok?.orderCount ?? 0,
        debt: d.gazoblok?.debt ?? 0,
        last: last ? { id: last.id, orderNumber: last.orderNumber, placedAt: last.placedAt } : null,
      };
    },
  });

  if (!enabled) return { status: "unavailable" };
  if (!phoneLooksComplete(phone) || norm === "") return { status: "idle" };
  if (q.isError) {
    if (!(q.error instanceof ApiError)) console.error("[gazoblok] client lookup failed:", q.error);
    return { status: "unavailable" };
  }
  if (q.isLoading || settled !== phone) return { status: "loading" };
  return q.data ? { status: "known", client: q.data } : { status: "new" };
}
