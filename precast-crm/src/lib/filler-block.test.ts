import { describe, it, expect } from 'vitest';
import { fillerBlockLetter, fillerBlockName } from './filler-block';
import { FillerBlockTypeEnum } from './validation';

describe('fillerBlockLetter', () => {
  it('Тайсон → Т, Катта → К', () => {
    expect(fillerBlockLetter('TAYSON')).toBe('Т');
    expect(fillerBlockLetter('KATTA')).toBe('К');
  });
  it('an order from before the choice shows no letter', () => {
    expect(fillerBlockLetter(null)).toBeNull();
    expect(fillerBlockLetter(undefined)).toBeNull();
  });
  it('names carry the height', () => {
    expect(fillerBlockName('TAYSON')).toContain('10 см');
    expect(fillerBlockName('KATTA')).toContain('15 см');
  });
});

describe('FillerBlockTypeEnum', () => {
  it('accepts the two stored values only', () => {
    expect(FillerBlockTypeEnum.parse('TAYSON')).toBe('TAYSON');
    expect(FillerBlockTypeEnum.safeParse('T').success).toBe(false);
  });
});
