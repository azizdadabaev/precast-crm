import { prisma } from "@/lib/prisma";

/**
 * Extract @mention tokens from a comment body and resolve them to
 * active User IDs. A token matches if it equals a user's email
 * (case-insensitive) OR their name (case-insensitive). Returns the
 * deduplicated list of matched IDs.
 */
export async function extractMentions(body: string): Promise<string[]> {
  if (!body) return [];

  const tokens = new Set<string>();
  // Two shapes supported:
  //   @username       — local-part-only (matches name OR email local-part)
  //   @user@host.tld  — full email (operators log in by email, so this
  //                     is the natural way to mention someone exactly)
  // We capture both shapes greedily — the email form is tried first so
  // `@sales@precast.local` becomes ONE token, not two.
  const re = /@([\w.+-]+@[\w.-]+\.[A-Za-z]{2,})|@([\w.+-]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const tok = (m[1] ?? m[2] ?? "").trim();
    if (tok) tokens.add(tok.toLowerCase());
  }
  if (tokens.size === 0) return [];

  const arr = [...tokens];
  // Match against email (exact, case-insensitive) OR name (insensitive equals).
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [
        { email: { in: arr, mode: "insensitive" } },
        { name: { in: arr, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });

  return [...new Set(users.map((u) => u.id))];
}
