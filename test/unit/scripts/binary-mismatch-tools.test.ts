import { describe, expect, it } from 'vitest';

import {
  findFirstMismatch,
  summarizeBinaryMismatch,
} from '../../../scripts/dev/binaryMismatchTools.mjs';

describe('binary mismatch tools', () => {
  it('finds and summarizes binary mismatches', () => {
    const actual = Buffer.from([0x00, 0x02]);
    const reference = Buffer.from([0x00, 0x01, 0x03]);

    expect(findFirstMismatch(actual, reference)).toBe(1);
    expect(summarizeBinaryMismatch(actual, reference)).toContain(
      'First mismatch @0x0001: actual=0x02 reference=0x01',
    );
  });
});
