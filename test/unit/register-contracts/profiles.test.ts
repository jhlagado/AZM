import { describe, expect, it } from 'vitest';

import { getRegisterContractsProfile } from '../../../src/register-contracts/profiles.js';

describe('register-contracts profiles', () => {
  it('covers every MON3 APITable service through the RST $10 dispatcher', () => {
    const profile = getRegisterContractsProfile('mon3');
    const services = profile?.rstDispatchers.get(0x10)?.services;

    expect(services?.size).toBe(64);
    expect(services?.get(0)?.name).toBe('MON3_API_0_SOFTWARE_ID');
    expect(services?.get(16)).toMatchObject({
      name: 'MON3_API_16_SCAN_KEYS',
      mayOutput: ['A', 'carry', 'zero'],
    });
    expect(services?.get(54)?.name).toBe('MON3_API_54_PARSE_MATRIX_SCAN');
    expect(services?.get(62)?.name).toBe('MON3_API_62_RGB_SCAN');
    expect(services?.get(0x53)).toMatchObject({
      name: 'MON3_API_83_BANK_CALL',
      mayRead: ['B', 'C', 'H', 'L'],
      mayOutput: ['A', 'carry'],
      consumesStackFrame: ['AF', 'DE', 'HL'],
      stackBalanced: true,
    });
  });

  it('does not hardwire TecMate expansion service selector ranges into the MON3 profile', () => {
    const profile = getRegisterContractsProfile('mon3');
    const dispatcher = profile?.rstDispatchers.get(0x10);

    expect(dispatcher?.rangeServices).toBeUndefined();
  });
});
