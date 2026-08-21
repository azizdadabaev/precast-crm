'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/fetcher';
import { monthTitle, shiftMonth } from '@/lib/month-orders';
import type { LedgerRow, LedgerTotals } from '@/lib/ledger';

interface LedgerResponse {
  month: string;
  rows: LedgerRow[];
  totals: LedgerTotals;
}

interface EventRow {
  id: string;
  type: string;
  message: string | null;
  createdAt: string;
  actorName: string | null;
  orderId: string;
  orderNumber: string;
  clientName: string;
}

interface EventsResponse {
  events: EventRow[];
  nextCursor: string | null;
}

function fmt(n: number): string {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}
function fmt1(n: number): string {
  const [w, f] = (Math.round(n * 10) / 10).toFixed(1).split('.');
  return `${w.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')},${f}`;
}
function dayLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][d.getMonth()]}`;
}

const thisMonthKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

export function LedgerClient() {
  const [month, setMonth] = useState(thisMonthKey);
  const [tab, setTab] = useState<'attribution' | 'events'>('attribution');
  const [onlyCrossing, setOnlyCrossing] = useState(false);

  const ledger = useQuery<LedgerResponse>({
    queryKey: ['ledger', month],
    queryFn: () => api<LedgerResponse>(`/api/ledger?month=${month}`),
    enabled: tab === 'attribution',
    placeholderData: (p) => p,
  });

  const events = useQuery<EventsResponse>({
    queryKey: ['ledger-events', month],
    queryFn: () => api<EventsResponse>(`/api/ledger/events?month=${month}`),
    enabled: tab === 'events',
    placeholderData: (p) => p,
  });

  const rows = (ledger.data?.rows ?? []).filter((r) => (onlyCrossing ? r.crossesMonth : true));
  const totals = ledger.data?.totals;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
        <div>
          <h1 className="font-display text-3xl font-semibold text-foreground">Ҳисоб журнали</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ҳар бир сумма ва ҳажм қайси ойга ёзилгани · where every figure landed
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
            className="h-9 w-9 rounded-md border border-border bg-background hover:bg-accent"
            aria-label="Олдинги ой"
          >‹</button>
          <span className="font-mono text-sm font-semibold min-w-[130px] text-center">
            {monthTitle(month)}
          </span>
          <button
            type="button"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            className="h-9 w-9 rounded-md border border-border bg-background hover:bg-accent"
            aria-label="Кейинги ой"
          >›</button>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div className="flex gap-1 mb-5 border-b border-border">
        {([
          ['attribution', 'Ҳисобланиши · Attribution'],
          ['events', 'Тўлиқ тарих · Full history'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >{label}</button>
        ))}
      </div>

      {tab === 'attribution' ? (
        <>
          {/* Totals — what this month's dashboard figures are made of. */}
          {totals && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <Stat label="Пул · Money" value={`${fmt(totals.money)} UZS`} />
              <Stat label="Блок" value={fmt(totals.blocks)} />
              <Stat label="Балка" value={`${fmt1(totals.beamMeters)} м`} />
              <Stat label="Майдон" value={`${fmt1(totals.area)} м²`} />
            </div>
          )}

          {totals && totals.crossMonthCount > 0 && (
            <div className="mb-4 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
              <span className="font-semibold">{totals.crossMonthCount} та ёзув</span>{' '}
              бошқа ойдаги буюртмага тегишли
              {totals.crossMonthMoney > 0 && <> · <span className="font-mono">{fmt(totals.crossMonthMoney)} UZS</span></>}
              <button
                type="button"
                onClick={() => setOnlyCrossing((v) => !v)}
                className="ml-3 underline underline-offset-2 text-muted-foreground hover:text-foreground"
              >{onlyCrossing ? 'Ҳаммасини кўрсатиш' : 'Фақат шуларни кўрсатиш'}</button>
            </div>
          )}

          {ledger.isError && <Msg>Юклаб бўлмади. Қайта уриниб кўринг.</Msg>}
          {ledger.isLoading && !ledger.data && <Msg>Юкланмоқда…</Msg>}
          {ledger.data && rows.length === 0 && <Msg>Бу ойда ёзув йўқ</Msg>}

          {rows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2">Сана</th>
                    <th className="text-left font-semibold px-3 py-2">Буюртма</th>
                    <th className="text-left font-semibold px-3 py-2">Нима учун</th>
                    <th className="text-right font-semibold px-3 py-2">Сумма</th>
                    <th className="text-right font-semibold px-3 py-2">Блок</th>
                    <th className="text-right font-semibold px-3 py-2">Балка</th>
                    <th className="text-right font-semibold px-3 py-2">Майдон</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono whitespace-nowrap">{dayLabel(r.attributedAt)}</td>
                      <td className="px-3 py-2">
                        <Link href={`/orders/${r.orderId}`} className="font-mono text-primary hover:underline">
                          {r.orderNumber}
                        </Link>
                        <div className="text-xs text-muted-foreground truncate max-w-[220px]">{r.clientName}</div>
                      </td>
                      <td className="px-3 py-2">
                        {r.reason}
                        {/* A remainder row shows only the BALANCE, so on a
                            well-recorded order most columns are empty and it
                            reads as "nothing counted" when the opposite is
                            true. Spell out what was already counted, where. */}
                        {r.context && (
                          <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                            <div>
                              блок:{' '}
                              <span className="font-mono">
                                {fmt(r.context.recorded.blocks)} / {fmt(r.context.orderTotals.blocks)}
                              </span>
                              {r.context.blocksComplete && ' ✓ тўлиқ ёзилган'}
                            </div>
                            <div>
                              балка:{' '}
                              <span className="font-mono">
                                {fmt1(r.context.recorded.beamMeters)} / {fmt1(r.context.orderTotals.beamMeters)} м
                              </span>
                              {r.context.beamsComplete && ' ✓ тўлиқ ёзилган'}
                            </div>
                            {r.context.recordedMonths.length > 0 && (
                              <div>
                                олдин ҳисобланган:{' '}
                                <span className="font-mono">{r.context.recordedMonths.join(', ')}</span>
                              </div>
                            )}
                          </div>
                        )}
                        {r.crossesMonth && (
                          // The point of the whole page: this figure counted in
                          // a month other than its order's.
                          <div className="text-xs text-muted-foreground mt-0.5">
                            ⚠ буюртма {r.orderMonth} · ҳисобланди {r.attributedMonth}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                        {r.kind === 'money' ? fmt(r.amount ?? 0) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {r.kind === 'volume' && r.blocks ? fmt(r.blocks) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                        {r.kind === 'volume' && r.beamMeters ? (
                          <>
                            {fmt1(r.beamMeters)} м
                            {/* Metres are what compare across orders, but the
                                piece count is what the yard actually loads. */}
                            {r.beamCount ? (
                              <div className="text-xs text-muted-foreground">{fmt(r.beamCount)} та</div>
                            ) : null}
                          </>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap">
                        {r.kind === 'volume' && r.area ? `${fmt1(r.area)} м²` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          {events.isError && <Msg>Юклаб бўлмади. Қайта уриниб кўринг.</Msg>}
          {events.isLoading && !events.data && <Msg>Юкланмоқда…</Msg>}
          {events.data && events.data.events.length === 0 && <Msg>Бу ойда ҳодиса йўқ</Msg>}

          {events.data && events.data.events.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2">Сана</th>
                    <th className="text-left font-semibold px-3 py-2">Буюртма</th>
                    <th className="text-left font-semibold px-3 py-2">Ҳодиса</th>
                    <th className="text-left font-semibold px-3 py-2">Ким</th>
                  </tr>
                </thead>
                <tbody>
                  {events.data.events.map((e) => (
                    <tr key={e.id} className="border-t border-border">
                      <td className="px-3 py-2 font-mono whitespace-nowrap">{dayLabel(e.createdAt)}</td>
                      <td className="px-3 py-2">
                        <Link href={`/orders/${e.orderId}`} className="font-mono text-primary hover:underline">
                          {e.orderNumber}
                        </Link>
                        <div className="text-xs text-muted-foreground truncate max-w-[200px]">{e.clientName}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-mono text-[11px] text-muted-foreground">{e.type}</span>
                        {e.message && <div className="mt-0.5">{e.message}</div>}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{e.actorName ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {events.data?.nextCursor && (
            <p className="text-xs text-muted-foreground mt-3">
              Кўрсатилди: {events.data.events.length} та. Кўпроқ ҳодиса бор — ойни танланг.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className="font-mono text-lg font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}

function Msg({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground py-6">{children}</p>;
}
