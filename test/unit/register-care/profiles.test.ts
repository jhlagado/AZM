import { describe, expect, it } from 'vitest';

import { getRegisterCareProfile } from '../../../src/register-care/profiles.js';

describe('register-care profiles', () => {
  it('covers every MON3 APITable service through the RST $10 dispatcher', () => {
    const profile = getRegisterCareProfile('mon3');
    const services = profile?.rstDispatchers.get(0x10)?.services;

    expect(services?.size).toBe(63);
    expect(services?.get(0)?.name).toBe('MON3_API_0_SOFTWARE_ID');
    expect(services?.get(16)).toMatchObject({
      name: 'MON3_API_16_SCAN_KEYS',
      mayOutput: ['A', 'carry', 'zero'],
    });
    expect(services?.get(54)?.name).toBe('MON3_API_54_PARSE_MATRIX_SCAN');
    expect(services?.get(62)?.name).toBe('MON3_API_62_RGB_SCAN');
  });
});
