"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/fetcher";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ScrollText } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { useT } from "@/lib/i18n";

/**
 * Map an AuditLog target (type + id) to a navigable href, or null if
 * the target isn't a clickable entity (e.g. system config, deleted
 * rows where targetId is set but the row is gone). New target types
 * just need a case here to become linkable.
 */
function targetHref(targetType: string | null, targetId: string | null): string | null {
  if (!targetType || !targetId) return null;
  switch (targetType) {
    case "order":   return `/orders/${targetId}`;
    case "project": return `/projects/${targetId}`;
    case "user":    return `/users`;
    default:        return null;
  }
}

interface AuditRow {
  id: string;
  createdAt: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  message: string | null;
  metadata: unknown;
  user: { id: string; name: string; email: string; role: string } | null;
}

interface AuditResponse {
  items: AuditRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const PAGE_SIZE = 50;

/**
 * The audit log can grow large fast (every order placement /
 * status change / drawing request adds a row). Default the page to
 * the last 7 days of activity — that's the window an owner actually
 * scans by hand. Older entries are still reachable: the operator
 * just clears the From input or types a different start date.
 */
function defaultFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 6); // 7 days inclusive of today (today + 6 prior)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function AuditPage() {
  const t = useT();
  const [action, setAction] = useState("");
  const [targetType, setTargetType] = useState("");
  // First load: default to the last week. Either bound can be cleared
  // or overridden by the operator to widen the window.
  const [from, setFrom] = useState<string>(() => defaultFromDate());
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery<AuditResponse>({
    queryKey: ["audit", action, targetType, from, to, page],
    queryFn: () => {
      const p = new URLSearchParams();
      if (action.trim()) p.set("action", action.trim());
      if (targetType.trim()) p.set("targetType", targetType.trim());
      if (from.trim()) p.set("from", from.trim());
      if (to.trim()) p.set("to", to.trim());
      p.set("page", String(page));
      p.set("pageSize", String(PAGE_SIZE));
      return api(`/api/audit?${p.toString()}`);
    },
  });

  const rows = data?.items ?? [];
  const totalPages = data?.totalPages ?? 1;
  const total = data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ScrollText className="h-6 w-6 text-muted-foreground" />
          Журнал
          <span className="lang-en text-muted-foreground font-normal text-base">
            {" "}· Audit log
          </span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            "Тизим бўйича барча муҳим амаллар — ким, нима, қачон қилгани.",
            "Every significant action across the system — who, what, when.",
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-56"
          placeholder={t("Амал (мас. order.place)", "Action (e.g. order.place)")}
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
        />
        <Input
          className="w-48"
          placeholder={t("Объект тури (мас. project)", "Target type (e.g. project)")}
          value={targetType}
          onChange={(e) => {
            setTargetType(e.target.value);
            setPage(1);
          }}
        />
        {/* Date range — both ends optional. `type="date"` renders the
            native picker; both anchors are local-TZ at the API level
            (matches the orders day-filter convention). */}
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          {t("Дан", "From")}
          <Input
            type="date"
            className="w-40"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-muted-foreground">
          {t("Гача", "To")}
          <Input
            type="date"
            className="w-40"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
        {(action || targetType || from !== defaultFromDate() || to) && (
          // "Clear" resets back to the 7-day default window so the
          // operator doesn't get dumped into an unbounded "everything
          // since day 1" view by accident.
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setAction("");
              setTargetType("");
              setFrom(defaultFromDate());
              setTo("");
              setPage(1);
            }}
          >
            {t("Тозалаш", "Clear")}
          </Button>
        )}
      </div>

      <div className="rounded-lg border border-border bg-card overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-muted-foreground">{t("Юкланмоқда…", "Loading…")}</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">
            {t("Ёзувлар топилмади.", "No audit entries match these filters.")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted text-[11px] uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 whitespace-nowrap">{t("Вақт", "When")}</th>
                  <th className="text-left px-3 py-2">{t("Фойдаланувчи", "Actor")}</th>
                  <th className="text-left px-3 py-2">{t("Амал", "Action")}</th>
                  <th className="text-left px-3 py-2">{t("Объект", "Target")}</th>
                  <th className="text-left px-3 py-2">{t("Изоҳ", "Message")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {formatDateTime(r.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.user ? (
                        <>
                          <div className="font-medium">{r.user.name}</div>
                          <div className="text-muted-foreground">
                            {r.user.role} · {r.user.email}
                          </div>
                        </>
                      ) : (
                        <span className="italic text-muted-foreground">
                          {t("Тизим", "system")}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-mono text-[11px] bg-muted px-1.5 py-0.5 rounded">
                        {r.action}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.targetType ? (
                        (() => {
                          const href = targetHref(r.targetType, r.targetId);
                          // The id stays visible because it's the
                          // canonical ref for cross-checking with
                          // logs / DB; the parent row + the message
                          // column already carry a friendly name.
                          // Link wraps the whole cell so the click
                          // target is generous.
                          return href ? (
                            <Link href={href} className="block hover:underline">
                              <div className="font-medium">{r.targetType}</div>
                              {r.targetId && (
                                <div className="text-primary font-mono">
                                  {r.targetId}
                                </div>
                              )}
                            </Link>
                          ) : (
                            <>
                              <div className="font-medium">{r.targetType}</div>
                              {r.targetId && (
                                <div className="text-muted-foreground font-mono">
                                  {r.targetId}
                                </div>
                              )}
                            </>
                          );
                        })()
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {r.message ?? <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground">
            <div>
              {t(`Саҳифа ${page} / ${totalPages}`, `Page ${page} of ${totalPages}`)}{" "}
              · {total} {t("ёзув", "entries")}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((n) => Math.max(1, n - 1))}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> {t("Олдинги", "Prev")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((n) => Math.min(totalPages, n + 1))}
              >
                {t("Кейинги", "Next")} <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
