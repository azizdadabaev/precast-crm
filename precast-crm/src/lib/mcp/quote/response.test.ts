import { describe, it, expect } from 'vitest';
import { cardCaption } from './response';

// ru-RU grouping uses a no-break space, exactly like the Telegram caption.
const plain = (s: string) => s.replace(/[  ]/g, ' ');

describe('cardCaption — the text sent with the quote card (owner 2026-10-07)', () => {
  it('matches the Telegram «Send to chat» caption: number, Жами, Оғирлик', () => {
    const snap = { draft_number: 368, totals: { total_price: 15842760, total_weight_kg: 20158 } };
    expect(plain(cardCaption(snap))).toBe("0368D\nЖами: 15 842 760 so'm\nОғирлик: 20 158 кг");
  });
  it('the 4 × 6 golden', () => {
    const snap = { draft_number: 619, totals: { total_price: 3749600, total_weight_kg: 4582 } };
    expect(plain(cardCaption(snap))).toBe("0619D\nЖами: 3 749 600 so'm\nОғирлик: 4 582 кг");
  });
});
