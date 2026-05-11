"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Chip } from "@/components/ui/chip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Plus, Search, Send, X } from "lucide-react";
import { formatDate, cn } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import { ExportDialog } from "@/components/clients/ExportDialog";

interface Client {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  language: "UZ" | "RU";
  source: string | null;
  referenceConsent: "NOT_ASKED" | "GRANTED" | "DENIED";
  createdAt: string;
  _count: { deals: number; orders: number };
}

export default function ClientsPage() {
  const [q, setQ] = useState("");
  const [language, setLanguage] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ["clients", q, language],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (language) params.set("language", language);
      return api(`/api/clients?${params.toString()}`);
    },
  });

  // Clear selection whenever filters change — operators should re-confirm
  // context after narrowing/widening the visible list (per spec).
  useEffect(() => {
    setSelected(new Set());
  }, [q, language]);

  const eligibleIds = useMemo(
    () => clients.filter((c) => c.referenceConsent === "GRANTED").map((c) => c.id),
    [clients],
  );
  const allEligibleSelected =
    eligibleIds.length > 0 && eligibleIds.every((id) => selected.has(id));
  const someEligibleSelected =
    !allEligibleSelected && eligibleIds.some((id) => selected.has(id));

  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someEligibleSelected;
    }
  }, [someEligibleSelected]);

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  function toggleAllVisibleEligible() {
    setSelected((prev) => {
      if (allEligibleSelected) {
        // deselect only the eligible ones; preserve any others (none, in
        // practice, since ineligible can't get into the set)
        const next = new Set(prev);
        for (const id of eligibleIds) next.delete(id);
        return next;
      }
      const next = new Set(prev);
      for (const id of eligibleIds) next.add(id);
      return next;
    });
  }
  function clearSelection() {
    setSelected(new Set());
  }

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const selectedCount = selected.size;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Мижозлар <span className="text-muted-foreground font-normal text-base">· Clients</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Auto-populated when an Order is placed. Search by name, phone (last 4 digits OK), or address.
          </p>
        </div>
        <NewClientDialog />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-tertiary pointer-events-none" />
          <Input
            placeholder="Қидириш · name, phone (last 4 digits OK), or address…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="sm:w-44"
        >
          <option value="">All languages</option>
          <option value="UZ">Uzbek</option>
          <option value="RU">Russian</option>
        </Select>
      </div>

      {/* Sticky action bar — appears when at least one row is selected */}
      {selectedCount > 0 && (
        <div className="sticky top-2 z-10 px-4 py-2.5 bg-primary text-primary-foreground rounded-md flex items-center justify-between shadow-sm">
          <div className="text-sm">
            <span className="font-bold font-mono">{selectedCount}</span>{" "}
            client{selectedCount === 1 ? "" : "s"} selected
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setExportOpen(true)}
            >
              <Send className="h-4 w-4 mr-2" />
              Export Contacts
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-primary-foreground hover:bg-primary-foreground/10"
              onClick={clearSelection}
            >
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-muted-foreground">Loading…</div>
        ) : clients.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No clients found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="w-10 text-center px-3 py-2.5">
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      className="h-4 w-4 accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                      checked={allEligibleSelected}
                      onChange={toggleAllVisibleEligible}
                      disabled={eligibleIds.length === 0}
                      title={
                        eligibleIds.length === 0
                          ? "No clients with consent on file in current view"
                          : "Select all clients with consent on file"
                      }
                    />
                  </th>
                  <th className="text-left px-3 py-2.5">Исм · Name</th>
                  <th className="text-left px-3 py-2.5">Тел · Phone</th>
                  <th className="text-left px-3 py-2.5">Манзил · Address</th>
                  <th className="text-left px-3 py-2.5">Lang</th>
                  <th className="text-left px-3 py-2.5">Source</th>
                  <th className="text-right px-3 py-2.5">Orders</th>
                  <th className="text-left px-3 py-2.5">Added</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c, i) => {
                  const eligible = c.referenceConsent === "GRANTED";
                  const checked = selected.has(c.id);
                  return (
                    <tr
                      key={c.id}
                      className={cn(
                        "border-b last:border-b-0 border-border/60 hover:bg-surface-hover transition-colors",
                        i % 2 === 1 && "bg-muted/30",
                      )}
                    >
                      <td className="text-center px-3 py-2.5">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-primary cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                          checked={checked}
                          disabled={!eligible}
                          onChange={() => toggleOne(c.id)}
                          title={
                            eligible
                              ? "Toggle selection"
                              : "Розилик берилмаган · No consent on file"
                          }
                        />
                      </td>
                      <td className="px-3 py-2.5 font-medium">
                        <Link
                          href={`/clients/${c.id}`}
                          className="hover:underline hover:text-primary transition-colors"
                        >
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-text-tertiary">
                        {formatPhone(c.phone)}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-text-tertiary max-w-[14rem]">
                        {c.address ? <span className="line-clamp-2">{c.address}</span> : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <Chip variant="neutral">{c.language}</Chip>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-text-tertiary">
                        {c.source ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">
                        {c._count.orders}
                      </td>
                      <td className="px-3 py-2.5 text-xs font-mono text-text-tertiary">
                        {formatDate(c.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ExportDialog
        open={exportOpen}
        ids={selectedIds}
        onClose={() => setExportOpen(false)}
      />
    </div>
  );
}

function NewClientDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    address: "",
    language: "UZ",
    source: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: typeof form) =>
      api("/api/clients", { method: "POST", json: payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["clients"] });
      setOpen(false);
      setForm({ name: "", phone: "", address: "", language: "UZ", source: "", notes: "" });
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Client
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Client</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate(form);
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Phone *</Label>
            <Input
              required
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Манзил · Address</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Language</Label>
              <Select
                value={form.language}
                onChange={(e) => setForm({ ...form, language: e.target.value })}
              >
                <option value="UZ">Uzbek</option>
                <option value="RU">Russian</option>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Source</Label>
            <Input
              placeholder="e.g. Instagram, referral, walk-in"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Input
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          {error && (
            <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
