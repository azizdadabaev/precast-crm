import { describe, it, expect } from 'vitest';
import { findKbPrices } from './kb-lint';

describe('findKbPrices', () => {
  it('flags numbers next to a currency word', () => {
    expect(findKbPrices("Narx 500000 so'm")).toContain("500000 so'm");
    expect(findKbPrices('цена 1 200 000 сум')).not.toHaveLength(0);
    expect(findKbPrices('5000 UZS')).toContain('5000 UZS');
  });

  it('flags thousands-grouped amounts', () => {
    expect(findKbPrices('1 000 000')).toContain('1 000 000');
    expect(findKbPrices('1.000.000')).toContain('1.000.000');
    expect(findKbPrices('500,000')).toContain('500,000');
  });

  it('does NOT flag the KB legitimate spec/dimension numbers', () => {
    for (const clean of [
      'Har m²ga 600-1000 kg/m²',
      'ГОСТ 7348-81',
      '5mm armatura, ВР2',
      'pitch 0.58 m, blok 0.20 m, 0.45 m gap',
      'tensile 1670 MPa',
      '2 ta balka 4-5 tonna',
      'bearing 0.15 m, 15 cm',
      'D600 density',
    ]) {
      expect(findKbPrices(clean)).toEqual([]);
    }
  });

  it('dedupes repeated hits', () => {
    expect(findKbPrices("500000 so'm ... yana 500000 so'm")).toEqual(["500000 so'm"]);
  });
});
