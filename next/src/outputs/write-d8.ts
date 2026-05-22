import { normalize, relative, resolve, isAbsolute } from 'node:path';

import type {
  D8mArtifact,
  D8mFileEntry,
  D8mGenerator,
  D8mJson,
  D8mSymbol,
  EmittedByteMap,
  SymbolEntry,
  WriteD8mOptions,
} from './types.js';

function toHexFilePath(path: string, rootDir?: string): string {
  const normalized = normalize(path).replace(/\\/g, '/');
  if (!rootDir) {
    return normalized;
  }

  const root = normalize(resolve(rootDir)).replace(/\\/g, '/');
  const resolvedPath = normalize(resolve(path)).replace(/\\/g, '/');
  const rel = relative(root, resolvedPath).replace(/\\/g, '/');
  if (rel.startsWith('..') || rel === '' || isAbsolute(rel)) {
    return normalized;
  }
  return rel;
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

function compareSymbol(a: D8mSymbol, b: D8mSymbol): number {
  if (a.kind !== b.kind) {
    return a.kind.localeCompare(b.kind);
  }
  const aAddress = a.kind === 'constant' ? (a.value ?? 0) & 0xffff : (a.address ?? 0) & 0xffff;
  const bAddress = b.kind === 'constant' ? (b.value ?? 0) & 0xffff : (b.address ?? 0) & 0xffff;
  if (aAddress !== bAddress) {
    return aAddress - bAddress;
  }
  return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
}

export function writeD8m(
  map: EmittedByteMap,
  symbols: readonly SymbolEntry[],
  opts?: WriteD8mOptions,
): D8mArtifact {
  const { start, end } = getWrittenRange(map);
  const jsonSymbols = symbols.map((symbol) =>
    symbol.kind === 'constant'
      ? ({
          name: symbol.name,
          kind: symbol.kind,
          value: symbol.value,
          ...(symbol.file !== undefined ? { file: toHexFilePath(symbol.file, opts?.rootDir) } : {}),
          ...(symbol.line !== undefined ? { line: symbol.line } : {}),
          ...(symbol.scope !== undefined ? { scope: symbol.scope } : {}),
        } as D8mSymbol)
      : ({
          name: symbol.name,
          kind: symbol.kind,
          address: symbol.address,
          ...(symbol.file !== undefined ? { file: toHexFilePath(symbol.file, opts?.rootDir) } : {}),
          ...(symbol.line !== undefined ? { line: symbol.line } : {}),
          ...(symbol.scope !== undefined ? { scope: symbol.scope } : {}),
          ...(symbol.size !== undefined ? { size: symbol.size } : {}),
        } as D8mSymbol),
  );

  const fileSet = new Set<string>();
  const entries = new Map<string, D8mFileEntry>();
  for (const symbol of jsonSymbols) {
    const file = symbol.file ?? '';
    fileSet.add(file);
    const entry = entries.get(file) ?? { symbols: [] };
    if (!entries.has(file)) {
      entries.set(file, entry);
    }
    const symbolWithoutFile = { ...symbol };
    delete symbolWithoutFile.file;
    entry.symbols?.push(symbolWithoutFile);
  }

  const files = Object.fromEntries(
    [...entries.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, fileEntry]) => [
        path,
        {
          ...(fileEntry.symbols && fileEntry.symbols.length > 0 ? { symbols: fileEntry.symbols } : {}),
        },
      ]),
  );

  const sortedSymbolList = [...jsonSymbols].sort(compareSymbol);
  const generator: D8mGenerator = {
    name: 'azm',
    tool: 'azm',
    ...(opts?.packageVersion !== undefined ? { version: opts.packageVersion } : {}),
    ...(opts?.inputs !== undefined ? { inputs: normalizeInputs(opts.inputs, opts.rootDir) } : {}),
    ...(opts?.entrySymbol !== undefined ? { entrySymbol: opts.entrySymbol } : {}),
    ...(opts?.entryAddress !== undefined ? { entryAddress: opts.entryAddress & 0xffff } : {}),
  };

  return {
    kind: 'd8m',
    json: {
      format: 'd8-debug-map',
      version: 1,
      arch: 'z80',
      addressWidth: 16,
      endianness: 'little',
      files,
      segments: [{ start, end }],
      ...(fileSet.size > 0 ? { fileList: [...fileSet].sort((a, b) => a.localeCompare(b)) } : {}),
      symbols: sortedSymbolList,
      generator,
    },
  };
}

function normalizeInputs(
  inputs: NonNullable<WriteD8mOptions['inputs']>,
  rootDir?: string,
): { entry?: string; listing?: string; hex?: string; bin?: string } {
  const out: { entry?: string; listing?: string; hex?: string; bin?: string } = {};
  for (const [key, value] of Object.entries(inputs) as Array<
    ['entry' | 'listing' | 'hex' | 'bin', string]
  >) {
    if (value !== undefined && value.length > 0) {
      out[key] = toHexFilePath(value, rootDir);
    }
  }
  return out;
}
