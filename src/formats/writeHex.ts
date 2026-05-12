import type { EmittedByteMap, HexArtifact, SymbolEntry, WriteHexOptions } from './types.js';
import { getWrittenSegments } from './range.js';

function toHexByte(n: number): string {
  return (n & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function checksum(bytes: number[]): number {
  const sum = bytes.reduce((acc, b) => acc + (b & 0xff), 0) & 0xff;
  return ((0x100 - sum) & 0xff) >>> 0;
}

/**
 * Create an Intel HEX artifact from an emitted address->byte map.
 *
 * PR1 implementation note:
 * - Emits only type-00 data records and a type-01 EOF record.
 * - Does not emit extended address records (assumes 16-bit address space).
 */
export function writeHex(
  map: EmittedByteMap,
  _symbols: SymbolEntry[],
  opts?: WriteHexOptions,
): HexArtifact {
  const lineEnding = opts?.lineEnding ?? '\n';
  const segments = getWrittenSegments(map);
  const recordSize = 16;
  const lines: string[] = [];

  for (const segment of segments) {
    for (let addr = segment.start; addr < segment.end; addr += recordSize) {
      const count = Math.min(recordSize, segment.end - addr);
      const data: number[] = [];
      for (let i = 0; i < count; i++) {
        data.push(map.bytes.get(addr + i) ?? 0);
      }
      const hi = (addr >> 8) & 0xff;
      const lo = addr & 0xff;
      const recType = 0x00;
      const header = [count, hi, lo, recType, ...data];
      const cs = checksum(header);
      const hexData = data.map(toHexByte).join('');
      lines.push(
        `:${toHexByte(count)}${toHexByte(hi)}${toHexByte(lo)}00${hexData}${toHexByte(cs)}`,
      );
    }
  }

  lines.push(':00000001FF');
  return { kind: 'hex', text: lines.join(lineEnding) + lineEnding };
}
