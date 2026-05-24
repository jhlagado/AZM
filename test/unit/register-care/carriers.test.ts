import { describe, expect, it } from 'vitest';

import { expandCarrierList } from '../../../src/register-care/carriers.js';

describe('register-care carriers', () => {
  const flags = ['carry', 'zero', 'sign', 'parity', 'halfCarry'];

  it('normalizes register pairs into byte carriers', () => {
    expect(expandCarrierList(['DE', 'HL'])).toEqual(['D', 'E', 'H', 'L']);
  });

  it('normalizes AF into A plus individual flags', () => {
    expect(expandCarrierList(['AF'])).toEqual(['A', ...flags]);
  });

  it('accepts F as a compatibility spelling for individual flags', () => {
    expect(expandCarrierList(['F'])).toEqual(flags);
  });

  it('normalizes named flags without changing their meaning', () => {
    expect(expandCarrierList(['carry', 'zero'])).toEqual(['carry', 'zero']);
  });

  it('normalizes bare C as the register carrier', () => {
    expect(expandCarrierList(['C'])).toEqual(['C']);
  });

  it('normalizes explicit carry flag names', () => {
    expect(expandCarrierList(['carry'])).toEqual(['carry']);
    expect(expandCarrierList(['CARRY'])).toEqual(['carry']);
  });

  it('does not expose the Z80 N flag as a public contract carrier', () => {
    expect(expandCarrierList(['negative'])).toBeUndefined();
    expect(expandCarrierList(['N'])).toBeUndefined();
  });

  it('normalizes index registers into high and low byte carriers', () => {
    expect(expandCarrierList(['IX', 'IY'])).toEqual(['IXH', 'IXL', 'IYH', 'IYL']);
  });

  it('rejects unknown carrier names', () => {
    expect(expandCarrierList(['BAD'])).toBeUndefined();
  });

  it('rejects a whole carrier list when any item is unknown', () => {
    expect(expandCarrierList(['DE', 'BAD'])).toBeUndefined();
    expect(expandCarrierList(['BAD'])).toBeUndefined();
  });

  it('preserves first-occurrence ordering while removing duplicates', () => {
    expect(expandCarrierList(['DE', 'D', 'HL', 'E'])).toEqual(['D', 'E', 'H', 'L']);
  });
});
