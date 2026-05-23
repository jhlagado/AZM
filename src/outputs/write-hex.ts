import type { AddressRange, EmittedByteMap, HexArtifact, SymbolEntry, WriteHexOptions } from './types.js';

function toHexByte(n: number): string {
  return (n & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function toChecksum(bytes: number[]): number {
  const sum = bytes.reduce((acc, b) => acc + (b & 0xff), 0) & 0xff;
  return ((0x100 - sum) & 0xff) >>> 0;
}

function writeSegments(map: EmittedByteMap): AddressRange[] {
  const addresses = [...map.bytes.keys()].sort((a, b) => a - b);
  if (addresses.length === 0) {
    return [];
  }

  const [firstAddress, ...rest] = addresses;
  if (firstAddress === undefined) {
    return [];
  }

  const out: AddressRange[] = [];
  let segmentStart = firstAddress;
  let segmentEnd = firstAddress + 1;

  for (const address of rest) {
    if (address === segmentEnd) {
      segmentEnd = address + 1;
      continue;
    }
    out.push({ start: segmentStart, end: segmentEnd });
    segmentStart = address;
    segmentEnd = address + 1;
  }

  out.push({ start: segmentStart, end: segmentEnd });
  return out;
}

export function writeHex(
  map: EmittedByteMap,
  _symbols: readonly SymbolEntry[],
  opts?: WriteHexOptions,
): HexArtifact {
  const lineEnding = opts?.lineEnding ?? '\n';
  const lines: string[] = [];
  for (const segment of writeSegments(map)) {
    for (let address = segment.start; address < segment.end; address += 16) {
      const count = Math.min(16, segment.end - address);
      const data: number[] = [];
      for (let index = 0; index < count; index += 1) {
        data.push(map.bytes.get(address + index) ?? 0);
      }
      const hi = (address >> 8) & 0xff;
      const lo = address & 0xff;
      const recType = 0x00;
      const payload = [count, hi, lo, recType, ...data];
      lines.push(
        `:${toHexByte(count)}${toHexByte(hi)}${toHexByte(lo)}00${data
          .map(toHexByte)
          .join('')}${toHexByte(toChecksum(payload))}`,
      );
    }
  }
  lines.push(':00000001FF');
  return { kind: 'hex', text: lines.join(lineEnding) + lineEnding };
}
