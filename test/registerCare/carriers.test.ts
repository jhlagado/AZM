import { describe, expect, it } from 'vitest';

import { expandCarrierList, normalizeCarrierName } from '../../src/registerCare/carriers.js';

describe('register-care carriers', () => {
  it('normalizes register pairs into byte carriers', () => {
    expect(expandCarrierList(['DE', 'HL'])).toEqual(['D', 'E', 'H', 'L']);
  });

  it('normalizes AF into A plus flags register carrier', () => {
    expect(expandCarrierList(['AF'])).toEqual(['A', 'F']);
  });

  it('normalizes named flags without changing their meaning', () => {
    expect(expandCarrierList(['carry', 'zero'])).toEqual(['carry', 'zero']);
  });

  it('normalizes index registers into high and low byte carriers', () => {
    expect(expandCarrierList(['IX', 'IY'])).toEqual(['IXH', 'IXL', 'IYH', 'IYL']);
  });

  it('rejects unknown carrier names', () => {
    expect(normalizeCarrierName('BAD')).toBeUndefined();
  });
});
