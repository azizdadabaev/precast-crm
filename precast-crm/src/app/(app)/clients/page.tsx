"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { Plus, Search } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";

interface Client {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  language: "UZ" | "RU";
  source: string | null;
  createdAt: string;
  _count: { deals: number; orders: number };
}

export default function ClientsPage() {
  const [q, setQ] = useState("");
  const [language, setLanguage] = useState("");

  const { data: clients = [], isLoading } = useQuery<Client[]>({
    queryKey: ["clients", q, language],
    queryFn: () => {
      const params = new URLSearchParams();
      if (q) params.set("q", q);
      if (language) params.set("language", language);
      return api(`/api/clients?${params.toString()}`);
    },
  });

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

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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

          {isLoading ? (
            <div className="text-muted-foreground py-8 text-center">Loading…</div>
          ) : clients.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">No clients found</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="excel-table">
                <thead>
                  <tr>
                    <th>Исм · Name</th>
                    <th>Тел · Phone</th>
                    <th>Манзил · Address</th>
                    <th>Lang</th>
                    <th>Source</th>
                    <th className="text-center">Orders</th>
                    <th>Added</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.id} className="cursor-pointer">
                      <td className="font-medium">
                        <Link href={`/clients/${c.id}`} className="hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="tabular-nums">{formatPhone(c.phone)}</td>
                      <td>{c.address ?? "—"}</td>
                      <td>
                        <Badge variant="outline">{c.language}</Badge>
                      </td>
                      <td>{c.source ?? "—"}</td>
                      <td className="text-center tabular-nums">{c._count.orders}</td>
                      <td className="text-muted-foreground">{formatDate(c.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
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
