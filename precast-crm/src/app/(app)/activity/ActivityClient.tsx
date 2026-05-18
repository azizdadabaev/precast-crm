"use client";

import * as React from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MessageSquare, Loader2, FileText, ShoppingCart } from "lucide-react";
import { api } from "@/lib/fetcher";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

interface CommentRow {
  id: string;
  body: string;
  createdAt: string;
  deletedAt: string | null;
  authorId: string;
  author: { id: string; name: string; role: string };
  orderId: string | null;
  projectId: string | null;
  order: {
    id: string;
    orderNumber: string;
    client: { id: string; name: string } | null;
  } | null;
  project: {
    id: string;
    draftNumber: number | null;
    name: string | null;
    tentativeClientName: string | null;
    client: { id: string; name: string } | null;
  } | null;
}

interface InboxPage {
  comments: CommentRow[];
  nextCursor: string | null;
  hasNextPage: boolean;
}

function relativeTime(iso: string, t: (uz: string, en: string) => string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return t("ҳозиргина", "just now");
  const min = Math.round(sec / 60);
  if (min < 60) return t(`${min} дақ. олдин`, `${min}m ago`);
  const hr = Math.round(min / 60);
  if (hr < 24) return t(`${hr} соат олдин`, `${hr}h ago`);
  const day = Math.round(hr / 24);
  if (day < 7) return t(`${day} кун олдин`, `${day}d ago`);
  return new Date(iso).toLocaleDateString();
}

function renderBody(body: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /@([\w.+-]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push(<span key={key++}>{body.slice(last, m.index)}</span>);
    parts.push(
      <span key={key++} className="text-primary font-medium">
        @{m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(<span key={key++}>{body.slice(last)}</span>);
  return parts.length ? parts : body;
}

type Filter = "all" | "order" | "project";

export default function ActivityClient() {
  const t = useT();
  const [filter, setFilter] = React.useState<Filter>("all");

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useInfiniteQuery<InboxPage>({
    queryKey: ["activity-inbox", filter],
    queryFn: ({ pageParam }) => {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("entityType", filter);
      if (pageParam) params.set("cursor", String(pageParam));
      params.set("limit", "30");
      return api(`/api/comments?${params.toString()}`);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.hasNextPage ? last.nextCursor : null),
  });

  const allRows: CommentRow[] = React.useMemo(
    () => (data?.pages ?? []).flatMap((p) => p.comments),
    [data],
  );

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {t("Фаоллик", "Activity")}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              "Буюртмалар ва лойиҳалардаги барча изоҳлар",
              "All comments across orders and saved drafts",
            )}
          </p>
        </div>
      </div>

      <div className="flex gap-2 border-b border-border">
        <FilterTab active={filter === "all"} onClick={() => setFilter("all")}>
          {t("Барчаси", "All")}
        </FilterTab>
        <FilterTab active={filter === "order"} onClick={() => setFilter("order")}>
          {t("Буюртмалар", "Orders")}
        </FilterTab>
        <FilterTab active={filter === "project"} onClick={() => setFilter("project")}>
          {t("Лойиҳалар", "Drafts")}
        </FilterTab>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t("Юкланмоқда…", "Loading…")}
        </div>
      )}

      {!isLoading && allRows.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          <MessageSquare className="h-8 w-8 mx-auto mb-3 opacity-50" />
          {t("Ҳали изоҳ йўқ", "No comments yet")}
        </div>
      )}

      <div className="space-y-3">
        {allRows.map((c) => (
          <ActivityRow key={c.id} comment={c} />
        ))}
      </div>

      {hasNextPage && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isFetchingNextPage}
            onClick={() => fetchNextPage()}
          >
            {isFetchingNextPage ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {t("Юкланмоқда…", "Loading…")}
              </>
            ) : (
              t("Кўпроқ", "Load more")
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px " +
        (active
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

function ActivityRow({ comment }: { comment: CommentRow }) {
  const t = useT();
  const isOrder = !!comment.orderId;
  const target = isOrder
    ? {
        href: `/orders/${comment.orderId}`,
        icon: <ShoppingCart className="h-3.5 w-3.5" />,
        label: `#${comment.order?.orderNumber ?? "—"}`,
        sub: comment.order?.client?.name ?? "",
      }
    : {
        href: `/projects/${comment.projectId}`,
        icon: <FileText className="h-3.5 w-3.5" />,
        label: comment.project?.draftNumber
          ? `Draft ${comment.project.draftNumber}D`
          : comment.project?.name ?? "Draft",
        sub:
          comment.project?.client?.name ??
          comment.project?.tentativeClientName ??
          "",
      };

  return (
    <div className="rounded-lg border border-border bg-card p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-xs font-semibold shrink-0">
          {comment.author.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1 flex-wrap">
            <span className="font-medium text-foreground">{comment.author.name}</span>
            <span>·</span>
            <span>{relativeTime(comment.createdAt, t)}</span>
            <span>·</span>
            <Link
              href={target.href}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono text-[11px] hover:bg-primary/20 transition-colors"
            >
              {target.icon}
              {target.label}
            </Link>
            {target.sub && (
              <>
                <span>·</span>
                <span className="truncate">{target.sub}</span>
              </>
            )}
          </div>
          <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
            {comment.deletedAt ? (
              <span className="italic text-muted-foreground">
                {t("[Шарҳ ўчирилган]", "[Comment deleted]")}
              </span>
            ) : (
              renderBody(comment.body)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
