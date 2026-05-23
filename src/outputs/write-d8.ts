import { normalize, relative, resolve, isAbsolute } from 'node:path';

import type {
  D8mArtifact,
  D8mFileEntry,
  D8mFileSymbol,
  D8mSegment,
  D8mGenerator,
  D8mSymbol,
  EmittedByteMap,
  EmittedSourceSegment,
  SymbolEntry,
  WriteD8mOptions,
} from './types.js';
import { getWrittenRange, getWrittenSegments } from './range.js';

function toHexFilePath(path: string, rootDir?: string): string {
  const normalized = normalize(path).replace(/\\/g, '/');
  if (!rootDir) {
    return normalized;
  }

  const root = normalize(resolve(rootDir)).replace(/\\/g, '/');
  const resolvedPath = normalize(resolve(path)).replace(/\\/g, '/');
  const rel = relative(root, resolvedPath).replace(/\\/g, '/');
  if (rel.startsWith('..') || rel === '' || isAbsolute(rel)) {
    return resolvedPath;
  }
  return rel;
}

function compareSymbol(a: D8mSymbol, b: D8mSymbol): number {
  const aClass = a.kind === 'constant' ? 1 : 0;
  const bClass = b.kind === 'constant' ? 1 : 0;
  if (aClass !== bClass) return aClass - bClass;

  const aAddress = a.kind === 'constant' ? (a.value ?? 0) & 0xffff : (a.address ?? 0) & 0xffff;
  const bAddress = b.kind === 'constant' ? (b.value ?? 0) & 0xffff : (b.address ?? 0) & 0xffff;
  if (aAddress !== bAddress) {
    return aAddress - bAddress;
  }
  const nameCmp = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  if (nameCmp !== 0) return nameCmp;

  const kindCmp = a.kind.localeCompare(b.kind);
  if (kindCmp !== 0) return kindCmp;

  const fileCmp = (a.file ?? '').localeCompare(b.file ?? '');
  if (fileCmp !== 0) return fileCmp;

  const lineCmp = (a.line ?? 0) - (b.line ?? 0);
  if (lineCmp !== 0) return lineCmp;

  if (a.kind === 'constant' && b.kind === 'constant') {
    return (a.value ?? 0) - (b.value ?? 0);
  }

  return ((a as { size?: number }).size ?? 0) - ((b as { size?: number }).size ?? 0);
}

function compareFileSymbol(a: D8mFileSymbol, b: D8mFileSymbol): number {
  return compareSymbol(a as D8mSymbol, b as D8mSymbol);
}

function compareSegment(a: D8mSegment, b: D8mSegment): number {
  if (a.start !== b.start) return a.start - b.start;
  if (a.end !== b.end) return a.end - b.end;
  if (a.lstLine !== b.lstLine) return a.lstLine - b.lstLine;
  const lineCmp = (a.line ?? 0) - (b.line ?? 0);
  if (lineCmp !== 0) return lineCmp;
  const kindCmp = a.kind.localeCompare(b.kind);
  if (kindCmp !== 0) return kindCmp;
  return a.confidence.localeCompare(b.confidence);
}

function rangesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && b.start < a.end;
}

function hasOverlappingSourceSegment(
  sourceSegmentsByFile: ReadonlyMap<string, EmittedSourceSegment[]>,
  file: string,
  range: { start: number; end: number },
): boolean {
  return (sourceSegmentsByFile.get(file) ?? []).some((segment) =>
    rangesOverlap({ start: segment.start, end: segment.end }, range),
  );
}

export function writeD8m(
  map: EmittedByteMap,
  symbols: readonly SymbolEntry[],
  opts?: WriteD8mOptions,
): D8mArtifact {
  const { start, end } = getWrittenRange(map);
  const writtenSegments = getWrittenSegments(map);
  const segments =
    writtenSegments.length > 0
      ? writtenSegments
      : start < end
        ? [{ start, end }]
        : [{ start: 0, end: 0 }];
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

  const normalizedSourceSegments: EmittedSourceSegment[] = (map.sourceSegments ?? []).flatMap(
    (segment) =>
      clipSourceSegmentToWrittenSegments(segment, segments).map((clipped) => ({
        ...clipped,
        file: toHexFilePath(clipped.file, opts?.rootDir),
      })),
  );

  const fileSet = new Set(
    jsonSymbols
      .map((symbol) => symbol.file)
      .filter((file): file is string => typeof file === 'string' && file.length > 0),
  );
  for (const segment of normalizedSourceSegments) {
    if (segment.file.length > 0) fileSet.add(segment.file);
  }
  const fileList = [...fileSet].sort((a, b) => a.localeCompare(b));

  const entries = new Map<string, Required<D8mFileEntry>>();
  const ensureEntry = (file: string): Required<D8mFileEntry> => {
    let entry = entries.get(file);
    if (!entry) {
      entry = { symbols: [], segments: [] };
      entries.set(file, entry);
    }
    return entry;
  };

  const sortedSymbolList = [...jsonSymbols].sort(compareSymbol);
  for (const symbol of sortedSymbolList) {
    const entry = ensureEntry(symbol.file ?? '');
    const symbolWithoutFile = { ...symbol };
    delete symbolWithoutFile.file;
    entry.symbols?.push(symbolWithoutFile);
  }

  for (const segment of normalizedSourceSegments) {
    ensureEntry(segment.file).segments.push({
      start: segment.start,
      end: segment.end,
      line: segment.line,
      lstLine: segment.line,
      kind: segment.kind,
      confidence: segment.confidence,
    });
  }

  const sourceSegmentsByFile = new Map<string, EmittedSourceSegment[]>();
  for (const segment of normalizedSourceSegments) {
    const sourceSegments = sourceSegmentsByFile.get(segment.file);
    if (sourceSegments) {
      sourceSegments.push(segment);
    } else {
      sourceSegmentsByFile.set(segment.file, [segment]);
    }
  }

  const symbolRangesByFile = new Map<string, Array<{ start: number; end: number }>>();
  for (const symbol of sortedSymbolList) {
    if (symbol.kind === 'constant' || symbol.file === undefined) continue;
    if (symbol.address === undefined) continue;
    const size = symbol.size !== undefined && symbol.size > 0 ? symbol.size : 1;
    const ranges = symbolRangesByFile.get(symbol.file) ?? [];
    ranges.push({ start: symbol.address, end: Math.min(0x10000, symbol.address + size) });
    symbolRangesByFile.set(symbol.file, ranges);
  }

  for (const segment of segments) {
    const targetFiles = [...symbolRangesByFile.entries()]
      .filter(([, ranges]) => ranges.some((range) => rangesOverlap(range, segment)))
      .map(([file]) => file)
      .sort((a, b) => a.localeCompare(b));
    const targets = targetFiles.length > 0 ? targetFiles : [fileList[0] ?? ''];
    for (const target of targets) {
      if (hasOverlappingSourceSegment(sourceSegmentsByFile, target, segment)) continue;
      ensureEntry(target).segments.push({
        start: segment.start,
        end: segment.end,
        lstLine: 1,
        kind: 'unknown',
        confidence: 'low',
      });
    }
  }

  for (const entry of entries.values()) {
    entry.symbols.sort(compareFileSymbol);
    entry.segments.sort(compareSegment);
  }

  const files = Object.fromEntries(
    [...entries.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([path, fileEntry]) => [
        path,
        {
          ...(fileEntry.segments && fileEntry.segments.length > 0
            ? { segments: fileEntry.segments }
            : {}),
          ...(fileEntry.symbols && fileEntry.symbols.length > 0
            ? { symbols: fileEntry.symbols }
            : {}),
        },
      ]),
  );

  const generatorInputs =
    opts?.inputs !== undefined ? normalizeInputs(opts.inputs, opts.rootDir) : undefined;
  const generator: D8mGenerator = {
    name: 'azm',
    tool: 'azm',
    ...(opts?.packageVersion !== undefined ? { version: opts.packageVersion } : {}),
    ...(generatorInputs !== undefined ? { inputs: generatorInputs } : {}),
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
      segments,
      ...(fileList.length > 0 ? { fileList } : {}),
      symbols: sortedSymbolList,
      generator,
    },
  };
}

function normalizeInputs(
  inputs: NonNullable<WriteD8mOptions['inputs']>,
  rootDir?: string,
): { entry?: string; listing?: string; hex?: string; bin?: string } | undefined {
  const out: { entry?: string; listing?: string; hex?: string; bin?: string } = {};
  for (const [key, value] of Object.entries(inputs) as Array<
    ['entry' | 'listing' | 'hex' | 'bin', string]
  >) {
    if (value !== undefined && value.length > 0) {
      out[key] = toHexFilePath(value, rootDir);
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function clipSourceSegmentToWrittenSegments(
  segment: EmittedSourceSegment,
  writtenSegments: readonly { readonly start: number; readonly end: number }[],
): EmittedSourceSegment[] {
  const clipped: EmittedSourceSegment[] = [];
  for (const writtenSegment of writtenSegments) {
    const start = Math.max(segment.start, writtenSegment.start);
    const end = Math.min(segment.end, writtenSegment.end);
    if (end > start) {
      clipped.push({ ...segment, start, end });
    }
  }
  return clipped;
}
