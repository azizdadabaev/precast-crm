import { describe, it, expect, vi } from 'vitest';
import { placeOrderFromProposal, orderConfirmationMessage, type PlaceOrderDeps } from './place-order';
import type { ApprovalCallback } from './approval-callback';
import type { DecideOutcome } from './approve-order';
import type { DraftOrderResult } from './order-tool';

const DRAFT = {
  quoteId: 'q-token',
  customerName: 'Ali',
  customerPhone: '998901234567',
  deliveryAddress: 'Namangan',
  notes: null,
};

function draftedOk(id = 'po1'): DraftOrderResult {
  return {
    ok: true,
    created: true,
    pendingOrder: { id, conversationId: 'c1', clientId: null, quoteId: 'q-token', idempotencyKey: 'k', payload: {} as never },
  };
}

describe('placeOrderFromProposal', () => {
  it('drafts → marks AWAITING_STAFF → commits via decide, recording the operator', async () => {
    const markAwaitingStaff = vi.fn(async () => {});
    const decideCalls: Array<{ callback: ApprovalCallback; tap: { decidedById: string | null } }> = [];
    const decideFn = vi.fn(async (callback: ApprovalCallback, tap: { callbackId: string | null; decidedById: string | null }) => {
      decideCalls.push({ callback, tap });
      return { ok: true, status: 'committed', orderId: 'o1', orderNumber: '2026-06-0001' } as DecideOutcome;
    });
    const deps: PlaceOrderDeps = {
      secret: 'S',
      draftOrderFn: async () => draftedOk('poX'),
      markAwaitingStaff,
      decideFn,
    };

    const res = await placeOrderFromProposal(
      { draft: DRAFT, conversationId: 'c1', confirmationMsgId: 'm1', decidedById: 'user-7' },
      deps,
    );

    expect(res).toEqual({ ok: true, status: 'committed', orderId: 'o1', orderNumber: '2026-06-0001' });
    expect(markAwaitingStaff).toHaveBeenCalledWith('poX');
    expect(decideCalls[0].callback).toEqual({ action: 'approve', pendingOrderId: 'poX' });
    expect(decideCalls[0].tap.decidedById).toBe('user-7'); // decision (c): CRM identity
  });

  it('returns the draft failure (bad quote) WITHOUT marking or committing', async () => {
    const markAwaitingStaff = vi.fn(async () => {});
    const decideFn = vi.fn();
    const res = await placeOrderFromProposal(
      { draft: DRAFT, conversationId: 'c1', confirmationMsgId: 'm1', decidedById: 'user-7' },
      { secret: 'S', draftOrderFn: async () => ({ ok: false, reason: 'INVALID_QUOTE' }), markAwaitingStaff, decideFn: decideFn as never },
    );
    expect(res).toEqual({ ok: false, reason: 'INVALID_QUOTE' });
    expect(markAwaitingStaff).not.toHaveBeenCalled();
    expect(decideFn).not.toHaveBeenCalled();
  });

  it('propagates a decide failure (e.g. CREATE_FAILED)', async () => {
    const res = await placeOrderFromProposal(
      { draft: DRAFT, conversationId: 'c1', confirmationMsgId: 'm1', decidedById: 'u' },
      {
        secret: 'S',
        draftOrderFn: async () => draftedOk(),
        markAwaitingStaff: async () => {},
        decideFn: async () => ({ ok: false, reason: 'CREATE_FAILED', message: 'boom' }) as DecideOutcome,
      },
    );
    expect(res).toEqual({ ok: false, reason: 'CREATE_FAILED', message: 'boom' });
  });
});

describe('orderConfirmationMessage', () => {
  it('renders per language with the order number', () => {
    expect(orderConfirmationMessage('ru', 'N1')).toContain('заказ принят');
    expect(orderConfirmationMessage('ru', 'N1')).toContain('N1');
    expect(orderConfirmationMessage('uz-cyrillic', 'N2')).toContain('қабул қилинди');
    expect(orderConfirmationMessage('uz-latin', 'N3')).toContain('qabul qilindi');
    expect(orderConfirmationMessage('something-else', 'N4')).toContain('qabul qilindi'); // default uz-latin
  });
});
