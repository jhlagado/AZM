import { describe, expect, it } from 'vitest';

import { writeHex } from '../../../src/outputs/write-hex.js';

function parseRecords(hexText: string): Array<{ bytes: string; address: string; count: number }> {
  return hexText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== ':00000001FF')
    .map((line) => {
      if (!/^:[0-9A-F]{2}[0-9A-F]{4}00[0-9A-F]*[0-9A-F]{2}$/.test(line)) {
        throw new Error(`unexpected intel hex record: ${line}`);
      }
      const count = parseInt(line.slice(1, 3), 16);
      const address = line.slice(3, 7);
      const bytes = line.slice(9, 9 + count * 2);
      expect(bytes.length).toBe(count * 2);
      return { bytes, address, count };
    });
}

describe('writeHex', () => {
  it('splits sparse maps into separate segments', () => {
    const map = new Map([
      [0x1000, 0x12],
      [0x1002, 0x34],
      [0x1003, 0x56],
      [0x1010, 0x78],
    ]);
    const result = writeHex({ bytes: map }, []);

    const records = parseRecords(result.text);
    expect(records).toHaveLength(3);
    expect(records[0]).toEqual({ address: '1000', count: 1, bytes: '12' });
    expect(records[1]).toEqual({ address: '1002', count: 2, bytes: '3456' });
    expect(records[2]).toEqual({ address: '1010', count: 1, bytes: '78' });
  });

  it('emits a single segment for contiguous addresses', () => {
    const map = new Map([
      [0x4000, 0x01],
      [0x4001, 0x02],
      [0x4002, 0x03],
      [0x4010, 0x04],
    ]);
    const result = writeHex({ bytes: map }, []);

    const records = parseRecords(result.text);
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({ address: '4000', count: 3, bytes: '010203' });
    expect(records[1]).toEqual({ address: '4010', count: 1, bytes: '04' });
  });

  it('chunks long contiguous spans at 16-byte boundaries', () => {
    const map = new Map<number, number>();
    for (let index = 0; index < 20; index += 1) {
      map.set(0x4000 + index, index);
    }
    const result = writeHex({ bytes: map }, []);
    const records = parseRecords(result.text);

    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({
      address: '4000',
      count: 16,
      bytes: '000102030405060708090A0B0C0D0E0F',
    });
    expect(records[1]).toEqual({
      address: '4010',
      count: 4,
      bytes: '10111213',
    });
  });

  it('returns only EOF for an empty map', () => {
    const result = writeHex({ bytes: new Map<number, number>() }, []);
    expect(result.text).toBe(':00000001FF\n');
  });
});
