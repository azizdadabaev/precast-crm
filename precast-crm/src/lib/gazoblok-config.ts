// Single density-grade label for the газоблок line, stored in one
// AppConfig row keyed "gazoblok.grade" (e.g. "D500"). The owner picks ONE
// grade; it is shown on quotes. No schema change — AppConfig is key/value
// JSON (same approach as pricing-config.ts).

import { prisma } from "@/lib/prisma";

const KEY = "gazoblok.grade";
export const DEFAULT_GAZOBLOK_GRADE = "D500";

/** Read the configured grade label, falling back to the default. */
export async function loadGazoblokGrade(): Promise<string> {
  const row = await prisma.appConfig.findUnique({ where: { key: KEY } });
  const v = row?.value as unknown;
  if (v && typeof v === "object" && typeof (v as { grade?: unknown }).grade === "string") {
    const g = (v as { grade: string }).grade.trim();
    if (g) return g;
  }
  return DEFAULT_GAZOBLOK_GRADE;
}

/** Persist a new grade label. Throws on empty input. */
export async function saveGazoblokGrade(grade: string): Promise<string> {
  const g = grade.trim();
  if (!g) throw new Error("Grade label cannot be empty");
  await prisma.appConfig.upsert({
    where: { key: KEY },
    create: { key: KEY, value: { grade: g } },
    update: { value: { grade: g } },
  });
  return g;
}
