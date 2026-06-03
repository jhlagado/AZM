import { describe, expect, it } from 'vitest';

import { byteHex, byteWindow, hex } from '../../../scripts/dev/hexFormatTools.mjs';

describe('hex format tools', () => {
  it('formats bytes and addresses for diagnostics', () => {
    expect(byteHex(undefined)).toBe('EOF');
    expect(byteHex(0x0a)).toBe('0x0a');
    expect(hex(0x2a)).toBe('0x002a');
    expect(hex(0x2a, 2)).toBe('0x2a');
  });

  it('formats byte windows around a mismatch', () => {
    expect(byteWindow(Buffer.from([0x00, 0x01, 0x02, 0x03]), 2, 1)).toBe('[0x01 0x02 0x03]');
    expect(byteWindow(Buffer.from([0x00]), -1)).toBe('[]');
  });
});
