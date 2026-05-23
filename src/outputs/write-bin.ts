import type { EmittedByteMap, BinArtifact, SymbolEntry, WriteBinOptions } from './types.js';

const BIN_FROM_SYMBOL_NAME = '__azm_binfrom';
const BIN_TO_SYMBOL_NAME = '__azm_binto';

export function writeBin(
  map: EmittedByteMap,
  symbols: readonly SymbolEntry[],
  opts?: WriteBinOptions,
): BinArtifact {
  const { start: writtenStart, end: writtenEnd } = getWrittenRange(map);
  const optionStart = opts?.binFrom ?? opts?.startAddress;
  const symbolStart = symbols.find(
    (symbol) => symbol.kind === 'constant' && symbol.name === BIN_FROM_SYMBOL_NAME,
  );
  const symbolEnd = symbols.find(
    (symbol) => symbol.kind === 'constant' && symbol.name === BIN_TO_SYMBOL_NAME,
  );
  const start = optionStart ?? (symbolStart?.kind === 'constant' ? symbolStart.value : writtenStart);
  const end = symbolEnd?.kind === 'constant' ? symbolEnd.value + 1 : writtenEnd;
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
