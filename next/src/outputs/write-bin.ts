import type { EmittedByteMap, BinArtifact, SymbolEntry, WriteBinOptions } from './types.js';

export function writeBin(
  map: EmittedByteMap,
  _symbols: readonly SymbolEntry[],
  opts?: WriteBinOptions,
): BinArtifact {
  const { start: writtenStart, end: writtenEnd } = getWrittenRange(map);
  const start = opts?.startAddress ?? opts?.binFrom ?? writtenStart;
  const end = writtenEnd;
  const out = new Uint8Array(Math.max(0, end - start));

  for (let index = 0; index < out.length; index += 1) {
    out[index] = map.bytes.get(start + index) ?? 0;
  }

  return { kind: 'bin', bytes: out };
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
