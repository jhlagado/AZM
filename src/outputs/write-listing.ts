import type { EmittedByteMap, ListingArtifact, SymbolEntry, WriteListingOptions } from './types.js';
import { getWrittenRange, getWrittenSegments } from './range.js';

function toHexByte(n: number): string {
  return (n & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function toHexWord(n: number): string {
  return (n & 0xffff).toString(16).toUpperCase().padStart(4, '0');
}

function symbolAddress(symbol: SymbolEntry): number {
  return symbol.kind === 'constant' ? symbol.value & 0xffff : symbol.address & 0xffff;
}

function sortSymbols(a: SymbolEntry, b: SymbolEntry): number {
  const aClass = a.kind === 'constant' ? 1 : 0;
  const bClass = b.kind === 'constant' ? 1 : 0;
  if (aClass !== bClass) {
    return aClass - bClass;
  }
  const addressCmp = symbolAddress(a) - symbolAddress(b);
  if (addressCmp !== 0) {
    return addressCmp;
  }
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

export function writeListing(
  map: EmittedByteMap,
  symbols: readonly SymbolEntry[],
  opts?: WriteListingOptions,
): ListingArtifact {
  const lineEnding = opts?.lineEnding ?? '\n';
  const bytesPerLine = opts?.bytesPerLine ?? 16;
  const { start, end } = getWrittenRange(map);
  const segments = getWrittenSegments(map);
  const lines: string[] = [];

  lines.push('; AZM listing');
  lines.push(`; range: $${toHexWord(start)}..$${toHexWord(end)} (end exclusive)`);
  lines.push('');

  const lineBaseSet = new Set<number>();
  for (const segment of segments) {
    const first = segment.start - (segment.start % bytesPerLine);
    const last = segment.end - 1 - ((segment.end - 1) % bytesPerLine);
    for (let address = first; address <= last; address += bytesPerLine) {
      lineBaseSet.add(address);
    }
  }
  const lineBases = [...lineBaseSet].sort((a, b) => a - b);
  let previousBase: number | undefined;

  for (const address of lineBases) {
    if (previousBase !== undefined && address > previousBase + bytesPerLine) {
      const gapStart = previousBase + bytesPerLine;
      const gapEndInclusive = address - 1;
      const gapLineCount = Math.ceil((address - gapStart) / bytesPerLine);
      lines.push(
        `; ... gap $${toHexWord(gapStart)}..$${toHexWord(gapEndInclusive)} (${gapLineCount} lines)`,
      );
    }

    const lineBytes: string[] = [];
    const lineChars: string[] = [];
    const count = Math.min(bytesPerLine, end - address);
    for (let offset = 0; offset < count; offset += 1) {
      const byte = map.bytes.get(address + offset);
      if (byte === undefined) {
        lineBytes.push('..');
        lineChars.push(' ');
      } else {
        const value = byte & 0xff;
        lineBytes.push(toHexByte(value));
        lineChars.push(value >= 0x20 && value <= 0x7e ? String.fromCharCode(value) : '.');
      }
    }
    const payload = lineBytes.join(' ').padEnd(bytesPerLine * 3 - 1, ' ');
    lines.push(`${toHexWord(address)}: ${payload}  |${lineChars.join('')}|`);
    previousBase = address;
  }

  lines.push('');
  lines.push('; symbols:');
  for (const symbol of [...symbols].sort(sortSymbols)) {
    if (symbol.kind === 'constant') {
      lines.push(`; constant ${symbol.name} = $${toHexWord(symbol.value)} (${symbol.value})`);
    } else {
      lines.push(`; ${symbol.kind} ${symbol.name} = $${toHexWord(symbol.address)}`);
    }
  }

  return { kind: 'lst', text: lines.join(lineEnding) + lineEnding };
}
