import { describe, expect, it } from 'vitest';

import { writeListing } from '../../../src/outputs/write-listing.js';

describe('writeListing', () => {
  it('renders sparse bytes as gaps within a listing line', () => {
    const result = writeListing(
      {
        bytes: new Map<number, number>([
          [0x1000, 0x41],
          [0x1002, 0x42],
        ]),
      },
      [],
      { bytesPerLine: 4 },
    );

    expect(result.text).toContain('1000: 41 .. 42     |A B|');
  });

  it('compresses full-line sparse gaps with a deterministic marker', () => {
    const result = writeListing(
      {
        bytes: new Map<number, number>([
          [0x1000, 0x41],
          [0x1020, 0x42],
        ]),
      },
      [],
      { bytesPerLine: 16 },
    );

    expect(result.text).toContain('1000: 41');
    expect(result.text).toContain('; ... gap $1010..$101F (1 lines)');
    expect(result.text).toContain('1020: 42');
  });

  it('preserves sparse lines at segment edges and collapses middle full-line gaps', () => {
    const result = writeListing(
      {
        bytes: new Map<number, number>([
          [0x100f, 0x41],
          [0x1020, 0x42],
        ]),
      },
      [],
      { bytesPerLine: 16 },
    );

    expect(result.text).toContain('1000:');
    expect(result.text).toContain('1000: .. .. .. .. .. .. .. .. .. .. .. .. .. .. .. 41');
    expect(result.text).toContain('; ... gap $1010..$101F (1 lines)');
    expect(result.text).toContain('1020: 42');
  });
});
