// Crew pay persistence. Stores only raw inputs; every figure is computed by
// the engine on read. Each write runs in one transaction that re-loads state,
// applies the pure rules (closed weeks, validation), then writes. Audit rows
// are written after commit, fire-and-forget (src/lib/audit.ts).
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { balanceAt, weeklyPay, type EngineInput, type IsoDate } from "./engine";
import { buildState, type CrewState, type LedgerMeta } from "./views";
import { runChecks, closeBlockers } from "./checks";
import {
  CrewPayError, assertCanReopen, assertEffectiveDateAllowed, assertWeeksOpen, clampToWeek, planPayments, todayTashkent,
  validateDayWrite, validateLedgerWrite,
} from "./rules";
import { fmtSom } from "./format";
import type {
  DayBody, LedgerBody, LedgerPatchBody, PayBody, RateBody, ReverseBody, SettingBody, WorkerBody, WorkerPatchBody,
} from "./schemas";

type Db = PrismaClient | Prisma.TransactionClient;
type Actor = { id: string };

export const toDbDate = (d: IsoDate) => new Date(`${d}T00:00:00.000Z`);
export const fromDbDate = (d: Date): IsoDate => d.toISOString().slice(0, 10);

export async function loadCrewState(db: Db = prisma): Promise<CrewState> {
  const [workers, days, ledger, rates, settings, weeks] = await Promise.all([
    db.crewWorker.findMany({ orderBy: { code: "asc" } }),
    db.crewDay.findMany({ include: { attendance: true }, orderBy: { workDate: "asc" } }),
    db.crewLedgerEntry.findMany({ orderBy: { seq: "asc" } }),
    db.crewRate.findMany(),
    db.crewSetting.findMany(),
    db.crewPayWeek.findMany(),
  ]);
  const typeById = new Map(ledger.map((e) => [e.id, e.type]));
  const input: EngineInput = {
    workers: workers.map((w) => ({ id: w.id, code: w.code, name: w.name, status: w.status,
      joinedOn: fromDbDate(w.joinedOn), leftOn: w.leftOn ? fromDbDate(w.leftOn) : null })),
    days: days.map((d) => ({ date: fromDbDate(d.workDate), moulded: d.moulded, broken: d.broken,
      attendance: Object.fromEntries(d.attendance.map((a) => [a.workerId, a.halfDays / 2])) })),
    ledger: ledger.map((e) => ({ id: e.id, seq: e.seq, date: fromDbDate(e.entryDate), workerId: e.workerId, type: e.type, amount: e.amount,
      reverses: e.reversesEntryId ? typeById.get(e.reversesEntryId) : undefined })),
    rates: rates.map((r) => ({ effectiveFrom: fromDbDate(r.effectiveFrom), ratePerBlock: r.ratePerBlock })),
    settings: settings.map((s) => ({ key: s.key, value: Number(s.value), effectiveFrom: fromDbDate(s.effectiveFrom) })),
  };
  return buildState({
    input,
    closedWeekStarts: weeks.filter((w) => w.state === "CLOSED").map((w) => fromDbDate(w.weekStart)),
    snapshots: new Map(weeks.filter((w) => w.snapshot != null).map((w) => [fromDbDate(w.weekStart), w.snapshot])),
    ledgerMeta: new Map<string, LedgerMeta>(ledger.map((e) => [e.id, { method: e.method, reason: e.reason, signed: e.signed, reversesEntryId: e.reversesEntryId }])),
    workerMeta: new Map(workers.map((w) => [w.id, { phone: w.phone, notes: w.notes }])),
    dayNotes: new Map(days.map((d) => [fromDbDate(d.workDate), d.notes])),
  });
}

// Every write re-reads state and checks the closed-week lock before writing;
// Serializable makes that read-check-write atomic against a concurrent close,
// pay or edit (a lost race surfaces as P2034 → Uzbek "retry" via crewRoute).
const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

const audit = (user: Actor, action: string, targetId: string, message: string, metadata?: Record<string, unknown>) =>
  void recordAudit({ userId: user.id, action, targetType: "crewpay", targetId, message, metadata: metadata ?? null });

export async function saveDay(user: Actor, body: DayBody) {
  const id = await prisma.$transaction(async (tx) => {
    const s = await loadCrewState(tx);
    assertWeeksOpen(s.closedWeeks, [body.date]);
    validateDayWrite({ date: body.date, moulded: body.moulded, broken: body.broken, attendance: body.attendance }, s.input,
      { confirmNoAttendance: body.confirmNoAttendance, today: todayTashkent() });
    const day = await tx.crewDay.upsert({
      where: { workDate: toDbDate(body.date) },
      create: { workDate: toDbDate(body.date), moulded: body.moulded, broken: body.broken, notes: body.notes ?? null, updatedById: user.id },
      update: { moulded: body.moulded, broken: body.broken, notes: body.notes ?? null, updatedById: user.id },
    });
    await tx.crewAttendance.deleteMany({ where: { dayId: day.id } });
    const rows = Object.entries(body.attendance).map(([workerId, v]) => ({ dayId: day.id, workerId, halfDays: v === 1 ? 2 : 1 }));
    if (rows.length) await tx.crewAttendance.createMany({ data: rows });
    return day.id;
  }, SERIALIZABLE);
  audit(user, "crewpay.day.save", id, `Кун сақланди ${body.date}`, { ...body });
  return { id };
}

/** `reversesEntryId` is internal (set by reverseLedgerEntry), never taken from the request body. */
export async function addLedgerEntry(user: Actor, body: LedgerBody, link: { reversesEntryId?: string } = {}) {
  const result = await prisma.$transaction(async (tx) => {
    const s = await loadCrewState(tx);
    if (!s.input.workers.some((w) => w.id === body.workerId)) throw new CrewPayError("Номаълум ишчи");
    assertWeeksOpen(s.closedWeeks, [body.date]);
    validateLedgerWrite(body, todayTashkent());
    if (body.clientKey && (await tx.crewLedgerEntry.findUnique({ where: { clientKey: body.clientKey } }))) {
      throw new CrewPayError("Бу ёзув аллақачон сақланган", 409);
    }
    let warning: string | null = null;
    if (body.type === "ADVANCE") {
      const after = balanceAt(s.input, s.weeks, body.workerId, body.date) - body.amount;
      if (after < 0) {
        warning = `Аванс ишлаганидан кўп — ишчи ${fmtSom(-after)} сўм қарз бўлади`;
        if (!body.confirmOverBalance) throw new CrewPayError(warning, 422);
      }
    }
    const e = await tx.crewLedgerEntry.create({
      data: { entryDate: toDbDate(body.date), workerId: body.workerId, type: body.type, amount: body.amount,
              method: body.method, reason: body.reason ?? null, signed: body.signed ?? false,
              clientKey: body.clientKey ?? null, reversesEntryId: link.reversesEntryId ?? null, createdById: user.id },
    });
    return { id: e.id, warning };
  }, SERIALIZABLE);
  audit(user, "crewpay.ledger.add", result.id, `${body.type} ${fmtSom(body.amount)} сўм`, { ...body });
  return result;
}

export async function patchLedgerEntry(user: Actor, id: string, body: LedgerPatchBody) {
  const before = await prisma.crewLedgerEntry.findUnique({ where: { id } });
  if (!before) throw new CrewPayError("Ёзув топилмади", 404);
  // Only reason / signed / method may change; amount, date, worker and type are immutable.
  const after = await prisma.crewLedgerEntry.update({
    where: { id },
    data: { reason: body.reason === undefined ? undefined : body.reason, signed: body.signed, method: body.method },
  });
  audit(user, "crewpay.ledger.patch", id, "Кассадаги изоҳ/имзо ўзгартирилди",
    { before: { reason: before.reason, signed: before.signed, method: before.method }, after: { reason: after.reason, signed: after.signed, method: after.method } });
  return { id };
}

export async function reverseLedgerEntry(user: Actor, id: string, body: ReverseBody) {
  const orig = await prisma.crewLedgerEntry.findUnique({ where: { id } });
  if (!orig) throw new CrewPayError("Ёзув топилмади", 404);
  const amount = body.amount ?? -orig.amount;
  // The link is written in the same insert, so a correction can never exist unlinked.
  return addLedgerEntry(user, {
    date: body.date, workerId: orig.workerId, type: "CORRECTION", amount, method: orig.method,
    reason: body.reason ?? `№${orig.seq} бекор қилинди`, signed: false,
  }, { reversesEntryId: orig.id });
}

export async function payWorkers(user: Actor, weekStart: IsoDate, body: PayBody) {
  const date = clampToWeek(todayTashkent(), weekStart);
  const created = await prisma.$transaction(async (tx) => {
    const s = await loadCrewState(tx);
    assertWeeksOpen(s.closedWeeks, [date]);
    const keys = await tx.crewLedgerEntry.findMany({
      where: { clientKey: { in: body.payments.map((p) => p.clientKey) } }, select: { clientKey: true },
    });
    const todo = planPayments(new Set(keys.map((k) => k.clientKey!)), body.payments);
    for (const p of todo) {
      if (!s.input.workers.some((w) => w.id === p.workerId)) throw new CrewPayError("Номаълум ишчи");
      await tx.crewLedgerEntry.create({
        data: { entryDate: toDbDate(date), workerId: p.workerId, type: "WEEKLY_PAY", amount: p.amount, method: p.method,
                reason: `${weekStart} ҳафтаси учун`, payWeekStart: toDbDate(weekStart), clientKey: p.clientKey, createdById: user.id },
      });
    }
    return todo.length;
  }, SERIALIZABLE);
  audit(user, "crewpay.pay", weekStart, `Иш ҳақи тўланди (${created} та)`, { weekStart, date, payments: body.payments });
  return { created };
}

export async function closeWeek(user: Actor, weekStart: IsoDate) {
  const result = await prisma.$transaction(async (tx) => {
    const s = await loadCrewState(tx);
    if (s.closedWeeks.has(weekStart)) throw new CrewPayError("Бу ҳафта аллақачон ёпилган", 409);
    const blockers = closeBlockers(runChecks(s.input, s.weeks, todayTashkent()), weekStart);
    if (blockers.length) throw new CrewPayError(`Ёпиб бўлмайди: ${blockers.map((b) => b.message).join("; ")}`, 422);
    const snapshot = { rows: weeklyPay(s.input, s.weeks, weekStart), week: s.weeks.get(weekStart) ?? null };
    await tx.crewPayWeek.upsert({
      where: { weekStart: toDbDate(weekStart) },
      create: { weekStart: toDbDate(weekStart), state: "CLOSED", closedAt: new Date(), closedById: user.id, snapshot: snapshot as unknown as Prisma.InputJsonValue },
      update: { state: "CLOSED", closedAt: new Date(), closedById: user.id, snapshot: snapshot as unknown as Prisma.InputJsonValue },
    });
    await tx.crewPayWeekEvent.create({ data: { weekStart: toDbDate(weekStart), action: "close", byId: user.id } });
    return { weekStart };
  }, SERIALIZABLE);
  audit(user, "crewpay.week.close", weekStart, `${weekStart} ҳафтаси ёпилди`);
  return result;
}

export async function reopenWeek(user: Actor, weekStart: IsoDate, reason: string) {
  const closed = await prisma.crewPayWeek.findMany({ where: { state: "CLOSED" }, select: { weekStart: true } });
  assertCanReopen(new Set(closed.map((w) => fromDbDate(w.weekStart))), weekStart);
  await prisma.$transaction([
    prisma.crewPayWeek.update({ where: { weekStart: toDbDate(weekStart) }, data: { state: "OPEN" } }),
    prisma.crewPayWeekEvent.create({ data: { weekStart: toDbDate(weekStart), action: "reopen", reason, byId: user.id } }),
  ]);
  audit(user, "crewpay.week.reopen", weekStart, `${weekStart} ҳафтаси қайта очилди: ${reason}`);
  return { weekStart };
}

export async function createWorker(user: Actor, body: WorkerBody) {
  const codes = await prisma.crewWorker.findMany({ select: { code: true } });
  const next = codes.reduce((m, c) => Math.max(m, Number(c.code.slice(1)) || 0), 0) + 1;
  const w = await prisma.crewWorker.create({
    data: { code: `W${String(next).padStart(2, "0")}`, name: body.name, joinedOn: toDbDate(body.joinedOn),
            phone: body.phone ?? null, notes: body.notes ?? null },
  });
  audit(user, "crewpay.worker.create", w.id, `Ишчи қўшилди: ${w.name}`);
  return { id: w.id };
}

export async function updateWorker(user: Actor, id: string, body: WorkerPatchBody) {
  const s = await loadCrewState();
  const w = s.input.workers.find((x) => x.id === id);
  if (!w) throw new CrewPayError("Ишчи топилмади", 404);
  const joinedOn = body.joinedOn ?? w.joinedOn;
  const leftOn = body.leftOn === undefined ? w.leftOn : body.leftOn;
  if (leftOn && leftOn < joinedOn) throw new CrewPayError("Кетган сана келган санадан олдин бўлиши мумкин эмас");
  // Moving the dates must not orphan attendance already recorded outside them.
  const outside = s.input.days.filter((d) => d.attendance[id] && (d.date < joinedOn || (leftOn && d.date > leftOn)));
  if (outside.length) throw new CrewPayError(`Бу санада ишчининг давомати бор: ${outside.map((d) => d.date).join(", ")}`);
  await prisma.crewWorker.update({
    where: { id },
    data: { name: body.name, joinedOn: toDbDate(joinedOn), leftOn: leftOn ? toDbDate(leftOn) : null,
            status: leftOn ? "LEFT" : "ACTIVE", phone: body.phone, notes: body.notes },
  });
  audit(user, "crewpay.worker.update", id, `Ишчи ўзгартирилди: ${body.name ?? w.name}`, { ...body });
  return { id };
}

export async function addRate(user: Actor, body: RateBody) {
  const s = await loadCrewState();
  assertEffectiveDateAllowed(s.closedWeeks, body.effectiveFrom);
  const r = await prisma.crewRate.create({ data: { effectiveFrom: toDbDate(body.effectiveFrom), ratePerBlock: body.ratePerBlock, createdById: user.id } });
  audit(user, "crewpay.rate.add", r.id, `Ставка ${body.ratePerBlock} сўм ${body.effectiveFrom} дан`);
  return { id: r.id };
}

export async function addSetting(user: Actor, body: SettingBody) {
  const s = await loadCrewState();
  assertEffectiveDateAllowed(s.closedWeeks, body.effectiveFrom);
  const r = await prisma.crewSetting.create({ data: { key: body.key, value: body.value, effectiveFrom: toDbDate(body.effectiveFrom), createdById: user.id } });
  audit(user, "crewpay.setting.add", r.id, `${body.key} = ${body.value} ${body.effectiveFrom} дан`);
  return { id: r.id };
}

/** Exposed for the payday screen: the date a payment made today would carry. */
export const paymentDateFor = (weekStart: IsoDate) => clampToWeek(todayTashkent(), weekStart);
