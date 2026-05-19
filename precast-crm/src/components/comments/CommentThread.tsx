"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send, Pencil, Trash2, Loader2 } from "lucide-react";
import { api } from "@/lib/fetcher";
import { useT } from "@/lib/i18n";
import { Button } from "@/components/ui/button";

interface CommentThreadProps {
  orderId?: string;
  projectId?: string;
}

interface CommentDTO {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  authorId: string;
  author: { id: string; name: string; role: string };
  editHistory: Array<{ body: string; editedAt: string }>;
  deletedAt: string | null;
  deletedBy?: { id: string; name: string } | null;
  mentionedUserIds: string[];
}

interface MeDTO {
  id: string;
  name: string;
  role: string;
  permissions: string[];
}

interface MentionUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

const EDIT_WINDOW_MS = 30 * 60_000;

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
  const re = /@([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})|@([\w.+-]+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) parts.push(<span key={key++}>{body.slice(last, m.index)}</span>);
    const tok = m[1] ?? m[2];
    parts.push(
      <span key={key++} className="text-primary font-medium">
        @{tok}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push(<span key={key++}>{body.slice(last)}</span>);
  return parts.length ? parts : body;
}

/** Returns initials (up to 2 chars) from a display name. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

// Stable hue per user id so the avatar color is consistent across renders.
function avatarHue(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffff;
  return h % 360;
}

export function CommentThread({ orderId, projectId }: CommentThreadProps) {
  const t = useT();
  const qc = useQueryClient();

  const baseUrl = orderId
    ? `/api/orders/${orderId}/comments`
    : `/api/projects/${projectId}/comments`;
  const queryKey = orderId ? ["comments", "order", orderId] : ["comments", "project", projectId];

  const { data: me } = useQuery<MeDTO>({
    queryKey: ["me"],
    queryFn: () => api<MeDTO>("/api/auth/me"),
    staleTime: 60_000,
  });

  const { data: comments = [], isLoading } = useQuery<CommentDTO[]>({
    queryKey,
    queryFn: () => api<CommentDTO[]>(baseUrl),
    enabled: Boolean(orderId || projectId),
  });

  // Mentionable users — lightweight list for the @picker
  const { data: mentionUsers = [] } = useQuery<MentionUser[]>({
    queryKey: ["users", "mentionable"],
    queryFn: () => api<MentionUser[]>("/api/users/mentionable"),
    staleTime: 5 * 60_000,
  });

  const draftKey = me
    ? `comment-draft:${me.id}:${orderId ? `o:${orderId}` : `p:${projectId}`}`
    : null;

  const [draft, setDraft] = React.useState("");
  const [draftHydrated, setDraftHydrated] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editDraft, setEditDraft] = React.useState("");

  // Mention picker state
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const mentionAtPos = React.useRef(-1);
  const [mentionQuery, setMentionQuery] = React.useState<string | null>(null);
  const [mentionIdx, setMentionIdx] = React.useState(0);

  const mentionSuggestions = React.useMemo<MentionUser[]>(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return mentionUsers
      .filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [mentionQuery, mentionUsers]);

  // Detect @query immediately before the cursor
  function detectMention(value: string, cursor: number) {
    const before = value.slice(0, cursor);
    const m = /@([\w.]*)$/.exec(before);
    if (m) {
      mentionAtPos.current = m.index;
      setMentionQuery(m[1]);
      setMentionIdx(0);
    } else {
      mentionAtPos.current = -1;
      setMentionQuery(null);
    }
  }

  function insertMention(user: MentionUser) {
    const token = `@${user.email}`;
    const el = textareaRef.current;
    const cursor = el?.selectionStart ?? draft.length;
    const atPos = mentionAtPos.current;
    if (atPos < 0) return;
    const newValue = draft.slice(0, atPos) + token + " " + draft.slice(cursor);
    setDraft(newValue);
    setMentionQuery(null);
    mentionAtPos.current = -1;
    const newCursor = atPos + token.length + 1;
    requestAnimationFrame(() => {
      if (el) {
        el.setSelectionRange(newCursor, newCursor);
        el.focus();
      }
    });
  }

  function handleDraftChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setDraft(v);
    detectMention(v, e.target.selectionStart ?? v.length);
  }

  function handleDraftKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mentionSuggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIdx((i) => Math.min(i + 1, mentionSuggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        insertMention(mentionSuggestions[mentionIdx]);
        return;
      }
      if (e.key === "Escape") {
        setMentionQuery(null);
        return;
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  function handleDraftBlur() {
    // Short delay so onMouseDown on a suggestion fires before we close
    setTimeout(() => setMentionQuery(null), 120);
  }

  React.useEffect(() => {
    if (!draftKey || draftHydrated) return;
    try {
      const stored = localStorage.getItem(draftKey);
      if (stored) setDraft(stored);
    } catch {
      /* localStorage blocked / quota */
    }
    setDraftHydrated(true);
  }, [draftKey, draftHydrated]);

  React.useEffect(() => {
    if (!draftKey || !draftHydrated) return;
    try {
      if (draft) localStorage.setItem(draftKey, draft);
      else localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }, [draft, draftKey, draftHydrated]);

  const invalidate = () => qc.invalidateQueries({ queryKey });

  const createMut = useMutation({
    mutationFn: (body: string) => api(baseUrl, { method: "POST", json: { body } }),
    onSuccess: () => {
      setDraft("");
      if (draftKey) {
        try { localStorage.removeItem(draftKey); } catch { /* ignore */ }
      }
      invalidate();
    },
  });

  const editMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: string }) =>
      api(`${baseUrl}/${id}`, { method: "PATCH", json: { body } }),
    onSuccess: () => {
      setEditingId(null);
      setEditDraft("");
      invalidate();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api(`${baseUrl}/${id}`, { method: "DELETE" }),
    onSuccess: invalidate,
  });

  const isModerator = me?.permissions?.includes("comment.moderate") ?? false;
  const visible = comments.filter((c) => !c.deletedAt);

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed || createMut.isPending) return;
    createMut.mutate(trimmed);
  }

  function submitEdit(id: string) {
    const trimmed = editDraft.trim();
    if (!trimmed || editMut.isPending) return;
    editMut.mutate({ id, body: trimmed });
  }

  function startEdit(c: CommentDTO) {
    setEditingId(c.id);
    setEditDraft(c.body);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
  }

  function canEdit(c: CommentDTO): boolean {
    if (!me) return false;
    if (c.authorId !== me.id) return false;
    return Date.now() - new Date(c.createdAt).getTime() < EDIT_WINDOW_MS;
  }

  function canDelete(c: CommentDTO): boolean {
    if (!me) return false;
    return isModerator || c.authorId === me.id;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-4">
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Шарҳлар<span className="lang-en text-muted-foreground font-normal"> · Comments</span>
        </h3>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {visible.length}
        </span>
      </div>

      <div className="space-y-3">
        {isLoading && (
          <div className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("Юкланмоқда…", "Loading…")}
          </div>
        )}
        {!isLoading && visible.length === 0 && (
          <div className="text-sm text-muted-foreground italic">
            {t("Ҳозирча шарҳлар йўқ", "No comments yet")}
          </div>
        )}
        {visible.map((c) => {
          const edited = (c.editHistory?.length ?? 0) > 0;
          const isEditing = editingId === c.id;
          return (
            <div
              key={c.id}
              className="rounded-md border border-border bg-background p-3 space-y-1.5"
            >
              <div className="flex items-baseline gap-2 text-xs">
                <span className="font-semibold text-sm">{c.author.name}</span>
                <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {c.author.role}
                </span>
                <span className="text-muted-foreground ml-auto tabular-nums">
                  {relativeTime(c.createdAt, t)}
                  {edited && (
                    <span className="ml-1 italic">
                      · {t("таҳрирланди", "edited")}
                    </span>
                  )}
                </span>
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={3}
                    maxLength={4000}
                    className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        submitEdit(c.id);
                      }
                    }}
                  />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      {t("Бекор қилиш", "Cancel")}
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => submitEdit(c.id)}
                      disabled={!editDraft.trim() || editMut.isPending}
                    >
                      {editMut.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        t("Сақлаш", "Save")
                      )}
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="text-sm whitespace-pre-wrap break-words">
                    {renderBody(c.body)}
                  </div>
                  {(canEdit(c) || canDelete(c)) && (
                    <div className="flex gap-1 pt-1">
                      {canEdit(c) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs"
                          onClick={() => startEdit(c)}
                        >
                          <Pencil className="h-3 w-3 mr-1" />
                          {t("Таҳрирлаш", "Edit")}
                        </Button>
                      )}
                      {!canEdit(c) && c.authorId === me?.id && (
                        <span className="text-[10px] text-muted-foreground italic px-2 py-1">
                          {t("30 дақ. таҳрир ойнаси тугаган", "edit window closed")}
                        </span>
                      )}
                      {canDelete(c) && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm(t("Шарҳ ўчирилсинми?", "Delete this comment?"))) {
                              deleteMut.mutate(c.id);
                            }
                          }}
                          disabled={deleteMut.isPending}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          {t("Ўчириш", "Delete")}
                        </Button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Compose area */}
      <div className="space-y-2 pt-2 border-t border-border">
        {/* Relative wrapper so the dropdown is anchored to this block */}
        <div className="relative">
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={handleDraftChange}
            onKeyDown={handleDraftKeyDown}
            onBlur={handleDraftBlur}
            rows={3}
            maxLength={4000}
            placeholder={t(
              "Шарҳ ёзинг… @ билан одам белгилаш",
              "Write a comment… type @ to mention someone",
            )}
            className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />

          {/* @mention dropdown — floats above the textarea */}
          {mentionSuggestions.length > 0 && (
            <div className="absolute bottom-full mb-1 left-0 right-0 z-50 rounded-md border border-border bg-card shadow-lg overflow-hidden">
              {mentionSuggestions.map((u, i) => {
                const hue = avatarHue(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left ${
                      i === mentionIdx ? "bg-accent" : "hover:bg-accent/60"
                    }`}
                    onMouseDown={(e) => {
                      // Prevent textarea blur before the click registers
                      e.preventDefault();
                      insertMention(u);
                    }}
                  >
                    {/* Avatar */}
                    <span
                      className="h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                      style={{ background: `hsl(${hue} 55% 50%)` }}
                    >
                      {initials(u.name)}
                    </span>
                    <span className="font-medium truncate">{u.name}</span>
                    <span className="text-[10px] bg-muted rounded px-1.5 py-0.5 font-mono uppercase tracking-wide text-muted-foreground shrink-0">
                      {u.role}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground font-mono truncate hidden sm:block">
                      {u.email}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {t("Ctrl/⌘ + Enter — юбориш", "Ctrl/⌘ + Enter to submit")}
          </span>
          <Button
            size="sm"
            onClick={submit}
            disabled={!draft.trim() || createMut.isPending}
          >
            {createMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
            ) : (
              <Send className="h-3.5 w-3.5 mr-1" />
            )}
            {t("Юбориш", "Send")}
          </Button>
        </div>
        {createMut.isError && (
          <div className="text-xs text-destructive">
            {(createMut.error as Error).message}
          </div>
        )}
      </div>
    </div>
  );
}

export default CommentThread;
