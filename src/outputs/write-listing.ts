import type {
  EmittedByteMap,
  ListingArtifact,
  SymbolEntry,
  WriteListingOptions,
} from './types.js';

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

function getWrittenRange(map: EmittedByteMap): { start: number; end: number } {
  if (map.writtenRange) {
    return map.writtenRange;
  }
  if (map.bytes.size === 0) {
    return { start: 0, end: 0 };
  }
  const keys = [...map.bytes.keys()];
  const start = Math.min(...keys);
  const end = Math.max(...keys) + 1;
  return { start, end };
}

export function writeListing(
  map: EmittedByteMap,
  symbols: readonly SymbolEntry[],
  opts?: WriteListingOptions,
): ListingArtifact {
  const lineEnding = opts?.lineEnding ?? '\n';
  const bytesPerLine = opts?.bytesPerLine ?? 16;
  const { start, end } = getWrittenRange(map);
  const lines: string[] = [];

  lines.push('; AZM listing');
  lines.push(`; range: $${toHexWord(start)}..$${toHexWord(end)} (end exclusive)`);
  lines.push('');

  for (let address = start; address < end; address += bytesPerLine) {
    const lineBytes: string[] = [];
    const lineChars: string[] = [];
    for (let offset = 0; offset < bytesPerLine; offset += 1) {
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
