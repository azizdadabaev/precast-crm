import { describe, it, expect } from 'vitest';
import { editPolicy, editLockMessage, loadedFloorViolations, floorViolationMessage } from './order-edit-policy';

const OWNER = ['order.edit', 'order.editShipped'];
const OPERATOR = ['order.edit'];
const loaded = [{ loadedAt: '2026-08-29T14:55:06.215Z' }, { loadedAt: null }];

describe('editPolicy', () => {
  it('nothing loaded: anyone with order.edit, as today', () => {
    expect(editPolicy({ status: 'PLACED', shipments: [], permissions: OPERATOR })).toEqual({ allowed: true, reason: null, shipped: false });
    expect(editPolicy({ status: 'IN_PRODUCTION', shipments: [{ loadedAt: null }], permissions: OPERATOR }).allowed).toBe(true);
  });
  it('a truck loaded: only the shipped-order permission', () => {
    expect(editPolicy({ status: 'DISPATCHED', shipments: loaded, permissions: OPERATOR })).toEqual({ allowed: false, reason: 'NEEDS_SHIPPED_PERMISSION', shipped: true });
    expect(editPolicy({ status: 'DISPATCHED', shipments: loaded, permissions: OWNER })).toEqual({ allowed: true, reason: null, shipped: true });
    expect(editPolicy({ status: 'PLACED', shipments: loaded, permissions: OPERATOR }).reason).toBe('NEEDS_SHIPPED_PERMISSION');
  });
  it('never after delivery or cancel, even for the owner', () => {
    expect(editPolicy({ status: 'DELIVERED', shipments: loaded, permissions: OWNER }).reason).toBe('DELIVERED');
    expect(editPolicy({ status: 'CANCELED', shipments: [], permissions: OWNER }).reason).toBe('CANCELED');
  });
  it('single truck already on a truck: locked for everyone', () => {
    expect(editPolicy({ status: 'LOADED', shipments: [], permissions: OWNER }).reason).toBe('ON_TRUCK');
    expect(editPolicy({ status: 'DISPATCHED', shipments: [], permissions: OWNER }).reason).toBe('ON_TRUCK');
  });
  it('no order.edit: locked', () => {
    expect(editPolicy({ status: 'PLACED', shipments: [], permissions: [] }).reason).toBe('NO_PERMISSION');
  });
  it('every lock reason has an Uzbek message', () => {
    for (const r of ['NO_PERMISSION', 'CANCELED', 'DELIVERED', 'ON_TRUCK', 'NEEDS_SHIPPED_PERMISSION'] as const) {
      expect(editLockMessage(r)).toMatch(/[А-Яа-яЎўҚқҒғҲҳ]/);
    }
  });
});

describe('loadedFloorViolations', () => {
  const already = { beams: { '4.07': 40, '4.30': 22 }, blocks: 980 };
  it('accepts an edit that keeps or grows what was loaded', () => {
    expect(loadedFloorViolations({ beams: { '4.07': 40, '4.30': 25, '5.10': 10 }, blocks: 1200 }, already)).toEqual([]);
  });
  it('lists every beam length and the blocks that would drop below loaded', () => {
    expect(loadedFloorViolations({ beams: { '4.07': 30 }, blocks: 900 }, already)).toEqual([
      { length: '4.07', loaded: 40, ordered: 30 },
      { length: '4.30', loaded: 22, ordered: 0 },
      { length: null, loaded: 980, ordered: 900 },
    ]);
  });
  it('message names each problem in Uzbek', () => {
    const msg = floorViolationMessage([{ length: '4.07', loaded: 40, ordered: 30 }, { length: null, loaded: 980, ordered: 900 }]);
    expect(msg).toContain('4.07 м балка: юкланган 40, янгисида 30');
    expect(msg).toContain('Ғишт: юкланган 980, янгисида 900');
  });
});
