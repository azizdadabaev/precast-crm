"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/fetcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Plus, ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { formatMoney, formatDate } from "@/lib/utils";
import { formatPhone } from "@/lib/phone";
import {
  ConsentDialog,
  type ConsentValue,
} from "@/components/clients/ConsentDialog";

interface ClientDetail {
  id: string;
  name: string;
  phone: string;
  address: string | null;
  language: string;
  source: string | null;
  notes: string | null;
  createdAt: string;
  referenceConsent: ConsentValue;
  consentNote: string | null;
  consentUpdatedAt: string | null;
  deals: Array<{
    id: string;
    stage: string;
    status: string;
    value: string;
    createdAt: string;
    projects: Array<{ id: string }>;
  }>;
}

const CONSENT_LABEL: Record<ConsentValue, string> = {
  GRANTED: "GRANTED · Розилик берилган",
  DENIED: "DENIED · Розилик берилмаган",
  NOT_ASKED: "NOT_ASKED · Сўралмаган",
};

const CONSENT_BADGE: Record<ConsentValue, { cls: string; Icon: React.ComponentType<{ className?: string }> }> = {
  GRANTED:   { cls: "bg-emerald-100 text-emerald-800 border-emerald-300", Icon: ShieldCheck },
  DENIED:    { cls: "bg-rose-100 text-rose-800 border-rose-300",          Icon: ShieldAlert },
  NOT_ASKED: { cls: "bg-muted text-muted-foreground border-border",       Icon: ShieldQuestion },
};

export default function ClientDetailPage() {
  const params = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [consentOpen, setConsentOpen] = useState(false);

  const { data: client, isLoading } = useQuery<ClientDetail>({
    queryKey: ["client", params.id],
    queryFn: () => api(`/api/clients/${params.id}`),
  });

  const createDeal = useMutation({
    mutationFn: () =>
      api("/api/deals", { method: "POST", json: { clientId: params.id, stage: "NEW_LEAD" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client", params.id] }),
  });

  const updateConsent = useMutation({
    mutationFn: (payload: { referenceConsent: ConsentValue; consentNote: string | null }) =>
      api(`/api/clients/${params.id}`, { method: "PATCH", json: payload }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["client", params.id] }),
  });

  if (isLoading || !client) return <div className="text-muted-foreground">Loading…</div>;

  const consentBadge = CONSENT_BADGE[client.referenceConsent];
  const ConsentIcon = consentBadge.Icon;

  return (
    <div className="space-y-5">
      <Link
        href="/clients"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4 mr-1" /> Back to clients
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{client.name}</h1>
          <p className="text-sm text-muted-foreground tabular-nums">
            {formatPhone(client.phone)}
          </p>
        </div>
        <Button onClick={() => createDeal.mutate()}>
          <Plus className="h-4 w-4 mr-2" /> New Deal
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Phone" value={formatPhone(client.phone)} />
            <Row label="Address · Манзил" value={client.address ?? "—"} />
            <Row label="Language" value={client.language} />
            <Row label="Source" value={client.source ?? "—"} />
            <Row label="Created" value={formatDate(client.createdAt)} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">
              {client.notes || <span className="text-muted-foreground">No notes</span>}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Reference consent card — controls inclusion in contact-export */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <ConsentIcon className="h-5 w-5" />
            Reference Consent
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConsentOpen(true)}
          >
            Update consent
          </Button>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center text-[11px] font-bold uppercase tracking-wider rounded px-2 py-0.5 border ${consentBadge.cls}`}
            >
              {CONSENT_LABEL[client.referenceConsent]}
            </span>
            {client.consentUpdatedAt && (
              <span className="text-xs text-muted-foreground">
                Last updated: {formatDate(client.consentUpdatedAt)}
              </span>
            )}
          </div>
          {client.consentNote && (
            <p className="text-sm text-muted-foreground italic">
              &ldquo;{client.consentNote}&rdquo;
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            Controls whether this client is selectable in the export-contacts
            flow on the Clients list. Operators must record an explicit answer
            before the client can be shared with prospects.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Deals ({client.deals.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {client.deals.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deals yet</p>
          ) : (
            <table className="excel-table">
              <thead>
                <tr>
                  <th>Stage</th>
                  <th>Status</th>
                  <th className="text-right">Value</th>
                  <th className="text-center">Projects</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {client.deals.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <Badge variant="outline">{d.stage}</Badge>
                    </td>
                    <td>
                      <Badge
                        variant={
                          d.status === "WON"
                            ? "success"
                            : d.status === "LOST"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {d.status}
                      </Badge>
                    </td>
                    <td className="text-right">{formatMoney(d.value)}</td>
                    <td className="text-center">{d.projects.length}</td>
                    <td className="text-muted-foreground">{formatDate(d.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <ConsentDialog
        open={consentOpen}
        onClose={() => setConsentOpen(false)}
        initialValue={client.referenceConsent}
        initialNote={client.consentNote}
        onSubmit={async (next) => {
          await updateConsent.mutateAsync(next);
        }}
      />
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right">{value}</span>
    </div>
  );
}
